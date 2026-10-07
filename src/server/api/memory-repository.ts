import type {
  Contact,
  Credential,
  DeadLetter,
  DeadLetterStatus,
  DurableJob,
  DurableJobType,
  ExternalWallet,
  ExternalWalletChallenge,
  IdempotencyRecord,
  JobStatus,
  KeyDirectoryRecord,
  LifecycleAnchor,
  MailboxPolicy,
  MessageDeliveryStatusRecord,
  PolicyWriteIntent,
  Postage,
  PostageStatus,
  Profile,
  ProvisioningRecord,
  PublishedKey,
  Receipt,
  ReceiptCheckpoint,
  RecoveryCodeSet,
  RetiredSession,
  SenderRule,
  SenderRuleRecord,
  SenderRuleWriteIntent,
  Session,
  StoredEnvelope,
  UnknownSenderDecision,
  UnknownSenderRequest,
  User,
  UsernameReservation,
  VerificationPurpose,
  VerificationToken,
  ManagedWalletRecord,
  FundingOperation,
  Wallet,
  DraftRecord,
  OnboardingDraftRecord,
  AccountDeletionRequest,
  AccountExport,
  Invite,
} from "./domain";
import { toPublicProfile, toPublicUser } from "./domain";
import type {
  ApiRepository,
  CompareSetSenderRuleRecordInput,
  CompareSetSenderRuleResult,
  ContactQueryOptions,
  DraftQueryOptions,
  SearchMailboxQueryOptions,
  ConsumeVerificationTokenResult,
  CreateManagedWalletResult,
  InsertEnvelopeResult,
  IssueVerificationTokenResult,
  PostageTransitionResult,
  RecordVerificationAttemptResult,
  UpdateContactResult,
  UpdateDraftResult,
  UpdateProvisioningResult,
  UpdateRecoveryCodeSetResult,
  UpdateUserResult,
  UsernameReservationResult,
  WalletCreationResult,
} from "./repository";
import { ApiError } from "./errors";

function key(owner: string, sender: string) {
  return `${owner}:${sender}`;
}

function activeTokenKey(userId: string, purpose: string) {
  return `${userId}:${purpose}`;
}

export class MemoryApiRepository implements ApiRepository {
  private readonly policies = new Map<string, MailboxPolicy>();
  private readonly invites = new Map<string, Invite>();
  private readonly policyWriteIntents = new Map<string, PolicyWriteIntent>();
  private readonly lifecycleAnchors = new Map<string, LifecycleAnchor>();
  private readonly postage = new Map<string, Postage>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly deliveryStatuses = new Map<string, MessageDeliveryStatusRecord>();

  private readonly senderRules = new Map<string, SenderRule>();
  // BETA-037 (Issue #1944): versioned sender rule records keyed by `${owner}:${sender}`
  private readonly senderRuleRecords = new Map<string, SenderRuleRecord>();
  private readonly senderRuleWriteIntents = new Map<string, SenderRuleWriteIntent>();
  private readonly counters = new Map<string, number[]>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly externalWallets = new Map<string, ExternalWallet[]>();
  private readonly walletChallenges = new Map<string, ExternalWalletChallenge>();
  private readonly receiptLocks = new Map<string, Promise<void>>();
  // Issue #1936: envelope store and per-key insert locks.
  private readonly envelopes = new Map<string, StoredEnvelope>();
  private readonly envelopeLocks = new Map<string, Promise<void>>();
  private readonly senderRequests = new Map<string, UnknownSenderRequest>();
  private readonly senderRequestLocks = new Map<string, Promise<void>>();
  // Issue #1973: owner-scoped contact store keyed by `${owner}:${contactId}`.
  private readonly contacts = new Map<string, Contact>();
  // Issue #1965: owner-scoped draft store keyed by `${owner}:${draftId}`.
  private readonly drafts = new Map<string, DraftRecord>();
  // Issue #1952: durable jobs, DLQ, and receipt checkpoints
  private readonly jobs = new Map<string, DurableJob>();
  private readonly jobsByIdempotencyKey = new Map<string, string>();
  private readonly deadLetters = new Map<string, DeadLetter>();
  private readonly receiptCheckpoints = new Map<string, ReceiptCheckpoint>();
  private readonly jobLocks = new Map<string, Promise<void>>();
  // Issue #1954: send operation state machine store
  private readonly sendOperations = new Map<string, import("./domain").SendOperationState>();

  // BETA-002: User Account, Profile, Credential storage & unique index maps
  private readonly usersById = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly usersByUsername = new Map<string, string>();
  private readonly usersByAddress = new Map<string, string>();
  private readonly profiles = new Map<string, Profile>();
  private readonly credentials = new Map<string, Credential>();

  // BETA-014: Account-provisioning storage
  private readonly provisioning = new Map<string, ProvisioningRecord>();
  private readonly usernameReservations = new Map<string, UsernameReservation>();
  private readonly wallets = new Map<string, Wallet>();
  // BETA-013: Durable server-backed onboarding drafts (one record per user)
  private readonly onboardingDrafts = new Map<string, OnboardingDraftRecord>();
  private readonly accountDeletionRequests = new Map<string, AccountDeletionRequest>();
  private readonly keyLocks = new Map<string, Promise<void>>();

  private async withKeyLock<T>(lockKey: string, action: () => Promise<T>): Promise<T> {
    const previous = this.keyLocks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.keyLocks.set(lockKey, queued);

    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.keyLocks.get(lockKey) === queued) {
        this.keyLocks.delete(lockKey);
      }
    }
  }
  // BETA-006: Session storage
  private readonly sessions = new Map<string, Session>();
  private readonly retiredSessions = new Map<string, RetiredSession>();

  // BETA-005: Verification tokens keyed by SHA-256 hash, plus the active-token
  // index per (userId, purpose) and a per-key lock chain for atomic transitions.
  private readonly verificationTokens = new Map<string, VerificationToken>();
  private readonly activeVerificationTokens = new Map<string, string>();
  private readonly verificationLocks = new Map<string, Promise<void>>();

  private async withVerificationLock<T>(lockKey: string, action: () => Promise<T>): Promise<T> {
    const previous = this.verificationLocks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.verificationLocks.set(lockKey, queued);

    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.verificationLocks.get(lockKey) === queued) {
        this.verificationLocks.delete(lockKey);
      }
    }
  }

  // BETA-027: Key Directory storage
  private readonly keyDirectories = new Map<string, KeyDirectoryRecord>();
  private readonly publishedKeys = new Map<string, PublishedKey>(); // key: `${owner}:${keyId}`
  private readonly keyDirectoryLocks = new Map<string, Promise<void>>();
  private readonly managedWallets = new Map<string, ManagedWalletRecord>();
  private readonly fundingOperations = new Map<string, FundingOperation>();

  // Issue #1917 (BETA-010): Recovery code sets + per-user CAS locks
  private readonly recoveryCodeSets = new Map<string, RecoveryCodeSet>();
  private readonly recoveryCodeSetLocks = new Map<string, Promise<void>>();

  private async withReceiptLock<T>(messageId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.receiptLocks.get(messageId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.receiptLocks.set(messageId, queued);

    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.receiptLocks.get(messageId) === queued) {
        this.receiptLocks.delete(messageId);
      }
    }
  }

  private async withEnvelopeLock<T>(messageId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.envelopeLocks.get(messageId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.envelopeLocks.set(messageId, queued);

    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.envelopeLocks.get(messageId) === queued) {
        this.envelopeLocks.delete(messageId);
      }
    }
  }

  private async withSenderRequestLock<T>(requestId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.senderRequestLocks.get(requestId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.senderRequestLocks.set(requestId, queued);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.senderRequestLocks.get(requestId) === queued)
        this.senderRequestLocks.delete(requestId);
    }
  }

  private async withRecoveryCodeSetLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.recoveryCodeSetLocks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.recoveryCodeSetLocks.set(userId, queued);

    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.recoveryCodeSetLocks.get(userId) === queued) {
        this.recoveryCodeSetLocks.delete(userId);
      }
    }
  }

  async getPolicy(owner: string) {
    return structuredClone(this.policies.get(owner) ?? null);
  }

  async setPolicy(owner: string, policy: MailboxPolicy) {
    this.policies.set(owner, structuredClone(policy));
    return structuredClone(policy);
  }

  async getPolicyWriteIntent(owner: string) {
    return structuredClone(this.policyWriteIntents.get(owner) ?? null);
  }

  async setPolicyWriteIntent(intent: PolicyWriteIntent) {
    this.policyWriteIntents.set(intent.owner, structuredClone(intent));
    return structuredClone(intent);
  }

  async getLifecycleAnchor(messageId: string) {
    return structuredClone(this.lifecycleAnchors.get(messageId) ?? null);
  }

  async setLifecycleAnchor(anchor: LifecycleAnchor) {
    this.lifecycleAnchors.set(anchor.messageId, structuredClone(anchor));
    return structuredClone(anchor);
  }

  async getSenderRule(owner: string, sender: string) {
    return this.senderRules.get(key(owner, sender)) ?? "default";
  }

  async setSenderRule(owner: string, sender: string, rule: SenderRule) {
    const ruleKey = key(owner, sender);
    if (rule === "default") this.senderRules.delete(ruleKey);
    else this.senderRules.set(ruleKey, rule);
    return rule;
  }

  // BETA-037 (Issue #1944): versioned sender rule records
  async getSenderRuleRecord(owner: string, sender: string): Promise<SenderRuleRecord | null> {
    return structuredClone(this.senderRuleRecords.get(key(owner, sender)) ?? null);
  }

  async setSenderRuleRecord(record: SenderRuleRecord): Promise<SenderRuleRecord> {
    this.senderRuleRecords.set(key(record.owner, record.sender), structuredClone(record));
    return structuredClone(record);
  }

  async deleteSenderRuleRecord(owner: string, sender: string): Promise<boolean> {
    return this.senderRuleRecords.delete(key(owner, sender));
  }

  async listSenderRuleRecords(
    owner: string,
    options?: { limit?: number; after?: string },
  ): Promise<{ records: SenderRuleRecord[]; nextCursor?: string }> {
    const limit = options?.limit ?? 50;
    const after = options?.after;
    let records: SenderRuleRecord[] = [];
    const ownerPrefix = `${owner}:`;
    for (const [k, v] of this.senderRuleRecords) {
      if (k.startsWith(ownerPrefix)) {
        records.push(structuredClone(v));
      }
    }
    records.sort((a, b) => a.sender.localeCompare(b.sender));
    if (after) {
      const idx = records.findIndex((r) => r.sender === after);
      if (idx >= 0) records = records.slice(idx + 1);
    }
    const nextCursor = records.length > limit ? records[limit - 1].sender : undefined;
    return { records: records.slice(0, limit), nextCursor };
  }

  async compareAndSetSenderRule(
    owner: string,
    sender: string,
    rule: SenderRule,
    expectedVersion?: number,
    now = new Date(),
  ): Promise<CompareSetSenderRuleResult> {
    const ruleKey = key(owner, sender);
    const current = this.senderRuleRecords.get(ruleKey) ?? null;
    const iso = now.toISOString();

    if (expectedVersion !== undefined) {
      const actualVersion = current?.version ?? 0;
      if (actualVersion !== expectedVersion) {
        return { outcome: "conflict", current: structuredClone(current) };
      }
    }

    if (rule === "default") {
      this.senderRuleRecords.delete(ruleKey);
      this.senderRules.delete(ruleKey);
      const nextVersion = (current?.version ?? 0) + 1;
      const record: SenderRuleRecord = current
        ? { ...structuredClone(current), version: nextVersion, updatedAt: iso }
        : {
            owner,
            sender,
            rule: "allow",
            version: nextVersion,
            chainStatus: "pending",
            scheduledAt: iso,
            updatedAt: iso,
            confirmedAt: null,
            failureCount: 0,
            lastError: null,
            txHash: null,
          };
      return { outcome: "applied", record };
    }

    const record: SenderRuleRecord = {
      owner,
      sender,
      rule,
      version: (current?.version ?? 0) + 1,
      chainStatus: "pending",
      scheduledAt: iso,
      updatedAt: iso,
      confirmedAt: null,
      failureCount: 0,
      lastError: null,
      txHash: null,
    };
    this.senderRuleRecords.set(ruleKey, structuredClone(record));
    this.senderRules.set(ruleKey, rule);
    return { outcome: "applied", record: structuredClone(record) };
  }

  async compareAndSetSenderRuleRecord(
    input: CompareSetSenderRuleRecordInput,
    expectedVersion?: number,
    now = new Date(),
  ): Promise<CompareSetSenderRuleResult> {
    const ruleKey = key(input.owner, input.sender);
    const current = this.senderRuleRecords.get(ruleKey) ?? null;
    const iso = now.toISOString();

    if (expectedVersion === undefined) {
      if (current) {
        return { outcome: "conflict", current: structuredClone(current) };
      }
    } else if (!current || current.version !== expectedVersion) {
      return { outcome: "conflict", current: current ? structuredClone(current) : null };
    }

    const record: SenderRuleRecord = {
      owner: input.owner,
      sender: input.sender,
      rule: input.rule,
      pricePayload: input.rule === "price" ? input.pricePayload : undefined,
      version: (current?.version ?? 0) + 1,
      chainStatus: "pending",
      scheduledAt: iso,
      updatedAt: iso,
      confirmedAt: null,
      failureCount: 0,
      lastError: null,
      txHash: null,
      idempotencyKey: input.idempotencyKey,
    };
    this.senderRuleRecords.set(ruleKey, structuredClone(record));
    this.senderRules.set(ruleKey, input.rule as SenderRule);
    return { outcome: "applied", record: structuredClone(record) };
  }

  async getSenderRuleWriteIntent(
    owner: string,
    sender: string,
  ): Promise<SenderRuleWriteIntent | null> {
    return structuredClone(this.senderRuleWriteIntents.get(key(owner, sender)) ?? null);
  }

  async setSenderRuleWriteIntent(intent: SenderRuleWriteIntent): Promise<SenderRuleWriteIntent> {
    this.senderRuleWriteIntents.set(key(intent.owner, intent.sender), structuredClone(intent));
    return structuredClone(intent);
  }

  async listSenderRuleWriteIntents(owner: string): Promise<SenderRuleWriteIntent[]> {
    const prefix = `${owner}:`;
    const intents: SenderRuleWriteIntent[] = [];
    for (const [compound, intent] of this.senderRuleWriteIntents.entries()) {
      if (compound.startsWith(prefix)) {
        intents.push(structuredClone(intent));
      }
    }
    return intents.sort((left, right) => left.sender.localeCompare(right.sender));
  }

  async getPostage(messageId: string) {
    return structuredClone(this.postage.get(messageId) ?? null);
  }

  async setPostage(postage: Postage) {
    this.postage.set(postage.messageId, structuredClone(postage));
    return structuredClone(postage);
  }

  async transitionPostage(
    messageId: string,
    expectedStatus: PostageStatus,
    nextStatus: PostageStatus,
  ): Promise<PostageTransitionResult> {
    const current = this.postage.get(messageId);
    if (!current) {
      return { outcome: "not-found" };
    }
    if (current.status !== expectedStatus) {
      return { outcome: "conflict", postage: structuredClone(current) };
    }
    const updated: Postage = { ...current, status: nextStatus };
    this.postage.set(messageId, updated);
    return { outcome: "applied", postage: structuredClone(updated) };
  }

  async insertPostage(postage: Postage) {
    if (this.postage.has(postage.messageId)) {
      throw new ApiError(
        409,
        "conflict",
        `A postage record already exists for message ${postage.messageId}`,
      );
    }
    this.postage.set(postage.messageId, structuredClone(postage));
    return structuredClone(postage);
  }

  async getReceipt(messageId: string) {
    return structuredClone(this.receipts.get(messageId) ?? null);
  }

  async setReceipt(receipt: Receipt) {
    this.receipts.set(receipt.messageId, structuredClone(receipt));
    return structuredClone(receipt);
  }

  async getMessageDeliveryStatus(messageId: string) {
    return structuredClone(this.deliveryStatuses.get(messageId) ?? null);
  }

  async setMessageDeliveryStatus(record: MessageDeliveryStatusRecord) {
    this.deliveryStatuses.set(record.messageId, structuredClone(record));
    return structuredClone(record);
  }

  async createReceiptIfAbsent(receipt: Receipt) {
    return this.withReceiptLock(receipt.messageId, async () => {
      const existing = this.receipts.get(receipt.messageId);
      if (existing) return { created: false, receipt: structuredClone(existing) };

      this.receipts.set(receipt.messageId, structuredClone(receipt));
      return { created: true, receipt: structuredClone(receipt) };
    });
  }

  async markReceiptRead(
    messageId: string,
    actor: string,
    now = new Date(),
  ): Promise<import("./repository").MarkReceiptReadResult> {
    const receipt = this.receipts.get(messageId);
    if (!receipt) {
      return { outcome: "not-found" };
    }
    if (actor !== receipt.sender && actor !== receipt.recipient) {
      return { outcome: "forbidden" };
    }
    if (receipt.readAt !== null) {
      return { outcome: "already-read", readAt: receipt.readAt };
    }
    const updated: Receipt = { ...receipt, readAt: now.toISOString() };
    this.receipts.set(messageId, updated);
    return { outcome: "marked", receipt: structuredClone(updated) };
  }

  // BETA-002 User Account, Profile, and Credential Domain Implementation
  async getUserById(userId: string): Promise<User | null> {
    return structuredClone(this.usersById.get(userId) ?? null);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = this.usersByEmail.get(email.toLowerCase().trim());
    if (!userId) return null;
    return structuredClone(this.usersById.get(userId) ?? null);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const userId = this.usersByUsername.get(username.toLowerCase().trim());
    if (!userId) return null;
    return structuredClone(this.usersById.get(userId) ?? null);
  }

  async getUserByAddress(address: string): Promise<User | null> {
    const userId = this.usersByAddress.get(address.toUpperCase().trim());
    if (!userId) return null;
    return structuredClone(this.usersById.get(userId) ?? null);
  }

  async createUser(user: User, credential?: Credential, profile?: Profile): Promise<User> {
    if (this.usersById.has(user.userId)) {
      throw new ApiError(409, "conflict", `User ID ${user.userId} already exists`);
    }

    const normEmail = user.email.toLowerCase().trim();
    if (this.usersByEmail.has(normEmail)) {
      throw new ApiError(409, "conflict", `User with email ${user.email} already exists`);
    }

    const normUsername = user.username.toLowerCase().trim();
    if (this.usersByUsername.has(normUsername)) {
      throw new ApiError(409, "conflict", `Username ${user.username} already in use`);
    }

    const normAddress = user.address.toUpperCase().trim();
    if (this.usersByAddress.has(normAddress)) {
      throw new ApiError(409, "conflict", `Stellar address ${user.address} is already bound`);
    }

    const clonedUser = structuredClone(user);
    this.usersById.set(user.userId, clonedUser);
    this.usersByEmail.set(normEmail, user.userId);
    this.usersByUsername.set(normUsername, user.userId);
    this.usersByAddress.set(normAddress, user.userId);

    if (credential) {
      this.credentials.set(user.userId, structuredClone(credential));
    }
    if (profile) {
      this.profiles.set(user.userId, structuredClone(profile));
    }

    return structuredClone(clonedUser);
  }

  async updateUser(user: User, expectedVersion: number): Promise<UpdateUserResult> {
    const current = this.usersById.get(user.userId);
    if (!current) {
      return { updated: false, current: null };
    }

    if (current.version !== expectedVersion) {
      return { updated: false, current: structuredClone(current) };
    }

    const normEmail = user.email.toLowerCase().trim();
    const existingEmailOwner = this.usersByEmail.get(normEmail);
    if (existingEmailOwner && existingEmailOwner !== user.userId) {
      throw new ApiError(409, "conflict", `User with email ${user.email} already exists`);
    }

    const normUsername = user.username.toLowerCase().trim();
    const existingUsernameOwner = this.usersByUsername.get(normUsername);
    if (existingUsernameOwner && existingUsernameOwner !== user.userId) {
      throw new ApiError(409, "conflict", `Username ${user.username} already in use`);
    }

    const normAddress = user.address.toUpperCase().trim();
    const existingAddressOwner = this.usersByAddress.get(normAddress);
    if (existingAddressOwner && existingAddressOwner !== user.userId) {
      throw new ApiError(409, "conflict", `Stellar address ${user.address} is already bound`);
    }

    // Clean up old index entries if changed
    if (current.email.toLowerCase().trim() !== normEmail) {
      this.usersByEmail.delete(current.email.toLowerCase().trim());
    }
    if (current.username.toLowerCase().trim() !== normUsername) {
      this.usersByUsername.delete(current.username.toLowerCase().trim());
    }
    if (current.address.toUpperCase().trim() !== normAddress) {
      this.usersByAddress.delete(current.address.toUpperCase().trim());
    }

    const nextUser: User = {
      ...user,
      version: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    };

    this.usersById.set(user.userId, structuredClone(nextUser));
    this.usersByEmail.set(normEmail, user.userId);
    this.usersByUsername.set(normUsername, user.userId);
    this.usersByAddress.set(normAddress, user.userId);

    return { updated: true, user: structuredClone(nextUser) };
  }

  async getProfile(userId: string): Promise<Profile | null> {
    return structuredClone(this.profiles.get(userId) ?? null);
  }

  async setProfile(profile: Profile): Promise<Profile> {
    this.profiles.set(profile.userId, structuredClone(profile));
    return structuredClone(profile);
  }

  async getCredential(userId: string): Promise<Credential | null> {
    return structuredClone(this.credentials.get(userId) ?? null);
  }

  async getAccountDeletionRequest(userId: string): Promise<AccountDeletionRequest | null> {
    return structuredClone(this.accountDeletionRequests.get(userId) ?? null);
  }

  async setAccountDeletionRequest(
    request: AccountDeletionRequest,
  ): Promise<AccountDeletionRequest> {
    this.accountDeletionRequests.set(request.userId, structuredClone(request));
    return structuredClone(request);
  }

  async exportAccount(userId: string, address: string, now = new Date()): Promise<AccountExport> {
    const user = this.usersById.get(userId);
    if (!user || user.address.toUpperCase() !== address.toUpperCase()) {
      throw new ApiError(404, "not_found", "Account data not found");
    }
    const mailbox = [...this.envelopes.values()]
      .filter((envelope) => envelope.recipientId.toUpperCase() === address.toUpperCase())
      .map((envelope) => structuredClone(envelope));
    const contacts = [...this.contacts.values()]
      .filter((contact) => contact.owner.toUpperCase() === address.toUpperCase())
      .map((contact) => structuredClone(contact));
    const senderRequests = [...this.senderRequests.values()]
      .filter((request) => request.recipient.toUpperCase() === address.toUpperCase())
      .map((request) => structuredClone(request));
    const publicKeys = [...this.publishedKeys.values()]
      .filter((key) => key.owner.toUpperCase() === address.toUpperCase())
      .map((key) => structuredClone(key));

    return {
      format: "stealth-account-export-v1",
      generatedAt: now.toISOString(),
      account: toPublicUser(user),
      profile: this.profiles.has(userId) ? toPublicProfile(this.profiles.get(userId)!) : null,
      contacts,
      mailbox,
      senderRequests,
      publicKeys,
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
    const user = this.usersById.get(userId);
    if (!user || user.address.toUpperCase() !== address.toUpperCase()) {
      throw new ApiError(404, "not_found", "Account data not found");
    }
    const normalizedAddress = address.toUpperCase();
    await this.deleteUserSessions(userId);
    this.profiles.delete(userId);
    this.credentials.delete(userId);
    this.onboardingDrafts.delete(userId);
    this.provisioning.delete(userId);
    this.wallets.delete(userId);
    this.managedWallets.delete(userId);
    this.externalWallets.delete(normalizedAddress);
    this.keyDirectories.delete(normalizedAddress);
    for (const key of [...this.publishedKeys.keys()]) {
      if (key.startsWith(`${normalizedAddress}:`)) this.publishedKeys.delete(key);
    }
    for (const [contactKey, contact] of this.contacts.entries()) {
      if (contact.owner.toUpperCase() === normalizedAddress) this.contacts.delete(contactKey);
    }
    for (const envelope of this.envelopes.values()) {
      if (envelope.recipientId.toUpperCase() === normalizedAddress) {
        envelope.deletedAt = now.toISOString();
        this.envelopes.set(envelope.messageId, envelope);
      }
    }

    this.usersByEmail.delete(user.email.toLowerCase());
    this.usersByUsername.delete(user.username.toLowerCase());
    const tombstoneUser = {
      ...user,
      email: `deleted-${userId}@invalid.example`,
      username: `deleted-${userId}`.slice(0, 30),
      status: "deactivated" as const,
      updatedAt: now.toISOString(),
      version: user.version + 1,
    };
    this.usersById.set(userId, tombstoneUser);
    this.usersByEmail.set(tombstoneUser.email, userId);
    this.usersByAddress.set(normalizedAddress, userId);

    return {
      deleted: [
        "profile",
        "credential",
        "sessions",
        "contacts",
        "mailbox ciphertext access",
        "published keys",
      ],
      retained: [
        "testnet account and transaction history",
        "on-chain contract events and lifecycle commitments",
        "postage and receipt references required for chain reconciliation",
      ],
    };
  }

  async setCredential(credential: Credential): Promise<Credential> {
    this.credentials.set(credential.userId, structuredClone(credential));
    return structuredClone(credential);
  }

  // BETA-014: Transactional account-provisioning implementation
  async getProvisioningRecord(userId: string): Promise<ProvisioningRecord | null> {
    return structuredClone(this.provisioning.get(userId) ?? null);
  }

  async createProvisioningRecord(
    record: ProvisioningRecord,
  ): Promise<{ created: boolean; record: ProvisioningRecord }> {
    return this.withKeyLock(`provisioning:${record.userId}`, async () => {
      const existing = this.provisioning.get(record.userId);
      if (existing) {
        return { created: false, record: structuredClone(existing) };
      }
      this.provisioning.set(record.userId, structuredClone(record));
      return { created: true, record: structuredClone(record) };
    });
  }

  async setProvisioningRecord(
    record: ProvisioningRecord,
    expectedVersion: number,
  ): Promise<UpdateProvisioningResult> {
    return this.withKeyLock(`provisioning:${record.userId}`, async () => {
      const current = this.provisioning.get(record.userId);
      if (!current) {
        return { updated: false, current: null };
      }
      if (current.version !== expectedVersion) {
        return { updated: false, current: structuredClone(current) };
      }
      const next: ProvisioningRecord = {
        ...record,
        version: expectedVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      this.provisioning.set(record.userId, structuredClone(next));
      return { updated: true, record: structuredClone(next) };
    });
  }

  // BETA-013: Durable server-backed onboarding drafts.
  // Keyed by userId so duplicate saves can never create duplicates and every
  // device resumes from the same authoritative record.
  async getOnboardingDraft(userId: string): Promise<OnboardingDraftRecord | null> {
    return structuredClone(this.onboardingDrafts.get(userId) ?? null);
  }

  async saveOnboardingDraft(record: OnboardingDraftRecord): Promise<OnboardingDraftRecord> {
    return this.withKeyLock(`onboarding:${record.userId}`, async () => {
      this.onboardingDrafts.set(record.userId, structuredClone(record));
      return structuredClone(record);
    });
  }

  async getUsernameReservation(username: string): Promise<UsernameReservation | null> {
    const norm = username.toLowerCase().trim();
    return structuredClone(this.usernameReservations.get(norm) ?? null);
  }

  async reserveUsername(
    username: string,
    userId: string,
    leaseMs: number,
  ): Promise<UsernameReservationResult> {
    const norm = username.toLowerCase().trim();
    return this.withKeyLock(`username-reservation:${norm}`, async () => {
      const boundUser = this.usersByUsername.get(norm);
      if (boundUser && boundUser !== userId) {
        return { outcome: "unavailable" };
      }

      const existing = this.usernameReservations.get(norm);
      const now = Date.now();

      if (existing) {
        if (existing.userId === userId && now < new Date(existing.expiresAt).getTime()) {
          return { outcome: "already-reserved", reservation: structuredClone(existing) };
        }
        if (existing.userId !== userId && now < new Date(existing.expiresAt).getTime()) {
          return { outcome: "unavailable" };
        }
      }

      const reservation: UsernameReservation = {
        username: norm,
        userId,
        reservedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + leaseMs).toISOString(),
      };
      this.usernameReservations.set(norm, structuredClone(reservation));
      return { outcome: "reserved", reservation: structuredClone(reservation) };
    });
  }

  async releaseUsernameReservation(username: string, userId: string): Promise<boolean> {
    const norm = username.toLowerCase().trim();
    return this.withKeyLock(`username-reservation:${norm}`, async () => {
      const existing = this.usernameReservations.get(norm);
      if (!existing) return false;
      if (existing.userId !== userId) return false;
      this.usernameReservations.delete(norm);
      return true;
    });
  }

  async getWallet(userId: string): Promise<Wallet | null> {
    return structuredClone(this.wallets.get(userId) ?? null);
  }

  async createWallet(wallet: Wallet): Promise<WalletCreationResult> {
    return this.withKeyLock(`wallet:${wallet.userId}`, async () => {
      const existing = this.wallets.get(wallet.userId);
      if (existing) {
        return { outcome: "already-exists", wallet: structuredClone(existing) };
      }
      this.wallets.set(wallet.userId, structuredClone(wallet));
      return { outcome: "created", wallet: structuredClone(wallet) };
    });
  }

  async initializePolicyIfAbsent(
    owner: string,
    policy: MailboxPolicy,
  ): Promise<{ created: boolean; policy: MailboxPolicy }> {
    const normOwner = owner.toUpperCase().trim();
    return this.withKeyLock(`policy-init:${normOwner}`, async () => {
      const existing = this.policies.get(normOwner);
      if (existing) {
        return { created: false, policy: structuredClone(existing) };
      }
      this.policies.set(normOwner, structuredClone(policy));
      return { created: true, policy: structuredClone(policy) };
    });
  }

  // BETA-006: Session CRUD Methods
  async getSession(sessionId: string): Promise<Session | null> {
    return structuredClone(this.sessions.get(sessionId) ?? null);
  }

  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.sessionId, structuredClone(session));
    return structuredClone(session);
  }

  async updateSession(session: Session): Promise<Session> {
    this.sessions.set(session.sessionId, structuredClone(session));
    return structuredClone(session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async listUserSessions(userId: string): Promise<Session[]> {
    const list: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        list.push(structuredClone(session));
      }
    }
    return list;
  }

  async deleteOtherUserSessions(userId: string, currentSessionId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId && sessionId !== currentSessionId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async getRetiredSession(sessionId: string): Promise<RetiredSession | null> {
    return structuredClone(this.retiredSessions.get(sessionId) ?? null);
  }

  async createRetiredSession(retiredSession: RetiredSession): Promise<RetiredSession> {
    this.retiredSessions.set(retiredSession.sessionId, structuredClone(retiredSession));
    return structuredClone(retiredSession);
  }

  // BETA-005 Verification Token Lifecycle Implementation
  async getVerificationToken(tokenHash: string): Promise<VerificationToken | null> {
    return structuredClone(this.verificationTokens.get(tokenHash) ?? null);
  }

  async getActiveVerificationToken(
    userId: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationToken | null> {
    const tokenHash = this.activeVerificationTokens.get(activeTokenKey(userId, purpose));
    if (!tokenHash) return null;
    return structuredClone(this.verificationTokens.get(tokenHash) ?? null);
  }

  async issueVerificationToken(
    token: VerificationToken,
    now: Date,
  ): Promise<IssueVerificationTokenResult> {
    return this.withVerificationLock(activeTokenKey(token.userId, token.purpose), async () => {
      if (this.verificationTokens.has(token.tokenHash)) {
        return {
          outcome: "conflict",
          token: structuredClone(this.verificationTokens.get(token.tokenHash)!),
        };
      }

      let replacedToken: VerificationToken | null = null;
      const activeHash = this.activeVerificationTokens.get(
        activeTokenKey(token.userId, token.purpose),
      );
      if (activeHash && activeHash !== token.tokenHash) {
        const current = this.verificationTokens.get(activeHash);
        if (current && current.consumedAt === null && current.replacedAt === null) {
          const invalidated: VerificationToken = {
            ...current,
            replacedAt: now.toISOString(),
            replacedByTokenHash: token.tokenHash,
          };
          this.verificationTokens.set(activeHash, invalidated);
          replacedToken = invalidated;
        }
      }

      const stored = structuredClone(token);
      this.verificationTokens.set(token.tokenHash, stored);
      this.activeVerificationTokens.set(
        activeTokenKey(token.userId, token.purpose),
        token.tokenHash,
      );
      return {
        outcome: "issued",
        token: structuredClone(stored),
        replacedToken: replacedToken ? structuredClone(replacedToken) : null,
      };
    });
  }

  async consumeVerificationToken(
    tokenHash: string,
    now: Date,
  ): Promise<ConsumeVerificationTokenResult> {
    return this.withVerificationLock(`token:${tokenHash}`, async () => {
      const current = this.verificationTokens.get(tokenHash);
      if (!current) {
        return { outcome: "not-found" };
      }
      if (current.consumedAt !== null) {
        return { outcome: "already-consumed", token: structuredClone(current) };
      }
      if (current.replacedAt !== null) {
        return { outcome: "replaced", token: structuredClone(current) };
      }
      if (current.attemptCount >= current.maxAttempts) {
        return {
          outcome: "brute-force-blocked",
          token: structuredClone(current),
        };
      }
      if (Date.parse(current.expiresAt) <= now.getTime()) {
        return { outcome: "expired", token: structuredClone(current) };
      }
      const consumed: VerificationToken = {
        ...current,
        consumedAt: now.toISOString(),
      };
      this.verificationTokens.set(tokenHash, consumed);
      return { outcome: "consumed", token: structuredClone(consumed) };
    });
  }

  async recordVerificationAttempt(
    tokenHash: string,
    now: Date,
  ): Promise<RecordVerificationAttemptResult> {
    return this.withVerificationLock(`token:${tokenHash}`, async () => {
      const current = this.verificationTokens.get(tokenHash);
      if (!current) {
        return { recorded: false, token: null };
      }
      if (current.consumedAt !== null || current.replacedAt !== null) {
        return { recorded: false, token: structuredClone(current) };
      }
      const updated: VerificationToken = {
        ...current,
        attemptCount: current.attemptCount + 1,
      };
      this.verificationTokens.set(tokenHash, updated);
      return { recorded: true, token: structuredClone(updated) };
    });
  }

  // Issue #1917 (BETA-010): Recovery code set CAS storage
  async getRecoveryCodeSet(userId: string): Promise<RecoveryCodeSet | null> {
    return structuredClone(this.recoveryCodeSets.get(userId) ?? null);
  }

  async setRecoveryCodeSet(
    set: RecoveryCodeSet,
    expectedVersion: number,
  ): Promise<UpdateRecoveryCodeSetResult> {
    return this.withRecoveryCodeSetLock(set.userId, async () => {
      const current = this.recoveryCodeSets.get(set.userId);

      if (expectedVersion === 0) {
        // Create-only reservation. If a concurrent generation won first, the
        // caller reconciles against `current`.
        if (current) {
          return { updated: false, current: structuredClone(current) };
        }
        this.recoveryCodeSets.set(set.userId, structuredClone(set));
        return { updated: true, set: structuredClone(set) };
      }

      if (!current || current.version !== expectedVersion) {
        return { updated: false, current: current ? structuredClone(current) : null };
      }

      const next: RecoveryCodeSet = {
        ...set,
        version: expectedVersion + 1,
      };
      this.recoveryCodeSets.set(set.userId, structuredClone(next));
      return { updated: true, set: structuredClone(next) };
    });
  }

  async invalidateActiveVerificationToken(
    userId: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<void> {
    return this.withVerificationLock(activeTokenKey(userId, purpose), async () => {
      const activeHash = this.activeVerificationTokens.get(activeTokenKey(userId, purpose));
      if (activeHash) {
        const current = this.verificationTokens.get(activeHash);
        if (current && current.consumedAt === null && current.replacedAt === null) {
          const invalidated: VerificationToken = {
            ...current,
            replacedAt: now.toISOString(),
          };
          this.verificationTokens.set(activeHash, invalidated);
        }
        this.activeVerificationTokens.delete(activeTokenKey(userId, purpose));
      }
    });
  }

  async getRelayQueueDepth(_relayId: string) {
    return 0;
  }

  async getRelayRetryCount(_relayId: string) {
    return 0;
  }

  async getRelayLastSuccessfulDelivery(_relayId: string) {
    return null;
  }

  async getRelayLastFailedDelivery(_relayId: string) {
    return null;
  }

  async getRelayDeadLetterCount(_relayId: string) {
    return 0;
  }
  async getCounter(key: string) {
    return this.counters.get(key)?.length ?? 0;
  }

  async incrementCounter(key: string, windowSeconds: number, amount = 1) {
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new RangeError("Counter increment amount must be a positive safe integer");
    }
    const now = Date.now();
    const windowMilliseconds = windowSeconds * 1000;
    const timestamps = this.counters.get(key) ?? [];
    const filtered = [...timestamps, ...Array<number>(amount).fill(now)].filter(
      (timestamp) => now - timestamp <= windowMilliseconds,
    );
    this.counters.set(key, filtered);
    return filtered.length;
  }

  async acquireIdempotencyRecord(
    key: string,
    requestDigest: string,
    leaseMs: number,
  ): Promise<import("./repository").AcquireIdempotencyResult> {
    const existing = this.idempotency.get(key);
    const now = Date.now();

    if (existing) {
      if (existing.requestDigest !== requestDigest) {
        return { status: "conflict" };
      }

      if (existing.state === "completed") {
        return { status: "completed", record: structuredClone(existing) };
      }

      if (now < new Date(existing.recoveryExpiryAt).getTime()) {
        return { status: "in_progress" };
      }
    }

    this.idempotency.set(key, {
      state: "in_progress",
      requestDigest,
      createdAt: new Date(now).toISOString(),
      recoveryExpiryAt: new Date(now + leaseMs).toISOString(),
    });

    return { status: "acquired" };
  }

  async getIdempotencyRecord(key: string) {
    return structuredClone(this.idempotency.get(key) ?? null);
  }

  async setIdempotencyRecord(key: string, record: IdempotencyRecord) {
    this.idempotency.set(key, structuredClone(record));
  }

  async getExternalWallets(owner: string): Promise<ExternalWallet[]> {
    return structuredClone(this.externalWallets.get(owner) ?? []);
  }

  async setExternalWallet(owner: string, wallet: ExternalWallet): Promise<ExternalWallet> {
    const wallets = this.externalWallets.get(owner) ?? [];
    const existing = wallets.findIndex((w) => w.address === wallet.address);
    if (existing >= 0) {
      wallets[existing] = structuredClone(wallet);
    } else {
      wallets.push(structuredClone(wallet));
    }
    this.externalWallets.set(owner, wallets);
    return structuredClone(wallet);
  }

  async removeExternalWallet(owner: string, address: string): Promise<void> {
    const wallets = this.externalWallets.get(owner) ?? [];
    this.externalWallets.set(
      owner,
      wallets.filter((w) => w.address !== address),
    );
  }

  async findExternalWalletOwner(address: string): Promise<string | null> {
    for (const [owner, wallets] of this.externalWallets.entries()) {
      if (wallets.some((w) => w.address === address)) {
        return owner;
      }
    }
    return null;
  }

  walletChallengeKey(owner: string, address: string) {
    return `${owner}:${address}`;
  }

  async getWalletChallenge(
    owner: string,
    address: string,
  ): Promise<ExternalWalletChallenge | null> {
    return structuredClone(
      this.walletChallenges.get(this.walletChallengeKey(owner, address)) ?? null,
    );
  }

  async setWalletChallenge(
    owner: string,
    address: string,
    challenge: ExternalWalletChallenge,
  ): Promise<void> {
    this.walletChallenges.set(this.walletChallengeKey(owner, address), structuredClone(challenge));
  }

  async deleteWalletChallenge(owner: string, address: string): Promise<void> {
    this.walletChallenges.delete(this.walletChallengeKey(owner, address));
  }

  // ---------------------------------------------------------------------------
  // Issue #1936 (BETA-029) — Encrypted envelope persistence
  // ---------------------------------------------------------------------------

  async getEnvelope(messageId: string): Promise<StoredEnvelope | null> {
    return structuredClone(this.envelopes.get(messageId) ?? null);
  }

  /**
   * Insert-only envelope persistence.
   *
   * Concurrency: the per-key promise chain (withEnvelopeLock) guarantees that
   * two concurrent inserts for the same messageId are serialized. No `await`
   * crosses the read-check-write boundary inside the lock body, so the
   * check-then-act is atomic within the single JS microtask.
   */
  async insertEnvelope(envelope: StoredEnvelope): Promise<InsertEnvelopeResult> {
    return this.withEnvelopeLock(envelope.messageId, async () => {
      const existing = this.envelopes.get(envelope.messageId);
      if (existing) {
        // Byte-equality check: serialize both to canonical JSON for comparison.
        const existingBytes = JSON.stringify(existing);
        const incomingBytes = JSON.stringify(envelope);
        if (existingBytes === incomingBytes) {
          return { outcome: "duplicate", envelope: structuredClone(existing) };
        }
        // Different payload — reject. The prior record is authoritative.
        return { outcome: "conflict" };
      }
      const stored = structuredClone(envelope);
      this.envelopes.set(envelope.messageId, stored);
      return { outcome: "inserted", envelope: structuredClone(stored) };
    });
  }

  async getSenderRequest(requestId: string): Promise<UnknownSenderRequest | null> {
    return structuredClone(this.senderRequests.get(requestId) ?? null);
  }
  async listSenderRequests(recipient: string, status?: "pending"): Promise<UnknownSenderRequest[]> {
    return [...this.senderRequests.values()]
      .filter((r) => r.recipient === recipient && (!status || r.status === status))
      .map((r) => structuredClone(r));
  }
  async createSenderRequestIfAbsent(request: UnknownSenderRequest) {
    return this.withEnvelopeLock(`request:${request.requestId}`, async () => {
      const existing = this.senderRequests.get(request.requestId);
      if (existing) return { created: false, request: structuredClone(existing) };
      this.senderRequests.set(request.requestId, structuredClone(request));
      return { created: true, request: structuredClone(request) };
    });
  }
  async transitionSenderRequest(
    requestId: string,
    recipient: string,
    decision: UnknownSenderDecision,
    now = new Date(),
  ) {
    return this.withEnvelopeLock(`request:${requestId}`, async () => {
      const current = this.senderRequests.get(requestId);
      if (!current || current.recipient !== recipient) return { outcome: "not_found" as const };
      if (
        current.status !== "pending" ||
        (new Date(current.expiresAt) <= now && decision !== "expire")
      )
        return { outcome: "conflict" as const, request: structuredClone(current) };
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
      } as UnknownSenderRequest;
      if (decision === "always_allow")
        this.senderRules.set(key(recipient, current.sender), "allow");
      if (decision === "block") this.senderRules.set(key(recipient, current.sender), "block");
      this.senderRequests.set(requestId, request);
      return { outcome: "applied" as const, request: structuredClone(request) };
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

    const filtered: StoredEnvelope[] = [];
    for (const env of this.envelopes.values()) {
      if (env.recipientId.toUpperCase().trim() !== normRecipient) {
        continue;
      }
      const isDeleted = Boolean(env.deletedAt);
      if (isDeleted && !includeTombstones) {
        continue;
      }
      const itemStatus = env.status ?? "pending";
      if (statusFilter !== "all" && itemStatus !== statusFilter) {
        continue;
      }
      filtered.push(structuredClone(env));
    }

    const spec = PAGINATED_QUERY_ORDERINGS.listEnvelopes;
    return paginate(filtered, spec, { limit, after: options.after });
  }

  async tombstoneEnvelope(messageId: string, recipient: string): Promise<StoredEnvelope> {
    return this.withEnvelopeLock(messageId, async () => {
      const existing = this.envelopes.get(messageId);
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
      this.envelopes.set(messageId, tombstoned);
      return structuredClone(tombstoned);
    });
  }

  async updateEnvelopeStatus(
    messageId: string,
    status: import("./domain").MailboxItemStatus,
  ): Promise<StoredEnvelope> {
    return this.withEnvelopeLock(messageId, async () => {
      const existing = this.envelopes.get(messageId);
      if (!existing) {
        throw new ApiError(404, "not_found", `No envelope found for message ${messageId}`);
      }
      const updated: StoredEnvelope = {
        ...existing,
        status,
      };
      this.envelopes.set(messageId, updated);
      return structuredClone(updated);
    });
  }

  async patchMailboxFlags(
    messageId: string,
    recipient: string,
    patch: import("./domain").MailboxFlagsPatch,
  ): Promise<StoredEnvelope> {
    const { applyMailboxFlags } = await import("./mailbox-live");
    return this.withEnvelopeLock(messageId, async () => {
      const existing = this.envelopes.get(messageId);
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
      this.envelopes.set(messageId, updated);
      return structuredClone(updated);
    });
  }

  async searchMailbox(
    actor: string,
    options: SearchMailboxQueryOptions = {},
  ): Promise<import("./repository").Page<StoredEnvelope>> {
    const { paginate, PAGINATED_QUERY_ORDERINGS } = await import("./repository");
    const { readMailboxFlags } = await import("./mailbox-live");
    const normActor = actor.toUpperCase().trim();
    const limit = options.limit ?? 25;
    const folderFilter = options.folder;
    const includeDeleted = options.includeDeleted ?? folderFilter === "trash";
    const query = options.query?.trim().toLowerCase();

    const filtered: StoredEnvelope[] = [];
    for (const env of this.envelopes.values()) {
      const isRecipient = env.recipientId.toUpperCase().trim() === normActor;
      const isSender = env.senderId.toUpperCase().trim() === normActor;
      if (!isRecipient && !isSender) {
        continue;
      }

      const isDeleted = Boolean(env.deletedAt);
      if (isDeleted && !includeDeleted) {
        continue;
      }

      const flags = readMailboxFlags(env);
      if (folderFilter && folderFilter !== "all" && flags.folder !== folderFilter) {
        continue;
      }

      if (options.unread !== undefined && flags.unread !== options.unread) {
        continue;
      }

      if (options.starred !== undefined && flags.starred !== options.starred) {
        continue;
      }

      if (options.hasAttachments !== undefined) {
        const metadata =
          env.metadata && typeof env.metadata === "object"
            ? (env.metadata as Record<string, unknown>)
            : {};
        const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
        const has = attachments.length > 0;
        if (has !== options.hasAttachments) {
          continue;
        }
      }

      if (options.sender) {
        const normSender = options.sender.toLowerCase().trim();
        const headers = (env.protectedHeaders ?? {}) as Record<string, unknown>;
        const senderMatch =
          env.senderId.toLowerCase().includes(normSender) ||
          (typeof headers.from === "string" && headers.from.toLowerCase().includes(normSender));
        if (!senderMatch) {
          continue;
        }
      }

      if (options.recipient) {
        const normRecipient = options.recipient.toLowerCase().trim();
        const headers = (env.protectedHeaders ?? {}) as Record<string, unknown>;
        const recipientMatch =
          env.recipientId.toLowerCase().includes(normRecipient) ||
          (typeof headers.to === "string" && headers.to.toLowerCase().includes(normRecipient));
        if (!recipientMatch) {
          continue;
        }
      }

      if (options.afterDate && env.createdAt < options.afterDate) {
        continue;
      }

      if (options.beforeDate && env.createdAt > options.beforeDate) {
        continue;
      }

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

        if (!haystack.includes(query)) {
          continue;
        }
      }

      filtered.push(structuredClone(env));
    }

    const spec = PAGINATED_QUERY_ORDERINGS.searchMailbox;
    return paginate(filtered, spec, { limit, after: options.after });
  }

  async getKeyDirectory(owner: string): Promise<KeyDirectoryRecord | null> {
    const dir = this.keyDirectories.get(owner.toUpperCase());
    return dir ? structuredClone(dir) : null;
  }

  async getPublishedKey(owner: string, keyId: string): Promise<PublishedKey | null> {
    const k = this.publishedKeys.get(`${owner.toUpperCase()}:${keyId}`);
    return k ? structuredClone(k) : null;
  }

  async savePublishedKey(owner: string, publishedKey: PublishedKey): Promise<PublishedKey> {
    const stored = structuredClone(publishedKey);
    this.publishedKeys.set(`${owner.toUpperCase()}:${publishedKey.keyId}`, stored);
    return structuredClone(stored);
  }

  async saveKeyDirectory(record: KeyDirectoryRecord): Promise<KeyDirectoryRecord> {
    const stored = structuredClone(record);
    this.keyDirectories.set(record.owner.toUpperCase(), stored);
    return structuredClone(stored);
  }

  async getManagedWallet(userId: string): Promise<ManagedWalletRecord | null> {
    return structuredClone(this.managedWallets.get(userId) ?? null);
  }

  async setManagedWallet(wallet: ManagedWalletRecord): Promise<ManagedWalletRecord> {
    const stored = structuredClone(wallet);
    this.managedWallets.set(wallet.userId, stored);
    return structuredClone(stored);
  }

  async createManagedWalletIfAbsent(
    wallet: ManagedWalletRecord,
  ): Promise<CreateManagedWalletResult> {
    const existing = this.managedWallets.get(wallet.userId);
    if (existing) {
      return { outcome: "existing", wallet: structuredClone(existing) };
    }
    const stored = structuredClone(wallet);
    this.managedWallets.set(wallet.userId, stored);
    return { outcome: "created", wallet: structuredClone(stored) };
  }

  async getFundingOperation(operationId: string): Promise<FundingOperation | null> {
    return structuredClone(this.fundingOperations.get(operationId) ?? null);
  }

  async setFundingOperation(operation: FundingOperation): Promise<FundingOperation> {
    const stored = structuredClone(operation);
    this.fundingOperations.set(operation.operationId, stored);
    return structuredClone(stored);
  }

  async createFundingOperationIfAbsent(
    operation: FundingOperation,
  ): Promise<{ created: boolean; operation: FundingOperation }> {
    const existing = this.fundingOperations.get(operation.operationId);
    if (existing) {
      return { created: false, operation: structuredClone(existing) };
    }
    const stored = structuredClone(operation);
    this.fundingOperations.set(operation.operationId, stored);
    return { created: true, operation: structuredClone(stored) };
  }

  async listFundingOperations(filter?: {
    status?: FundingOperation["status"];
    limit?: number;
  }): Promise<FundingOperation[]> {
    const limit = filter?.limit ?? 50;
    const matches: FundingOperation[] = [];
    for (const operation of this.fundingOperations.values()) {
      if (filter?.status && operation.status !== filter.status) continue;
      matches.push(structuredClone(operation));
    }
    matches.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return matches.slice(0, limit);
  }

  async listContacts(
    owner: string,
    options: ContactQueryOptions = {},
  ): Promise<import("./repository").Page<Contact>> {
    const { paginate, PAGINATED_QUERY_ORDERINGS } = await import("./repository");
    const normOwner = owner.toUpperCase().trim();
    const limit = options.limit ?? 25;
    const query = options.query?.trim().toLowerCase();

    const filtered: Contact[] = [];
    for (const contact of this.contacts.values()) {
      if (contact.owner.toUpperCase().trim() !== normOwner) {
        continue;
      }
      if (query) {
        const haystack =
          `${contact.name} ${contact.address} ${contact.canonicalAddress ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) {
          continue;
        }
      }
      filtered.push(structuredClone(contact));
    }

    const spec = PAGINATED_QUERY_ORDERINGS.listContacts;
    return paginate(filtered, spec, { limit, after: options.after });
  }

  async getContact(owner: string, contactId: string): Promise<Contact | null> {
    const contact = this.contacts.get(this.contactKey(owner, contactId));
    return contact ? structuredClone(contact) : null;
  }

  async createContact(contact: Contact): Promise<Contact> {
    const key = this.contactKey(contact.owner, contact.contactId);
    if (this.contacts.has(key)) {
      throw new ApiError(409, "conflict", `A contact already exists for ${contact.contactId}`);
    }
    const stored = structuredClone(contact);
    this.contacts.set(key, stored);
    return structuredClone(stored);
  }

  async updateContact(contact: Contact, expectedVersion: number): Promise<UpdateContactResult> {
    const key = this.contactKey(contact.owner, contact.contactId);
    const existing = this.contacts.get(key);
    if (!existing) {
      return { updated: false, current: null };
    }
    if (existing.version !== expectedVersion) {
      return { updated: false, current: structuredClone(existing) };
    }
    const updated = { ...contact, version: expectedVersion + 1 };
    this.contacts.set(key, updated);
    return { updated: true, contact: structuredClone(updated) };
  }

  async deleteContact(owner: string, contactId: string): Promise<void> {
    const key = this.contactKey(owner, contactId);
    if (!this.contacts.has(key)) {
      throw new ApiError(404, "not_found", `No contact found for ${contactId}`);
    }
    this.contacts.delete(key);
  }

  private contactKey(owner: string, contactId: string): string {
    return `${owner.toUpperCase().trim()}:${contactId}`;
  }

  // ---------------------------------------------------------------------------
  // Issue #1965 (BETA-058) — Live drafts CRUD
  // ---------------------------------------------------------------------------

  async listDrafts(
    owner: string,
    options: DraftQueryOptions = {},
  ): Promise<import("./repository").Page<DraftRecord>> {
    const normOwner = owner.toUpperCase().trim();
    const limit = options.limit ?? 25;
    const { paginate, PAGINATED_QUERY_ORDERINGS } = await import("./repository");

    const matched: DraftRecord[] = [];
    for (const draft of this.drafts.values()) {
      if (draft.owner.toUpperCase().trim() === normOwner) {
        matched.push(structuredClone(draft));
      }
    }

    const spec = PAGINATED_QUERY_ORDERINGS.listDrafts;
    return paginate(matched, spec, { limit, after: options.after });
  }

  async getDraft(owner: string, draftId: string): Promise<DraftRecord | null> {
    const draft = this.drafts.get(this.draftKey(owner, draftId));
    return draft ? structuredClone(draft) : null;
  }

  async createDraft(draft: DraftRecord): Promise<DraftRecord> {
    const key = this.draftKey(draft.owner, draft.draftId);
    if (this.drafts.has(key)) {
      throw new ApiError(409, "conflict", `A draft already exists for ${draft.draftId}`);
    }
    const stored = structuredClone(draft);
    this.drafts.set(key, stored);
    return structuredClone(stored);
  }

  async updateDraft(draft: DraftRecord, expectedVersion: number): Promise<UpdateDraftResult> {
    const key = this.draftKey(draft.owner, draft.draftId);
    const existing = this.drafts.get(key);
    if (!existing) {
      return { updated: false, current: null };
    }
    if (existing.version !== expectedVersion) {
      return { updated: false, current: structuredClone(existing) };
    }
    const updated = { ...draft, version: expectedVersion + 1 };
    this.drafts.set(key, updated);
    return { updated: true, draft: structuredClone(updated) };
  }

  async deleteDraft(owner: string, draftId: string): Promise<void> {
    const key = this.draftKey(owner, draftId);
    if (!this.drafts.has(key)) {
      throw new ApiError(404, "not_found", `No draft found for ${draftId}`);
    }
    this.drafts.delete(key);
  }

  private draftKey(owner: string, draftId: string): string {
    return `${owner.toUpperCase().trim()}:${draftId}`;
  }

  // ---------------------------------------------------------------------------
  // Issue #1952 (BETA-045) — Durable jobs, retries, DLQ, and receipt indexing
  // ---------------------------------------------------------------------------

  async enqueueJob(job: DurableJob): Promise<{ enqueued: boolean; job: DurableJob }> {
    const existingId = this.jobsByIdempotencyKey.get(job.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) {
        return { enqueued: false, job: structuredClone(existing) };
      }
    }

    const stored = structuredClone(job);
    this.jobs.set(stored.jobId, stored);
    this.jobsByIdempotencyKey.set(stored.idempotencyKey, stored.jobId);
    return { enqueued: true, job: structuredClone(stored) };
  }

  async getJob(jobId: string): Promise<DurableJob | null> {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : null;
  }

  async getJobByIdempotencyKey(key: string): Promise<DurableJob | null> {
    const jobId = this.jobsByIdempotencyKey.get(key);
    if (!jobId) return null;
    return this.getJob(jobId);
  }

  async updateJob(job: DurableJob): Promise<DurableJob> {
    const stored = structuredClone(job);
    this.jobs.set(stored.jobId, stored);
    this.jobsByIdempotencyKey.set(stored.idempotencyKey, stored.jobId);
    return structuredClone(stored);
  }

  async claimNextPendingJob(
    types?: DurableJobType[],
    now = new Date(),
  ): Promise<DurableJob | null> {
    const nowTime = now.getTime();
    for (const job of this.jobs.values()) {
      if (job.status === "pending" && new Date(job.nextRunAt).getTime() <= nowTime) {
        if (!types || types.includes(job.type)) {
          const claimed: DurableJob = {
            ...job,
            status: "running",
            updatedAt: now.toISOString(),
          };
          this.jobs.set(claimed.jobId, claimed);
          return structuredClone(claimed);
        }
      }
    }
    return null;
  }

  async listJobs(filter?: {
    type?: DurableJobType;
    status?: JobStatus;
    limit?: number;
  }): Promise<DurableJob[]> {
    const limit = filter?.limit ?? 50;
    const matches: DurableJob[] = [];
    for (const job of this.jobs.values()) {
      if (filter?.type && job.type !== filter.type) continue;
      if (filter?.status && job.status !== filter.status) continue;
      matches.push(structuredClone(job));
    }
    matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches.slice(0, limit);
  }

  async createDeadLetter(deadLetter: DeadLetter): Promise<DeadLetter> {
    const stored = structuredClone(deadLetter);
    this.deadLetters.set(stored.deadLetterId, stored);
    return structuredClone(stored);
  }

  async getDeadLetter(deadLetterId: string): Promise<DeadLetter | null> {
    const dl = this.deadLetters.get(deadLetterId);
    return dl ? structuredClone(dl) : null;
  }

  async listDeadLetters(filter?: {
    jobType?: DurableJobType;
    status?: DeadLetterStatus;
    limit?: number;
  }): Promise<DeadLetter[]> {
    const limit = filter?.limit ?? 50;
    const matches: DeadLetter[] = [];
    for (const dl of this.deadLetters.values()) {
      if (filter?.jobType && dl.jobType !== filter.jobType) continue;
      if (filter?.status && dl.status !== filter.status) continue;
      matches.push(structuredClone(dl));
    }
    matches.sort(
      (a, b) => new Date(b.deadLetteredAt).getTime() - new Date(a.deadLetteredAt).getTime(),
    );
    return matches.slice(0, limit);
  }

  async updateDeadLetter(deadLetter: DeadLetter): Promise<DeadLetter> {
    const stored = structuredClone(deadLetter);
    this.deadLetters.set(stored.deadLetterId, stored);
    return structuredClone(stored);
  }

  async getReceiptCheckpoint(streamId: string): Promise<ReceiptCheckpoint | null> {
    const cp = this.receiptCheckpoints.get(streamId);
    return cp ? structuredClone(cp) : null;
  }

  async setReceiptCheckpoint(checkpoint: ReceiptCheckpoint): Promise<ReceiptCheckpoint> {
    const stored = structuredClone(checkpoint);
    this.receiptCheckpoints.set(checkpoint.streamId, stored);
    return structuredClone(stored);
  }

  reset() {
    this.policies.clear();
    this.policyWriteIntents.clear();
    this.postage.clear();
    this.receipts.clear();
    this.deliveryStatuses.clear();
    this.senderRules.clear();
    this.senderRuleRecords.clear();
    this.counters.clear();
    this.idempotency.clear();
    this.externalWallets.clear();
    this.walletChallenges.clear();
    this.receiptLocks.clear();
    this.envelopes.clear();
    this.envelopeLocks.clear();
    this.senderRequests.clear();
    this.senderRequestLocks.clear();
    this.usersById.clear();
    this.usersByEmail.clear();
    this.usersByUsername.clear();
    this.usersByAddress.clear();
    this.profiles.clear();
    this.credentials.clear();
    this.provisioning.clear();
    this.usernameReservations.clear();
    this.wallets.clear();
    this.onboardingDrafts.clear();
    this.keyLocks.clear();
    this.sessions.clear();
    this.retiredSessions.clear();
    this.verificationTokens.clear();
    this.activeVerificationTokens.clear();
    this.verificationLocks.clear();
    this.keyDirectories.clear();
    this.publishedKeys.clear();
    this.keyDirectoryLocks.clear();
    this.managedWallets.clear();
    this.fundingOperations.clear();
    this.contacts.clear();
    this.drafts.clear();
    this.jobs.clear();
    this.jobsByIdempotencyKey.clear();
    this.deadLetters.clear();
    this.receiptCheckpoints.clear();
    this.jobLocks.clear();
    this.sendOperations.clear();
    this.recoveryCodeSets.clear();
    this.recoveryCodeSetLocks.clear();
    this.feedbackReports.clear();
  }

  async getInvite(code: string): Promise<Invite | null> {
    return structuredClone(this.invites.get(code.toUpperCase()) ?? null);
  }

  async setInvite(invite: Invite): Promise<Invite> {
    const stored = structuredClone(invite);
    this.invites.set(invite.code.toUpperCase(), stored);
    return structuredClone(stored);
  }

  async listInvites(): Promise<Invite[]> {
    return Array.from(this.invites.values()).map((r) => structuredClone(r));
  }

  async getSendOperation(messageId: string): Promise<import("./domain").SendOperationState | null> {
    return structuredClone(this.sendOperations.get(messageId) ?? null);
  }

  async setSendOperation(
    state: import("./domain").SendOperationState,
  ): Promise<import("./domain").SendOperationState> {
    const stored = structuredClone(state);
    this.sendOperations.set(state.messageId, stored);
    return structuredClone(stored);
  }

  async createSendOperationIfAbsent(
    state: import("./domain").SendOperationState,
  ): Promise<{ created: boolean; state: import("./domain").SendOperationState }> {
    return this.withKeyLock(`send-op:${state.messageId}`, async () => {
      const existing = this.sendOperations.get(state.messageId);
      if (existing) {
        return { created: false, state: structuredClone(existing) };
      }
      const stored = structuredClone(state);
      this.sendOperations.set(state.messageId, stored);
      return { created: true, state: structuredClone(stored) };
    });
  }

  // ---------------------------------------------------------------------------
  // Issue #2001 (BETA-094) — Beta tester feedback reports
  // ---------------------------------------------------------------------------
  private readonly feedbackReports = new Map<string, import("./domain").FeedbackReport>();

  async getFeedbackReport(reportId: string): Promise<import("./domain").FeedbackReport | null> {
    return structuredClone(this.feedbackReports.get(reportId) ?? null);
  }

  async createFeedbackReport(
    report: import("./domain").FeedbackReport,
  ): Promise<import("./domain").FeedbackReport> {
    if (this.feedbackReports.has(report.reportId)) {
      throw new ApiError(409, "conflict", `Feedback report ${report.reportId} already exists`);
    }
    const stored = structuredClone(report);
    this.feedbackReports.set(report.reportId, stored);
    return structuredClone(stored);
  }

  async updateFeedbackReport(
    report: import("./domain").FeedbackReport,
  ): Promise<import("./domain").FeedbackReport> {
    if (!this.feedbackReports.has(report.reportId)) {
      throw new ApiError(404, "not_found", `Feedback report ${report.reportId} not found`);
    }
    const stored = structuredClone(report);
    this.feedbackReports.set(report.reportId, stored);
    return structuredClone(stored);
  }

  async listFeedbackReports(filter?: {
    status?: import("./domain").FeedbackStatus;
    category?: import("./domain").FeedbackCategory;
    limit?: number;
    after?: string;
  }): Promise<import("./domain").FeedbackReport[]> {
    let reports = Array.from(this.feedbackReports.values()).map((r) => structuredClone(r));

    if (filter?.status) {
      reports = reports.filter((r) => r.status === filter.status);
    }
    if (filter?.category) {
      reports = reports.filter((r) => r.category === filter.category);
    }

    // Stable order: newest first
    reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter?.after) {
      const idx = reports.findIndex((r) => r.reportId === filter.after);
      if (idx >= 0) reports = reports.slice(idx + 1);
    }

    const limit = filter?.limit ?? 50;
    return reports.slice(0, limit);
  }
}
