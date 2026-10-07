import { describe, expect, it } from "vitest";
import { createNotification, isWithinQuietHours, safeBrowserCopy } from "@/features/notifications";

describe("notification privacy and quiet hours", () => {
  const quietHours = { enabled: true, start: "22:00", end: "07:00" };

  it("uses metadata-minimal browser copy for locked screens", () => {
    for (const copy of Object.values(safeBrowserCopy)) {
      expect(copy.title).not.toMatch(/subject|from|message body/i);
      expect(copy.body).toContain("Open Hush");
    }
  });

  it("handles quiet hours that cross midnight", () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 23, 30), quietHours)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 2, 6, 59), quietHours)).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 2, 7, 0), quietHours)).toBe(false);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 12, 0), quietHours)).toBe(false);
  });

  it("treats invalid and zero-length quiet-hour ranges as disabled", () => {
    expect(isWithinQuietHours(new Date(), { enabled: true, start: "invalid", end: "07:00" })).toBe(
      false,
    );
    expect(isWithinQuietHours(new Date(), { enabled: true, start: "07:00", end: "07:00" })).toBe(
      false,
    );
  });

  it("creates safe in-app notifications without decrypted message fields", () => {
    const notification = createNotification("mail:abc", "mail", "2026-08-20T10:00:00.000Z");
    expect(notification).toEqual({
      id: "mail:abc",
      category: "mail",
      title: "New encrypted mail",
      message: "Open Hush to view it.",
      createdAt: "2026-08-20T10:00:00.000Z",
      read: false,
    });
  });
});
