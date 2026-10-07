import { describe, expect, it } from "vitest";
import type { Draft } from "../types/draft";
import {
  clearBulkSelection,
  formatBulkSelectionSummary,
  getBulkSelectionSummary,
  invertBulkSelection,
  normalizeSelectedDraftIds,
  selectAllDrafts,
  selectDraftRange,
  updateBulkSelection,
} from "../bulkSelection";

const drafts: Draft[] = [
  {
    id: "draft-welcome",
    subject: "Welcome to Hush Mail",
    body: "Deterministic welcome copy.",
    recipients: ["alex@example.com"],
  },
  {
    id: "draft-security",
    subject: "Security policy update",
    body: "Fake dashboard copy only.",
    recipients: ["sam@example.org"],
  },
  {
    id: "draft-postage",
    subject: "Postage receipt",
    body: "Demo receipt copy.",
    recipients: ["ops@stealth.demo"],
  },
];

describe("bulkSelection helpers", () => {
  it("normalizes selected ids by draft order and drops unknown ids", () => {
    expect(
      normalizeSelectedDraftIds(drafts, ["missing", "draft-postage", "draft-welcome"]),
    ).toEqual(["draft-welcome", "draft-postage"]);
  });

  it("selects all draft messages", () => {
    const result = selectAllDrafts(drafts);

    expect(result.selectedIds).toEqual(["draft-welcome", "draft-security", "draft-postage"]);
    expect(result.lastFocusedId).toBe("draft-postage");
  });

  it("clears the current selection", () => {
    expect(clearBulkSelection()).toEqual({
      selectedIds: [],
      lastFocusedId: null,
    });
  });

  it("selects a contiguous range regardless of direction", () => {
    expect(selectDraftRange(drafts, "draft-postage", "draft-welcome")).toEqual({
      selectedIds: ["draft-welcome", "draft-security", "draft-postage"],
      lastFocusedId: "draft-welcome",
    });
  });

  it("updates selection in replace, add, remove, and toggle modes", () => {
    expect(updateBulkSelection(drafts, ["draft-welcome"], ["draft-security"], "replace")).toEqual({
      selectedIds: ["draft-security"],
      lastFocusedId: "draft-security",
    });

    expect(
      updateBulkSelection(drafts, ["draft-welcome"], ["draft-security"], "add").selectedIds,
    ).toEqual(["draft-welcome", "draft-security"]);

    expect(
      updateBulkSelection(drafts, ["draft-welcome", "draft-security"], ["draft-welcome"], "remove")
        .selectedIds,
    ).toEqual(["draft-security"]);

    expect(
      updateBulkSelection(drafts, ["draft-welcome", "draft-security"], ["draft-security"], "toggle")
        .selectedIds,
    ).toEqual(["draft-welcome"]);
  });

  it("inverts selection against the current draft dataset", () => {
    expect(invertBulkSelection(drafts, ["draft-security"]).selectedIds).toEqual([
      "draft-welcome",
      "draft-postage",
    ]);
  });

  it("summarizes empty, partial, and complete selections", () => {
    expect(formatBulkSelectionSummary(getBulkSelectionSummary([], []))).toBe(
      "No draft messages available.",
    );
    expect(formatBulkSelectionSummary(getBulkSelectionSummary(drafts, []))).toBe(
      "No draft messages selected out of 3.",
    );
    expect(formatBulkSelectionSummary(getBulkSelectionSummary(drafts, ["draft-welcome"]))).toBe(
      "1 of 3 draft messages selected.",
    );
    expect(
      formatBulkSelectionSummary(
        getBulkSelectionSummary(drafts, selectAllDrafts(drafts).selectedIds),
      ),
    ).toBe("All 3 draft messages selected.");
  });
});
