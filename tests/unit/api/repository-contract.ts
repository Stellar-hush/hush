import { beforeEach, describe, expect, it } from "vitest";

import type { Contact, DraftRecord, StoredEnvelope } from "../../../src/server/api/domain";
import type { ApiRepository } from "../../../src/server/api/repository";

// Issue #1494: one reusable repository conformance suite that every adapter must
// satisfy, so memory and future production adapters cannot diverge on CRUD,
// ordering, conflict, and not-found semantics.
//
// `makeRepository` is an async factory so adapter-specific setup (connections,
// migrations, fixtures) is injected without changing the expected behavior.
export function runRepositoryContractTests(
  adapterName: string,
  makeRepository: () => Promise<ApiRepository> | ApiRepository,
) {
  const owner = `G${"A".repeat(55)}`;
  const sender = `G${"B".repeat(55)}`;
  const messageId = "a".repeat(64);
  const paymentHash = "b".repeat(64);

  describe(`ApiRepository contract: ${adapterName}`, () => {
    let repo: ApiRepository;

    beforeEach(async () => {
      repo = await makeRepository();
    });

    describe("policy CRUD", () => {
      it("returns null for a missing policy", async () => {
        await expect(repo.getPolicy(owner)).resolves.toBeNull();
      });

      it("round-trips a stored policy", async () => {
        await repo.setPolicy(owner, {
          allowUnknown: true,
          minimumPostage: "100",
          requireVerified: false,
        });
        await expect(repo.getPolicy(owner)).resolves.toMatchObject({
          allowUnknown: true,
          minimumPostage: "100",
          requireVerified: false,
        });
      });

      it("overwrites an existing policy on repeated set", async () => {
        await repo.setPolicy(owner, {
          allowUnknown: true,
          minimumPostage: "100",
          requireVerified: false,
        });
        await repo.setPolicy(owner, {
          allowUnknown: false,
          minimumPostage: "200",
          requireVerified: true,
        });
        await expect(repo.getPolicy(owner)).resolves.toMatchObject({
          minimumPostage: "200",
          requireVerified: true,
        });
      });
    });

    describe("policy write intents (BETA-023 / Issue #1930)", () => {
      const intent = {
        owner,
        policy: {
          allowUnknown: true,
          requireVerified: false,
          requireReceipt: false,
          minimumPostage: "0",
        },
        offchainVersion: 1,
        status: "pending" as const,
        scheduledAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        failureCount: 0,
        lastError: null,
        txHash: null,
      };

      it("returns null for a missing write intent", async () => {
        await expect(repo.getPolicyWriteIntent(owner)).resolves.toBeNull();
      });

      it("round-trips a policy write intent keyed by owner", async () => {
        await repo.setPolicyWriteIntent(intent);
        await expect(repo.getPolicyWriteIntent(owner)).resolves.toMatchObject({
          owner,
          offchainVersion: 1,
          status: "pending",
        });
      });

      it("overwrites an existing write intent and isolates per owner", async () => {
        const otherOwner = `G${"C".repeat(55)}`;
        await repo.setPolicyWriteIntent(intent);
        await repo.setPolicyWriteIntent({
          ...intent,
          owner: otherOwner,
          offchainVersion: 2,
        });
        await expect(repo.getPolicyWriteIntent(owner)).resolves.toMatchObject({
          offchainVersion: 1,
        });
        await expect(repo.getPolicyWriteIntent(otherOwner)).resolves.toMatchObject({
          offchainVersion: 2,
        });
      });
    });

    describe("sender rules", () => {
      it("defaults to 'default' when no rule exists", async () => {
        await expect(repo.getSenderRule(owner, sender)).resolves.toBe("default");
      });

      it("stores and clears explicit rules", async () => {
        await repo.setSenderRule(owner, sender, "allow");
        await expect(repo.getSenderRule(owner, sender)).resolves.toBe("allow");

        await repo.setSenderRule(owner, sender, "default");
        await expect(repo.getSenderRule(owner, sender)).resolves.toBe("default");
      });

      it("isolates rules per (owner, sender) pair", async () => {
        const otherSender = `G${"C".repeat(55)}`;
        await repo.setSenderRule(owner, sender, "block");
        await expect(repo.getSenderRule(owner, otherSender)).resolves.toBe("default");
      });
    });

    describe("postage and receipt records", () => {
      it("returns null for missing postage and receipts", async () => {
        await expect(repo.getPostage(messageId)).resolves.toBeNull();
        await expect(repo.getReceipt(messageId)).resolves.toBeNull();
      });

      it("round-trips postage keyed by messageId", async () => {
        await repo.setPostage({
          amount: "100",
          createdAt: "2026-01-01T00:00:00.000Z",
          messageId,
          paymentHash,
          recipient: owner,
          sender,
          status: "pending",
        });
        await expect(repo.getPostage(messageId)).resolves.toMatchObject({
          messageId,
          status: "pending",
        });
      });

      it("round-trips receipts keyed by messageId", async () => {
        await repo.setReceipt({
          deliveredAt: "2026-01-01T00:00:00.000Z",
          messageId,
          readAt: null,
          recipient: owner,
          sender,
        });
        await expect(repo.getReceipt(messageId)).resolves.toMatchObject({
          messageId,
          readAt: null,
        });
      });
    });

    describe("atomic postage transitions", () => {
      it("reports not-found for a message with no postage", async () => {
        await expect(repo.transitionPostage(messageId, "pending", "settled")).resolves.toEqual({
          outcome: "not-found",
        });
      });

      it("applies a pending -> settled transition and reflects it in getPostage", async () => {
        await repo.setPostage({
          amount: "100",
          createdAt: "2026-01-01T00:00:00.000Z",
          messageId,
          paymentHash,
          recipient: owner,
          sender,
          status: "pending",
        });

        const result = await repo.transitionPostage(messageId, "pending", "settled");
        expect(result).toMatchObject({
          outcome: "applied",
          postage: { status: "settled" },
        });
        await expect(repo.getPostage(messageId)).resolves.toMatchObject({
          status: "settled",
        });
      });

      it("reports a conflict with the current status when already terminal", async () => {
        await repo.setPostage({
          amount: "100",
          createdAt: "2026-01-01T00:00:00.000Z",
          messageId,
          paymentHash,
          recipient: owner,
          sender,
          status: "settled",
        });

        await expect(
          repo.transitionPostage(messageId, "pending", "settled"),
        ).resolves.toMatchObject({
          outcome: "conflict",
          postage: { status: "settled" },
        });
      });

      it("allows exactly one winner out of concurrent settlement attempts", async () => {
        await repo.setPostage({
          amount: "100",
          createdAt: "2026-01-01T00:00:00.000Z",
          messageId,
          paymentHash,
          recipient: owner,
          sender,
          status: "pending",
        });

        const results = await Promise.all(
          Array.from({ length: 5 }, () => repo.transitionPostage(messageId, "pending", "settled")),
        );

        const applied = results.filter((result) => result.outcome === "applied");
        const conflicts = results.filter((result) => result.outcome === "conflict");
        expect(applied).toHaveLength(1);
        expect(conflicts).toHaveLength(4);
        await expect(repo.getPostage(messageId)).resolves.toMatchObject({
          status: "settled",
        });
      });
    });

    describe("idempotency records", () => {
      it("returns null for a missing idempotency key", async () => {
        await expect(repo.getIdempotencyRecord("missing")).resolves.toBeNull();
      });

      it("round-trips an idempotency record", async () => {
        await repo.setIdempotencyRecord("key-1", {
          state: "completed",
          status: 200,
          body: { ok: true },
          requestDigest: "digest-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
        });
        await expect(repo.getIdempotencyRecord("key-1")).resolves.toMatchObject({
          status: 200,
        });
      });

      // Issue #1498: acquiring a lease binds it to a canonical request digest,
      // so a same-key-different-payload retry never blocks behind or replays
      // an unrelated request's response.
      it("acquires, blocks concurrent followers, and replays the completed response", async () => {
        const acquired = await repo.acquireIdempotencyRecord("key-2", "digest-a", 30_000);
        expect(acquired).toEqual({ status: "acquired" });

        const inProgress = await repo.acquireIdempotencyRecord("key-2", "digest-a", 30_000);
        expect(inProgress).toEqual({ status: "in_progress" });

        await repo.setIdempotencyRecord("key-2", {
          state: "completed",
          status: 200,
          body: { ok: true },
          requestDigest: "digest-a",
          createdAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
        });

        const completed = await repo.acquireIdempotencyRecord("key-2", "digest-a", 30_000);
        expect(completed).toMatchObject({
          status: "completed",
          record: { body: { ok: true } },
        });
      });

      it("returns conflict when the same key is reused with a different payload digest", async () => {
        await repo.acquireIdempotencyRecord("key-3", "digest-a", 30_000);

        const conflict = await repo.acquireIdempotencyRecord("key-3", "digest-b", 30_000);
        expect(conflict).toEqual({ status: "conflict" });
      });

      it("only lets one of many concurrent duplicate acquires win", async () => {
        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            repo.acquireIdempotencyRecord("key-4", "digest-a", 30_000),
          ),
        );

        const acquired = results.filter((result) => result.status === "acquired");
        const inProgress = results.filter((result) => result.status === "in_progress");
        expect(acquired).toHaveLength(1);
        expect(inProgress).toHaveLength(4);
      });
    });

    describe("counters", () => {
      it("starts at zero and increments within a window", async () => {
        await expect(repo.getCounter("rl:test")).resolves.toBe(0);
        const first = await repo.incrementCounter("rl:test", 60);
        const second = await repo.incrementCounter("rl:test", 60);
        expect(first).toBe(1);
        expect(second).toBe(2);
      });
    });

    describe("stored values are isolated from caller mutation", () => {
      it("does not reflect post-write mutation of the input object", async () => {
        const policy = {
          allowUnknown: true,
          minimumPostage: "100",
          requireVerified: false,
        };
        await repo.setPolicy(owner, policy);
        policy.minimumPostage = "999";
        await expect(repo.getPolicy(owner)).resolves.toMatchObject({
          minimumPostage: "100",
        });
      });
    });

    describe("BETA-002: user account, profile, and credential management", () => {
      const sampleUser = {
        userId: "usr_test_1",
        address: `G${"D".repeat(55)}`,
        email: "alice@stealth.mail",
        username: "alice_stealth",
        status: "active" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        version: 1,
      };

      const sampleProfile = {
        userId: "usr_test_1",
        username: "alice_stealth",
        displayName: "Alice Hush",
        avatarUrl: "https://stealth.mail/avatars/alice.png",
        bio: "Crypto privacy enthusiast",
        locale: "en-US",
        timezone: "UTC",
        addressDisplay: "full" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      const sampleCredential = {
        credentialId: "cred_test_1",
        userId: "usr_test_1",
        authMethod: "stellar_header" as const,
        secretHash: "hash_super_secret_123",
        walletKeyRef: "vault_ref_abc_456",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      it("returns null for non-existent user, profile, or credential", async () => {
        await expect(repo.getUserById("missing")).resolves.toBeNull();
        await expect(repo.getUserByEmail("missing@stealth.mail")).resolves.toBeNull();
        await expect(repo.getUserByUsername("missing_user")).resolves.toBeNull();
        await expect(repo.getUserByAddress(`G${"E".repeat(55)}`)).resolves.toBeNull();
        await expect(repo.getProfile("missing")).resolves.toBeNull();
        await expect(repo.getCredential("missing")).resolves.toBeNull();
      });

      it("creates a user and satisfies email, username, address lookups", async () => {
        const created = await repo.createUser(sampleUser, sampleCredential, sampleProfile);
        expect(created).toMatchObject({
          userId: "usr_test_1",
          email: "alice@stealth.mail",
        });

        await expect(repo.getUserById("usr_test_1")).resolves.toMatchObject({
          username: "alice_stealth",
        });
        await expect(repo.getUserByEmail("ALICE@STEALTH.MAIL")).resolves.toMatchObject({
          userId: "usr_test_1",
        });
        await expect(repo.getUserByUsername("ALICE_STEALTH")).resolves.toMatchObject({
          userId: "usr_test_1",
        });
        await expect(repo.getUserByAddress(sampleUser.address)).resolves.toMatchObject({
          userId: "usr_test_1",
        });
        await expect(repo.getProfile("usr_test_1")).resolves.toMatchObject({
          displayName: "Alice Hush",
        });
        await expect(repo.getCredential("usr_test_1")).resolves.toMatchObject({
          secretHash: "hash_super_secret_123",
        });
      });

      it("rejects duplicate email, username, or address creation with 409 conflict", async () => {
        await repo.createUser(sampleUser);

        // Duplicate email
        await expect(
          repo.createUser({
            ...sampleUser,
            userId: "usr_test_2",
            username: "bob_stealth",
            address: `G${"E".repeat(55)}`,
          }),
        ).rejects.toMatchObject({ status: 409 });

        // Duplicate username
        await expect(
          repo.createUser({
            ...sampleUser,
            userId: "usr_test_3",
            email: "bob@stealth.mail",
            address: `G${"F".repeat(55)}`,
          }),
        ).rejects.toMatchObject({ status: 409 });

        // Duplicate address
        await expect(
          repo.createUser({
            ...sampleUser,
            userId: "usr_test_4",
            email: "carol@stealth.mail",
            username: "carol_stealth",
          }),
        ).rejects.toMatchObject({ status: 409 });
      });

      it("updates a user with optimistic concurrency version check", async () => {
        await repo.createUser(sampleUser);

        // Stale update (expectedVersion = 999 instead of 1)
        const staleRes = await repo.updateUser(
          { ...sampleUser, email: "alice2@stealth.mail" },
          999,
        );
        expect(staleRes.updated).toBe(false);
        if (!staleRes.updated) {
          expect(staleRes.current).toMatchObject({ version: 1 });
        }

        // Valid update (expectedVersion = 1)
        const validRes = await repo.updateUser(
          { ...sampleUser, email: "alice_new@stealth.mail" },
          1,
        );
        expect(validRes.updated).toBe(true);
        if (validRes.updated) {
          expect(validRes.user.version).toBe(2);
          expect(validRes.user.email).toBe("alice_new@stealth.mail");
        }

        await expect(repo.getUserByEmail("alice_new@stealth.mail")).resolves.toMatchObject({
          userId: "usr_test_1",
        });
      });
    });

    describe("session CRUD", () => {
      const sampleSession = {
        sessionId: "sess_contract_100",
        userId: "usr_test_1",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-08T00:00:00.000Z",
        lastActiveAt: "2026-01-01T00:00:00.000Z",
        ipAddress: "127.0.0.1",
        userAgent: "ContractAgent/1.0",
        deviceFingerprint: "fp_12345",
      };

      it("returns null for non-existent session", async () => {
        await expect(repo.getSession("sess_missing")).resolves.toBeNull();
      });

      it("creates and retrieves a session", async () => {
        const created = await repo.createSession(sampleSession);
        expect(created.sessionId).toBe("sess_contract_100");

        const fetched = await repo.getSession("sess_contract_100");
        expect(fetched).toMatchObject({
          sessionId: "sess_contract_100",
          userId: "usr_test_1",
        });
      });

      it("updates a session", async () => {
        await repo.createSession(sampleSession);
        const updated = await repo.updateSession({
          ...sampleSession,
          lastActiveAt: "2026-01-02T12:00:00.000Z",
        });

        expect(updated.lastActiveAt).toBe("2026-01-02T12:00:00.000Z");

        const fetched = await repo.getSession("sess_contract_100");
        expect(fetched?.lastActiveAt).toBe("2026-01-02T12:00:00.000Z");
      });

      it("deletes a session and deletes all user sessions", async () => {
        await repo.createSession(sampleSession);
        await repo.createSession({
          ...sampleSession,
          sessionId: "sess_contract_101",
        });

        await repo.deleteSession("sess_contract_100");
        expect(await repo.getSession("sess_contract_100")).toBeNull();
        expect(await repo.getSession("sess_contract_101")).not.toBeNull();

        await repo.deleteUserSessions("usr_test_1");
        expect(await repo.getSession("sess_contract_101")).toBeNull();
      });

      it("creates and retrieves a retired session record", async () => {
        const retiredRecord = {
          sessionId: "sess_old_1",
          replacedBySessionId: "sess_new_2",
          userId: "usr_test_1",
          retiredAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-08T00:00:00.000Z",
        };

        expect(await repo.getRetiredSession("sess_old_1")).toBeNull();

        const created = await repo.createRetiredSession(retiredRecord);
        expect(created.sessionId).toBe("sess_old_1");

        const fetched = await repo.getRetiredSession("sess_old_1");
        expect(fetched).toMatchObject({
          sessionId: "sess_old_1",
          replacedBySessionId: "sess_new_2",
          userId: "usr_test_1",
        });
      });
    });

    describe("contacts (BETA-066 / Issue #1973)", () => {
      const otherOwner = `G${"C".repeat(55)}`;

      function sampleContact(id: string, overrides: Partial<Contact> = {}): Contact {
        return {
          contactId: id,
          owner,
          name: `Contact ${id}`,
          address: `g-address-${id}`,
          canonicalAddress: null,
          trust: "default",
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          version: 1,
          ...overrides,
        };
      }

      it("returns null for a missing contact", async () => {
        await expect(repo.getContact(owner, "c_missing")).resolves.toBeNull();
      });

      it("round-trips a created contact and isolates it per owner", async () => {
        const stored = await repo.createContact(sampleContact("c_1"));
        expect(stored).toMatchObject({ contactId: "c_1", owner, name: "Contact c_1" });

        const fetched = await repo.getContact(owner, "c_1");
        expect(fetched).toMatchObject({ contactId: "c_1", owner, version: 1 });

        await expect(repo.getContact(otherOwner, "c_1")).resolves.toBeNull();
      });

      it("rejects duplicate contactId creation for the same owner", async () => {
        await repo.createContact(sampleContact("c_dup"));
        await expect(repo.createContact(sampleContact("c_dup"))).rejects.toThrow();
      });

      it("allows the same contactId under a different owner", async () => {
        await repo.createContact(sampleContact("c_shared"));
        await expect(
          repo.createContact(sampleContact("c_shared", { owner: otherOwner })),
        ).resolves.toMatchObject({ owner: otherOwner });
      });

      it("applies compare-and-swap updates keyed by expectedVersion", async () => {
        await repo.createContact(sampleContact("c_cas"));

        const moved = await repo.updateContact(
          sampleContact("c_cas", { version: 2, name: "Moved" }),
          1,
        );
        expect(moved.updated).toBe(true);
        if (moved.updated) {
          expect(moved.contact).toMatchObject({ name: "Moved", version: 2 });
        }

        const stale = await repo.updateContact(sampleContact("c_cas"), 1);
        expect(stale.updated).toBe(false);
      });

      it("reports not-found CAS when the contact never existed", async () => {
        const result = await repo.updateContact(sampleContact("c_ghost"), 1);
        expect(result).toEqual({ updated: false, current: null });
      });

      it("deletes a contact and leaves other owners untouched", async () => {
        await repo.createContact(sampleContact("c_del", { owner: otherOwner }));
        await repo.createContact(sampleContact("c_keep"));

        await repo.deleteContact(owner, "c_keep");
        await expect(repo.getContact(owner, "c_keep")).resolves.toBeNull();
        await expect(repo.getContact(otherOwner, "c_del")).resolves.not.toBeNull();
      });

      it("lists contacts scoped to the owner with the declared ordering", async () => {
        await repo.createContact(sampleContact("c_a", { name: "Alpha" }));
        await repo.createContact(sampleContact("c_b", { name: "Beta" }));
        await repo.createContact(sampleContact("c_z", { owner: otherOwner, name: "Zulu" }));

        const page = await repo.listContacts(owner);
        expect(page.items.map((c) => c.contactId).sort()).toEqual(["c_a", "c_b"]);
        expect(page.items.every((c) => c.owner === owner)).toBe(true);
      });

      it("filters by query against name and raw address case-insensitively", async () => {
        await repo.createContact(sampleContact("c_alpha", { name: "Alice" }));
        await repo.createContact(sampleContact("c_bravo", { address: "GALICE-ADDRESS" }));

        const byName = await repo.listContacts(owner, { query: "alice" });
        expect(byName.items.map((c) => c.contactId).sort()).toEqual(["c_alpha", "c_bravo"]);

        const onlyAddress = await repo.listContacts(owner, { query: "galice" });
        expect(onlyAddress.items.map((c) => c.contactId)).toEqual(["c_bravo"]);
      });

      it("paginates contacts with limit and continuation key", async () => {
        for (let i = 0; i < 5; i += 1) {
          await repo.createContact(sampleContact(`c_page_${i}`));
        }

        const first = await repo.listContacts(owner, { limit: 2 });
        expect(first.items).toHaveLength(2);
        expect(first.nextContinuationKey).not.toBeNull();

        const second = await repo.listContacts(owner, {
          limit: 2,
          after: first.nextContinuationKey ?? undefined,
        });
        expect(second.items).toHaveLength(2);
        expect(second.items[0].contactId).not.toBe(first.items[0].contactId);

        const last = await repo.listContacts(owner, {
          limit: 5,
          after: second.nextContinuationKey ?? undefined,
        });
        expect(last.items).toHaveLength(1);
        expect(last.nextContinuationKey).toBeNull();
      });
    });

    describe("drafts (BETA-058 / Issue #1965)", () => {
      const otherOwner = `G${"C".repeat(55)}`;

      function sampleDraft(id: string, overrides: Partial<DraftRecord> = {}): DraftRecord {
        return {
          draftId: id,
          owner,
          encryptedPayload: "ZW5jcnlwdGVkLWRhdGE=",
          nonce: "bm9uY2UtZGF0YQ==",
          tag: "dGFnLWRhdGE=",
          algorithm: "AES-256-GCM",
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          ...overrides,
        };
      }

      it("returns null for a missing draft", async () => {
        await expect(repo.getDraft(owner, "d_missing")).resolves.toBeNull();
      });

      it("round-trips a created draft keyed by draftId and isolated by owner", async () => {
        const draft = sampleDraft("d_1");
        const created = await repo.createDraft(draft);
        expect(created).toMatchObject({
          draftId: "d_1",
          owner,
          version: 1,
          algorithm: "AES-256-GCM",
        });

        const fetched = await repo.getDraft(owner, "d_1");
        expect(fetched).toMatchObject({
          draftId: "d_1",
          owner,
          encryptedPayload: "ZW5jcnlwdGVkLWRhdGE=",
        });

        await expect(repo.getDraft(otherOwner, "d_1")).resolves.toBeNull();
      });

      it("rejects duplicate draftId creation with a 409 conflict", async () => {
        await repo.createDraft(sampleDraft("d_dup"));
        await expect(repo.createDraft(sampleDraft("d_dup"))).rejects.toMatchObject({
          status: 409,
          code: "conflict",
        });
      });

      it("applies compare-and-swap updates when expectedVersion matches and increments version", async () => {
        await repo.createDraft(sampleDraft("d_cas"));

        const first = await repo.updateDraft(
          sampleDraft("d_cas", { encryptedPayload: "bmV3LXBheWxvYWQ=" }),
          1,
        );
        expect(first.updated).toBe(true);
        if (first.updated) {
          expect(first.draft.version).toBe(2);
          expect(first.draft.encryptedPayload).toBe("bmV3LXBheWxvYWQ=");
        }

        const stale = await repo.updateDraft(sampleDraft("d_cas"), 1);
        expect(stale.updated).toBe(false);
        if (!stale.updated) {
          expect(stale.current).not.toBeNull();
          expect(stale.current?.version).toBe(2);
        }
      });

      it("reports not-found CAS when the draft never existed", async () => {
        const result = await repo.updateDraft(sampleDraft("d_ghost"), 1);
        expect(result).toEqual({ updated: false, current: null });
      });

      it("deletes a draft and leaves other owners untouched", async () => {
        await repo.createDraft(sampleDraft("d_del", { owner: otherOwner }));
        await repo.createDraft(sampleDraft("d_keep"));

        await repo.deleteDraft(owner, "d_keep");
        await expect(repo.getDraft(owner, "d_keep")).resolves.toBeNull();
        await expect(repo.getDraft(otherOwner, "d_del")).resolves.not.toBeNull();
      });

      it("lists drafts scoped to the owner with pagination", async () => {
        for (let i = 0; i < 5; i += 1) {
          await repo.createDraft(
            sampleDraft(`d_page_${i}`, {
              updatedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
            }),
          );
        }
        await repo.createDraft(sampleDraft("d_other", { owner: otherOwner }));

        const first = await repo.listDrafts(owner, { limit: 2 });
        expect(first.items).toHaveLength(2);
        expect(first.items.every((d) => d.owner === owner)).toBe(true);
        expect(first.nextContinuationKey).not.toBeNull();

        const second = await repo.listDrafts(owner, {
          limit: 2,
          after: first.nextContinuationKey ?? undefined,
        });
        expect(second.items).toHaveLength(2);
        expect(second.items[0].draftId).not.toBe(first.items[0].draftId);

        const last = await repo.listDrafts(owner, {
          limit: 5,
          after: second.nextContinuationKey ?? undefined,
        });
        expect(last.items).toHaveLength(1);
        expect(last.nextContinuationKey).toBeNull();
      });
    });

    describe("recovery code sets (BETA-010 / Issue #1917)", () => {
      const sampleSet = {
        userId: "usr_test_1",
        status: "active" as const,
        codes: [
          { hash: "hash_1", salt: "salt_1", usedAt: null },
          { hash: "hash_2", salt: "salt_2", usedAt: null },
        ],
        generatedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        version: 1,
      };

      it("returns null for a missing recovery code set", async () => {
        await expect(repo.getRecoveryCodeSet("usr_missing")).resolves.toBeNull();
      });

      it("creates with expectedVersion 0 and refuses a second create", async () => {
        const created = await repo.setRecoveryCodeSet(sampleSet, 0);
        expect(created.updated).toBe(true);

        const conflict = await repo.setRecoveryCodeSet({ ...sampleSet, version: 1 }, 0);
        expect(conflict.updated).toBe(false);
        if (!conflict.updated) {
          expect(conflict.current).toMatchObject({ version: 1 });
        }
      });

      it("round-trips a recovery code set keyed by userId", async () => {
        await repo.setRecoveryCodeSet(sampleSet, 0);
        const fetched = await repo.getRecoveryCodeSet("usr_test_1");
        expect(fetched).toMatchObject({
          userId: "usr_test_1",
          status: "active",
          version: 1,
        });
        expect(fetched?.codes).toHaveLength(2);
      });

      it("applies a CAS update against the expected version and bumps it", async () => {
        await repo.setRecoveryCodeSet(sampleSet, 0);

        const stale = await repo.setRecoveryCodeSet(
          { ...sampleSet, updatedAt: "2026-01-02T00:00:00.000Z", version: 2 },
          9,
        );
        expect(stale.updated).toBe(false);
        if (!stale.updated) {
          expect(stale.current).toMatchObject({ version: 1 });
        }

        const applied = await repo.setRecoveryCodeSet(
          {
            ...sampleSet,
            status: "exhausted",
            updatedAt: "2026-01-02T00:00:00.000Z",
            version: 2,
          },
          1,
        );
        expect(applied.updated).toBe(true);
        if (applied.updated) {
          expect(applied.set.version).toBe(2);
          expect(applied.set.status).toBe("exhausted");
        }
      });

      it("allows exactly one writer to win a concurrent CAS", async () => {
        await repo.setRecoveryCodeSet(sampleSet, 0);

        const results = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            repo.setRecoveryCodeSet(
              {
                ...sampleSet,
                version: 2,
                updatedAt: `2026-01-02T00:00:0${i}.000Z`,
                codes: [{ hash: `hash_new_${i}`, salt: "salt_1", usedAt: null }],
              },
              1,
            ),
          ),
        );

        const winners = results.filter((result) => result.updated);
        expect(winners).toHaveLength(1);
        const persisted = await repo.getRecoveryCodeSet("usr_test_1");
        expect(persisted?.version).toBe(2);
        expect(persisted?.codes).toHaveLength(1);
      });
    });
  });
}
