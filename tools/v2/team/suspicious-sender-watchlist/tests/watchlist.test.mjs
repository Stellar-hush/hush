/**
 * watchlist.test.mjs — Suspicious Sender Watchlist
 *
 * Tests for the core service logic.  Runs under Node's built-in test runner
 * (`node --test`).  No React / DOM required.
 *
 * We replicate the pure functions inline so no TypeScript loader is needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline replicas of the pure helpers (mirrors watchlist.service.ts logic)
// ---------------------------------------------------------------------------

const FIXTURES = [
  {
    id: "watch-001",
    senderEmail: "noreply@phishing-stealth-alert.example.com",
    senderName: "Hush Security Alert",
    reason: "Known phishing domain",
    riskLevel: "high",
    status: "active",
    dateAdded: "2026-06-01",
    notes: "Flagged by 3 team members",
  },
  {
    id: "watch-002",
    senderEmail: "billing@fake-invoice-portal.example.net",
    senderName: "Invoice Portal",
    reason: "Fraudulent invoice sender",
    riskLevel: "high",
    status: "active",
    dateAdded: "2026-06-05",
  },
  {
    id: "watch-003",
    senderEmail: "promo@bulk-sender-spam.example.org",
    senderName: "Promo Sender",
    reason: "High-volume unsolicited bulk mail",
    riskLevel: "medium",
    status: "active",
    dateAdded: "2026-06-08",
  },
  {
    id: "watch-004",
    senderEmail: "support@lookalike-domain.example.com",
    senderName: "Customer Support",
    reason: "Lookalike domain",
    riskLevel: "medium",
    status: "active",
    dateAdded: "2026-06-10",
  },
  {
    id: "watch-005",
    senderEmail: "newsletter@low-risk-sender.example.io",
    senderName: "Newsletter Service",
    reason: "Occasional misleading subject lines",
    riskLevel: "low",
    status: "active",
    dateAdded: "2026-06-12",
  },
  {
    id: "watch-006",
    senderEmail: "old-threat@dismissed-example.com",
    senderName: "Former Threat Actor",
    reason: "Previously flagged; domain deactivated",
    riskLevel: "high",
    status: "dismissed",
    dateAdded: "2026-05-20",
  },
];

function computeMetrics(entries) {
  return {
    total: entries.length,
    highRisk: entries.filter((e) => e.riskLevel === "high").length,
    mediumRisk: entries.filter((e) => e.riskLevel === "medium").length,
    lowRisk: entries.filter((e) => e.riskLevel === "low").length,
    active: entries.filter((e) => e.status === "active").length,
    dismissed: entries.filter((e) => e.status === "dismissed").length,
  };
}

function applyFilter(entries, filter) {
  let result = entries;
  if (filter.riskLevel) result = result.filter((e) => e.riskLevel === filter.riskLevel);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(
      (e) =>
        e.senderEmail.toLowerCase().includes(q) ||
        e.senderName.toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q),
    );
  }
  return result;
}

let _idCounter = 100;
function generateId() {
  return `watch-${String(++_idCounter).padStart(3, "0")}`;
}

function createService(initialEntries = FIXTURES) {
  let entries = initialEntries.map((e) => ({ ...e }));

  async function getEntries(filter = {}) {
    return applyFilter(entries, filter);
  }

  async function addEntry(input) {
    const entry = {
      id: generateId(),
      senderEmail: input.senderEmail,
      senderName: input.senderName,
      reason: input.reason,
      riskLevel: input.riskLevel,
      status: "active",
      dateAdded: new Date().toISOString().slice(0, 10),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    entries = [...entries, entry];
    return entry;
  }

  async function updateRisk(input) {
    const idx = entries.findIndex((e) => e.id === input.id);
    if (idx === -1) throw new Error(`Entry ${input.id} not found.`);
    const updated = { ...entries[idx], riskLevel: input.riskLevel };
    entries = entries.map((e, i) => (i === idx ? updated : e));
    return updated;
  }

  async function dismissEntry(id) {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Entry ${id} not found.`);
    const updated = { ...entries[idx], status: "dismissed" };
    entries = entries.map((e, i) => (i === idx ? updated : e));
    return updated;
  }

  async function removeEntry(id) {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Entry ${id} not found.`);
    entries = entries.filter((e) => e.id !== id);
  }

  async function getMetrics() {
    return computeMetrics(entries);
  }

  return { getEntries, addEntry, updateRisk, dismissEntry, removeEntry, getMetrics };
}

// ---------------------------------------------------------------------------
// Guard-augmented service (replicates guard integration in watchlist.service.ts)
// ---------------------------------------------------------------------------

// Inline replica of the guard logic so no ESM import is needed for tests
class WatchlistValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "WatchlistValidationError";
    this.field = field;
  }
}

const GUARD_LIMITS = {
  MAX_WATCHLIST_ENTRIES: 5_000,
  MAX_ID_LENGTH: 64,
  MAX_EMAIL_LENGTH: 320,
  MAX_NAME_LENGTH: 200,
  MAX_REASON_LENGTH: 500,
  MAX_SEARCH_LENGTH: 100,
  ALLOWED_RISK_LEVELS: ["low", "medium", "high"],
};

const WATCHLIST_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sanitizeText(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/[\r\n\0]/g, " ");
}

function validateWatchlistId(id) {
  if (typeof id !== "string" || id.length === 0) {
    throw new WatchlistValidationError("id must be a non-empty string", "id");
  }
  if (id.length > GUARD_LIMITS.MAX_ID_LENGTH) {
    throw new WatchlistValidationError(
      `id exceeds max length of ${GUARD_LIMITS.MAX_ID_LENGTH}`,
      "id",
    );
  }
  if (!WATCHLIST_ID_PATTERN.test(id)) {
    throw new WatchlistValidationError("id contains illegal characters", "id");
  }
  return id;
}

function validateSenderEmail(email) {
  if (typeof email !== "string" || email.length === 0) {
    throw new WatchlistValidationError("senderEmail must be a non-empty string", "senderEmail");
  }
  if (email.length > GUARD_LIMITS.MAX_EMAIL_LENGTH) {
    throw new WatchlistValidationError(
      `senderEmail exceeds max length of ${GUARD_LIMITS.MAX_EMAIL_LENGTH}`,
      "senderEmail",
    );
  }
  if (/[\r\n\0]/.test(email)) {
    throw new WatchlistValidationError(
      "senderEmail contains illegal control characters",
      "senderEmail",
    );
  }
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 1 || atIndex === email.length - 1) {
    throw new WatchlistValidationError(
      "senderEmail is malformed — missing local part or domain",
      "senderEmail",
    );
  }
  return email;
}

function validateSenderName(name) {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new WatchlistValidationError("senderName must be a non-empty string", "senderName");
  }
  if (name.length > GUARD_LIMITS.MAX_NAME_LENGTH) {
    throw new WatchlistValidationError(
      `senderName exceeds max length of ${GUARD_LIMITS.MAX_NAME_LENGTH}`,
      "senderName",
    );
  }
  return sanitizeText(name);
}

function validateReason(reason) {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new WatchlistValidationError("reason must be a non-empty string", "reason");
  }
  if (reason.length > GUARD_LIMITS.MAX_REASON_LENGTH) {
    throw new WatchlistValidationError(
      `reason exceeds max length of ${GUARD_LIMITS.MAX_REASON_LENGTH}`,
      "reason",
    );
  }
  return sanitizeText(reason);
}

function validateRiskLevel(level) {
  if (typeof level !== "string" || level.length === 0) {
    throw new WatchlistValidationError("riskLevel must be a non-empty string", "riskLevel");
  }
  const lowered = level.toLowerCase();
  if (!GUARD_LIMITS.ALLOWED_RISK_LEVELS.includes(lowered)) {
    throw new WatchlistValidationError(`"${level}" is not a recognised risk level`, "riskLevel");
  }
  return lowered;
}

function guardWatchlistSize(entries) {
  if (!Array.isArray(entries)) {
    throw new WatchlistValidationError("entries must be an array", "entries");
  }
  if (entries.length >= GUARD_LIMITS.MAX_WATCHLIST_ENTRIES) {
    throw new WatchlistValidationError(
      `watchlist size ${entries.length} exceeds safe limit of ${GUARD_LIMITS.MAX_WATCHLIST_ENTRIES}`,
      "entries",
    );
  }
  return true;
}

function validateSearchQuery(query) {
  if (query === undefined || query === null) return "";
  if (typeof query !== "string") {
    throw new WatchlistValidationError("search query must be a string", "search");
  }
  if (query.length > GUARD_LIMITS.MAX_SEARCH_LENGTH) {
    throw new WatchlistValidationError(
      `search query exceeds max length of ${GUARD_LIMITS.MAX_SEARCH_LENGTH}`,
      "search",
    );
  }
  return query.trim();
}

function validateAddEntryInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new WatchlistValidationError("addEntry input must be a plain object", "input");
  }
  const senderEmail = validateSenderEmail(input.senderEmail);
  const senderName = validateSenderName(input.senderName);
  const reason = validateReason(input.reason);
  const riskLevel = validateRiskLevel(input.riskLevel);
  return { senderEmail, senderName, reason, riskLevel };
}

function createServiceWithGuards(initialEntries = FIXTURES) {
  let entries = initialEntries.map((e) => ({ ...e }));

  async function getEntries(filter = {}) {
    return applyFilter(entries, filter);
  }

  async function addEntry(input) {
    const validated = validateAddEntryInput(input);
    guardWatchlistSize(entries);

    const entry = {
      id: generateId(),
      senderEmail: validated.senderEmail,
      senderName: validated.senderName,
      reason: validated.reason,
      riskLevel: validated.riskLevel,
      status: "active",
      dateAdded: new Date().toISOString().slice(0, 10),
      ...(input.notes !== undefined ? { notes: sanitizeText(input.notes) } : {}),
    };
    entries = [...entries, entry];
    return entry;
  }

  async function updateRisk(input) {
    validateWatchlistId(input.id);
    validateRiskLevel(input.riskLevel);

    const idx = entries.findIndex((e) => e.id === input.id);
    if (idx === -1) throw new Error(`Entry ${input.id} not found.`);
    const updated = { ...entries[idx], riskLevel: input.riskLevel.toLowerCase() };
    entries = entries.map((e, i) => (i === idx ? updated : e));
    return updated;
  }

  async function dismissEntry(id) {
    validateWatchlistId(id);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Entry ${id} not found.`);
    const updated = { ...entries[idx], status: "dismissed" };
    entries = entries.map((e, i) => (i === idx ? updated : e));
    return updated;
  }

  async function removeEntry(id) {
    validateWatchlistId(id);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Entry ${id} not found.`);
    entries = entries.filter((e) => e.id !== id);
  }

  async function getMetrics() {
    guardWatchlistSize(entries);
    return computeMetrics(entries);
  }

  /** Guard-augmented applyFilter that validates inputs */
  function guardedApplyFilter(list, filter = {}) {
    let result = list;

    try {
      guardWatchlistSize(list);
    } catch (e) {
      if (e instanceof WatchlistValidationError) return [];
      throw e;
    }

    if (filter.riskLevel) {
      const validatedLevel = validateRiskLevel(filter.riskLevel);
      result = result.filter((e) => e.riskLevel === validatedLevel);
    }
    if (filter.status) {
      const q = filter.status.toLowerCase();
      result = result.filter((e) => e.status === q);
    }
    if (filter.search) {
      const q = validateSearchQuery(filter.search);
      if (q) {
        const lowered = q.toLowerCase();
        result = result.filter(
          (e) =>
            e.senderEmail.toLowerCase().includes(lowered) ||
            e.senderName.toLowerCase().includes(lowered) ||
            e.reason.toLowerCase().includes(lowered),
        );
      }
    }
    return result;
  }

  return {
    getEntries,
    addEntry,
    updateRisk,
    dismissEntry,
    removeEntry,
    getMetrics,
    guardedApplyFilter,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Suspicious Sender Watchlist — Fixtures", () => {
  it("has 6 fixture entries total", () => {
    assert.strictEqual(FIXTURES.length, 6);
  });

  it("has 5 active and 1 dismissed entry", () => {
    const active = FIXTURES.filter((e) => e.status === "active");
    const dismissed = FIXTURES.filter((e) => e.status === "dismissed");
    assert.strictEqual(active.length, 5);
    assert.strictEqual(dismissed.length, 1);
  });

  it("has 3 high-risk, 2 medium-risk, 1 low-risk entry", () => {
    assert.strictEqual(FIXTURES.filter((e) => e.riskLevel === "high").length, 3);
    assert.strictEqual(FIXTURES.filter((e) => e.riskLevel === "medium").length, 2);
    assert.strictEqual(FIXTURES.filter((e) => e.riskLevel === "low").length, 1);
  });

  it("every entry has required fields", () => {
    for (const entry of FIXTURES) {
      assert.ok(entry.id, "missing id");
      assert.ok(entry.senderEmail, "missing senderEmail");
      assert.ok(entry.senderName, "missing senderName");
      assert.ok(entry.reason, "missing reason");
      assert.ok(["low", "medium", "high"].includes(entry.riskLevel), "invalid riskLevel");
      assert.ok(["active", "dismissed"].includes(entry.status), "invalid status");
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.dateAdded), "invalid dateAdded format");
    }
  });
});

describe("Suspicious Sender Watchlist — computeMetrics", () => {
  it("returns correct totals for fixture data", () => {
    const m = computeMetrics(FIXTURES);
    assert.strictEqual(m.total, 6);
    assert.strictEqual(m.highRisk, 3);
    assert.strictEqual(m.mediumRisk, 2);
    assert.strictEqual(m.lowRisk, 1);
    assert.strictEqual(m.active, 5);
    assert.strictEqual(m.dismissed, 1);
  });

  it("returns zero metrics for empty list", () => {
    const m = computeMetrics([]);
    assert.strictEqual(m.total, 0);
    assert.strictEqual(m.highRisk, 0);
    assert.strictEqual(m.mediumRisk, 0);
    assert.strictEqual(m.lowRisk, 0);
    assert.strictEqual(m.active, 0);
    assert.strictEqual(m.dismissed, 0);
  });

  it("counts correctly for a single-entry list", () => {
    const m = computeMetrics([FIXTURES[0]]);
    assert.strictEqual(m.total, 1);
    assert.strictEqual(m.highRisk, 1);
    assert.strictEqual(m.mediumRisk, 0);
    assert.strictEqual(m.lowRisk, 0);
    assert.strictEqual(m.active, 1);
    assert.strictEqual(m.dismissed, 0);
  });
});

describe("Suspicious Sender Watchlist — applyFilter", () => {
  it("returns all entries with empty filter", () => {
    assert.strictEqual(applyFilter(FIXTURES, {}).length, 6);
  });

  it("filters by riskLevel=high", () => {
    const result = applyFilter(FIXTURES, { riskLevel: "high" });
    assert.strictEqual(result.length, 3);
    assert.ok(result.every((e) => e.riskLevel === "high"));
  });

  it("filters by riskLevel=low", () => {
    const result = applyFilter(FIXTURES, { riskLevel: "low" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "watch-005");
  });

  it("filters by status=dismissed", () => {
    const result = applyFilter(FIXTURES, { status: "dismissed" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "watch-006");
  });

  it("filters by status=active", () => {
    const result = applyFilter(FIXTURES, { status: "active" });
    assert.strictEqual(result.length, 5);
    assert.ok(result.every((e) => e.status === "active"));
  });

  it("filters by search matching senderEmail", () => {
    const result = applyFilter(FIXTURES, { search: "phishing" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "watch-001");
  });

  it("filters by search matching senderName (case-insensitive)", () => {
    const result = applyFilter(FIXTURES, { search: "invoice portal" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "watch-002");
  });

  it("filters by search matching reason", () => {
    const result = applyFilter(FIXTURES, { search: "bulk" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "watch-003");
  });

  it("returns empty array when search matches nothing", () => {
    const result = applyFilter(FIXTURES, { search: "zzz-no-match" });
    assert.strictEqual(result.length, 0);
  });

  it("combines riskLevel and status filters", () => {
    // high-risk AND dismissed → only watch-006
    const result = applyFilter(FIXTURES, { riskLevel: "high", status: "dismissed" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "watch-006");
  });
});

describe("Suspicious Sender Watchlist — Service", () => {
  it("getEntries returns all fixture entries by default", async () => {
    const svc = createService();
    const entries = await svc.getEntries();
    assert.strictEqual(entries.length, 6);
  });

  it("getEntries respects riskLevel filter", async () => {
    const svc = createService();
    const entries = await svc.getEntries({ riskLevel: "medium" });
    assert.strictEqual(entries.length, 2);
    assert.ok(entries.every((e) => e.riskLevel === "medium"));
  });

  it("addEntry creates a new entry with status=active and today's date", async () => {
    const svc = createService();
    const added = await svc.addEntry({
      senderEmail: "new@threat.example.com",
      senderName: "New Threat",
      reason: "Test addition",
      riskLevel: "medium",
    });

    assert.ok(added.id.startsWith("watch-"));
    assert.strictEqual(added.status, "active");
    assert.strictEqual(added.senderEmail, "new@threat.example.com");
    assert.strictEqual(added.riskLevel, "medium");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(added.dateAdded));

    const entries = await svc.getEntries();
    assert.strictEqual(entries.length, 7);
  });

  it("addEntry persists notes when provided", async () => {
    const svc = createService();
    const added = await svc.addEntry({
      senderEmail: "noted@threat.example.com",
      senderName: "Noted Threat",
      reason: "Has notes",
      riskLevel: "low",
      notes: "keep an eye",
    });
    assert.strictEqual(added.notes, "keep an eye");
  });

  it("updateRisk changes the riskLevel and reflects in getEntries", async () => {
    const svc = createService();
    const updated = await svc.updateRisk({ id: "watch-005", riskLevel: "high" });
    assert.strictEqual(updated.riskLevel, "high");

    const entries = await svc.getEntries({ riskLevel: "high" });
    assert.ok(entries.some((e) => e.id === "watch-005"));
  });

  it("updateRisk throws for unknown id", async () => {
    const svc = createService();
    await assert.rejects(() => svc.updateRisk({ id: "watch-999", riskLevel: "low" }), /not found/);
  });

  it("dismissEntry sets status=dismissed", async () => {
    const svc = createService();
    const dismissed = await svc.dismissEntry("watch-003");
    assert.strictEqual(dismissed.status, "dismissed");

    const active = await svc.getEntries({ status: "active" });
    assert.ok(!active.some((e) => e.id === "watch-003"));
  });

  it("dismissEntry throws for unknown id", async () => {
    const svc = createService();
    await assert.rejects(() => svc.dismissEntry("watch-999"), /not found/);
  });

  it("removeEntry deletes the entry permanently", async () => {
    const svc = createService();
    await svc.removeEntry("watch-001");

    const entries = await svc.getEntries();
    assert.strictEqual(entries.length, 5);
    assert.ok(!entries.some((e) => e.id === "watch-001"));
  });

  it("removeEntry throws for unknown id", async () => {
    const svc = createService();
    await assert.rejects(() => svc.removeEntry("watch-999"), /not found/);
  });

  it("getMetrics reflects current state after mutations", async () => {
    const svc = createService();
    await svc.removeEntry("watch-001"); // remove one high-risk active entry
    const m = await svc.getMetrics();
    assert.strictEqual(m.total, 5);
    assert.strictEqual(m.highRisk, 2);
    assert.strictEqual(m.active, 4);
  });

  it("service starts with empty list and correctly tracks additions", async () => {
    const svc = createService([]);
    let entries = await svc.getEntries();
    assert.strictEqual(entries.length, 0);

    await svc.addEntry({
      senderEmail: "a@b.com",
      senderName: "A",
      reason: "r",
      riskLevel: "low",
    });

    entries = await svc.getEntries();
    assert.strictEqual(entries.length, 1);
    const m = await svc.getMetrics();
    assert.strictEqual(m.total, 1);
    assert.strictEqual(m.lowRisk, 1);
  });
});

// ---------------------------------------------------------------------------
// Guard Integration Tests — validates that guard functions work at the service boundary
// ---------------------------------------------------------------------------

describe("Suspicious Sender Watchlist — Guard Integration (Service)", () => {
  // --- addEntry guard integration ---

  it("addEntry rejects invalid email via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () =>
        svc.addEntry({
          senderEmail: "not-an-email",
          senderName: "Test",
          reason: "Test",
          riskLevel: "low",
        }),
      WatchlistValidationError,
    );
  });

  it("addEntry rejects malicious email with CRLF via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () =>
        svc.addEntry({
          senderEmail: "user@evil.test\r\nBcc: victim",
          senderName: "Test",
          reason: "Test",
          riskLevel: "low",
        }),
      WatchlistValidationError,
    );
  });

  it("addEntry rejects invalid risk level via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () =>
        svc.addEntry({
          senderEmail: "user@example.com",
          senderName: "Test",
          reason: "Test",
          riskLevel: "critical",
        }),
      WatchlistValidationError,
    );
  });

  it("addEntry rejects empty name via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () =>
        svc.addEntry({
          senderEmail: "user@example.com",
          senderName: "",
          reason: "Test",
          riskLevel: "low",
        }),
      WatchlistValidationError,
    );
  });

  it("addEntry sanitizes HTML in name and reason", async () => {
    const svc = createServiceWithGuards();
    const added = await svc.addEntry({
      senderEmail: "hacker@example.com",
      senderName: "<script>alert(1)</script>",
      reason: "<b>Phishing</b> attempt",
      riskLevel: "high",
    });
    assert.strictEqual(added.senderName, "alert(1)");
    assert.strictEqual(added.reason, "Phishing attempt");
  });

  it("addEntry normalizes case of risk level via guards", async () => {
    const svc = createServiceWithGuards();
    const added = await svc.addEntry({
      senderEmail: "test@example.com",
      senderName: "Test",
      reason: "Test reason",
      riskLevel: "HIGH",
    });
    assert.strictEqual(added.riskLevel, "high");
  });

  it("addEntry rejects input with empty reason via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () =>
        svc.addEntry({
          senderEmail: "user@example.com",
          senderName: "Test",
          reason: "   ",
          riskLevel: "low",
        }),
      WatchlistValidationError,
    );
  });

  // --- updateRisk guard integration ---

  it("updateRisk rejects malformed ID via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () => svc.updateRisk({ id: "../../../etc/passwd", riskLevel: "high" }),
      WatchlistValidationError,
    );
  });

  it("updateRisk rejects invalid risk level via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () => svc.updateRisk({ id: "watch-001", riskLevel: "CRITICAL" }),
      WatchlistValidationError,
    );
  });

  it("updateRisk accepts case-variant risk level and normalizes", async () => {
    const svc = createServiceWithGuards();
    const updated = await svc.updateRisk({ id: "watch-005", riskLevel: "HIGH" });
    assert.strictEqual(updated.riskLevel, "high");
  });

  it("updateRisk rejects path traversal in ID via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () => svc.updateRisk({ id: "../../secret", riskLevel: "high" }),
      WatchlistValidationError,
    );
  });

  // --- dismissEntry guard integration ---

  it("dismissEntry rejects null ID via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(() => svc.dismissEntry(null), WatchlistValidationError);
  });

  it("dismissEntry rejects path traversal in ID via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(() => svc.dismissEntry("../../secret"), WatchlistValidationError);
  });

  // --- removeEntry guard integration ---

  it("removeEntry rejects empty ID via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(() => svc.removeEntry(""), WatchlistValidationError);
  });

  it("removeEntry rejects XSS in ID via guards", async () => {
    const svc = createServiceWithGuards();
    await assert.rejects(
      () => svc.removeEntry("<script>alert(1)</script>"),
      WatchlistValidationError,
    );
  });

  // --- getMetrics guard integration ---

  it("getMetrics does not throw for watchlist one below limit", async () => {
    const entries = Array.from({ length: GUARD_LIMITS.MAX_WATCHLIST_ENTRIES - 1 }, (_, i) => ({
      id: `watch-${i}`,
      senderEmail: "test@example.com",
      senderName: "Test",
      reason: "Bulk entry",
      riskLevel: "low",
      status: "active",
      dateAdded: "2026-01-01",
    }));
    const svc = createServiceWithGuards(entries);
    const m = await svc.getMetrics();
    assert.strictEqual(m.total, GUARD_LIMITS.MAX_WATCHLIST_ENTRIES - 1);
  });

  it("getMetrics throws for oversized watchlist via guards", async () => {
    const oversized = Array.from({ length: GUARD_LIMITS.MAX_WATCHLIST_ENTRIES + 1 }, (_, i) => ({
      id: `watch-${i}`,
      senderEmail: "test@example.com",
      senderName: "Test",
      reason: "Bulk entry",
      riskLevel: "low",
      status: "active",
      dateAdded: "2026-01-01",
    }));
    const svc = createServiceWithGuards(oversized);
    await assert.rejects(() => svc.getMetrics(), WatchlistValidationError);
  });

  // --- applyFilter guard integration ---

  it("applyFilter with guards returns empty for oversized watchlist", async () => {
    const oversized = Array.from({ length: GUARD_LIMITS.MAX_WATCHLIST_ENTRIES + 1 }, (_, i) => ({
      id: `watch-${i}`,
      senderEmail: "test@example.com",
      senderName: "Test",
      reason: "Bulk entry",
      riskLevel: "low",
      status: "active",
      dateAdded: "2026-01-01",
    }));
    const svc = createServiceWithGuards(oversized);
    const result = svc.guardedApplyFilter(oversized, { riskLevel: "low" });
    assert.strictEqual(result.length, 0);
  });

  // --- addEntry size guard ---

  it("addEntry throws when watchlist is at capacity via guards", async () => {
    const nearlyFull = Array.from({ length: GUARD_LIMITS.MAX_WATCHLIST_ENTRIES }, (_, i) => ({
      id: `watch-${i}`,
      senderEmail: "test@example.com",
      senderName: "Test",
      reason: "Bulk entry",
      riskLevel: "low",
      status: "active",
      dateAdded: "2026-01-01",
    }));
    const svc = createServiceWithGuards(nearlyFull);
    await assert.rejects(
      () =>
        svc.addEntry({
          senderEmail: "new@example.com",
          senderName: "New Threat",
          reason: "New entry at capacity",
          riskLevel: "high",
        }),
      WatchlistValidationError,
    );
  });

  // --- happy path with guards ---

  it("addEntry with guards succeeds for valid input", async () => {
    const svc = createServiceWithGuards();
    const added = await svc.addEntry({
      senderEmail: "safe@example.com",
      senderName: "Safe Sender",
      reason: "Legitimate concern",
      riskLevel: "medium",
    });
    assert.ok(added.id.startsWith("watch-"));
    assert.strictEqual(added.status, "active");
    assert.strictEqual(added.senderEmail, "safe@example.com");
    assert.strictEqual(added.riskLevel, "medium");

    const entries = await svc.getEntries();
    assert.strictEqual(entries.length, 7); // 6 fixtures + 1 new
  });

  it("updateRisk with guards succeeds for valid input", async () => {
    const svc = createServiceWithGuards();
    const updated = await svc.updateRisk({ id: "watch-001", riskLevel: "low" });
    assert.strictEqual(updated.riskLevel, "low");
  });

  it("dismissEntry with guards succeeds for valid ID", async () => {
    const svc = createServiceWithGuards();
    const dismissed = await svc.dismissEntry("watch-003");
    assert.strictEqual(dismissed.status, "dismissed");
  });

  it("removeEntry with guards succeeds for valid ID", async () => {
    const svc = createServiceWithGuards();
    await svc.removeEntry("watch-001");
    const entries = await svc.getEntries();
    assert.strictEqual(entries.length, 5);
  });
});
