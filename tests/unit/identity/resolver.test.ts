import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IdentityResolverService,
  normalizeIdentifier,
  parseIdentifier,
  defaultIdentityResolver,
} from "@/features/identity/resolver";
import { MemoryApiRepository } from "@/server/api/memory-repository";
import type { User } from "@/server/api/domain";
import { resolveRecipient } from "@/features/compose/recipientResolver";

describe("BETA-026 (Issue #1933): Production Stealth-Address & Stellar-Federation Resolver", () => {
  let repository: MemoryApiRepository;
  let resolver: IdentityResolverService;

  const ALICE_USER: User = {
    userId: "usr_alice123456",
    address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXAA",
    email: "alice@stealth.me",
    username: "alice",
    status: "active",
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const BOB_SUSPENDED: User = {
    userId: "usr_bob123456",
    address: "GAYOLLLVPWNOY2R572622UGLM2F2D72VFU7GY3QMR44QW277U7H353PPA",
    email: "bob@stealth.me",
    username: "bob",
    status: "suspended",
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const CHARLIE_PENDING: User = {
    userId: "usr_charlie123456",
    address: "GC5HNVLBPWNOY2R572622UGLM2F2D72VFU7GY3QMR44QW277U7H353XXA",
    email: "charlie@stealth.me",
    username: "charlie",
    status: "pending_verification",
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  beforeEach(async () => {
    repository = new MemoryApiRepository();
    (globalThis as any).__stealthApiRepository = repository;

    await repository.createUser(ALICE_USER);
    await repository.setProfile({
      userId: ALICE_USER.userId,
      username: ALICE_USER.username,
      displayName: "Alice Smith",
      avatarUrl: "https://stealth.me/avatars/alice.png",
      bio: "Crypto & Privacy enthusiast",
      locale: "en-US",
      timezone: "UTC",
      addressDisplay: "full" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    await repository.setPolicy(ALICE_USER.address, {
      allowUnknown: true,
      requireVerified: false,
      minimumPostage: "0",
    });

    await repository.createUser(BOB_SUSPENDED);
    await repository.createUser(CHARLIE_PENDING);

    resolver = new IdentityResolverService({
      positiveTtlMs: 60 * 1000,
      negativeTtlMs: 10 * 1000,
    });
  });

  describe("1. Normalization & Format Parsing", () => {
    it("handles Unicode NFKC normalization, whitespace trimming, and zero-width characters", () => {
      // Test full-width characters and zero-width spaces
      const input = "  \u200BＡlice@stealth.me\uFEFF  ";
      const normalized = normalizeIdentifier(input);
      expect(normalized).toBe("alice@stealth.me");
    });

    it("parses all supported identifier formats deterministically", () => {
      expect(parseIdentifier("alice@stealth.me")).toEqual({
        type: "local_handle",
        username: "alice",
        domain: "stealth.me",
      });

      expect(parseIdentifier("alice*stealth.me")).toEqual({
        type: "local_handle",
        username: "alice",
        domain: "stealth.me",
      });

      expect(parseIdentifier("alice*stealth.xyz")).toEqual({
        type: "local_handle",
        username: "alice",
        domain: "stealth.xyz",
      });

      expect(parseIdentifier("alice@stealth.xyz")).toEqual({
        type: "local_handle",
        username: "alice",
        domain: "stealth.xyz",
      });

      expect(parseIdentifier("GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXAA")).toEqual({
        type: "stellar_address",
        address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXAA",
      });

      expect(parseIdentifier("SBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXAA")).toEqual({
        type: "stealth_address",
        address: "SBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXAA",
      });

      expect(parseIdentifier("alice*stellar.org")).toEqual({
        type: "federation_address",
        username: "alice",
        domain: "stellar.org",
        raw: "alice*stellar.org",
      });

      expect(parseIdentifier("alice")).toEqual({
        type: "local_handle",
        username: "alice",
        domain: "betasmail.com",
      });

      expect(parseIdentifier("")).toEqual({
        type: "invalid",
        raw: "",
        reason: "Identifier cannot be empty",
      });
    });
  });

  describe("2. Local Hush Identity Resolution", () => {
    it("resolves active user across email, federation asterisk, and bare username formats", async () => {
      const formats = [
        "alice@betasmail.com",
        "alice*betasmail.com",
        "alice@smail.com",
        "alice@stealth.me",
        "alice*stealth.me",
        "alice@stealth.xyz",
        "alice",
      ];

      for (const format of formats) {
        const result = await resolver.resolve(format, {
          repository,
          bypassCache: true,
        });
        expect(result.resolved).toBe(true);
        expect(result.status).toBe("active");
        expect(result.account).toBe(ALICE_USER.address);
        expect(result.publicKey).toBe(ALICE_USER.address);
        expect(result.encryptionKeyVersion).toBe(1);
        expect(result.policyEndpoint).toBe(`/api/v1/policies/${ALICE_USER.address}`);
        expect(result.policy?.minimumPostage).toBe("0");
        expect(result.profile?.displayName).toBe("Alice Smith");
        expect(result.freshness.source).toBe("stealth_local");
        expect(result.freshness.cached).toBe(false);
      }
    });

    it("returns negative result for non-existent users without leaking database details", async () => {
      const result = await resolver.resolve("nonexistent@stealth.me", {
        repository,
      });
      expect(result.resolved).toBe(false);
      expect(result.status).toBe("unknown");
      expect(result.account).toBeNull();
      expect(result.error?.code).toBe("not_found");
    });
  });

  describe("3. Disabled, Suspended, and Stale Key Protection", () => {
    it("refuses to return suspended account as active or verified", async () => {
      const result = await resolver.resolve("bob@stealth.me", { repository });
      expect(result.resolved).toBe(false);
      expect(result.status).toBe("suspended");
      expect(result.publicKey).toBeNull();
      expect(result.error?.code).toBe("suspended");
      expect(result.error?.message).toContain("suspended");
    });

    it("refuses to return pending_verification account as active", async () => {
      const result = await resolver.resolve("charlie@stealth.me", {
        repository,
      });
      expect(result.resolved).toBe(false);
      expect(result.status).toBe("pending_verification");
      expect(result.publicKey).toBeNull();
      expect(result.error?.code).toBe("pending_verification");
    });
  });

  describe("4. Direct Address Resolution", () => {
    it("resolves registered Stellar G-address with full policy and profile", async () => {
      const result = await resolver.resolve(ALICE_USER.address, { repository });
      expect(result.resolved).toBe(true);
      expect(result.account).toBe(ALICE_USER.address);
      expect(result.status).toBe("active");
      expect(result.policyEndpoint).toBe(`/api/v1/policies/${ALICE_USER.address}`);
    });

    it("resolves unregistered direct Stellar G-address with direct_address source", async () => {
      const unregAddress = "GCZ7N22Q53VRD2O5M7N2465XQWXYJLYPUMF524X2R4V7ZDF7M466U7W4";
      const result = await resolver.resolve(unregAddress, { repository });
      expect(result.resolved).toBe(true);
      expect(result.account).toBe(unregAddress);
      expect(result.status).toBe("unknown");
      expect(result.freshness.source).toBe("direct_address");
      expect(result.policyEndpoint).toBe(`/api/v1/policies/${unregAddress}`);
    });
  });

  describe("5. External Stellar Federation Resolution", () => {
    it("resolves external federation address with custom resolver or SEP-0002 adapter", async () => {
      const customFederationResolver = vi.fn().mockResolvedValue({
        account_id: "GD6WNOY2R572622UGLM2F2D72VFU7GY3QMR44QW277U7H353PP722GAC",
        memo_type: "text",
        memo: "payment-memo-123",
      });

      const result = await resolver.resolve("dan*stellar.org", {
        customFederationResolver,
      });

      expect(result.resolved).toBe(true);
      expect(result.account).toBe("GD6WNOY2R572622UGLM2F2D72VFU7GY3QMR44QW277U7H353PP722GAC");
      expect(result.memo).toBe("payment-memo-123");
      expect(result.memoType).toBe("text");
      expect(result.freshness.source).toBe("stellar_federation");
      expect(customFederationResolver).toHaveBeenCalledWith("dan*stellar.org");
    });
  });

  describe("6. Bounded Positive & Negative Caching", () => {
    it("caches positive results and sets freshness.cached to true", async () => {
      const first = await resolver.resolve("alice@stealth.me", { repository });
      expect(first.freshness.cached).toBe(false);

      const second = await resolver.resolve("alice@stealth.me", { repository });
      expect(second.freshness.cached).toBe(true);
      expect(second.account).toBe(ALICE_USER.address);
    });

    it("caches negative results to mitigate lookup storms", async () => {
      const first = await resolver.resolve("unknown@stealth.me", {
        repository,
      });
      expect(first.resolved).toBe(false);
      expect(first.freshness.cached).toBe(false);

      const second = await resolver.resolve("unknown@stealth.me", {
        repository,
      });
      expect(second.resolved).toBe(false);
      expect(second.freshness.cached).toBe(true);
    });

    it("bypasses cache when bypassCache option is set", async () => {
      await resolver.resolve("alice@stealth.me", { repository });
      const fresh = await resolver.resolve("alice@stealth.me", {
        repository,
        bypassCache: true,
      });
      expect(fresh.freshness.cached).toBe(false);
    });
  });

  describe("7. Revocation-Aware Cache Invalidation", () => {
    it("invalidates cache by identifier", async () => {
      await resolver.resolve("alice@stealth.me", { repository });
      resolver.invalidate("alice@stealth.me");

      const next = await resolver.resolve("alice@stealth.me", { repository });
      expect(next.freshness.cached).toBe(false);
    });

    it("invalidates all aliases when invalidating by account address", async () => {
      await resolver.resolve("alice@stealth.me", { repository });
      await resolver.resolve("alice*stealth.me", { repository });

      resolver.invalidateAccount(ALICE_USER.address);

      const nextEmail = await resolver.resolve("alice@stealth.me", {
        repository,
      });
      const nextFed = await resolver.resolve("alice*stealth.me", {
        repository,
      });

      expect(nextEmail.freshness.cached).toBe(false);
      expect(nextFed.freshness.cached).toBe(false);
    });

    it("prevents serving cached data when account status changes to suspended", async () => {
      // 1. Initial resolution: active
      const res1 = await resolver.resolve("alice@stealth.me", { repository });
      expect(res1.status).toBe("active");

      // 2. Account suspended in database
      await repository.updateUser({ ...ALICE_USER, status: "suspended" }, ALICE_USER.version);

      // Invalidate account
      resolver.invalidateAccount(ALICE_USER.address);

      // 3. Subsequent resolution reflects suspension
      const res2 = await resolver.resolve("alice@stealth.me", { repository });
      expect(res2.resolved).toBe(false);
      expect(res2.status).toBe("suspended");
      expect(res2.publicKey).toBeNull();
    });
  });

  describe("8. Timeout & AbortSignal Handling", () => {
    it("safely times out slow federation resolutions", async () => {
      const slowResolver = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)));

      const result = await resolver.resolve("slow*example.com", {
        timeoutMs: 50,
        customFederationResolver: slowResolver,
      });

      expect(result.resolved).toBe(false);
      expect(result.error?.code).toBe("timeout");
    });
  });

  describe("9. Compose recipientResolver Integration", () => {
    it("resolves recipient in compose flow using IdentityResolverService", async () => {
      const blocked = new Set<string>();
      const result = await resolveRecipient("alice@stealth.me", blocked, {
        identityResolver: resolver,
      });

      expect(result.state).toBe("verified");
      expect(result.resolvedAccount).toBe(ALICE_USER.address);
      expect(result.encryptionKey).toBe(ALICE_USER.address);
    });

    it("blocks suspended accounts in compose recipient resolution", async () => {
      const blocked = new Set<string>();
      const result = await resolveRecipient("bob@stealth.me", blocked, {
        identityResolver: resolver,
      });

      expect(result.state).toBe("blocked");
      expect(result.message).toContain("suspended");
    });
  });
});
