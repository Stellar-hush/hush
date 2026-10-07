import { startOfDay } from "date-fns";

/**
 * Shared date handling for the mock app.
 *
 * Hush's seed data is pinned to a fixed moment so the calendar, reminders,
 * and "today" markers all agree. This module is the single source of truth for
 * that reference clock — features that need "now" (calendar, snooze) import it
 * here instead of sprinkling `new Date(2026, 5, 13)` literals around.
 *
 * Swap the body of `getReferenceNow` for `new Date()` to make the app live.
 */
export function getReferenceNow(): Date {
  // June 13, 2026, 09:41 local — aligned with the morning timestamps in the
  // seeded inbox so relative reminders ("later today") land sensibly.
  return new Date(2026, 5, 13, 9, 41, 0, 0);
}

/** Start of the reference day — use for date-only comparisons and "today" markers. */
export function getAppToday(): Date {
  return startOfDay(getReferenceNow());
}

/** The viewer's IANA time zone (e.g. "Europe/Lisbon"), shown so reminder times are unambiguous. */
export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}
