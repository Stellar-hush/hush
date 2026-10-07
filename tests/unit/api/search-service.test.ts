import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  computeHighlights,
  escapeRegex,
  normalizeSearchTerm,
  parseSearchQuery,
  searchMailboxService,
} from "../../../src/server/api/search-service";
import type { StoredEnvelope } from "../../../src/server/api/domain";
import { MemoryApiRepository } from "../../../src/server/api/memory-repository";

const ACTOR_A = "GDV4Z3O74NKQ5G7B5G5P7Z7Q7R7S7T7U7V7W7X7Y7Z7A7B7C7D7E7F7G";
const ACTOR_B = "GA7B7C7D7E7F7G7H7I7J7K7L7M7N7O7P7Q7R7S7T7U7V7W7X7Y7Z7A7B";
const ACTOR_C = "GC7C7C7D7E7F7G7H7I7J7K7L7M7N7O7P7Q7R7S7T7U7V7W7X7Y7Z7A7B";

function makeEnvelope(overrides: Partial<StoredEnvelope>): StoredEnvelope {
  return {
    messageId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    senderId: ACTOR_C,
    recipientId: ACTOR_A,
    ciphertext: "dGVzdCBjaXBoZXJ0ZXh0", // Base64
    createdAt: new Date().toISOString(),
    protectedHeaders: {
      from: "alice@example.com",
      to: "bob@example.com",
      subject: "Important Project Update",
    },
    status: "pending",
    ...overrides,
  };
}

describe("Search Service (Issue #1972 / BETA-065)", () => {
  let repo: MemoryApiRepository;

  beforeEach(() => {
    process.env.STEALTH_CURSOR_SECRET = "test-cursor-secret";
    repo = new MemoryApiRepository();
    repo.reset();
  });

  afterEach(() => {
    delete process.env.STEALTH_CURSOR_SECRET;
  });

  describe("Query Parsing & Unicode", () => {
    it("parses directives for sender, recipient, folder, unread, attachments, and dates", () => {
      const parsed = parseSearchQuery(
        'from:alice to:bob folder:inbox is:unread has:attachment after:2026-01-01 before:2026-12-31 "quarterly report" budget',
      );

      expect(parsed.filters.sender).toBe("alice");
      expect(parsed.filters.recipient).toBe("bob");
      expect(parsed.filters.folder).toBe("inbox");
      expect(parsed.filters.unread).toBe(true);
      expect(parsed.filters.hasAttachments).toBe(true);
      expect(parsed.filters.afterDate).toBe("2026-01-01");
      expect(parsed.filters.beforeDate).toBe("2026-12-31");
      expect(parsed.tokens).toEqual(["quarterly report", "budget"]);
      expect(parsed.textQuery).toBe("quarterly report budget");
    });

    it("parses is:starred, is:read, is:deleted", () => {
      const parsedStarred = parseSearchQuery("is:starred");
      expect(parsedStarred.filters.starred).toBe(true);

      const parsedRead = parseSearchQuery("is:read");
      expect(parsedRead.filters.unread).toBe(false);

      const parsedTrash = parseSearchQuery("is:trash");
      expect(parsedTrash.filters.folder).toBe("trash");
      expect(parsedTrash.filters.includeDeleted).toBe(true);
    });

    it("normalizes unicode and diacritics properly (NFKC)", () => {
      const input = "CAFÉ résumé \u0041\u030A"; // Å decomposed
      const normalized = normalizeSearchTerm(input);
      expect(normalized).toBe("café résumé å");
    });

    it("escapes regex characters safely", () => {
      const input = "test.*+?^${}()|[]\\";
      const escaped = escapeRegex(input);
      expect(escaped).toBe("test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
    });
  });

  describe("Highlighting", () => {
    it("computes highlights for matched tokens", () => {
      const fields = {
        subject: "Security Audit and Protocol Verification Notes",
        from: "security@stealth.network",
      };
      const highlights = computeHighlights(fields, ["audit", "stealth"]);
      expect(highlights.length).toBe(2);
      expect(highlights.find((h) => h.field === "subject")?.snippet).toContain("Audit");
      expect(highlights.find((h) => h.field === "from")?.snippet).toContain("stealth");
    });

    it("handles non-matching fields gracefully", () => {
      const fields = {
        subject: "Welcome to Hush Mail",
      };
      const highlights = computeHighlights(fields, ["nonexistent"]);
      expect(highlights.length).toBe(0);
    });
  });

  describe("Privacy-Safe Search & Permission Scoping", () => {
    it("server search never stores or returns plaintext body content", async () => {
      await repo.insertEnvelope(
        makeEnvelope({
          messageId: "1111111111111111111111111111111111111111111111111111111111111111",
          recipientId: ACTOR_A,
          ciphertext: "ZW5jcnlwdGVkLWJvZHk=",
          protectedHeaders: {
            subject: "Confidential Project",
          },
        }),
      );

      const result = await searchMailboxService(repo, ACTOR_A, { q: "Confidential" });
      expect(result.items.length).toBe(1);
      const item = result.items[0];
      // Verify body is not indexed or exposed from server
      expect((item as any).body).toBeUndefined();
      expect(result.indexLimitations.serverIndexLimited).toBe(true);
      expect(result.indexLimitations.encryptedBodyIndexed).toBe(false);
    });

    it("results cannot reveal another user's messages (strict tenant isolation)", async () => {
      // Message for Actor A from Actor C
      await repo.insertEnvelope(
        makeEnvelope({
          messageId: "2222222222222222222222222222222222222222222222222222222222222222",
          recipientId: ACTOR_A,
          senderId: ACTOR_C,
          protectedHeaders: { subject: "Actor A Secret" },
        }),
      );

      // Message for Actor B from Actor C
      await repo.insertEnvelope(
        makeEnvelope({
          messageId: "3333333333333333333333333333333333333333333333333333333333333333",
          recipientId: ACTOR_B,
          senderId: ACTOR_C,
          protectedHeaders: { subject: "Actor B Secret" },
        }),
      );

      // Actor A searches
      const searchForA = await searchMailboxService(repo, ACTOR_A, { q: "Secret" });
      expect(searchForA.items.length).toBe(1);
      expect(searchForA.items[0].id).toBe(
        "2222222222222222222222222222222222222222222222222222222222222222",
      );

      // Actor B searches
      const searchForB = await searchMailboxService(repo, ACTOR_B, { q: "Secret" });
      expect(searchForB.items.length).toBe(1);
      expect(searchForB.items[0].id).toBe(
        "3333333333333333333333333333333333333333333333333333333333333333",
      );
    });

    it("excludes deleted/tombstoned messages by default unless trash/is:deleted is requested", async () => {
      const activeMsgId = "4444444444444444444444444444444444444444444444444444444444444444";
      const deletedMsgId = "5555555555555555555555555555555555555555555555555555555555555555";

      await repo.insertEnvelope(
        makeEnvelope({
          messageId: activeMsgId,
          recipientId: ACTOR_A,
          protectedHeaders: { subject: "Active Newsletter" },
        }),
      );

      await repo.insertEnvelope(
        makeEnvelope({
          messageId: deletedMsgId,
          recipientId: ACTOR_A,
          deletedAt: new Date().toISOString(),
          protectedHeaders: { subject: "Deleted Newsletter" },
        }),
      );

      // Default search excludes deleted
      const normalSearch = await searchMailboxService(repo, ACTOR_A, { q: "Newsletter" });
      expect(normalSearch.items.length).toBe(1);
      expect(normalSearch.items[0].id).toBe(activeMsgId);

      // Search with is:deleted includes deleted items
      const deletedSearch = await searchMailboxService(repo, ACTOR_A, {
        q: "is:deleted Newsletter",
      });
      expect(deletedSearch.items.length).toBe(1);
      expect(deletedSearch.items[0].id).toBe(deletedMsgId);
    });

    it("supports multi-faceted filters (folder, unread, hasAttachments, sender)", async () => {
      await repo.insertEnvelope(
        makeEnvelope({
          messageId: "6666666666666666666666666666666666666666666666666666666666666666",
          recipientId: ACTOR_A,
          status: "pending",
          protectedHeaders: {
            from: "marcus@stealth.xyz",
            subject: "Architecture Spec",
          },
          metadata: {
            mailbox: { folder: "inbox", unread: true, starred: true },
            attachments: [{ filename: "spec.pdf", size: 1024 }],
          },
        }),
      );

      await repo.insertEnvelope(
        makeEnvelope({
          messageId: "7777777777777777777777777777777777777777777777777777777777777777",
          recipientId: ACTOR_A,
          status: "delivered",
          protectedHeaders: {
            from: "marcus@stealth.xyz",
            subject: "Architecture Notes",
          },
          metadata: {
            mailbox: { folder: "archive", unread: false, starred: false },
          },
        }),
      );

      // Search unread with attachment in inbox
      const searchRes = await searchMailboxService(repo, ACTOR_A, {
        q: "from:marcus folder:inbox is:unread has:attachment Spec",
      });

      expect(searchRes.items.length).toBe(1);
      expect(searchRes.items[0].id).toBe(
        "6666666666666666666666666666666666666666666666666666666666666666",
      );
      expect(searchRes.items[0].hasAttachments).toBe(true);
      expect(searchRes.items[0].unread).toBe(true);
    });

    it("handles injection strings safely without throwing or compromising query logic", async () => {
      const injectionQueries = [
        "'; DROP TABLE envelopes; --",
        "../../etc/passwd",
        "<script>alert(1)</script>",
        "($where: 'this.recipientId == null')",
        "*|()",
      ];

      for (const query of injectionQueries) {
        const res = await searchMailboxService(repo, ACTOR_A, { q: query });
        expect(res).toBeDefined();
        expect(Array.isArray(res.items)).toBe(true);
      }
    });

    it("supports cursor-based pagination across large results", async () => {
      // Insert 10 envelopes
      for (let i = 0; i < 10; i++) {
        const hex = i.toString(16).padStart(2, "0").repeat(32);
        await repo.insertEnvelope(
          makeEnvelope({
            messageId: hex,
            recipientId: ACTOR_A,
            createdAt: new Date(Date.now() - i * 1000).toISOString(),
            protectedHeaders: { subject: `Batch Item ${i}` },
          }),
        );
      }

      // First page of 3
      const page1 = await searchMailboxService(repo, ACTOR_A, { q: "Batch", limit: 3 });
      expect(page1.items.length).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();

      // Second page of 3
      const page2 = await searchMailboxService(repo, ACTOR_A, {
        q: "Batch",
        limit: 3,
        cursor: page1.nextCursor!,
      });
      expect(page2.items.length).toBe(3);
      expect(page2.items[0].id).not.toBe(page1.items[0].id);
    });
  });
});
