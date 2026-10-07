import type {
  DemoDataset,
  DemoMessage,
  DemoSender,
  DemoAttachment,
  DemoCalendarEvent,
  DemoProofRecord,
} from "../types/dataset";

/**
 * Demo inbox data fixtures for the preview components.
 *
 * IMPORTANT: All data is fake, deterministic, and safe for public repository review.
 * Email addresses use @example.com, @example.org, or *.stealth.demo domains only.
 * No real user data, secrets, private keys, or live network calls are used.
 */

/**
 * Demo senders with safe email addresses and consistent personas.
 */
const DEMO_SENDERS: DemoSender[] = [
  {
    address: "alice@example.com",
    name: "Alice Johnson",
    isTrusted: true,
    relayNode: "relay-1.stealth.demo",
  },
  {
    address: "bob@example.org",
    name: "Bob Chen",
    isTrusted: true,
    relayNode: "relay-2.stealth.demo",
  },
  {
    address: "charlie@example.com",
    name: "Charlie Davis",
    isTrusted: false,
  },
  {
    address: "diana@example.org",
    name: "Diana Rodriguez",
    isTrusted: true,
    relayNode: "relay-3.stealth.demo",
  },
  {
    address: "eve@example.com",
    name: "Eve Wilson",
    isTrusted: false,
  },
  {
    address: "frank@example.org",
    name: "Frank Miller",
    isTrusted: true,
    relayNode: "relay-1.stealth.demo",
  },
  {
    address: "grace@notifications.stealth.demo",
    name: "Hush Notifications",
    isTrusted: true,
    relayNode: "system.stealth.demo",
  },
  {
    address: "support@example.com",
    name: "Support Team",
    isTrusted: true,
  },
];

/**
 * Demo attachments with safe file types and sizes.
 */
const DEMO_ATTACHMENTS: DemoAttachment[] = [
  {
    id: "att-1",
    filename: "project-proposal.pdf",
    contentType: "application/pdf",
    sizeBytes: 2457600, // 2.4 MB
    url: "/demo/attachments/project-proposal.pdf",
  },
  {
    id: "att-2",
    filename: "meeting-notes.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 524288, // 512 KB
    url: "/demo/attachments/meeting-notes.docx",
  },
  {
    id: "att-3",
    filename: "quarterly-report.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 1048576, // 1 MB
    url: "/demo/attachments/quarterly-report.xlsx",
  },
  {
    id: "att-4",
    filename: "demo-screenshot.png",
    contentType: "image/png",
    sizeBytes: 307200, // 300 KB
    url: "/demo/attachments/demo-screenshot.png",
  },
  {
    id: "att-5",
    filename: "invoice-2026-q2.pdf",
    contentType: "application/pdf",
    sizeBytes: 98304, // 96 KB
    url: "/demo/attachments/invoice-2026-q2.pdf",
  },
];

/**
 * Demo calendar events with safe time ranges and attendees.
 */
const DEMO_CALENDAR_EVENTS: DemoCalendarEvent[] = [
  {
    id: "cal-1",
    title: "Project Kickoff Meeting",
    startTime: "2026-06-25T14:00",
    endTime: "2026-06-25T15:00",
    location: "Conference Room A",
    attendees: ["alice@example.com", "bob@example.org", "charlie@example.com"],
  },
  {
    id: "cal-2",
    title: "Demo Presentation",
    startTime: "2026-06-28T16:00",
    endTime: "2026-06-28T17:30",
    location: "Virtual Meeting",
    attendees: ["diana@example.org", "eve@example.com", "frank@example.org"],
  },
  {
    id: "cal-3",
    title: "Weekly Sync",
    startTime: "2026-06-30T10:00",
    endTime: "2026-06-30T10:30",
    location: "Team Room",
    attendees: ["alice@example.com", "bob@example.org"],
  },
];

/**
 * Demo proof records with various statuses.
 */
const DEMO_PROOF_RECORDS: DemoProofRecord[] = [
  {
    id: "proof-1",
    status: "verified",
    timestamp: "2026-06-20T08:30:00Z",
    postageAmount: 0.001,
    postageCurrency: "DEMO",
    policyId: "policy-allow-verified",
  },
  {
    id: "proof-2",
    status: "pending",
    timestamp: "2026-06-20T09:15:00Z",
    postageAmount: 0.002,
    postageCurrency: "DEMO",
    policyId: "policy-verify-pending",
  },
  {
    id: "proof-3",
    status: "verified",
    timestamp: "2026-06-20T10:45:00Z",
    postageAmount: 0.0005,
    postageCurrency: "DEMO",
    policyId: "policy-allow-trusted",
  },
  {
    id: "proof-4",
    status: "failed",
    timestamp: "2026-06-20T11:20:00Z",
    policyId: "policy-block-suspicious",
  },
];

/**
 * Demo messages with rich content and metadata.
 */
const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: "msg-1",
    threadId: "thread-1",
    subject: "Welcome to the Demo Environment",
    snippet: "This is a demonstration message showing the inbox preview functionality...",
    body: `
      <p>Hello and welcome to the Hush demo environment!</p>
      
      <p>This message demonstrates the inbox preview functionality with rich content support. 
      You can see how messages display in both list and reader views.</p>
      
      <p>Key features shown:</p>
      <ul>
        <li>Rich HTML content rendering</li>
        <li>Sender verification badges</li>
        <li>Proof record integration</li>
        <li>Attachment handling</li>
      </ul>
      
      <p>All data shown here is fake and safe for public review. No real user information 
      or live network calls are used.</p>
      
      <p>Best regards,<br>
      The Demo Team</p>
    `,
    sender: DEMO_SENDERS[6], // Hush Notifications
    recipients: ["demo@example.com"],
    date: "2026-06-20T08:30:00Z",
    isRead: false,
    isStarred: true,
    labels: ["inbox", "welcome"],
    attachments: [],
    proofRecord: DEMO_PROOF_RECORDS[0],
  },

  {
    id: "msg-2",
    threadId: "thread-2",
    subject: "Project Proposal Review",
    snippet: "I've attached the updated project proposal for your review. Please let me know...",
    body: `
      <p>Hi team,</p>
      
      <p>I've attached the updated project proposal for your review. Please let me know 
      your thoughts by the end of the week.</p>
      
      <p>Key changes from the previous version:</p>
      <ul>
        <li>Updated timeline and milestones</li>
        <li>Revised budget estimates</li>
        <li>Added risk mitigation strategies</li>
      </ul>
      
      <p>Looking forward to your feedback.</p>
      
      <p>Thanks,<br>Alice</p>
    `,
    sender: DEMO_SENDERS[0], // Alice Johnson
    recipients: ["team@example.com", "bob@example.org"],
    date: "2026-06-20T09:15:00Z",
    isRead: true,
    isStarred: false,
    labels: ["inbox", "work", "projects"],
    attachments: [DEMO_ATTACHMENTS[0]], // project-proposal.pdf
    proofRecord: DEMO_PROOF_RECORDS[1],
  },

  {
    id: "msg-3",
    threadId: "thread-3",
    subject: "Meeting Invitation: Project Kickoff",
    snippet: "You're invited to attend the project kickoff meeting next Thursday...",
    body: `
      <p>Hi everyone,</p>
      
      <p>You're invited to attend the project kickoff meeting next Thursday. 
      This will be an important session to align on goals and next steps.</p>
      
      <p>Agenda:</p>
      <ol>
        <li>Project overview and objectives</li>
        <li>Team introductions</li>
        <li>Timeline and deliverables</li>
        <li>Q&A session</li>
      </ol>
      
      <p>Please confirm your attendance by replying to this message.</p>
      
      <p>Best,<br>Bob</p>
    `,
    sender: DEMO_SENDERS[1], // Bob Chen
    recipients: ["alice@example.com", "charlie@example.com"],
    date: "2026-06-20T10:45:00Z",
    isRead: true,
    isStarred: false,
    labels: ["inbox", "meetings"],
    attachments: [],
    calendarEvent: DEMO_CALENDAR_EVENTS[0],
    proofRecord: DEMO_PROOF_RECORDS[2],
  },

  {
    id: "msg-4",
    threadId: "thread-4",
    subject: "Suspicious Activity Detected",
    snippet: "We've detected some unusual activity on your account. Please review...",
    body: `
      <p>Dear User,</p>
      
      <p>We've detected some unusual activity on your account. Please review 
      the attached security report and take appropriate action if needed.</p>
      
      <p><strong>Important:</strong> This is a demonstration message showing how 
      suspicious or unverified messages appear in the demo inbox.</p>
      
      <p>Security Team</p>
    `,
    sender: DEMO_SENDERS[4], // Eve Wilson (untrusted)
    recipients: ["demo@example.com"],
    date: "2026-06-20T11:20:00Z",
    isRead: false,
    isStarred: false,
    labels: ["inbox", "security"],
    attachments: [],
    proofRecord: DEMO_PROOF_RECORDS[3],
  },

  {
    id: "msg-5",
    threadId: "thread-5",
    subject: "Demo Presentation Materials",
    snippet: "Please find attached the materials for tomorrow's demo presentation...",
    body: `
      <p>Team,</p>
      
      <p>Please find attached the materials for tomorrow's demo presentation. 
      I've included the slides, talking points, and demo script.</p>
      
      <p>The presentation is scheduled for 4 PM in the virtual meeting room. 
      Please review the materials beforehand so we can have a smooth session.</p>
      
      <p>Let me know if you have any questions or suggestions.</p>
      
      <p>Regards,<br>Diana</p>
    `,
    sender: DEMO_SENDERS[3], // Diana Rodriguez
    recipients: ["team@example.com"],
    date: "2026-06-20T12:00:00Z",
    isRead: true,
    isStarred: true,
    labels: ["inbox", "presentations"],
    attachments: [DEMO_ATTACHMENTS[1], DEMO_ATTACHMENTS[3]], // meeting-notes.docx, demo-screenshot.png
    calendarEvent: DEMO_CALENDAR_EVENTS[1],
  },

  {
    id: "msg-6",
    threadId: "thread-6",
    subject: "Quarterly Report Ready for Review",
    snippet: "The Q2 quarterly report has been completed and is ready for your review...",
    body: `
      <p>Hi,</p>
      
      <p>The Q2 quarterly report has been completed and is ready for your review. 
      I've attached the Excel file with all the financial data and analysis.</p>
      
      <p>Key highlights:</p>
      <ul>
        <li>Revenue increased by 15% compared to Q1</li>
        <li>Customer acquisition costs decreased by 8%</li>
        <li>User engagement metrics improved across all channels</li>
      </ul>
      
      <p>Please review and let me know if you need any clarifications.</p>
      
      <p>Best regards,<br>Frank</p>
    `,
    sender: DEMO_SENDERS[5], // Frank Miller
    recipients: ["management@example.com"],
    date: "2026-06-20T13:30:00Z",
    isRead: false,
    isStarred: false,
    labels: ["inbox", "reports", "finance"],
    attachments: [DEMO_ATTACHMENTS[2]], // quarterly-report.xlsx
  },

  {
    id: "msg-7",
    threadId: "thread-7",
    subject: "Support Ticket #12345 - Demo Issue Resolved",
    snippet: "Your support ticket regarding the demo environment has been resolved...",
    body: `
      <p>Hello,</p>
      
      <p>Your support ticket #12345 regarding the demo environment has been resolved. 
      The issue was related to test data synchronization and has been fixed.</p>
      
      <p>Summary of changes:</p>
      <ul>
        <li>Updated demo data fixtures</li>
        <li>Fixed preview component rendering</li>
        <li>Improved error handling</li>
      </ul>
      
      <p>Please test the functionality and let us know if you encounter any other issues.</p>
      
      <p>Best regards,<br>Support Team</p>
    `,
    sender: DEMO_SENDERS[7], // Support Team
    recipients: ["demo@example.com"],
    date: "2026-06-20T14:15:00Z",
    isRead: true,
    isStarred: false,
    labels: ["inbox", "support"],
    attachments: [],
  },

  {
    id: "msg-8",
    threadId: "thread-8",
    subject: "Weekly Team Sync - Agenda",
    snippet: "Here's the agenda for our weekly team sync meeting on Monday...",
    body: `
      <p>Team,</p>
      
      <p>Here's the agenda for our weekly team sync meeting on Monday:</p>
      
      <ol>
        <li>Sprint review and retrospective</li>
        <li>Demo environment updates</li>
        <li>Upcoming feature priorities</li>
        <li>Blockers and dependencies</li>
        <li>Open discussion</li>
      </ol>
      
      <p>Please come prepared to discuss your progress and any challenges.</p>
      
      <p>See you Monday!<br>Alice</p>
    `,
    sender: DEMO_SENDERS[0], // Alice Johnson
    recipients: ["team@example.com"],
    date: "2026-06-20T15:00:00Z",
    isRead: false,
    isStarred: false,
    labels: ["inbox", "meetings", "team"],
    attachments: [],
    calendarEvent: DEMO_CALENDAR_EVENTS[2],
  },

  // Archived message
  {
    id: "msg-9",
    threadId: "thread-9",
    subject: "Completed: Demo Environment Setup",
    snippet: "The demo environment has been successfully set up and tested...",
    body: `
      <p>Update:</p>
      
      <p>The demo environment has been successfully set up and tested. 
      All components are working as expected and ready for review.</p>
      
      <p>This message has been archived as the task is complete.</p>
      
      <p>Thanks,<br>Bob</p>
    `,
    sender: DEMO_SENDERS[1], // Bob Chen
    recipients: ["team@example.com"],
    date: "2026-06-19T16:30:00Z",
    isRead: true,
    isStarred: false,
    labels: ["archive", "completed"],
    attachments: [],
  },

  // Trash message
  {
    id: "msg-10",
    threadId: "thread-10",
    subject: "SPAM: Special Offer Just for You!",
    snippet: "Congratulations! You've been selected for a special offer...",
    body: `
      <p>Congratulations! You've been selected for a special offer!</p>
      
      <p>This is a demo spam message showing how unwanted content 
      appears in the trash folder.</p>
      
      <p>Spam Sender</p>
    `,
    sender: DEMO_SENDERS[2], // Charlie Davis (untrusted)
    recipients: ["demo@example.com"],
    date: "2026-06-19T12:00:00Z",
    isRead: true,
    isStarred: false,
    labels: ["trash", "spam"],
    attachments: [],
  },
];

/**
 * Creates a complete demo inbox dataset with all fixtures.
 */
export function createDemoInboxData(): DemoDataset {
  return {
    id: "demo-inbox-dataset",
    name: "Demo Inbox Dataset",
    description: "Curated demo messages for inbox preview functionality",
    messages: DEMO_MESSAGES,
    senders: DEMO_SENDERS,
  };
}

/**
 * Get demo messages by specific criteria for testing different scenarios.
 */
export function getDemoMessagesByLabel(label: string): DemoMessage[] {
  return DEMO_MESSAGES.filter((message) => message.labels.includes(label));
}

/**
 * Get unread demo messages.
 */
export function getUnreadDemoMessages(): DemoMessage[] {
  return DEMO_MESSAGES.filter((message) => !message.isRead);
}

/**
 * Get starred demo messages.
 */
export function getStarredDemoMessages(): DemoMessage[] {
  return DEMO_MESSAGES.filter((message) => message.isStarred);
}

/**
 * Get demo messages with attachments.
 */
export function getDemoMessagesWithAttachments(): DemoMessage[] {
  return DEMO_MESSAGES.filter((message) => message.attachments.length > 0);
}

/**
 * Get demo messages with calendar events.
 */
export function getDemoMessagesWithEvents(): DemoMessage[] {
  return DEMO_MESSAGES.filter((message) => message.calendarEvent);
}
