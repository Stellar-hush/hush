import type { NotificationCategory, NotificationPreferences } from "@/features/preferences";

export type InAppNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export const safeBrowserCopy: Record<NotificationCategory, { title: string; body: string }> = {
  mail: { title: "New encrypted mail", body: "Open Hush to view it." },
  requests: { title: "New sender request", body: "Open Hush to review it." },
  failures: { title: "Delivery needs attention", body: "Open Hush to review the status." },
  receipts: { title: "Receipt updated", body: "Open Hush to view the status." },
};

export function isWithinQuietHours(now: Date, quietHours: NotificationPreferences["quietHours"]) {
  if (!quietHours.enabled) return false;
  const parse = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      hour >= 0 &&
      hour < 24 &&
      minute >= 0 &&
      minute < 60
      ? hour * 60 + minute
      : null;
  };
  const start = parse(quietHours.start);
  const end = parse(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function createNotification(
  id: string,
  category: NotificationCategory,
  createdAt: string,
): InAppNotification {
  const copy = safeBrowserCopy[category];
  return { id, category, title: copy.title, message: copy.body, createdAt, read: false };
}
