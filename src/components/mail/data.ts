import type { MailEvent } from "@/features/calendar";
import { formatMailAddress } from "@/features/identity/mail-domain";

export type MailFolder =
  | "all"
  | "inbox"
  | "priority"
  | "snoozed"
  | "verified"
  | "pending"
  | "requests"
  | "encrypted"
  | "receipts"
  | "starred"
  | "sent"
  | "outbox"
  | "drafts"
  | "scheduled"
  | "archive"
  | "spam"
  | "trash";

type VirtualMailFolder = "all" | "starred";

export type MailLocation = Exclude<MailFolder, VirtualMailFolder>;

/**
 * Per-sender policy applied through the sender-conversion flow.
 * `undefined` means the sender has never been converted (still "unknown").
 * See src/features/sender-conversion.
 */
export type SenderPolicy = "allow" | "verify" | "block";

export type ReceiptState = "none" | "pending" | "sent";

/**
 * Encrypted payload status for messages in the encrypted folder.
 * - `locked`     : payload present but key not yet loaded — body must not render.
 * - `verifying`  : decryption key found, integrity check in progress.
 * - `decrypted`  : payload verified and unlocked, body can render.
 * - `failed`     : decryption or integrity check failed; body must not render.
 */
export type PayloadStatus = "locked" | "verifying" | "decrypted" | "failed";

/**
 * Failure reason discriminator for the `failed` status.
 * Used to present specific error copy and targeted retry / report CTAs.
 */
export type PayloadFailureReason = "key" | "payload" | "relay" | "integrity";

export type EncryptedPayload = {
  /** Current verification/unlock state for this payload. */
  status: PayloadStatus;
  /** Short opaque ID shown in the diagnostic copy and clipboard button. */
  diagnosticId: string;
  /** Only set when status === "failed". */
  failureReason?: PayloadFailureReason;
};
/**
 * Reminder metadata attached when a message is snoozed. Persisted on the email
 * so the snoozed folder can show when it returns and offer edit/undo.
 * See src/features/snooze.
 */
export type SnoozeState = {
  /** ISO datetime the message should return to the inbox. */
  remindAt: string;
  /** Which option produced this reminder. */
  choice: "later-today" | "tomorrow" | "next-week" | "custom";
  /** Human label captured at set-time, e.g. "Tomorrow". */
  label: string;
  /** ISO datetime the snooze was created. */
  createdAt: string;
};

import type { VerifiedEnvelopeProvenance } from "@/services/crypto/open-envelope";
import type { QuarantinedMailRecord } from "@/features/mail/quarantine";

export type Email = {
  id: string;
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
  starred: boolean;
  folder: MailLocation;
  labels?: string[];
  attachments?: { name: string; size: string; type: string }[];
  /**
   * BETA-067: Per-attachment crypto context from the sealed envelope.
   * When present, the preview drawer can decrypt and verify the attachment.
   * When absent, the drawer shows a locked/unavailable state.
   */
  attachmentCrypto?: {
    /** The AES-GCM content key for decrypting attachments. */
    contentKey: CryptoKey;
    /** Per-attachment encrypted data from the sealed envelope. */
    attachments: Array<{
      filename: string;
      /** Base64-encoded ciphertext (includes trailing GCM auth tag). */
      ciphertext: string;
      /** Hex-encoded 12-byte nonce. */
      nonce: string;
      /** Hex-encoded 16-byte GCM auth tag. */
      mac: string;
      /** SHA-256 hex content hash of the plaintext. */
      contentHash: string;
    }>;
  };
  avatarColor: string;
  event?: MailEvent;
  senderPolicy?: SenderPolicy;
  receiptState?: ReceiptState;
  snooze?: SnoozeState;
  postageAmount?: string;
  verifiedSender?: boolean;
  encryptedPayload?: EncryptedPayload;
  provenanceData?: VerifiedEnvelopeProvenance;
  quarantineRecord?: QuarantinedMailRecord;
  threadId?: string;
};

export type MailFilters = {
  unreadOnly: boolean;
  hasAttachments: boolean;
  dateRange: "all" | "today" | "week" | "month";
};

export const defaultMailFilters: MailFilters = {
  unreadOnly: false,
  hasAttachments: false,
  dateRange: "all",
};

export function applyMailFilters(allEmails: Email[], filters: MailFilters) {
  return allEmails.filter((email) => {
    if (filters.unreadOnly && !email.unread) return false;
    if (filters.hasAttachments && !email.attachments?.length) return false;
    if (
      filters.dateRange === "today" &&
      !["Now", "Just now"].some((value) => email.time.includes(value)) &&
      !email.time.includes("AM") &&
      !email.time.includes("PM")
    )
      return false;
    if (
      filters.dateRange === "week" &&
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(email.time)
    )
      return false;
    return true;
  });
}

export const mailFolders: {
  key: MailFolder;
  label: string;
  group: "mail" | "protocol" | "delivery" | "storage";
}[] = [
  { key: "all", label: "All Mail", group: "mail" },
  { key: "inbox", label: "Inbox", group: "mail" },
  { key: "priority", label: "Priority", group: "mail" },
  { key: "snoozed", label: "Snoozed", group: "mail" },
  { key: "starred", label: "Starred", group: "mail" },
  { key: "drafts", label: "Drafts", group: "mail" },
  { key: "sent", label: "Sent", group: "mail" },
  { key: "verified", label: "Verified", group: "protocol" },
  { key: "pending", label: "Pending Proof", group: "protocol" },
  { key: "requests", label: "Requests", group: "protocol" },
  { key: "encrypted", label: "Encrypted", group: "protocol" },
  { key: "receipts", label: "Receipts", group: "delivery" },
  { key: "outbox", label: "Outbox", group: "delivery" },
  { key: "scheduled", label: "Scheduled", group: "delivery" },
  { key: "archive", label: "Archive", group: "storage" },
  { key: "spam", label: "Spam", group: "storage" },
  { key: "trash", label: "Trash", group: "storage" },
];

const inboxLocations = new Set<MailLocation>([
  "inbox",
  "priority",
  "verified",
  "pending",
  "requests",
  "encrypted",
]);

export function getFolderLabel(folder: MailFolder) {
  return mailFolders.find((item) => item.key === folder)?.label ?? folder;
}

/** Folders whose messages carry a verified Stellar identity proof. */
const verifiedLocations = new Set<MailLocation>(["verified", "priority", "encrypted", "receipts"]);

/** Whether a message's sender identity is considered verified. */
export function isVerified(email: Email) {
  return verifiedLocations.has(email.folder);
}

/**
 * Deterministic mock proof hash for a message. Shared by the reader's protocol
 * badge and the command palette so "inspect proof" and the badge agree.
 */
export function deriveProof(email: Email) {
  const digest = email.provenanceData?.digest;
  if (digest && digest.length >= 12) {
    return `${digest.slice(0, 8)}...${digest.slice(-4)}`;
  }
  return `${email.id.padStart(2, "0")}c7...${email.from.length.toString(16)}a9`;
}

export function getEmailsForFolder(allEmails: Email[], folder: MailFolder) {
  if (folder === "all")
    return allEmails.filter((email) => email.folder !== "spam" && email.folder !== "trash");
  if (folder === "starred") return allEmails.filter((email) => email.starred);
  if (folder === "inbox") return allEmails.filter((email) => inboxLocations.has(email.folder));
  return allEmails.filter((email) => email.folder === folder);
}

const colors = ["#5b6470", "#7a8290", "#4d5560", "#9098a4", "#3d434d"];
const c = (i: number) => colors[i % colors.length];

export const emails: Email[] = [
  {
    id: "1",
    from: "Lina Park",
    email: "lina*vantage.studio",
    subject: "Q2 brand system - final direction",
    preview:
      "Sharing the refined exploration for the new identity. The monochrome system feels strongest...",
    body: "Hey,\n\nSharing the refined exploration for the new identity. The monochrome system feels strongest across product surfaces. I've attached the latest spec sheet and the motion principles deck.\n\nLet me know your thoughts before Friday's review.\n\nLina",
    time: "9:42 AM",
    unread: true,
    starred: true,
    folder: "priority",
    labels: ["Design", "Priority"],
    attachments: [
      { name: "vantage-identity-v3.pdf", size: "4.2 MB", type: "pdf" },
      { name: "brand-moodboard.png", size: "1.8 MB", type: "png" },
      { name: "release-notes.txt", size: "1.2 KB", type: "txt" },
      { name: "motion-principles.key", size: "12.1 MB", type: "key" },
    ],
    avatarColor: c(0),
    receiptState: "sent",
  },
  {
    id: "2",
    from: "TOKEN2049 Abu Dhabi",
    email: "events*token2049.global",
    subject: "TOKEN2049 Abu Dhabi - founder pass ready",
    preview: "Your event pass, agenda window, and wallet reminder are ready for Abu Dhabi...",
    body: "Your TOKEN2049 Abu Dhabi founder pass is ready.\n\nDate: April 21, 2026\nTime: 9:00 AM GST\nVenue: Abu Dhabi Global Market\nPass: Founder access\n\nAdd the event to keep side sessions, badge pickup, and wallet reminders in one place.",
    time: "9:18 AM",
    unread: true,
    starred: false,
    folder: "inbox",
    labels: ["Event", "Pass"],
    avatarColor: c(1),
    event: {
      id: "mail-token2049",
      title: "TOKEN2049 Abu Dhabi",
      month: "April",
      day: "21",
      cadence: "Event",
      date: "2026-04-21",
      time: "9:00 AM GST",
      endTime: "18:00",
      location: "Abu Dhabi Global Market",
      note: "Founder pass ready",
      calendar: "protocol",
      organizer: "TOKEN2049",
      meetingUrl: "https://www.token2049.com",
      days: [
        { label: "S", date: "18" },
        { label: "M", date: "19" },
        { label: "T", date: "20" },
        { label: "W", date: "21", active: true },
        { label: "T", date: "22" },
        { label: "F", date: "23" },
        { label: "S", date: "24" },
      ],
    },
  },
  {
    id: "3",
    from: "Relay Node 07",
    email: "relay07*stealth.network",
    subject: "Your relay verification code",
    preview: "Use the one-time passkey below to authorize this relay session...",
    body: "Hi Eve,\n\nA new relay session is requesting authorization on Node 07. Use the one-time passkey below to confirm it's you.\n\nYour OTP code: 482 015\n\nThis code expires in 10 minutes. If you didn't initiate this, ignore the message and your session will stay locked.\n\n— Relay Node 07",
    time: "8:57 AM",
    unread: true,
    starred: false,
    folder: "pending",
    labels: ["Security", "OTP"],
    avatarColor: c(2),
  },
  {
    id: "4",
    from: "Kryputh",
    email: formatMailAddress("kryputh"),
    subject: "Investor update and postage policy",
    preview: "The paid-inbox model makes sense. Can you send over the sender-tier thresholds...",
    body: "The paid-inbox model makes sense.\n\nCan you send over the sender-tier thresholds and how postage refunds work for approved contacts? I want to understand what happens when a verified sender is whitelisted.",
    time: "8:23 AM",
    unread: false,
    starred: true,
    folder: "inbox",
    labels: ["Investors", "Postage"],
    avatarColor: c(3),
    verifiedSender: true,
    receiptState: "pending",
  },
  {
    id: "5",
    from: "Unknown Sender",
    email: "GCKN...N4XQ",
    subject: "Message request awaiting approval",
    preview: "This sender paid postage but is not in your trusted contacts yet...",
    body: "This sender paid postage but is not in your trusted contacts yet.\n\nApprove the request to decrypt future messages automatically, or reject it to keep the address quarantined.",
    time: "7:48 AM",
    unread: true,
    starred: false,
    folder: "requests",
    labels: ["Request", "Paid"],
    avatarColor: c(4),
    postageAmount: "10000000",
    verifiedSender: false,
  },
  {
    id: "5-b",
    from: "Stellar Fund",
    email: "GD7K...J4W2",
    subject: "Grant application review",
    preview: "We've completed the initial screening of your GrantFox application...",
    body: "We've completed the initial screening of your GrantFox application and would like to proceed with the technical review.\n\nPlease approve this request so we can schedule the dev walkthrough and share the assessment criteria.",
    time: "Yesterday",
    unread: true,
    starred: false,
    folder: "requests",
    labels: ["Request", "Grant", "Verified"],
    avatarColor: c(1),
    postageAmount: "50000000",
    verifiedSender: true,
  },
  {
    id: "5-c",
    from: "Anonymous Trader",
    email: "GB3S...P9A2",
    subject: "OTC offer for USDC on Stellar",
    preview: "I'm looking to buy 50,000 USDC at $0.15...",
    body: "I'm looking to buy 50,000 USDC at $0.15. Can settle immediately via smart contract. Let me know if you have liquidity available.",
    time: "Yesterday",
    unread: true,
    starred: false,
    folder: "requests",
    labels: ["Request", "Paid"],
    avatarColor: c(3),
    postageAmount: "15000000",
    verifiedSender: false,
  },
  {
    id: "6",
    from: "Nadia Reyes",
    email: "nadia*atlas.dev",
    subject: "Encrypted payload test",
    preview:
      "The Curve25519 envelope opens cleanly on desktop and mobile with the same account key...",
    body: "The Curve25519 envelope opens cleanly on desktop and mobile with the same account key.\n\nI attached the test vector and the decoded header output so you can compare against the relay logs.",
    time: "Yesterday",
    unread: false,
    starred: false,
    folder: "encrypted",
    labels: ["Encrypted", "Engineering"],
    attachments: [
      { name: "payload-test-vector.json", size: "18 KB", type: "json" },
      { name: "encrypted-data.pgp", size: "1.4 KB", type: "pgp" },
      { name: "stealth-payload.bin", size: "256 B", type: "bin" },
    ],
    avatarColor: c(0),
    encryptedPayload: {
      status: "decrypted",
      diagnosticId: "dec-7a3f-c18e",
    },
  },
  {
    id: "6-b",
    from: "Kael Ortega",
    email: "kael*nexus.io",
    subject: "Sealed proposal — open to verify",
    preview: "Unlock the encrypted envelope to read the funding proposal…",
    body: "Unlock the encrypted envelope to read the funding proposal. The payload is sealed with your registered public key.",
    time: "Yesterday",
    unread: true,
    starred: false,
    folder: "encrypted",
    labels: ["Encrypted", "Proposal"],
    avatarColor: c(1),
    encryptedPayload: {
      status: "locked",
      diagnosticId: "lck-4b2a-9d01",
    },
  },
  {
    id: "6-c",
    from: "Cipher Relay",
    email: "relay*cipher.network",
    subject: "Verifying message integrity…",
    preview: "Integrity check is running. Stand by for the decrypted payload.",
    body: "Integrity check is running. Stand by for the decrypted payload.",
    time: "Today",
    unread: true,
    starred: false,
    folder: "encrypted",
    labels: ["Encrypted", "Verifying"],
    avatarColor: c(2),
    encryptedPayload: {
      status: "verifying",
      diagnosticId: "vfy-8c5d-2e47",
    },
  },
  {
    id: "6-d",
    from: "Vault Node",
    email: "vault*stealth.network",
    subject: "Decryption failed — payload corrupted",
    preview: "The payload failed integrity verification. Possible relay tampering detected.",
    body: "The payload failed integrity verification. Possible relay tampering detected.",
    time: "2 days ago",
    unread: false,
    starred: false,
    folder: "encrypted",
    labels: ["Encrypted", "Failed"],
    avatarColor: c(3),
    encryptedPayload: {
      status: "failed",
      diagnosticId: "flt-1e9b-5f62",
      failureReason: "integrity",
    },
  },
  {
    id: "7",
    from: "Receipt Contract",
    email: "receipts*stealth.network",
    subject: "Delivery receipt settled",
    preview: "Soroban receipt confirmed read proof for message 48fb...c29a...",
    body: "Delivery receipt settled.\n\nMessage: 48fb...c29a\nContract: CCL2...9DME\nEvent: read_proof\nFee: 0.00002 XLM",
    time: "Yesterday",
    unread: false,
    starred: false,
    folder: "receipts",
    labels: ["Receipt", "Soroban"],
    avatarColor: c(1),
  },
  {
    id: "8",
    from: "Aria Voss",
    email: "aria*studio.aria",
    subject: "Studio visit next Thursday?",
    preview: "Snoozed until tomorrow. Aria wants to show the new prints in person...",
    body: "Would love to show you the new prints in person. We're in the Mission until the end of the month.\n\nSnoozing this so it comes back tomorrow morning.",
    time: "Tomorrow",
    unread: false,
    starred: false,
    folder: "snoozed",
    labels: ["Event", "Snoozed", "Personal"],
    avatarColor: c(2),
    snooze: {
      remindAt: "2026-06-14T10:30:00",
      choice: "tomorrow",
      label: "Tomorrow",
      createdAt: "2026-06-13T09:41:00",
    },
    event: {
      id: "mail-studio-visit",
      title: "Studio visit",
      month: "April",
      day: "21",
      cadence: "Weekly",
      date: "2026-04-21",
      time: "10:30 AM",
      endTime: "11:30",
      location: "Mission studio",
      note: "New print walkthrough",
      calendar: "personal",
      organizer: "Aria Voss",
      days: [
        { label: "S", date: "18" },
        { label: "M", date: "19" },
        { label: "T", date: "20" },
        { label: "W", date: "21", active: true },
        { label: "T", date: "22" },
        { label: "F", date: "23" },
        { label: "S", date: "24" },
      ],
    },
  },
  {
    id: "9",
    from: "Marcus Chen",
    email: "marcus*northwind.io",
    subject: "Re: Architecture review notes",
    preview: "Thanks for the deep dive yesterday. A few follow-ups on the edge runtime concerns...",
    body: "Thanks for the deep dive yesterday. A few follow-ups on the edge runtime concerns we discussed. I think we can resolve most of them with a thin adapter layer.\n\nHappy to pair on it tomorrow.",
    time: "Mon",
    unread: false,
    starred: true,
    folder: "archive",
    labels: ["Engineering"],
    avatarColor: c(3),
  },
  {
    id: "10",
    from: "Eve Navarro",
    email: "eve*stealth.xyz",
    subject: "Re: Co-marketing proposal",
    preview: "Sent with verified postage and memo hash 8d31...5b9c...",
    body: "Thanks Daniela,\n\nThis sounds useful. I sent over the launch calendar and the partner guidelines. The on-chain memo for this message is 8d31...5b9c.\n\nEve",
    time: "Sun",
    unread: false,
    starred: false,
    folder: "sent",
    labels: ["Partnerships"],
    avatarColor: c(4),
  },
  {
    id: "11",
    from: "Eve Navarro",
    email: "eve*stealth.xyz",
    subject: "Protocol launch notes",
    preview: "Draft saved locally. Add sender-verification screenshots before sending...",
    body: "Launch notes:\n\n- Explain Stellar federation in one paragraph\n- Show paid inbox settings\n- Add proof badge states\n- Include migration path for SMTP contacts",
    time: "Sat",
    unread: false,
    starred: false,
    folder: "drafts",
    labels: ["Draft"],
    avatarColor: c(0),
  },
  {
    id: "12",
    from: "Eve Navarro",
    email: "eve*stealth.xyz",
    subject: "Founder update - scheduled",
    preview: "Scheduled for tomorrow at 8:00 AM with minimum postage attached...",
    body: "This founder update is scheduled for tomorrow at 8:00 AM.\n\nMinimum postage is attached and the memo hash will be generated at send time.",
    time: "Tomorrow",
    unread: false,
    starred: false,
    folder: "scheduled",
    labels: ["Scheduled"],
    avatarColor: c(1),
  },
  {
    id: "13",
    from: "Outbound Queue",
    email: "queue*stealth.network",
    subject: "Waiting for wallet signature",
    preview: "One message is ready but still needs a Stellar wallet signature...",
    body: "One message is ready to leave your outbox.\n\nStatus: waiting for wallet signature\nAction: approve transaction\nPostage: 0.00001 XLM",
    time: "Now",
    unread: true,
    starred: false,
    folder: "outbox",
    labels: ["Signature Required"],
    avatarColor: c(2),
  },
  {
    id: "14",
    from: "Legacy Bridge",
    email: "bridge*stealth.network",
    subject: "SMTP bridge warning",
    preview: "This message was bridged from SMTP and cannot be fully verified...",
    body: "This message was bridged from SMTP and cannot be fully verified.\n\nThe sender domain passed standard checks, but there is no Stellar signature attached.",
    time: "Fri",
    unread: false,
    starred: false,
    folder: "spam",
    labels: ["Bridge", "Unverified"],
    avatarColor: c(3),
  },
  {
    id: "15",
    from: "Deleted Thread",
    email: "old-contact*example.org",
    subject: "Old import from test inbox",
    preview: "This imported thread is marked for deletion...",
    body: "This imported thread is marked for deletion and will be removed after the retention window closes.",
    time: "Jan 12",
    unread: false,
    starred: false,
    folder: "trash",
    avatarColor: c(4),
  },
  {
    id: "16",
    from: "Hush Security",
    email: "security*stealth.network",
    subject: "Your sign-in passkey",
    preview: "Use the one-time code below to finish signing in to your account...",
    body: "Hi Eve,\n\nWe received a sign-in request from a new device. Use the one-time passkey below to complete verification.\n\nYour OTP code: 371 400\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore the message.\n\n— Hush Security",
    time: "Just now",
    unread: true,
    starred: false,
    folder: "inbox",
    labels: ["Security", "OTP"],
    avatarColor: c(2),
  },
];
