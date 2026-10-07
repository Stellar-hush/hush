import type { CalendarDefinition, CalendarEvent } from "./types";

export const defaultCalendars: CalendarDefinition[] = [
  { id: "personal", name: "Personal", color: "#d5d7dc", visible: true },
  { id: "work", name: "Work", color: "#8fa8ff", visible: true },
  { id: "protocol", name: "Protocol", color: "#6ee7c7", visible: true },
];

export const defaultCalendarEvents: CalendarEvent[] = [
  {
    id: "calendar-design-review",
    title: "Design review",
    date: "2026-06-13",
    time: "10:00",
    endTime: "10:45",
    location: "Vantage studio",
    note: "Approve the final identity direction and motion principles.",
    calendarId: "work",
    cadence: "One time",
    organizer: "Lina Park",
    meetingUrl: "https://meet.stealth.local/design-review",
    response: "going",
    reminder: "15 minutes",
  },
  {
    id: "calendar-marcus-1-1",
    title: "1:1 with Marcus",
    date: "2026-06-13",
    time: "13:30",
    endTime: "14:00",
    location: "Private relay room",
    note: "Review edge runtime follow-ups and ownership.",
    calendarId: "work",
    cadence: "Weekly",
    organizer: "Marcus Chen",
    response: "going",
    reminder: "10 minutes",
  },
  {
    id: "calendar-investor-sync",
    title: "Investor sync",
    date: "2026-06-13",
    time: "16:00",
    endTime: "16:45",
    location: "Lumos Capital",
    note: "Walk through paid inbox thresholds and postage refunds.",
    calendarId: "protocol",
    cadence: "Monthly",
    organizer: "Uthaimin Lawal",
    response: "maybe",
    reminder: "30 minutes",
  },
  {
    id: "calendar-protocol-planning",
    title: "Protocol launch planning",
    date: "2026-06-16",
    time: "09:00",
    endTime: "10:30",
    location: "Hush operations",
    note: "Finalize launch sequence, sender policy defaults, and proof messaging.",
    calendarId: "protocol",
    cadence: "One time",
    response: "going",
    reminder: "1 hour",
  },
];

export const calendarColors = ["#d5d7dc", "#8fa8ff", "#6ee7c7", "#f2b880", "#d9a8ff"];
