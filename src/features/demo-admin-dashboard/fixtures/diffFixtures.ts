import type { DemoDataset } from "../types/dataset";

export const originalDatasetFixture: DemoDataset = {
  id: "original-v1",
  name: "Baseline Demo",
  description: "Initial seed data for demo environment.",
  messages: [
    {
      id: "msg-001",
      threadId: "t-001",
      subject: "Welcome",
      snippet: "Welcome to stealth demo.",
      body: "This is a baseline welcome message.",
      sender: {
        address: "admin@stealth.demo",
        name: "Hush Admin",
        isTrusted: true,
      },
      recipients: ["user@example.com"],
      date: "2024-01-01T10:00:00Z",
      isRead: true,
      isStarred: false,
      labels: ["inbox"],
      attachments: [],
    },
    {
      id: "msg-002",
      threadId: "t-002",
      subject: "Meeting Request",
      snippet: "Can we meet tomorrow?",
      body: "Let's discuss the project.",
      sender: {
        address: "colleague@example.org",
        name: "Colleague",
        isTrusted: false,
      },
      recipients: ["user@example.com"],
      date: "2024-01-01T11:00:00Z",
      isRead: false,
      isStarred: true,
      labels: ["work"],
      attachments: [],
    },
  ],
  senders: [
    {
      address: "admin@stealth.demo",
      name: "Hush Admin",
      isTrusted: true,
    },
    {
      address: "colleague@example.org",
      name: "Colleague",
      isTrusted: false,
    },
  ],
};

export const currentDatasetDraftFixture: DemoDataset = {
  id: "draft-v1",
  name: "Modified Demo",
  description: "Initial seed data with some edits.",
  messages: [
    {
      id: "msg-001",
      threadId: "t-001",
      subject: "Welcome (Updated)", // Changed
      snippet: "Welcome to stealth demo.",
      body: "This is a baseline welcome message. Now with more info!", // Changed
      sender: {
        address: "admin@stealth.demo",
        name: "Hush Admin",
        isTrusted: true,
      },
      recipients: ["user@example.com"],
      date: "2024-01-01T10:00:00Z",
      isRead: true,
      isStarred: true, // Changed
      labels: ["inbox", "updated"], // Changed
      attachments: [],
    },
    // msg-002 removed
    {
      id: "msg-003", // Added
      threadId: "t-003",
      subject: "New Message",
      snippet: "A new message in the draft.",
      body: "This message was added in the draft.",
      sender: {
        address: "newbie@example.com",
        name: "Newbie",
        isTrusted: false,
      },
      recipients: ["user@example.com"],
      date: "2024-01-02T09:00:00Z",
      isRead: false,
      isStarred: false,
      labels: ["new"],
      attachments: [],
    },
  ],
  senders: [
    {
      address: "admin@stealth.demo",
      name: "Hush Admin",
      isTrusted: true,
    },
    // colleague removed
    {
      address: "newbie@example.com", // Added
      name: "Newbie",
      isTrusted: false,
    },
  ],
};
