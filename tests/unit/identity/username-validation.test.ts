import { beforeEach, describe, expect, it } from "vitest";

import {
  normalizeUsername,
  validateUsername,
  checkUsernameAvailability,
  reserveUsername,
  isReservedWord,
  confusableNormalized,
  containsConfusables,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_RESERVATION_LEASE_MS,
} from "@/features/identity/username-validation";
import { MemoryApiRepository } from "@/server/api/memory-repository";
import type { User } from "@/server/api/domain";

describe("BETA-003 (Issue #1910): Canonical Hush username validation", () => {
  // -----------------------------------------------------------------------
  // 1. Normalization
  // -----------------------------------------------------------------------
  describe("normalizeUsername", () => {
    it("lowercases the input", () => {
      expect(normalizeUsername("Alice")).toBe("alice");
    });

    it("trims whitespace", () => {
      expect(normalizeUsername("  alice  ")).toBe("alice");
    });

    it("strips zero-width characters", () => {
      expect(normalizeUsername("a\u200Bl\u200Bi\u200Cc\u200Be")).toBe("alice");
      expect(normalizeUsername("a\u200D\uFEFF")).toBe("a");
    });

    it("applies Unicode NFKC normalization", () => {
      // Fullwidth Latin A -> normal A
      expect(normalizeUsername("\uFF21")).toBe("a");
      // Superscript two -> regular 2 (not in our range, just NFKC)
    });

    it("produces identical output for equivalent inputs", () => {
      const cases = ["Alice", "alice", " ALICE ", "aLice"];
      const normalized = cases.map(normalizeUsername);
      expect(new Set(normalized).size).toBe(1);
    });

    it("returns empty string for empty input", () => {
      expect(normalizeUsername("")).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Reserved words
  // -----------------------------------------------------------------------
  describe("isReservedWord", () => {
    it("rejects system words", () => {
      expect(isReservedWord("admin")).toBe(true);
      expect(isReservedWord("root")).toBe(true);
      expect(isReservedWord("support")).toBe(true);
    });

    it("rejects brand names", () => {
      expect(isReservedWord("hush")).toBe(true);
      expect(isReservedWord("stealth")).toBe(true);
      expect(isReservedWord("stellar")).toBe(true);
    });

    it("rejects protocol words", () => {
      expect(isReservedWord("api")).toBe(true);
      expect(isReservedWord("www")).toBe(true);
      expect(isReservedWord("ssh")).toBe(true);
    });

    it("rejects single-digit numbers", () => {
      expect(isReservedWord("0")).toBe(true);
      expect(isReservedWord("9")).toBe(true);
    });

    it("allows valid non-reserved usernames", () => {
      expect(isReservedWord("alice")).toBe(false);
      expect(isReservedWord("bob123")).toBe(false);
      expect(isReservedWord("cool-user")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Confusable detection
  // -----------------------------------------------------------------------
  describe("confusableNormalized", () => {
    it("maps Cyrillic lookalikes to ASCII", () => {
      // Cyrillic а (U+0430) + "dmin" -> "admin"
      expect(confusableNormalized("\u0430dmin")).toBe("admin");
    });

    it("maps Greek lookalikes to ASCII", () => {
      // Greek ο (U+03BF) -> "o"
      expect(confusableNormalized("r\u03BFot")).toBe("root");
    });

    it("leaves ASCII unchanged", () => {
      expect(confusableNormalized("alice")).toBe("alice");
    });
  });

  describe("containsConfusables", () => {
    it("returns true for Cyrillic characters", () => {
      expect(containsConfusables("\u0430lice")).toBe(true);
    });

    it("returns false for pure ASCII", () => {
      expect(containsConfusables("alice")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Full validation
  // -----------------------------------------------------------------------
  describe("validateUsername", () => {
    it("accepts valid alphanumeric username", () => {
      const result = validateUsername("alice");
      expect(result.valid).toBe(true);
      expect(result.canonical).toBe("alice");
    });

    it("accepts underscores and hyphens", () => {
      expect(validateUsername("alice_bob").valid).toBe(true);
      expect(validateUsername("alice-bob").valid).toBe(true);
    });

    it("rejects empty input", () => {
      const result = validateUsername("");
      expect(result.valid).toBe(false);
      expect(result.code).toBe("empty");
    });

    it("rejects too short", () => {
      const result = validateUsername("ab");
      expect(result.valid).toBe(false);
      expect(result.code).toBe("too_short");
    });

    it("rejects too long", () => {
      const result = validateUsername("a".repeat(31));
      expect(result.valid).toBe(false);
      expect(result.code).toBe("too_long");
    });

    it("rejects invalid characters", () => {
      expect(validateUsername("alice bob").valid).toBe(false);
      expect(validateUsername("alice.bob").valid).toBe(false);
      expect(validateUsername("alice@bob").valid).toBe(false);
    });

    it("rejects reserved words", () => {
      const result = validateUsername("admin");
      expect(result.valid).toBe(false);
      expect(result.code).toBe("reserved_word");
    });

    it("rejects Cyrillic lookalike of reserved word as invalid characters", () => {
      // Cyrillic а + "dmin" = visual "admin" -> caught by character class first
      const result = validateUsername("\u0430dmin");
      expect(result.valid).toBe(false);
      expect(result.code).toBe("invalid_characters");
    });

    it("normalizes input before validation", () => {
      const result = validateUsername("  ALICE  ");
      expect(result.valid).toBe(true);
      expect(result.canonical).toBe("alice");
    });

    it("rejects single-digit usernames", () => {
      expect(validateUsername("1").valid).toBe(false);
      expect(validateUsername("5").valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Availability check (repository-backed)
  // -----------------------------------------------------------------------
  describe("checkUsernameAvailability", () => {
    let repository: MemoryApiRepository;

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

    beforeEach(async () => {
      repository = new MemoryApiRepository();
      await repository.createUser(ALICE_USER);
    });

    it("returns available for an unused name", async () => {
      const result = await checkUsernameAvailability("bob", repository);
      expect(result.available).toBe(true);
      expect(result.canonical).toBe("bob");
    });

    it("returns unavailable for an existing user", async () => {
      const result = await checkUsernameAvailability("alice", repository);
      expect(result.available).toBe(false);
      expect(result.reason).toBe("taken");
    });

    it("returns unavailable for invalid names with same response shape", async () => {
      const result = await checkUsernameAvailability("x", repository);
      expect(result.available).toBe(false);
      // Enumeration-safe: same shape regardless of reason
      expect(result).toHaveProperty("canonical");
      expect(result).toHaveProperty("message");
    });

    it("returns unavailable for reserved words", async () => {
      const result = await checkUsernameAvailability("admin", repository);
      expect(result.available).toBe(false);
      expect(result.reason).toBe("reserved");
    });

    it("returns unavailable for active reservations", async () => {
      await repository.reserveUsername("tempname", "usr_other123456789", 30 * 60 * 1000);
      const result = await checkUsernameAvailability("tempname", repository);
      expect(result.available).toBe(false);
      expect(result.reason).toBe("reserved");
    });
  });

  // -----------------------------------------------------------------------
  // 6. Atomic reservation
  // -----------------------------------------------------------------------
  describe("reserveUsername", () => {
    let repository: MemoryApiRepository;

    beforeEach(async () => {
      repository = new MemoryApiRepository();
    });

    it("reserves a valid available username", async () => {
      const result = await reserveUsername("alice", "usr_alice123", repository);
      expect(result.success).toBe(true);
      expect(result.canonical).toBe("alice");
      expect(result.federationAddress).toBe("alice*betasmail.com");
      expect(result.emailAddress).toBe("alice@betasmail.com");
      expect(result.expiresAt).toBeDefined();
    });

    it("fails for reserved words", async () => {
      const result = await reserveUsername("admin", "usr_admin", repository);
      expect(result.success).toBe(false);
      expect(result.code).toBe("validation_failed");
    });

    it("fails for unavailable names", async () => {
      // First reservation succeeds
      await reserveUsername("bob", "usr_bob1", repository);
      // Second reservation with different user fails
      const result = await reserveUsername("bob", "usr_bob2", repository);
      expect(result.success).toBe(false);
      expect(result.code).toBe("unavailable");
    });

    it("allows re-reservation by the same user (idempotent)", async () => {
      const first = await reserveUsername("carol", "usr_carol1", repository);
      expect(first.success).toBe(true);

      const second = await reserveUsername("carol", "usr_carol1", repository);
      expect(second.success).toBe(true);
    });

    it("produces deterministic federation and email mappings", async () => {
      const result = await reserveUsername("testuser", "usr_test", repository);
      expect(result.federationAddress).toBe("testuser*betasmail.com");
      expect(result.emailAddress).toBe("testuser@betasmail.com");
    });
  });

  // -----------------------------------------------------------------------
  // 7. Concurrency / race cases
  // -----------------------------------------------------------------------
  describe("concurrent reservation", () => {
    let repository: MemoryApiRepository;

    beforeEach(async () => {
      repository = new MemoryApiRepository();
    });

    it("only one concurrent claim wins", async () => {
      const username = "contested";
      const results = await Promise.all([
        reserveUsername(username, "usr_a", repository),
        reserveUsername(username, "usr_b", repository),
        reserveUsername(username, "usr_c", repository),
      ]);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(2);
      expect(failures.every((f) => f.code === "unavailable")).toBe(true);
    });

    it("same user concurrent requests are idempotent", async () => {
      const username = "idempotent";
      const results = await Promise.all([
        reserveUsername(username, "usr_x", repository),
        reserveUsername(username, "usr_x", repository),
        reserveUsername(username, "usr_x", repository),
      ]);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Boundary cases
  // -----------------------------------------------------------------------
  describe("boundary cases", () => {
    it("accepts minimum length username", () => {
      const result = validateUsername("abc");
      expect(result.valid).toBe(true);
    });

    it("accepts maximum length username", () => {
      const result = validateUsername("a".repeat(30));
      expect(result.valid).toBe(true);
    });

    it("rejects 2-char username", () => {
      expect(validateUsername("ab").valid).toBe(false);
    });

    it("rejects 31-char username", () => {
      expect(validateUsername("a".repeat(31)).valid).toBe(false);
    });

    it("accepts username with all allowed special chars", () => {
      const result = validateUsername("a_b-c");
      expect(result.valid).toBe(true);
    });
  });
});
