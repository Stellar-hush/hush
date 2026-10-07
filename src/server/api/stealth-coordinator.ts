import type {
  Credential,
  DeadLetter,
  DeadLetterStatus,
  DurableJob,
  DurableJobType,
  IdempotencyRecord,
  JobStatus,
  ManagedWalletRecord,
  FundingOperation,
  Postage,
  PostageStatus,
  Profile,
  ProvisioningRecord,
  Receipt,
  ReceiptCheckpoint,
  RecoveryCodeSet,
  RetiredSession,
  Session,
  StoredEnvelope,
  UnknownSenderDecision,
  UnknownSenderRequest,
  User,
  UsernameReservation,
  VerificationPurpose,
  VerificationToken,
  Wallet,
  OnboardingDraftRecord,
  AccountDeletionRequest,
  AccountExport,
} from "./domain";
import { toPublicProfile, toPublicUser } from "./domain";
import type {
  AcquireIdempotencyResult,
  ConsumeVerificationTokenResult,
  CreateManagedWalletResult,
  InsertEnvelopeResult,
  IssueVerificationTokenResult,
  PostageTransitionResult,
  RecordVerificationAttemptResult,
  UpdateProvisioningResult,
  UpdateRecoveryCodeSetResult,
  UpdateUserResult,
  UsernameReservationResult,
  WalletCreationResult,
} from "./repository";
import { ApiError } from "./errors";
import { identityRecordFamilies, selectFamilies } from "../migrations/adapters";
import { createDurableObjectMigrationStorage } from "../migrations/durable-object-storage";
import { dryRun, forward, integrityCheck, rollback } from "../migrations/runner";
import type { MigrationCommand, MigrationReport, MigrationRunOptions } from "../migrations/types";

const DurableObjectBase: any = import.meta.env.PROD
  ? (await import("cloudflare:workers")).DurableObject
  : class {
      ctx: any;
      env: any;
      constructor(ctx: any, env: any) {
        this.ctx = ctx;
        this.env = env;
      }
    };

export class StealthCoordinator extends DurableObjectBase {
  // Per-key serialization for critical sections that must not interleave.
  // A Durable Object instance is a single JS object, but `await`ing a
  // storage call still yields to the microtask queue, so two concurrent
  // RPCs for the same key can otherwise both read state before either
  // writes it back (the exact double-settlement bug this coordinates
  // against). Chaining onto a per-key promise guarantees strict
  // sequential execution of the critical section regardless of Workers
  // runtime gating behavior, so correctness doesn't depend on unverified
  // assumptions about how `ctx.storage` schedules concurrent callers.
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
  }

  /** Run the reviewed identity migration plan against this DO's own storage. */
  async runIdentityMigrations(
    command: MigrationCommand,
    options: MigrationRunOptions = {},
  ): Promise<MigrationReport> {
    const storage = createDurableObjectMigrationStorage(this.ctx);
    const families = selectFamilies(identityRecordFamilies, options);
    switch (command) {
      case "dry-run":
        return dryRun(storage, families, options);
      case "forward":
        return forward(storage, families, options);
      case "rollback":
        return rollback(storage, families, options);
      case "integrity-check":
        return integrityCheck(storage, families, options);
    }
  }

  private runExclusive<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(lockKey) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    // Keep the chain alive for the next caller, but never let a rejection
    // here propagate into an unrelated future caller's chain.
    this.locks.set(
      lockKey,
      result.catch(() => undefined),
    );
    return result;
  }

  async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const record = (await this.ctx.storage.get(`idempotency:${key}`)) as
      | IdempotencyRecord
      | undefined;
    return record ?? null;
  }

  async setIdempotencyRecord(key: string, record: IdempotencyRecord): Promise<void> {
    await this.ctx.storage.put(`idempotency:${key}`, record);
  }

  async acquireIdempotencyRecord(
    key: string,
    requestDigest: string,
    leaseMs: number,
  ): Promise<AcquireIdempotencyResult> {
    return this.runExclusive(`idempotency:${key}`, async () => {
      const storageKey = `idempotency:${key}`;
      const existing = (await this.ctx.storage.get(storageKey)) as IdempotencyRecord | undefined;
      const now = Date.now();

      if (existing) {
        if (existing.requestDigest !== requestDigest) {
          return { status: "conflict" };
        }

        if (existing.state === "completed") {
          return {
            status: "completed",
            record: existing as IdempotencyRecord & { state: "completed" },
          };
        }

        if (
          existing.state === "in_progress" &&
          now < new Date(existing.recoveryExpiryAt).getTime()
        ) {
          return { status: "in_progress" };
        }
      }

      await this.ctx.storage.put(storageKey, {
        state: "in_progress",
        requestDigest,
        createdAt: new Date(now).toISOString(),
        recoveryExpiryAt: new Date(now + leaseMs).toISOString(),
      });

      return { status: "acquired" };
    });
  }

  async getReceipt(messageId: string): Promise<Receipt | null> {
    const receipt = (await this.ctx.storage.get(`receipt:${messageId}`)) as Receipt | undefined;
    return receipt ?? null;
  }

  async setReceipt(receipt: Receipt): Promise<Receipt> {
    await this.ctx.storage.put(`receipt:${receipt.messageId}`, receipt);
    return receipt;
  }

  async createReceiptIfAbsent(receipt: Receipt): Promise<{ created: boolean; receipt: Receipt }> {
    return this.runExclusive(`receipt:${receipt.messageId}`, async () => {
      const existing = await this.getReceipt(receipt.messageId);
      if (existing) return { created: false, receipt: existing };

      await this.ctx.storage.put(`receipt:${receipt.messageId}`, receipt);
      return { created: true, receipt };
    });
  }

  async markReceiptRead(
    messageId: string,
    actor: string,
    now = new Date(),
  ): Promise<import("./repository").MarkReceiptReadResult> {
    return this.runExclusive(`receipt:${messageId}`, async () => {
      const receipt = await this.getReceipt(messageId);
      if (!receipt) return { outcome: "not-found" };
      if (actor !== receipt.sender && actor !== receipt.recipient) {
        return { outcome: "forbidden" };
      }
      if (receipt.readAt) return { outcome: "already-read", readAt: receipt.readAt };

      const updated = { ...receipt, readAt: now.toISOString() };
      await this.ctx.storage.put(`receipt:${messageId}`, updated);
      return { outcome: "marked", receipt: updated };
    });
  }

  async getPostage(messageId: string): Promise<Postage | null> {
    const postage = (await this.ctx.storage.get(`postage:${messageId}`)) as Postage | undefined;
    return postage ?? null;
  }

  async setPostage(postage: Postage): Promise<Postage> {
    await this.ctx.storage.put(`postage:${postage.messageId}`, postage);
    return postage;
  }

  async transitionPostage(
    messageId: string,
    expectedStatus: PostageStatus,
    nextStatus: PostageStatus,
  ): Promise<PostageTransitionResult> {
    return this.runExclusive(`postage:${messageId}`, async () => {
      const current = (await this.ctx.storage.get(`postage:${messageId}`)) as Postage | undefined;
      if (!current) {
        return { outcome: "not-found" as const };
      }
      if (current.status !== expectedStatus) {
        return { outcome: "conflict" as const, postage: current };
      }
      const updated: Postage = { ...current, status: nextStatus };
      await this.ctx.storage.put(`postage:${messageId}`, updated);
      return { outcome: "applied" as const, postage: updated };
    });
  }

  // BETA-002: Durable User Account, Profile & Credential DO methods
  async getUserById(userId: string): Promise<User | null> {
    const user = (await this.ctx.storage.get(`user:id:${userId}`)) as User | undefined;
    return user ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const norm = email.toLowerCase().trim();
    const userId = (await this.ctx.storage.get(`user:email:${norm}`)) as string | undefined;
    if (!userId) return null;
    return this.getUserById(userId);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const norm = username.toLowerCase().trim();
    const userId = (await this.ctx.storage.get(`user:username:${norm}`)) as string | undefined;
    if (!userId) return null;
    return this.getUserById(userId);
  }

  async getUserByAddress(address: string): Promise<User | null> {
    const norm = address.toUpperCase().trim();
    const userId = (await this.ctx.storage.get(`user:address:${norm}`)) as string | undefined;
    if (!userId) return null;
    return this.getUserById(userId);
  }

  async createUser(user: User, credential?: Credential, profile?: Profile): Promise<User> {
    return this.runExclusive("user-write-lock", async () => {
      const existingId = await this.ctx.storage.get(`user:id:${user.userId}`);
      if (existingId) {
        throw new ApiError(409, "conflict", `User ID ${user.userId} already exists`);
      }

      const normEmail = user.email.toLowerCase().trim();
      const existingEmail = await this.ctx.storage.get(`user:email:${normEmail}`);
      if (existingEmail) {
        throw new ApiError(409, "conflict", `User with email ${user.email} already exists`);
      }

      const normUsername = user.username.toLowerCase().trim();
      const existingUsername = await this.ctx.storage.get(`user:username:${normUsername}`);
      if (existingUsername) {
        throw new ApiError(409, "conflict", `Username ${user.username} already in use`);
      }

      const normAddress = user.address.toUpperCase().trim();
      const existingAddress = await this.ctx.storage.get(`user:address:${normAddress}`);
      if (existingAddress) {
        throw new ApiError(409, "conflict", `Stellar address ${user.address} is already bound`);
      }

      await this.ctx.storage.put(`user:id:${user.userId}`, user);
      await this.ctx.storage.put(`user:email:${normEmail}`, user.userId);
      await this.ctx.storage.put(`user:username:${normUsername}`, user.userId);
      await this.ctx.storage.put(`user:address:${normAddress}`, user.userId);

      if (credential) {
        await this.ctx.storage.put(`credential:${user.userId}`, credential);
      }
      if (profile) {
        await this.ctx.storage.put(`profile:${user.userId}`, profile);
      }

      return user;
    });
  }

  async updateUser(user: User, expectedVersion: number): Promise<UpdateUserResult> {
    return this.runExclusive("user-write-lock", async () => {
      const current = (await this.ctx.storage.get(`user:id:${user.userId}`)) as User | undefined;
      if (!current) {
        return { updated: false, current: null };
      }

      if (current.version !== expectedVersion) {
        return { updated: false, current };
      }

      const normEmail = user.email.toLowerCase().trim();
      const existingEmailOwner = (await this.ctx.storage.get(`user:email:${normEmail}`)) as
        | string
        | undefined;
      if (existingEmailOwner && existingEmailOwner !== user.userId) {
        throw new ApiError(409, "conflict", `User with email ${user.email} already exists`);
      }

      const normUsername = user.username.toLowerCase().trim();
      const existingUsernameOwner = (await this.ctx.storage.get(
        `user:username:${normUsername}`,
      )) as string | undefined;
      if (existingUsernameOwner && existingUsernameOwner !== user.userId) {
        throw new ApiError(409, "conflict", `Username ${user.username} already in use`);
      }

      const normAddress = user.address.toUpperCase().trim();
      const existingAddressOwner = (await this.ctx.storage.get(`user:address:${normAddress}`)) as
        | string
        | undefined;
      if (existingAddressOwner && existingAddressOwner !== user.userId) {
        throw new ApiError(409, "conflict", `Stellar address ${user.address} is already bound`);
      }

      if (current.email.toLowerCase().trim() !== normEmail) {
        await this.ctx.storage.delete(`user:email:${current.email.toLowerCase().trim()}`);
      }
      if (current.username.toLowerCase().trim() !== normUsername) {
        await this.ctx.storage.delete(`user:username:${current.username.toLowerCase().trim()}`);
      }
      if (current.address.toUpperCase().trim() !== normAddress) {
        await this.ctx.storage.delete(`user:address:${current.address.toUpperCase().trim()}`);
      }

      const nextUser: User = {
        ...user,
        version: expectedVersion + 1,
        updatedAt: new Date().toISOString(),
      };

      await this.ctx.storage.put(`user:id:${user.userId}`, nextUser);
      await this.ctx.storage.put(`user:email:${normEmail}`, user.userId);
      await this.ctx.storage.put(`user:username:${normUsername}`, user.userId);
      await this.ctx.storage.put(`user:address:${normAddress}`, user.userId);

      return { updated: true, user: nextUser };
    });
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const profile = (await this.ctx.storage.get(`profile:${userId}`)) as Profile | undefined;
    return profile ?? null;
  }

  async setProfile(profile: Profile): Promise<Profile> {
    await this.ctx.storage.put(`profile:${profile.userId}`, profile);
    return profile;
  }

  async getCredential(userId: string): Promise<Credential | null> {
    const credential = (await this.ctx.storage.get(`credential:${userId}`)) as
      | Credential
      | undefined;
    return credential ?? null;
  }

  async setCredential(credential: Credential): Promise<Credential> {
    await this.ctx.storage.put(`credential:${credential.userId}`, credential);
    return credential;
  }

  async getAccountDeletionRequest(userId: string): Promise<AccountDeletionRequest | null> {
    return (
      ((await this.ctx.storage.get(`account-deletion:${userId}`)) as AccountDeletionRequest) ?? null
    );
  }

  async setAccountDeletionRequest(
    request: AccountDeletionRequest,
  ): Promise<AccountDeletionRequest> {
    await this.ctx.storage.put(`account-deletion:${request.userId}`, request);
    return request;
  }

  async exportAccount(userId: string, address: string, now = new Date()): Promise<AccountExport> {
    const user = await this.getUserById(userId);
    if (!user || user.address.toUpperCase() !== address.toUpperCase()) {
      throw new ApiError(404, "not_found", "Account data not found");
    }
    const envelopeRecords = await this.ctx.storage.list({ prefix: "envelope:" });
    const mailbox = [...envelopeRecords.values()].filter(
      (value) => (value as StoredEnvelope).recipientId.toUpperCase() === address.toUpperCase(),
    ) as StoredEnvelope[];
    const requestRecords = await this.ctx.storage.list({ prefix: "sender-request:" });
    const senderRequests = [...requestRecords.values()].filter(
      (value) => (value as UnknownSenderRequest).recipient.toUpperCase() === address.toUpperCase(),
    ) as UnknownSenderRequest[];
    const profile = await this.getProfile(userId);
    return {
      format: "stealth-account-export-v1",
      generatedAt: now.toISOString(),
      account: toPublicUser(user),
      profile: profile ? toPublicProfile(profile) : null,
      contacts: [],
      mailbox,
      senderRequests,
      publicKeys: [],
      ciphertextReferences: mailbox.map((envelope) => ({
        messageId: envelope.messageId,
        objectKey: envelope.objectRef ?? null,
        contentCommitment: envelope.contentCommitment ?? null,
        deletedAt: envelope.deletedAt ?? null,
      })),
      onChainLimitations: [
        "Stellar testnet transactions, account history, contract events, and published lifecycle commitments are immutable and are not erased.",
        "This export contains ciphertext and references only; Hush never exports plaintext message content or credentials.",
      ],
    };
  }

  async deleteAccountData(userId: string, address: string, now = new Date()) {
    return this.runExclusive(`account-deletion:${userId}`, async () => {
      const user = await this.getUserById(userId);
      if (!user || user.address.toUpperCase() !== address.toUpperCase()) {
        throw new ApiError(404, "not_found", "Account data not found");
      }
      await this.deleteUserSessions(userId);
      for (const prefix of [
        "profile:",
        "credential:",
        "onboarding:",
        "provisioning:",
        "wallet:",
        "managed-wallet:",
      ]) {
        await this.ctx.storage.delete(`${prefix}${userId}`);
      }
      const envelopes = await this.ctx.storage.list({ prefix: "envelope:" });
      for (const [key, value] of envelopes) {
        const envelope = value as StoredEnvelope;
        if (envelope.recipientId.toUpperCase() === address.toUpperCase()) {
          await this.ctx.storage.put(key, { ...envelope, deletedAt: now.toISOString() });
        }
      }
      await this.ctx.storage.delete(`user:email:${user.email.toLowerCase()}`);
      await this.ctx.storage.delete(`user:username:${user.username.toLowerCase()}`);
      await this.ctx.storage.put(`user:id:${userId}`, {
        ...user,
        email: `deleted-${userId}@invalid.example`,
        username: `deleted-${userId}`.slice(0, 30),
        status: "deactivated",
        updatedAt: now.toISOString(),
        version: user.version + 1,
      });
      return {
        deleted: ["profile", "credential", "sessions", "mailbox ciphertext access"],
        retained: [
          "testnet account and transaction history",
          "on-chain contract events and lifecycle commitments",
        ],
      };
    });
  }

  // ---------------------------------------------------------------------------
  // BETA-014: Transactional account-provisioning DO methods
  //
  // The coordinator is the single authority for provisioning state, username
  // claims, wallet insert-once semantics, and policy initialization. Every
  // mutation runs under a per-key lock so concurrent provisioners for the
  // same account (or the same username) serialize instead of racing.
  // ---------------------------------------------------------------------------

  async getProvisioningRecord(userId: string): Promise<ProvisioningRecord | null> {
    const record = (await this.ctx.storage.get(`provisioning:${userId}`)) as
      | ProvisioningRecord
      | undefined;
    return record ?? null;
  }

  async createProvisioningRecord(
    record: ProvisioningRecord,
  ): Promise<{ created: boolean; record: ProvisioningRecord }> {
    return this.runExclusive(`provisioning:${record.userId}`, async () => {
      const existing = (await this.ctx.storage.get(`provisioning:${record.userId}`)) as
        | ProvisioningRecord
        | undefined;
      if (existing) {
        return { created: false, record: existing };
      }
      await this.ctx.storage.put(`provisioning:${record.userId}`, record);
      return { created: true, record };
    });
  }

  async setProvisioningRecord(
    record: ProvisioningRecord,
    expectedVersion: number,
  ): Promise<UpdateProvisioningResult> {
    return this.runExclusive(`provisioning:${record.userId}`, async () => {
      const current = (await this.ctx.storage.get(`provisioning:${record.userId}`)) as
        | ProvisioningRecord
        | undefined;
      if (!current) {
        return { updated: false, current: null };
      }
      if (current.version !== expectedVersion) {
        return { updated: false, current };
      }
      const next: ProvisioningRecord = {
        ...record,
        version: expectedVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.ctx.storage.put(`provisioning:${record.userId}`, next);
      return { updated: true, record: next };
    });
  }

  async getUsernameReservation(username: string): Promise<UsernameReservation | null> {
    const norm = username.toLowerCase().trim();
    const reservation = (await this.ctx.storage.get(`username-reservation:${norm}`)) as
      | UsernameReservation
      | undefined;
    return reservation ?? null;
  }

  async reserveUsername(
    username: string,
    userId: string,
    leaseMs: number,
  ): Promise<UsernameReservationResult> {
    const norm = username.toLowerCase().trim();
    return this.runExclusive(`username-reservation:${norm}`, async () => {
      // A user record already bound to this username outranks any claim.
      const boundUser = (await this.ctx.storage.get(`user:username:${norm}`)) as string | undefined;
      if (boundUser && boundUser !== userId) {
        return { outcome: "unavailable" as const };
      }

      const existing = (await this.ctx.storage.get(`username-reservation:${norm}`)) as
        | UsernameReservation
        | undefined;
      const now = Date.now();

      if (existing) {
        if (existing.userId === userId && now < new Date(existing.expiresAt).getTime()) {
          return { outcome: "already-reserved" as const, reservation: existing };
        }
        if (existing.userId !== userId && now < new Date(existing.expiresAt).getTime()) {
          return { outcome: "unavailable" as const };
        }
      }

      const reservation: UsernameReservation = {
        username: norm,
        userId,
        reservedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + leaseMs).toISOString(),
      };
      await this.ctx.storage.put(`username-reservation:${norm}`, reservation);
      return { outcome: "reserved" as const, reservation };
    });
  }

  async releaseUsernameReservation(username: string, userId: string): Promise<boolean> {
    const norm = username.toLowerCase().trim();
    return this.runExclusive(`username-reservation:${norm}`, async () => {
      const existing = (await this.ctx.storage.get(`username-reservation:${norm}`)) as
        | UsernameReservation
        | undefined;
      if (!existing) return false;
      if (existing.userId !== userId) return false;
      await this.ctx.storage.delete(`username-reservation:${norm}`);
      return true;
    });
  }

  async getWallet(userId: string): Promise<Wallet | null> {
    const wallet = (await this.ctx.storage.get(`wallet:${userId}`)) as Wallet | undefined;
    return wallet ?? null;
  }

  async createWallet(wallet: Wallet): Promise<WalletCreationResult> {
    return this.runExclusive(`wallet:${wallet.userId}`, async () => {
      const existing = (await this.ctx.storage.get(`wallet:${wallet.userId}`)) as
        | Wallet
        | undefined;
      if (existing) {
        return { outcome: "already-exists" as const, wallet: existing };
      }
      await this.ctx.storage.put(`wallet:${wallet.userId}`, wallet);
      return { outcome: "created" as const, wallet };
    });
  }

  async initializePolicyIfAbsent(
    owner: string,
    policy: import("./domain").MailboxPolicy,
  ): Promise<{ created: boolean; policy: import("./domain").MailboxPolicy }> {
    const normOwner = owner.toUpperCase().trim();
    return this.runExclusive(`policy-init:${normOwner}`, async () => {
      const existing = (await this.ctx.storage.get(`policy-init:${normOwner}`)) as
        | import("./domain").MailboxPolicy
        | undefined;
      if (existing) {
        return { created: false, policy: existing };
      }
      await this.ctx.storage.put(`policy-init:${normOwner}`, policy);
      return { created: true, policy };
    });
  }

  // BETA-013: Durable server-backed onboarding drafts. Exactly one record per
  // user; duplicate saves overwrite in place so no duplicates can accumulate.
  async getOnboardingDraft(userId: string): Promise<OnboardingDraftRecord | null> {
    const record = (await this.ctx.storage.get(`onboarding:${userId}`)) as
      | OnboardingDraftRecord
      | undefined;
    return record ?? null;
  }

  async saveOnboardingDraft(record: OnboardingDraftRecord): Promise<OnboardingDraftRecord> {
    return this.runExclusive(`onboarding:${record.userId}`, async () => {
      await this.ctx.storage.put(`onboarding:${record.userId}`, record);
      return record;
    });
  }

  // BETA-006: Durable Session Storage
  async getSession(sessionId: string): Promise<Session | null> {
    const session = (await this.ctx.storage.get(`session:${sessionId}`)) as Session | undefined;
    return session ?? null;
  }

  async createSession(session: Session): Promise<Session> {
    await this.ctx.storage.put(`session:${session.sessionId}`, session);
    await this.ctx.storage.put(`session:user:${session.userId}:${session.sessionId}`, true);
    return session;
  }

  async updateSession(session: Session): Promise<Session> {
    const current = await this.getSession(session.sessionId);
    if (current && current.userId !== session.userId) {
      await this.ctx.storage.delete(`session:user:${current.userId}:${session.sessionId}`);
    }
    await this.ctx.storage.put(`session:${session.sessionId}`, session);
    await this.ctx.storage.put(`session:user:${session.userId}:${session.sessionId}`, true);
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    await this.ctx.storage.delete(`session:${sessionId}`);
    if (session) {
      await this.ctx.storage.delete(`session:user:${session.userId}:${sessionId}`);
    }
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const prefix = `session:user:${userId}:`;
    const sessionIndex = await this.ctx.storage.list({ prefix });
    const deletes: string[] = [];
    for (const key of sessionIndex.keys()) {
      deletes.push(key, `session:${key.slice(prefix.length)}`);
    }
    if (deletes.length > 0) {
      await this.ctx.storage.delete(deletes);
    }
  }

  async listUserSessions(userId: string): Promise<Session[]> {
    const prefix = `session:user:${userId}:`;
    const sessionIndex = await this.ctx.storage.list({ prefix });
    const keys: string[] = [];
    for (const key of sessionIndex.keys()) {
      keys.push(`session:${key.slice(prefix.length)}`);
    }
    if (keys.length === 0) return [];
    const sessionsMap = (await this.ctx.storage.get(keys)) as Map<string, Session>;
    const sessions: Session[] = [];
    for (const s of sessionsMap.values()) {
      if (s) sessions.push(s);
    }
    return sessions;
  }

  async deleteOtherUserSessions(userId: string, currentSessionId: string): Promise<void> {
    const prefix = `session:user:${userId}:`;
    const sessionIndex = await this.ctx.storage.list({ prefix });
    const deletes: string[] = [];
    for (const key of sessionIndex.keys()) {
      const sessionId = key.slice(prefix.length);
      if (sessionId !== currentSessionId) {
        deletes.push(key, `session:${sessionId}`);
      }
    }
    if (deletes.length > 0) {
      await this.ctx.storage.delete(deletes);
    }
  }

  async getRetiredSession(sessionId: string): Promise<RetiredSession | null> {
    const retiredSession = (await this.ctx.storage.get(`retired-session:${sessionId}`)) as
      | RetiredSession
      | undefined;
    return retiredSession ?? null;
  }

  async createRetiredSession(retiredSession: RetiredSession): Promise<RetiredSession> {
    await this.ctx.storage.put(`retired-session:${retiredSession.sessionId}`, retiredSession);
    return retiredSession;
  }

  // BETA-005: Durable verification-token lifecycle methods
  async getVerificationToken(tokenHash: string): Promise<VerificationToken | null> {
    const token = (await this.ctx.storage.get(`verification-token:hash:${tokenHash}`)) as
      | VerificationToken
      | undefined;
    return token ?? null;
  }

  async getActiveVerificationToken(
    userId: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationToken | null> {
    const tokenHash = (await this.ctx.storage.get(
      `verification-token:active:${userId}:${purpose}`,
    )) as string | undefined;
    if (!tokenHash) return null;
    return this.getVerificationToken(tokenHash);
  }

  async issueVerificationToken(
    token: VerificationToken,
    now: Date,
  ): Promise<IssueVerificationTokenResult> {
    return this.runExclusive(
      `verification-token:user:${token.userId}:${token.purpose}`,
      async () => {
        const existingHash = (await this.ctx.storage.get(
          `verification-token:hash:${token.tokenHash}`,
        )) as VerificationToken | undefined;
        if (existingHash) {
          return { outcome: "conflict", token: existingHash };
        }

        const activeHash = (await this.ctx.storage.get(
          `verification-token:active:${token.userId}:${token.purpose}`,
        )) as string | undefined;
        let replacedToken: VerificationToken | null = null;
        if (activeHash && activeHash !== token.tokenHash) {
          const current = (await this.ctx.storage.get(`verification-token:hash:${activeHash}`)) as
            | VerificationToken
            | undefined;
          if (current && current.consumedAt === null && current.replacedAt === null) {
            const invalidated: VerificationToken = {
              ...current,
              replacedAt: now.toISOString(),
              replacedByTokenHash: token.tokenHash,
            };
            await this.ctx.storage.put(`verification-token:hash:${activeHash}`, invalidated);
            replacedToken = invalidated;
          }
        }

        await this.ctx.storage.put(`verification-token:hash:${token.tokenHash}`, token);
        await this.ctx.storage.put(
          `verification-token:active:${token.userId}:${token.purpose}`,
          token.tokenHash,
        );
        return { outcome: "issued", token, replacedToken };
      },
    );
  }

  async consumeVerificationToken(
    tokenHash: string,
    now: Date,
  ): Promise<ConsumeVerificationTokenResult> {
    return this.runExclusive(`verification-token:consume:${tokenHash}`, async () => {
      const current = (await this.ctx.storage.get(`verification-token:hash:${tokenHash}`)) as
        | VerificationToken
        | undefined;
      if (!current) {
        return { outcome: "not-found" as const };
      }
      if (current.consumedAt !== null) {
        return { outcome: "already-consumed" as const, token: current };
      }
      if (current.replacedAt !== null) {
        return { outcome: "replaced" as const, token: current };
      }
      if (current.attemptCount >= current.maxAttempts) {
        return { outcome: "brute-force-blocked" as const, token: current };
      }
      if (Date.parse(current.expiresAt) <= now.getTime()) {
        return { outcome: "expired" as const, token: current };
      }
      const consumed: VerificationToken = {
        ...current,
        consumedAt: now.toISOString(),
      };
      await this.ctx.storage.put(`verification-token:hash:${tokenHash}`, consumed);
      return { outcome: "consumed" as const, token: consumed };
    });
  }

  async recordVerificationAttempt(
    tokenHash: string,
    now: Date,
  ): Promise<RecordVerificationAttemptResult> {
    return this.runExclusive(`verification-token:consume:${tokenHash}`, async () => {
      const current = (await this.ctx.storage.get(`verification-token:hash:${tokenHash}`)) as
        | VerificationToken
        | undefined;
      if (!current) {
        return { recorded: false, token: null };
      }
      if (current.consumedAt !== null || current.replacedAt !== null) {
        return { recorded: false, token: current };
      }
      const updated: VerificationToken = {
        ...current,
        attemptCount: current.attemptCount + 1,
      };
      await this.ctx.storage.put(`verification-token:hash:${tokenHash}`, updated);
      return { recorded: true, token: updated };
    });
  }

  // Issue #1917 (BETA-010): Recovery code set CAS storage. The CAS body runs
  // under runExclusive so concurrent writers for the same userId cannot
  // interleave their read-check-write cycles (the exact double-consumption
  // race this coordinates against).
  // interleave their read-check-write cycles (the exact double-consumption
  // race this coordinates against).
  async getRecoveryCodeSet(userId: string): Promise<RecoveryCodeSet | null> {
    const set = (await this.ctx.storage.get(`recovery-code-set:${userId}`)) as
      | RecoveryCodeSet
      | undefined;
    return set ?? null;
  }

  async setRecoveryCodeSet(
    set: RecoveryCodeSet,
    expectedVersion: number,
  ): Promise<UpdateRecoveryCodeSetResult> {
    return this.runExclusive(`recovery-code-set:${set.userId}`, async () => {
      const current = (await this.ctx.storage.get(`recovery-code-set:${set.userId}`)) as
        | RecoveryCodeSet
        | undefined;

      if (expectedVersion === 0) {
        // Create-only reservation. A concurrent first generation that won
        // reports `current` so the caller can reconcile instead of
        // double-inserting.
        if (current) {
          return { updated: false as const, current };
        }
        await this.ctx.storage.put(`recovery-code-set:${set.userId}`, set);
        return { updated: true as const, set };
      }

      if (!current || current.version !== expectedVersion) {
        return { updated: false as const, current: current ?? null };
      }

      const next: RecoveryCodeSet = {
        ...set,
        version: expectedVersion + 1,
      };
      await this.ctx.storage.put(`recovery-code-set:${set.userId}`, next);
      return { updated: true as const, set: next };
    });
  }

  async invalidateActiveVerificationToken(
    userId: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<void> {
    return this.runExclusive(`verification-token:user:${userId}:${purpose}`, async () => {
      const activeHash = (await this.ctx.storage.get(
        `verification-token:active:${userId}:${purpose}`,
      )) as string | undefined;
      if (activeHash) {
        const current = (await this.ctx.storage.get(`verification-token:hash:${activeHash}`)) as
          | VerificationToken
          | undefined;
        if (current && current.consumedAt === null && current.replacedAt === null) {
          const invalidated: VerificationToken = {
            ...current,
            replacedAt: now.toISOString(),
          };
          await this.ctx.storage.put(`verification-token:hash:${activeHash}`, invalidated);
        }
        await this.ctx.storage.delete(`verification-token:active:${userId}:${purpose}`);
      }
    });
  }

  async getCounter(key: string): Promise<number> {
    const timestamps =
      ((await this.ctx.storage.get(`counter:${key}`)) as number[] | undefined) ?? [];
    return timestamps.length;
  }

  async incrementCounter(key: string, windowSeconds: number, amount = 1): Promise<number> {
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new RangeError("Counter increment amount must be a positive safe integer");
    }

    return this.runExclusive(`counter:${key}`, async () => {
      const now = Date.now();
      const windowMilliseconds = windowSeconds * 1000;
      const timestamps =
        ((await this.ctx.storage.get(`counter:${key}`)) as number[] | undefined) ?? [];

      const filtered = [...timestamps, ...Array<number>(amount).fill(now)].filter(
        (timestamp) => now - timestamp <= windowMilliseconds,
      );

      await this.ctx.storage.put(`counter:${key}`, filtered);
      return filtered.length;
    });
  }

  // ---------------------------------------------------------------------------
  // Issue #1936 (BETA-029) — Durable encrypted envelope store
  // ---------------------------------------------------------------------------

  async getEnvelope(messageId: string): Promise<StoredEnvelope | null> {
    const envelope = (await this.ctx.storage.get(`envelope:${messageId}`)) as
      | StoredEnvelope
      | undefined;
    return envelope ?? null;
  }

  /**
   * Atomically insert an envelope, enforcing immutable-ID semantics.
   *
   * runExclusive serializes concurrent inserts for the same messageId so
   * two racing callers cannot both observe "absent" and both write — exactly
   * one gets "inserted" and the other gets "duplicate" or "conflict".
   */
  async insertEnvelope(envelope: StoredEnvelope): Promise<InsertEnvelopeResult> {
    return this.runExclusive(`envelope:${envelope.messageId}`, async () => {
      const existing = (await this.ctx.storage.get(`envelope:${envelope.messageId}`)) as
        | StoredEnvelope
        | undefined;

      if (existing) {
        // Byte-equality check — serialize both deterministically for comparison.
        const existingBytes = JSON.stringify(existing);
        const incomingBytes = JSON.stringify(envelope);
        if (existingBytes === incomingBytes) {
          return { outcome: "duplicate" as const, envelope: existing };
        }
        // Different payload for same ID: reject. Prior record is authoritative.
        throw new ApiError(
          409,
          "conflict",
          `An envelope with a different payload already exists for message ${envelope.messageId}`,
        );
      }

      await this.ctx.storage.put(`envelope:${envelope.messageId}`, envelope);
      return { outcome: "inserted" as const, envelope };
    });
  }
  async getSenderRequest(requestId: string) {
    return (
      ((await this.ctx.storage.get(`sender-request:${requestId}`)) as
        | import("./domain").UnknownSenderRequest
        | undefined) ?? null
    );
  }
  async listSenderRequests(recipient: string, status?: "pending") {
    const all = (await this.ctx.storage.list({ prefix: "sender-request:" })) as Map<
      string,
      import("./domain").UnknownSenderRequest
    >;
    return [...all.values()].filter(
      (r) => r.recipient === recipient && (!status || r.status === status),
    );
  }
  async createSenderRequestIfAbsent(request: import("./domain").UnknownSenderRequest) {
    return this.runExclusive(`sender-request:${request.requestId}`, async () => {
      const key = `sender-request:${request.requestId}`;
      const existing = await this.getSenderRequest(request.requestId);
      if (existing) return { created: false, request: existing };
      await this.ctx.storage.put(key, request);
      return { created: true, request };
    });
  }
  async transitionSenderRequest(
    requestId: string,
    recipient: string,
    decision: import("./domain").UnknownSenderDecision,
    now = new Date(),
  ) {
    return this.runExclusive(`sender-request:${requestId}`, async () => {
      const current = await this.getSenderRequest(requestId);
      if (!current || current.recipient !== recipient) return { outcome: "not_found" as const };
      if (
        current.status !== "pending" ||
        (new Date(current.expiresAt) <= now && decision !== "expire")
      )
        return { outcome: "conflict" as const, request: current };
      const status =
        decision === "approve_once" || decision === "always_allow"
          ? "approved"
          : decision === "block"
            ? "blocked"
            : decision === "expire"
              ? "expired"
              : "rejected";
      const request = {
        ...current,
        status,
        decision,
        decidedAt: now.toISOString(),
      } as import("./domain").UnknownSenderRequest;
      await this.ctx.storage.put(`sender-request:${requestId}`, request);
      return { outcome: "applied" as const, request };
    });
  }

  // ---------------------------------------------------------------------------
  // BETA-015 (Issue #1922) — Managed Stellar testnet wallet persistence
  // ---------------------------------------------------------------------------

  async getManagedWallet(userId: string): Promise<ManagedWalletRecord | null> {
    const wallet = (await this.ctx.storage.get(`managed-wallet:${userId}`)) as
      | ManagedWalletRecord
      | undefined;
    return wallet ?? null;
  }

  async setManagedWallet(wallet: ManagedWalletRecord): Promise<ManagedWalletRecord> {
    await this.ctx.storage.put(`managed-wallet:${wallet.userId}`, wallet);
    return wallet;
  }

  async createManagedWalletIfAbsent(
    wallet: ManagedWalletRecord,
  ): Promise<CreateManagedWalletResult> {
    return this.runExclusive(`managed-wallet:${wallet.userId}`, async () => {
      const existing = await this.getManagedWallet(wallet.userId);
      if (existing) {
        return { outcome: "existing", wallet: existing };
      }
      await this.ctx.storage.put(`managed-wallet:${wallet.userId}`, wallet);
      return { outcome: "created", wallet };
    });
  }

  async getFundingOperation(operationId: string): Promise<FundingOperation | null> {
    const operation = (await this.ctx.storage.get(`funding-op:${operationId}`)) as
      | FundingOperation
      | undefined;
    return operation ?? null;
  }

  async setFundingOperation(operation: FundingOperation): Promise<FundingOperation> {
    return this.runExclusive(`funding-op:${operation.operationId}`, async () => {
      await this.ctx.storage.put(`funding-op:${operation.operationId}`, operation);
      return operation;
    });
  }

  async createFundingOperationIfAbsent(
    operation: FundingOperation,
  ): Promise<{ created: boolean; operation: FundingOperation }> {
    return this.runExclusive(`funding-op:${operation.operationId}`, async () => {
      const existing = await this.getFundingOperation(operation.operationId);
      if (existing) {
        return { created: false, operation: existing };
      }
      await this.ctx.storage.put(`funding-op:${operation.operationId}`, operation);
      return { created: true, operation };
    });
  }

  async listFundingOperations(filter?: {
    status?: FundingOperation["status"];
    limit?: number;
  }): Promise<FundingOperation[]> {
    const stored = (await this.ctx.storage.list({ prefix: "funding-op:" })) as Map<
      string,
      FundingOperation
    >;
    const limit = filter?.limit ?? 50;
    const matches: FundingOperation[] = [];
    for (const operation of stored.values()) {
      if (!operation?.operationId) continue;
      if (filter?.status && operation.status !== filter.status) continue;
      matches.push(operation);
    }
    matches.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return matches.slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // BETA-037 (Issue #1944): versioned sender rule records
  // ---------------------------------------------------------------------------

  async listSenderRuleRecords(
    owner: string,
    options?: { limit?: number; after?: string },
  ): Promise<{ records: import("./domain").SenderRuleRecord[]; nextCursor?: string }> {
    const limit = options?.limit ?? 50;
    const records: import("./domain").SenderRuleRecord[] = [];
    const all = (await this.ctx.storage.list({
      prefix: `sender-rule-record:${owner}:`,
    })) as Map<string, import("./domain").SenderRuleRecord>;
    for (const record of all.values()) {
      if (record && record.owner === owner) {
        records.push(record);
      }
    }
    records.sort((a, b) => a.sender.localeCompare(b.sender));
    let startIndex = 0;
    if (options?.after) {
      startIndex = records.findIndex((r) => r.sender === options.after) + 1;
    }
    const page = records.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < records.length ? page[page.length - 1]?.sender : undefined;
    return { records: page, nextCursor };
  }

  async compareAndSetSenderRuleRecord(
    input: import("./repository").CompareSetSenderRuleRecordInput,
    expectedVersion?: number,
    nowIso?: string,
  ): Promise<import("./repository").CompareSetSenderRuleResult> {
    const now = nowIso ?? new Date().toISOString();
    return this.runExclusive(`sender-rule:${input.owner}:${input.sender}`, async () => {
      const storageKey = `sender-rule-record:${input.owner}:${input.sender}`;
      const current = (await this.ctx.storage.get(storageKey)) as
        | import("./domain").SenderRuleRecord
        | undefined;

      if (expectedVersion === undefined) {
        if (current) {
          return { outcome: "conflict", current };
        }
      } else if (!current || current.version !== expectedVersion) {
        return { outcome: "conflict", current: current ?? null };
      }

      const record: import("./domain").SenderRuleRecord = {
        owner: input.owner,
        sender: input.sender,
        rule: input.rule,
        pricePayload: input.rule === "price" ? input.pricePayload : undefined,
        version: (current?.version ?? 0) + 1,
        chainStatus: "pending",
        scheduledAt: now,
        updatedAt: now,
        confirmedAt: null,
        failureCount: 0,
        lastError: null,
        txHash: null,
        idempotencyKey: input.idempotencyKey,
      };
      await this.ctx.storage.put(storageKey, record);
      return { outcome: "applied", record };
    });
  }

  async listRecipientEnvelopes(
    recipient: string,
    options: import("./repository").MailboxQueryOptions = {},
  ): Promise<import("./repository").Page<StoredEnvelope>> {
    const { paginate, PAGINATED_QUERY_ORDERINGS } = await import("./repository");
    const normRecipient = recipient.toUpperCase().trim();
    const statusFilter = options.status ?? "all";
    const includeTombstones = options.includeTombstones ?? false;
    const limit = options.limit ?? 25;

    const envelopesMap = (await this.ctx.storage.list({
      prefix: "envelope:",
    })) as Map<string, StoredEnvelope>;

    const filtered: StoredEnvelope[] = [];
    for (const env of envelopesMap.values()) {
      if (!env || !env.recipientId) continue;
      if (env.recipientId.toUpperCase().trim() !== normRecipient) continue;

      const isDeleted = Boolean(env.deletedAt);
      if (isDeleted && !includeTombstones) continue;

      const itemStatus = env.status ?? "pending";
      if (statusFilter !== "all" && itemStatus !== statusFilter) continue;

      filtered.push(env);
    }

    const spec = PAGINATED_QUERY_ORDERINGS.listEnvelopes;
    return paginate(filtered, spec, { limit, after: options.after });
  }

  async tombstoneEnvelope(messageId: string, recipient: string): Promise<StoredEnvelope> {
    return this.runExclusive(`envelope:${messageId}`, async () => {
      const existing = (await this.ctx.storage.get(`envelope:${messageId}`)) as
        | StoredEnvelope
        | undefined;
      if (!existing) {
        throw new ApiError(404, "not_found", `No envelope found for message ${messageId}`);
      }
      if (existing.recipientId.toUpperCase().trim() !== recipient.toUpperCase().trim()) {
        throw new ApiError(
          403,
          "forbidden",
          "Cannot delete an envelope belonging to another recipient",
        );
      }
      const tombstoned: StoredEnvelope = {
        ...existing,
        deletedAt: new Date().toISOString(),
      };
      await this.ctx.storage.put(`envelope:${messageId}`, tombstoned);
      return tombstoned;
    });
  }

  async updateEnvelopeStatus(
    messageId: string,
    status: import("./domain").MailboxItemStatus,
  ): Promise<StoredEnvelope> {
    return this.runExclusive(`envelope:${messageId}`, async () => {
      const existing = (await this.ctx.storage.get(`envelope:${messageId}`)) as
        | StoredEnvelope
        | undefined;
      if (!existing) {
        throw new ApiError(404, "not_found", `No envelope found for message ${messageId}`);
      }
      const updated: StoredEnvelope = {
        ...existing,
        status,
      };
      await this.ctx.storage.put(`envelope:${messageId}`, updated);
      return updated;
    });
  }

  async patchMailboxFlags(
    messageId: string,
    recipient: string,
    patch: import("./domain").MailboxFlagsPatch,
  ): Promise<StoredEnvelope> {
    const { applyMailboxFlags } = await import("./mailbox-live");
    return this.runExclusive(`envelope:${messageId}`, async () => {
      const existing = (await this.ctx.storage.get(`envelope:${messageId}`)) as
        | StoredEnvelope
        | undefined;
      if (!existing) {
        throw new ApiError(404, "not_found", `No envelope found for message ${messageId}`);
      }
      if (existing.recipientId.toUpperCase().trim() !== recipient.toUpperCase().trim()) {
        throw new ApiError(
          403,
          "forbidden",
          "Cannot update an envelope belonging to another recipient",
        );
      }
      if (existing.deletedAt && patch.folder && patch.folder !== "trash") {
        throw new ApiError(409, "conflict", "Cannot move a deleted message");
      }
      const updated = applyMailboxFlags(existing, patch, new Date().toISOString());
      await this.ctx.storage.put(`envelope:${messageId}`, updated);
      return updated;
    });
  }

  async searchMailbox(
    actor: string,
    options: import("./repository").SearchMailboxQueryOptions = {},
  ): Promise<import("./repository").Page<StoredEnvelope>> {
    const { paginate, PAGINATED_QUERY_ORDERINGS } = await import("./repository");
    const { readMailboxFlags } = await import("./mailbox-live");
    const normActor = actor.toUpperCase().trim();
    const limit = options.limit ?? 25;
    const folderFilter = options.folder;
    const includeDeleted = options.includeDeleted ?? folderFilter === "trash";
    const query = options.query?.trim().toLowerCase();

    const envelopesMap = (await this.ctx.storage.list({
      prefix: "envelope:",
    })) as Map<string, StoredEnvelope>;

    const filtered: StoredEnvelope[] = [];
    for (const env of envelopesMap.values()) {
      if (!env || !env.recipientId || !env.senderId) continue;
      const isRecipient = env.recipientId.toUpperCase().trim() === normActor;
      const isSender = env.senderId.toUpperCase().trim() === normActor;
      if (!isRecipient && !isSender) continue;

      const isDeleted = Boolean(env.deletedAt);
      if (isDeleted && !includeDeleted) continue;

      const flags = readMailboxFlags(env);
      if (folderFilter && folderFilter !== "all" && flags.folder !== folderFilter) continue;

      if (options.unread !== undefined && flags.unread !== options.unread) continue;
      if (options.starred !== undefined && flags.starred !== options.starred) continue;

      if (options.hasAttachments !== undefined) {
        const metadata =
          env.metadata && typeof env.metadata === "object"
            ? (env.metadata as Record<string, unknown>)
            : {};
        const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
        const has = attachments.length > 0;
        if (has !== options.hasAttachments) continue;
      }

      if (options.sender) {
        const normSender = options.sender.toLowerCase().trim();
        const headers = (env.protectedHeaders ?? {}) as Record<string, unknown>;
        const senderMatch =
          env.senderId.toLowerCase().includes(normSender) ||
          (typeof headers.from === "string" && headers.from.toLowerCase().includes(normSender));
        if (!senderMatch) continue;
      }

      if (options.recipient) {
        const normRecipient = options.recipient.toLowerCase().trim();
        const headers = (env.protectedHeaders ?? {}) as Record<string, unknown>;
        const recipientMatch =
          env.recipientId.toLowerCase().includes(normRecipient) ||
          (typeof headers.to === "string" && headers.to.toLowerCase().includes(normRecipient));
        if (!recipientMatch) continue;
      }

      if (options.afterDate && env.createdAt < options.afterDate) continue;
      if (options.beforeDate && env.createdAt > options.beforeDate) continue;

      if (query) {
        const headers = (env.protectedHeaders ?? {}) as Record<string, unknown>;
        const metadata = (env.metadata ?? {}) as Record<string, unknown>;
        const mailboxMeta = (metadata.mailbox ?? {}) as Record<string, unknown>;
        const labels = Array.isArray(mailboxMeta.labels) ? mailboxMeta.labels.join(" ") : "";
        const haystack = [
          env.senderId,
          env.recipientId,
          env.messageId,
          typeof headers.subject === "string" ? headers.subject : "",
          typeof headers.from === "string" ? headers.from : "",
          typeof headers.to === "string" ? headers.to : "",
          labels,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) continue;
      }

      filtered.push(env);
    }

    const spec = PAGINATED_QUERY_ORDERINGS.searchMailbox;
    return paginate(filtered, spec, { limit, after: options.after });
  }

  // ---------------------------------------------------------------------------
  // Issue #1952 (BETA-045) — Durable jobs, retries, DLQ, and receipt indexing
  // ---------------------------------------------------------------------------

  async enqueueJob(job: DurableJob): Promise<{ enqueued: boolean; job: DurableJob }> {
    return this.runExclusive(`job_idemp:${job.idempotencyKey}`, async () => {
      const existingJobId = (await this.ctx.storage.get(`job_idemp:${job.idempotencyKey}`)) as
        | string
        | undefined;

      if (existingJobId) {
        const existing = (await this.ctx.storage.get(`job:${existingJobId}`)) as
          | DurableJob
          | undefined;
        if (existing) {
          return { enqueued: false, job: existing };
        }
      }

      await this.ctx.storage.put(`job:${job.jobId}`, job);
      await this.ctx.storage.put(`job_idemp:${job.idempotencyKey}`, job.jobId);
      return { enqueued: true, job };
    });
  }

  async getJob(jobId: string): Promise<DurableJob | null> {
    const job = (await this.ctx.storage.get(`job:${jobId}`)) as DurableJob | undefined;
    return job ?? null;
  }

  async getJobByIdempotencyKey(key: string): Promise<DurableJob | null> {
    const jobId = (await this.ctx.storage.get(`job_idemp:${key}`)) as string | undefined;
    if (!jobId) return null;
    return this.getJob(jobId);
  }

  async updateJob(job: DurableJob): Promise<DurableJob> {
    return this.runExclusive(`job:${job.jobId}`, async () => {
      await this.ctx.storage.put(`job:${job.jobId}`, job);
      await this.ctx.storage.put(`job_idemp:${job.idempotencyKey}`, job.jobId);
      return job;
    });
  }

  async claimNextPendingJob(
    types?: DurableJobType[],
    now = new Date(),
  ): Promise<DurableJob | null> {
    return this.runExclusive("claim_job", async () => {
      const jobsMap = (await this.ctx.storage.list({ prefix: "job:" })) as Map<string, DurableJob>;
      const nowTime = now.getTime();

      for (const [k, job] of jobsMap.entries()) {
        if (k.startsWith("job_idemp:")) continue;
        if (!job || job.status !== "pending") continue;
        if (new Date(job.nextRunAt).getTime() > nowTime) continue;
        if (types && !types.includes(job.type)) continue;

        const claimed: DurableJob = {
          ...job,
          status: "running",
          updatedAt: now.toISOString(),
        };
        await this.ctx.storage.put(`job:${job.jobId}`, claimed);
        return claimed;
      }
      return null;
    });
  }

  async listJobs(filter?: {
    type?: DurableJobType;
    status?: JobStatus;
    limit?: number;
  }): Promise<DurableJob[]> {
    const limit = filter?.limit ?? 50;
    const jobsMap = (await this.ctx.storage.list({ prefix: "job:" })) as Map<string, DurableJob>;
    const matches: DurableJob[] = [];

    for (const [k, job] of jobsMap.entries()) {
      if (k.startsWith("job_idemp:")) continue;
      if (!job || typeof job !== "object" || !job.jobId) continue;
      if (filter?.type && job.type !== filter.type) continue;
      if (filter?.status && job.status !== filter.status) continue;
      matches.push(job);
    }

    matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches.slice(0, limit);
  }

  async createDeadLetter(deadLetter: DeadLetter): Promise<DeadLetter> {
    await this.ctx.storage.put(`dlq:${deadLetter.deadLetterId}`, deadLetter);
    return deadLetter;
  }

  async getDeadLetter(deadLetterId: string): Promise<DeadLetter | null> {
    const dl = (await this.ctx.storage.get(`dlq:${deadLetterId}`)) as DeadLetter | undefined;
    return dl ?? null;
  }

  async listDeadLetters(filter?: {
    jobType?: DurableJobType;
    status?: DeadLetterStatus;
    limit?: number;
  }): Promise<DeadLetter[]> {
    const limit = filter?.limit ?? 50;
    const dlqMap = (await this.ctx.storage.list({ prefix: "dlq:" })) as Map<string, DeadLetter>;
    const matches: DeadLetter[] = [];

    for (const dl of dlqMap.values()) {
      if (!dl || typeof dl !== "object" || !dl.deadLetterId) continue;
      if (filter?.jobType && dl.jobType !== filter.jobType) continue;
      if (filter?.status && dl.status !== filter.status) continue;
      matches.push(dl);
    }

    matches.sort(
      (a, b) => new Date(b.deadLetteredAt).getTime() - new Date(a.deadLetteredAt).getTime(),
    );
    return matches.slice(0, limit);
  }

  async updateDeadLetter(deadLetter: DeadLetter): Promise<DeadLetter> {
    await this.ctx.storage.put(`dlq:${deadLetter.deadLetterId}`, deadLetter);
    return deadLetter;
  }

  async getReceiptCheckpoint(streamId: string): Promise<ReceiptCheckpoint | null> {
    const cp = (await this.ctx.storage.get(`receipt_cp:${streamId}`)) as
      | ReceiptCheckpoint
      | undefined;
    return cp ?? null;
  }

  async setReceiptCheckpoint(checkpoint: ReceiptCheckpoint): Promise<ReceiptCheckpoint> {
    await this.ctx.storage.put(`receipt_cp:${checkpoint.streamId}`, checkpoint);
    return checkpoint;
  }

  async getSendOperation(messageId: string): Promise<import("./domain").SendOperationState | null> {
    const state = (await this.ctx.storage.get(`send_op:${messageId}`)) as
      | import("./domain").SendOperationState
      | undefined;
    return state ?? null;
  }

  async setSendOperation(
    state: import("./domain").SendOperationState,
  ): Promise<import("./domain").SendOperationState> {
    await this.ctx.storage.put(`send_op:${state.messageId}`, state);
    return state;
  }

  async createSendOperationIfAbsent(
    state: import("./domain").SendOperationState,
  ): Promise<{ created: boolean; state: import("./domain").SendOperationState }> {
    return this.runExclusive(`send_op:${state.messageId}`, async () => {
      const existing = (await this.ctx.storage.get(`send_op:${state.messageId}`)) as
        | import("./domain").SendOperationState
        | undefined;
      if (existing) {
        return { created: false, state: existing };
      }
      await this.ctx.storage.put(`send_op:${state.messageId}`, state);
      return { created: true, state };
    });
  }
}
