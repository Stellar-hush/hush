import type { DemoCalendarEvent } from "../types/dataset";

export const calendarEventFixtures: DemoCalendarEvent[] = [
  {
    id: "evt-all-hands",
    title: "Company All-Hands",
    startTime: "2026-07-01T15:00",
    endTime: "2026-07-01T16:30",
    location: "Main Auditorium",
    attendees: ["eve@stealth.xyz", "lina@vantage.studio"],
  },
  {
    id: "evt-design-review",
    title: "Design Review — Q3 Identity",
    startTime: "2026-06-25T10:00",
    endTime: "2026-06-25T11:00",
    location: "Mission studio",
    attendees: ["eve@stealth.xyz", "aria@studio.aria"],
  },
  {
    id: "evt-protocol-workshop",
    title: "Protocol Workshop — Relay Routing",
    startTime: "2026-06-28T13:00",
    endTime: "2026-06-28T15:00",
    location: "Virtual / Zoom",
    attendees: ["eve@stealth.xyz", "marcus@northwind.io", "nadia@atlas.dev"],
  },
  {
    id: "evt-one-on-one",
    title: "1:1 with Manager",
    startTime: "2026-06-23T14:00",
    endTime: "2026-06-23T14:30",
    location: "Conference Room B",
    attendees: ["eve@stealth.xyz"],
  },
  {
    id: "evt-conference-call",
    title: "Hush Demo Roundtable",
    startTime: "2026-07-09T15:00",
    endTime: "2026-07-09T16:00",
    location: "Demo room",
    attendees: ["eve@stealth.xyz", "bob@stealth.demo"],
  },
];

export const defaultCalendarEvent: DemoCalendarEvent = {
  id: "evt-new",
  title: "",
  startTime: "",
  endTime: "",
  location: "",
  attendees: [],
};
