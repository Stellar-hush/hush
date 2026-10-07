import { describe, it, expect, vi } from "vitest";
import {
  resolveRecipient,
  resolveRecipients,
  type RecipientResolutionContext,
} from "@/features/compose/recipientResolver";

describe("recipientResolver", () => {
  describe("resolveRecipient", () => {
    it("should reject invalid addresses", async () => {
      const blocked = new Set<string>();
      const result = await resolveRecipient("invalid email@", blocked);
      expect(result.state).toBe("invalid");
      expect(result.message).toContain("Enter a Hush address");
    });

    it("should block recipients in blocklist", async () => {
      const blocked = new Set(["badactor@example.com"]);
      const result = await resolveRecipient("badactor@example.com", blocked);
      expect(result.state).toBe("blocked");
      expect(result.policyType).toBe("block");
    });

    it("should accept valid Stellar G-addresses", async () => {
      const blocked = new Set<string>();
      const validGAddress = "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA";
      const result = await resolveRecipient(validGAddress, blocked);
      expect(result.state).not.toBe("invalid");
    });

    it("should accept valid Hush S-addresses", async () => {
      const blocked = new Set<string>();
      const validSAddress = "SBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA";
      const result = await resolveRecipient(validSAddress, blocked);
      expect(result.state).not.toBe("invalid");
    });

    it("should accept federation addresses (name*domain)", async () => {
      const blocked = new Set<string>();
      const fedAddress = "alice*stellar.org";
      const result = await resolveRecipient(fedAddress, blocked);
      expect(result.state).not.toBe("invalid");
    });

    it("should accept contact aliases", async () => {
      const blocked = new Set<string>();
      const alias = "alice_smith";
      const result = await resolveRecipient(alias, blocked);
      expect(result.state).not.toBe("invalid");
    });

    it("should mark unknown addresses as 'unknown' state", async () => {
      const blocked = new Set<string>();
      const result = await resolveRecipient("alice*stellar.org", blocked);
      expect(result.state).toBe("unknown");
    });

    it("should resolve contacts via context", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue({
          id: "contact-1",
          name: "Alice Smith",
          address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
          publicKey: "pubkey123",
          trusted: true,
        }),
      };

      const result = await resolveRecipient("alice", blocked, context);
      expect(result.state).toBe("verified");
      expect(result.policyType).toBe("allow");
      expect(result.encryptionKey).toBe("pubkey123");
      expect(context.resolveContact).toHaveBeenCalledWith("alice");
    });

    it("should resolve federation addresses via context", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveFederation: vi.fn().mockResolvedValue({
          publicKey: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
          domain: "stellar.org",
        }),
      };

      const result = await resolveRecipient("alice*stellar.org", blocked, context);
      expect(result.state).toBe("verified");
      expect(result.message).toContain("Stellar federation");
      expect(context.resolveFederation).toHaveBeenCalledWith("alice*stellar.org");
    });

    it("should handle resolution errors gracefully", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockRejectedValue(new Error("DB connection failed")),
      };

      const result = await resolveRecipient("alice", blocked, context);
      expect(result.state).toBe("unknown");
      expect(result.policyType).toBe("default");
    });

    it("should check isBlockedRecipient via context", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        isBlockedRecipient: vi.fn().mockResolvedValue(true),
      };

      const result = await resolveRecipient("alice*stellar.org", blocked, context);
      expect(result.state).toBe("blocked");
      expect(context.isBlockedRecipient).toHaveBeenCalledWith("alice*stellar.org");
    });

    it("should normalize addresses to lowercase", async () => {
      const blocked = new Set(["alice*stellar.org"]);
      const result = await resolveRecipient("ALICE*STELLAR.ORG", blocked);
      expect(result.state).toBe("blocked");
    });
  });

  describe("resolveRecipients", () => {
    it("should batch resolve multiple recipients", async () => {
      const blocked: string[] = [];
      const addresses = [
        "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
        "alice*stellar.org",
        "ab", // Too short for alias
      ];

      const results = await resolveRecipients(addresses, blocked);
      expect(results).toHaveLength(3);
      expect(results[0].state).not.toBe("invalid"); // Valid G-address
      expect(results[1].state).not.toBe("invalid"); // Valid federation
      expect(results[2].state).toBe("invalid"); // Alias too short
    });

    it("should pass context to individual resolvers", async () => {
      const blocked: string[] = [];
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue(null),
      };

      await resolveRecipients(["alice", "bob"], blocked, context);
      expect(context.resolveContact).toHaveBeenCalledTimes(2);
      expect(context.resolveContact).toHaveBeenNthCalledWith(1, "alice");
      expect(context.resolveContact).toHaveBeenNthCalledWith(2, "bob");
    });

    it("should respect blocklist for batch resolution", async () => {
      const blocked = ["alice@example.com", "bob@example.com"];
      const addresses = ["alice@example.com", "charlie@example.com"];

      const results = await resolveRecipients(addresses, blocked);
      expect(results[0].state).toBe("blocked");
      expect(results[1].state).not.toBe("blocked"); // Not in blocklist
    });
  });

  describe("address validation", () => {
    const testCases = [
      {
        address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
        expected: "not invalid",
        desc: "valid G-address",
      },
      {
        address: "SBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
        expected: "not invalid",
        desc: "valid S-address",
      },
      {
        address: "alice*stellar.org",
        expected: "not invalid",
        desc: "valid federation address",
      },
      {
        address: "alice_smith",
        expected: "not invalid",
        desc: "valid alias",
      },
      {
        address: "alice-smith",
        expected: "not invalid",
        desc: "valid alias with hyphen",
      },
      {
        address: "alice.smith",
        expected: "not invalid",
        desc: "valid alias with dot",
      },
      {
        address: "invalid email@",
        expected: "invalid",
        desc: "invalid format with space",
      },
      {
        address: "email@domain.com",
        expected: "invalid",
        desc: "email address not supported",
      },
      {
        address: "",
        expected: "invalid",
        desc: "empty address",
      },
      {
        address: "ab",
        expected: "invalid",
        desc: "alias too short",
      },
    ];

    testCases.forEach(({ address, expected, desc }) => {
      it(`should handle ${desc}`, async () => {
        const blocked = new Set<string>();
        const result = await resolveRecipient(address, blocked);
        if (expected === "invalid") {
          expect(result.state).toBe("invalid");
        } else {
          expect(result.state).not.toBe("invalid");
        }
      });
    });
  });

  describe("policy integration", () => {
    it("allow-listed trusted contact yields policyType allow and verified state", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue({
          id: "trusted-1",
          name: "Trusted Alice",
          address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
          publicKey: "pk_trusted",
          trusted: true,
        }),
      };

      const result = await resolveRecipient("trusted-alice", blocked, context);
      expect(result.state).toBe("verified");
      expect(result.policyType).toBe("allow");
      expect(result.encryptionKey).toBe("pk_trusted");
      // Trusted contacts should have their encryption key available
      expect(result.encryptionKey).toBeTruthy();
    });

    it("non-trusted contact yields policyType default and verified state", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue({
          id: "unknown-1",
          name: "Unknown Bob",
          address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          publicKey: undefined,
          trusted: false,
        }),
      };

      const result = await resolveRecipient("unknown-bob", blocked, context);
      expect(result.state).toBe("verified");
      expect(result.policyType).toBe("default");
    });

    it("blocked recipient via context yields state blocked and policyType block", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        isBlockedRecipient: vi.fn().mockResolvedValue(true),
      };

      const result = await resolveRecipient("alice*example.com", blocked, context);
      expect(result.state).toBe("blocked");
      expect(result.policyType).toBe("block");
    });

    it("unresolved unknown recipient yields policyType default", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue(null),
        isBlockedRecipient: vi.fn().mockResolvedValue(false),
      };

      const result = await resolveRecipient("unknown-alias", blocked, context);
      expect(result.state).toBe("unknown");
      expect(result.policyType).toBe("default");
    });

    it("federation-resolved recipient yields policyType default (no trust override)", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveFederation: vi.fn().mockResolvedValue({
          publicKey: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
          domain: "example.com",
        }),
      };

      const result = await resolveRecipient("alice*example.com", blocked, context);
      expect(result.state).toBe("verified");
      expect(result.policyType).toBe("default");
      expect(result.message).toContain("Stellar federation");
    });

    it("should propagate AbortSignal and handle cancellation during resolution", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue({
          id: "contact-1",
          name: "Alice",
          address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
          publicKey: "pubkey123",
          trusted: true,
        }),
      };

      const controller = new AbortController();
      controller.abort();

      await expect(
        resolveRecipient("alice", blocked, context, controller.signal),
      ).rejects.toThrow();
    });

    it("should block recipient if key directory reports key is revoked", async () => {
      const blocked = new Set<string>();
      const context: RecipientResolutionContext = {
        resolveContact: vi.fn().mockResolvedValue({
          id: "contact-1",
          name: "Alice",
          address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
          publicKey: "pubkey123",
          trusted: true,
        }),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            currentKeys: {
              encryption: {
                publicKey: "pubkey123",
                status: "revoked",
              },
            },
          },
        }),
      });

      try {
        const result = await resolveRecipient("alice", blocked, context);
        expect(result.state).toBe("blocked");
        expect(result.keyStatus).toBe("revoked");
        expect(result.message).toContain("revoked");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
