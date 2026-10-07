/**
 * Inbox seed dataset — a local starter fixture that mirrors the current demo
 * inbox (src/components/mail/data.ts) but is owned by the admin-dashboard folder.
 *
 * Every address, hash, and timestamp is fake, deterministic, and safe for
 * public-repository review.  No real PII, secrets, or live-network values.
 */

import type {
  DemoAttachment,
  DemoCalendarEvent,
  DemoDataset,
  DemoMessage,
  DemoProofRecord,
  DemoSender,
} from "../types/dataset";

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

const senderLinaPark: DemoSender = {
  address: "lina@vantage.studio",
  name: "Lina Park",
  isTrusted: true,
};

const senderToken2049: DemoSender = {
  address: "events@token2049.global",
  name: "TOKEN2049 Abu Dhabi",
  isTrusted: true,
};

const senderRelay07: DemoSender = {
  address: "relay07@stealth.network",
  name: "Relay Node 07",
  isTrusted: false,
  relayNode: "node-07.stealth.network",
};

const senderUthaimin: DemoSender = {
  address: "mina@lumos.capital",
  name: "Uthaimin Lawal",
  isTrusted: true,
};

const senderUnknown: DemoSender = {
  address: "GCKN@stealth.demo",
  name: "Unknown Sender",
  isTrusted: false,
};

const senderStellarFund: DemoSender = {
  address: "GD7K@stealth.demo",
  name: "Stellar Fund",
  isTrusted: true,
};

const senderAnonTrader: DemoSender = {
  address: "GB3S@stealth.demo",
  name: "Anonymous Trader",
  isTrusted: false,
};

const senderNadia: DemoSender = {
  address: "nadia@atlas.dev",
  name: "Nadia Reyes",
  isTrusted: true,
};

const senderKael: DemoSender = {
  address: "kael@nexus.io",
  name: "Kael Ortega",
  isTrusted: true,
};

const senderCipherRelay: DemoSender = {
  address: "relay@cipher.network",
  name: "Cipher Relay",
  isTrusted: false,
  relayNode: "cipher-relay-02",
};

const senderVaultNode: DemoSender = {
  address: "vault@stealth.network",
  name: "Vault Node",
  isTrusted: false,
  relayNode: "vault.stealth.network",
};

const senderReceiptContract: DemoSender = {
  address: "receipts@stealth.network",
  name: "Receipt Contract",
  isTrusted: true,
};

const senderAriaVoss: DemoSender = {
  address: "aria@studio.aria",
  name: "Aria Voss",
  isTrusted: true,
};

const senderMarcusChen: DemoSender = {
  address: "marcus@northwind.io",
  name: "Marcus Chen",
  isTrusted: true,
};

const senderEve: DemoSender = {
  address: "eve@stealth.xyz",
  name: "Eve Navarro",
  isTrusted: true,
};

const senderOutboundQueue: DemoSender = {
  address: "queue@stealth.network",
  name: "Outbound Queue",
  isTrusted: false,
  relayNode: "outbound.stealth.network",
};

const senderLegacyBridge: DemoSender = {
  address: "bridge@stealth.network",
  name: "Legacy Bridge",
  isTrusted: false,
  relayNode: "smtp-bridge.stealth.network",
};

const senderDeleted: DemoSender = {
  address: "old-contact@example.org",
  name: "Deleted Thread",
  isTrusted: false,
};

const senderSecurity: DemoSender = {
  address: "security@stealth.network",
  name: "Hush Security",
  isTrusted: true,
};

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

const brandAttachments: DemoAttachment[] = [
  {
    id: "att-brand-pdf",
    filename: "vantage-identity-v3.pdf",
    contentType: "application/pdf",
    sizeBytes: 4_404_019,
    url: "demo://attachments/vantage-identity-v3.pdf",
  },
  {
    id: "att-brand-png",
    filename: "brand-moodboard.png",
    contentType: "image/png",
    sizeBytes: 1_887_437,
    url: "demo://attachments/brand-moodboard.png",
  },
  {
    id: "att-brand-txt",
    filename: "release-notes.txt",
    contentType: "text/plain",
    sizeBytes: 1_229,
    url: "demo://attachments/release-notes.txt",
  },
  {
    id: "att-brand-key",
    filename: "motion-principles.key",
    contentType: "application/x-iwork-keynote",
    sizeBytes: 12_688_589,
    url: "demo://attachments/motion-principles.key",
  },
];

const encryptedTestAttachments: DemoAttachment[] = [
  {
    id: "att-enc-json",
    filename: "payload-test-vector.json",
    contentType: "application/json",
    sizeBytes: 18_432,
    url: "demo://attachments/payload-test-vector.json",
  },
  {
    id: "att-enc-pgp",
    filename: "encrypted-data.pgp",
    contentType: "application/pgp-encrypted",
    sizeBytes: 1_434,
    url: "demo://attachments/encrypted-data.pgp",
  },
  {
    id: "att-enc-bin",
    filename: "stealth-payload.bin",
    contentType: "application/octet-stream",
    sizeBytes: 256,
    url: "demo://attachments/stealth-payload.bin",
  },
];

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

const token2049Event: DemoCalendarEvent = {
  id: "evt-token2049",
  title: "TOKEN2049 Abu Dhabi",
  startTime: "2026-04-21T09:00",
  endTime: "2026-04-21T18:00",
  location: "Abu Dhabi Global Market",
  attendees: ["eve@stealth.xyz", "events@token2049.global"],
};

const studioVisitEvent: DemoCalendarEvent = {
  id: "evt-studio-visit",
  title: "Studio visit",
  startTime: "2026-04-21T10:30",
  endTime: "2026-04-21T11:30",
  location: "Mission studio",
  attendees: ["eve@stealth.xyz", "aria@studio.aria"],
};

// ---------------------------------------------------------------------------
// Proof records
// ---------------------------------------------------------------------------

const priorityProof: DemoProofRecord = {
  id: "prf-priority-01",
  status: "verified",
  timestamp: "2026-06-19T09:42:00",
  postageAmount: 10_000_000,
  postageCurrency: "stroops",
  policyId: "pol-verified-sender",
};

const receiptProof: DemoProofRecord = {
  id: "prf-receipt-07",
  status: "verified",
  timestamp: "2026-06-18T12:00:00",
  postageAmount: 2_000,
  postageCurrency: "stroops",
  policyId: "pol-read-receipt",
};

const pendingOtpProof: DemoProofRecord = {
  id: "prf-pending-otp",
  status: "pending",
  timestamp: "2026-06-19T08:57:00",
  policyId: "pol-relay-verification",
};

const requestPaidProof: DemoProofRecord = {
  id: "prf-request-paid",
  status: "pending",
  timestamp: "2026-06-19T07:48:00",
  postageAmount: 10_000_000,
  postageCurrency: "stroops",
};

const encryptedDecryptedProof: DemoProofRecord = {
  id: "prf-enc-decrypted",
  status: "verified",
  timestamp: "2026-06-18T14:30:00",
  postageAmount: 5_000_000,
  postageCurrency: "stroops",
};

const encryptedFailedProof: DemoProofRecord = {
  id: "prf-enc-failed",
  status: "failed",
  timestamp: "2026-06-17T10:00:00",
  postageAmount: 5_000_000,
  postageCurrency: "stroops",
};

const scheduledProof: DemoProofRecord = {
  id: "prf-scheduled-12",
  status: "pending",
  timestamp: "2026-06-20T08:00:00",
  postageAmount: 10_000,
  postageCurrency: "stroops",
};

// ---------------------------------------------------------------------------
// Messages (mirrors the 18 emails in src/components/mail/data.ts)
// ---------------------------------------------------------------------------

export const inboxSeedMessages: DemoMessage[] = [
  // 1 — Priority inbox, verified sender with attachments + receipt
  {
    id: "seed-msg-01",
    threadId: "thread-01",
    subject: "Q2 brand system - final direction",
    snippet:
      "Sharing the refined exploration for the new identity. The monochrome system feels strongest...",
    body: "Hey,\n\nSharing the refined exploration for the new identity. The monochrome system feels strongest across product surfaces. I've attached the latest spec sheet and the motion principles deck.\n\nLet me know your thoughts before Friday's review.\n\nLina",
    sender: senderLinaPark,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T09:42:00",
    isRead: false,
    isStarred: true,
    labels: ["Design", "Priority"],
    attachments: brandAttachments,
    proofRecord: priorityProof,
  },

  // 2 — Verified sender with calendar event (TOKEN2049)
  {
    id: "seed-msg-02",
    threadId: "thread-02",
    subject: "TOKEN2049 Abu Dhabi - founder pass ready",
    snippet: "Your event pass, agenda window, and wallet reminder are ready for Abu Dhabi...",
    body: "Your TOKEN2049 Abu Dhabi founder pass is ready.\n\nDate: April 21, 2026\nTime: 9:00 AM GST\nVenue: Abu Dhabi Global Market\nPass: Founder access\n\nAdd the event to keep side sessions, badge pickup, and wallet reminders in one place.",
    sender: senderToken2049,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T09:18:00",
    isRead: false,
    isStarred: false,
    labels: ["Event", "Verified", "Pass"],
    attachments: [],
    calendarEvent: token2049Event,
  },

  // 3 — Pending relay verification (OTP)
  {
    id: "seed-msg-03",
    threadId: "thread-03",
    subject: "Your relay verification code",
    snippet: "Use the one-time passkey below to authorize this relay session...",
    body: "Hi Eve,\n\nA new relay session is requesting authorization on Node 07. Use the one-time passkey below to confirm it's you.\n\nYour OTP code: 482 015\n\nThis code expires in 10 minutes. If you didn't initiate this, ignore the message and your session will stay locked.\n\n— Relay Node 07",
    sender: senderRelay07,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T08:57:00",
    isRead: false,
    isStarred: false,
    labels: ["Security", "OTP"],
    attachments: [],
    proofRecord: pendingOtpProof,
  },

  // 4 — Inbox with pending receipt
  {
    id: "seed-msg-04",
    threadId: "thread-04",
    subject: "Investor update and postage policy",
    snippet: "The paid-inbox model makes sense. Can you send over the sender-tier thresholds...",
    body: "The paid-inbox model makes sense.\n\nCan you send over the sender-tier thresholds and how postage refunds work for approved contacts? I want to understand what happens when a verified sender is whitelisted.",
    sender: senderUthaimin,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T08:23:00",
    isRead: true,
    isStarred: true,
    labels: ["Investors", "Postage"],
    attachments: [],
    proofRecord: {
      id: "prf-inbox-04",
      status: "pending",
      timestamp: "2026-06-19T08:23:00",
      policyId: "pol-receipt-pending",
    },
  },

  // 5 — Request: paid unknown sender
  {
    id: "seed-msg-05",
    threadId: "thread-05",
    subject: "Message request awaiting approval",
    snippet: "This sender paid postage but is not in your trusted contacts yet...",
    body: "This sender paid postage but is not in your trusted contacts yet.\n\nApprove the request to decrypt future messages automatically, or reject it to keep the address quarantined.",
    sender: senderUnknown,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T07:48:00",
    isRead: false,
    isStarred: false,
    labels: ["Request", "Paid"],
    attachments: [],
    proofRecord: requestPaidProof,
  },

  // 5-b — Request: verified grant fund
  {
    id: "seed-msg-05b",
    threadId: "thread-05b",
    subject: "Grant application review",
    snippet: "We've completed the initial screening of your GrantFox application...",
    body: "We've completed the initial screening of your GrantFox application and would like to proceed with the technical review.\n\nPlease approve this request so we can schedule the dev walkthrough and share the assessment criteria.",
    sender: senderStellarFund,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-18T12:00:00",
    isRead: false,
    isStarred: false,
    labels: ["Request", "Grant", "Verified"],
    attachments: [],
    proofRecord: {
      id: "prf-request-grant",
      status: "verified",
      timestamp: "2026-06-18T12:00:00",
      postageAmount: 50_000_000,
      postageCurrency: "stroops",
    },
  },

  // 5-c — Request: anonymous OTC trader
  {
    id: "seed-msg-05c",
    threadId: "thread-05c",
    subject: "OTC offer for USDC on Stellar",
    snippet: "I'm looking to buy 50,000 USDC at $0.15...",
    body: "I'm looking to buy 50,000 USDC at $0.15. Can settle immediately via smart contract. Let me know if you have liquidity available.",
    sender: senderAnonTrader,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-18T11:00:00",
    isRead: false,
    isStarred: false,
    labels: ["Request", "Paid"],
    attachments: [],
    proofRecord: {
      id: "prf-request-otc",
      status: "pending",
      timestamp: "2026-06-18T11:00:00",
      postageAmount: 15_000_000,
      postageCurrency: "stroops",
    },
  },

  // 6 — Encrypted: decrypted successfully
  {
    id: "seed-msg-06",
    threadId: "thread-06",
    subject: "Encrypted payload test",
    snippet:
      "The Curve25519 envelope opens cleanly on desktop and mobile with the same account key...",
    body: "The Curve25519 envelope opens cleanly on desktop and mobile with the same account key.\n\nI attached the test vector and the decoded header output so you can compare against the relay logs.",
    sender: senderNadia,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-18T14:30:00",
    isRead: true,
    isStarred: false,
    labels: ["Encrypted", "Engineering"],
    attachments: encryptedTestAttachments,
    proofRecord: encryptedDecryptedProof,
  },

  // 6-b — Encrypted: locked (awaiting key)
  {
    id: "seed-msg-06b",
    threadId: "thread-06b",
    subject: "Sealed proposal — open to verify",
    snippet: "Unlock the encrypted envelope to read the funding proposal...",
    body: "Unlock the encrypted envelope to read the funding proposal. The payload is sealed with your registered public key.",
    sender: senderKael,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-18T10:00:00",
    isRead: false,
    isStarred: false,
    labels: ["Encrypted", "Proposal"],
    attachments: [],
    proofRecord: {
      id: "prf-enc-locked",
      status: "pending",
      timestamp: "2026-06-18T10:00:00",
      policyId: "pol-encrypted-locked",
    },
  },

  // 6-c — Encrypted: verifying integrity
  {
    id: "seed-msg-06c",
    threadId: "thread-06c",
    subject: "Verifying message integrity...",
    snippet: "Integrity check is running. Stand by for the decrypted payload.",
    body: "Integrity check is running. Stand by for the decrypted payload.",
    sender: senderCipherRelay,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T08:00:00",
    isRead: false,
    isStarred: false,
    labels: ["Encrypted", "Verifying"],
    attachments: [],
    proofRecord: {
      id: "prf-enc-verifying",
      status: "pending",
      timestamp: "2026-06-19T08:00:00",
      policyId: "pol-encrypted-verifying",
    },
  },

  // 6-d — Encrypted: failed (integrity)
  {
    id: "seed-msg-06d",
    threadId: "thread-06d",
    subject: "Decryption failed — payload corrupted",
    snippet: "The payload failed integrity verification. Possible relay tampering detected.",
    body: "The payload failed integrity verification. Possible relay tampering detected.",
    sender: senderVaultNode,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-17T10:00:00",
    isRead: true,
    isStarred: false,
    labels: ["Encrypted", "Failed"],
    attachments: [],
    proofRecord: encryptedFailedProof,
  },

  // 7 — Delivery receipt
  {
    id: "seed-msg-07",
    threadId: "thread-07",
    subject: "Delivery receipt settled",
    snippet: "Soroban receipt confirmed read proof for message 48fb...c29a...",
    body: "Delivery receipt settled.\n\nMessage: 48fb...c29a\nContract: CCL2...9DME\nEvent: read_proof\nFee: 0.00002 XLM",
    sender: senderReceiptContract,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-18T12:00:00",
    isRead: true,
    isStarred: false,
    labels: ["Receipt", "Soroban"],
    attachments: [],
    proofRecord: receiptProof,
  },

  // 8 — Snoozed with calendar event
  {
    id: "seed-msg-08",
    threadId: "thread-08",
    subject: "Studio visit next Thursday?",
    snippet: "Snoozed until tomorrow. Aria wants to show the new prints in person...",
    body: "Would love to show you the new prints in person. We're in the Mission until the end of the month.\n\nSnoozing this so it comes back tomorrow morning.",
    sender: senderAriaVoss,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-13T09:41:00",
    isRead: true,
    isStarred: false,
    snoozeRemindAt: "2026-06-14T10:30:00",
    labels: ["Event", "Snoozed", "Personal"],
    attachments: [],
    calendarEvent: studioVisitEvent,
  },

  // 9 — Archived engineering thread
  {
    id: "seed-msg-09",
    threadId: "thread-09",
    subject: "Re: Architecture review notes",
    snippet: "Thanks for the deep dive yesterday. A few follow-ups on the edge runtime concerns...",
    body: "Thanks for the deep dive yesterday. A few follow-ups on the edge runtime concerns we discussed. I think we can resolve most of them with a thin adapter layer.\n\nHappy to pair on it tomorrow.",
    sender: senderMarcusChen,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-16T10:00:00",
    isRead: true,
    isStarred: true,
    labels: ["Engineering"],
    attachments: [],
  },

  // 10 — Sent message
  {
    id: "seed-msg-10",
    threadId: "thread-10",
    subject: "Re: Co-marketing proposal",
    snippet: "Sent with verified postage and memo hash 8d31...5b9c...",
    body: "Thanks Daniela,\n\nThis sounds useful. I sent over the launch calendar and the partner guidelines. The on-chain memo for this message is 8d31...5b9c.\n\nEve",
    sender: senderEve,
    recipients: ["daniela@example.org"],
    date: "2026-06-15T14:00:00",
    isRead: true,
    isStarred: false,
    labels: ["Partnerships"],
    attachments: [],
  },

  // 11 — Draft
  {
    id: "seed-msg-11",
    threadId: "thread-11",
    subject: "Protocol launch notes",
    snippet: "Draft saved locally. Add sender-verification screenshots before sending...",
    body: "Launch notes:\n\n- Explain Stellar federation in one paragraph\n- Show paid inbox settings\n- Add proof badge states\n- Include migration path for SMTP contacts",
    sender: senderEve,
    recipients: [],
    date: "2026-06-14T16:00:00",
    isRead: true,
    isStarred: false,
    labels: ["Draft"],
    attachments: [],
  },

  // 12 — Scheduled send
  {
    id: "seed-msg-12",
    threadId: "thread-12",
    subject: "Founder update - scheduled",
    snippet: "Scheduled for tomorrow at 8:00 AM with minimum postage attached...",
    body: "This founder update is scheduled for tomorrow at 8:00 AM.\n\nMinimum postage is attached and the memo hash will be generated at send time.",
    sender: senderEve,
    recipients: ["investors@example.org"],
    date: "2026-06-20T08:00:00",
    isRead: true,
    isStarred: false,
    labels: ["Scheduled"],
    attachments: [],
    proofRecord: scheduledProof,
  },

  // 13 — Outbox awaiting signature
  {
    id: "seed-msg-13",
    threadId: "thread-13",
    subject: "Waiting for wallet signature",
    snippet: "One message is ready but still needs a Stellar wallet signature...",
    body: "One message is ready to leave your outbox.\n\nStatus: waiting for wallet signature\nAction: approve transaction\nPostage: 0.00001 XLM",
    sender: senderOutboundQueue,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T10:00:00",
    isRead: false,
    isStarred: false,
    labels: ["Signature Required"],
    attachments: [],
    proofRecord: {
      id: "prf-outbox-13",
      status: "pending",
      timestamp: "2026-06-19T10:00:00",
      postageAmount: 10_000,
      postageCurrency: "stroops",
    },
  },

  // 14 — Spam: SMTP bridge warning
  {
    id: "seed-msg-14",
    threadId: "thread-14",
    subject: "SMTP bridge warning",
    snippet: "This message was bridged from SMTP and cannot be fully verified...",
    body: "This message was bridged from SMTP and cannot be fully verified.\n\nThe sender domain passed standard checks, but there is no Stellar signature attached.",
    sender: senderLegacyBridge,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-13T12:00:00",
    isRead: true,
    isStarred: false,
    labels: ["Bridge", "Unverified"],
    attachments: [],
  },

  // 15 — Trash: old imported thread
  {
    id: "seed-msg-15",
    threadId: "thread-15",
    subject: "Old import from test inbox",
    snippet: "This imported thread is marked for deletion...",
    body: "This imported thread is marked for deletion and will be removed after the retention window closes.",
    sender: senderDeleted,
    recipients: ["eve@stealth.xyz"],
    date: "2026-01-12T00:00:00",
    isRead: true,
    isStarred: false,
    labels: [],
    attachments: [],
  },

  // 16 — Inbox: sign-in passkey (OTP)
  {
    id: "seed-msg-16",
    threadId: "thread-16",
    subject: "Your sign-in passkey",
    snippet: "Use the one-time code below to finish signing in to your account...",
    body: "Hi Eve,\n\nWe received a sign-in request from a new device. Use the one-time passkey below to complete verification.\n\nYour OTP code: 371 400\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore the message.\n\n— Hush Security",
    sender: senderSecurity,
    recipients: ["eve@stealth.xyz"],
    date: "2026-06-19T10:00:00",
    isRead: false,
    isStarred: false,
    labels: ["Security", "OTP"],
    attachments: [],
  },
];

// ---------------------------------------------------------------------------
// Aggregate dataset
// ---------------------------------------------------------------------------

/** All unique senders referenced by the seed messages. */
export const inboxSeedSenders: DemoSender[] = [
  senderLinaPark,
  senderToken2049,
  senderRelay07,
  senderUthaimin,
  senderUnknown,
  senderStellarFund,
  senderAnonTrader,
  senderNadia,
  senderKael,
  senderCipherRelay,
  senderVaultNode,
  senderReceiptContract,
  senderAriaVoss,
  senderMarcusChen,
  senderEve,
  senderOutboundQueue,
  senderLegacyBridge,
  senderDeleted,
  senderSecurity,
];

/**
 * The complete inbox seed dataset.
 *
 * This is the root export that the admin dashboard can load, edit, validate,
 * and publish without touching `src/components/mail/data.ts`.
 */
export const inboxSeedDataset: DemoDataset = {
  id: "inbox-seed-v1",
  name: "Inbox Seed Dataset",
  description:
    "A local starter dataset mirroring the current demo inbox. " +
    "All addresses, hashes, and timestamps are fake and deterministic.",
  messages: inboxSeedMessages,
  senders: inboxSeedSenders,
};
