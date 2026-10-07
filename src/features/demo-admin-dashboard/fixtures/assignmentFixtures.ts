import { AssignableMessage, AssignmentState } from "../types/assignment";
import { defaultCampaignSnapshots } from "./campaignSnapshotFixtures";
import { CampaignSnapshot } from "../types/campaignSnapshot";

export const messagePool: AssignableMessage[] = [
  {
    id: "msg-pool-001",
    subject: "Welcome to Hush",
    preview:
      "Your mailbox is ready. You decide who can reach you — trusted contacts arrive instantly.",
    body: "Your mailbox is ready. You decide who can reach you — trusted contacts arrive instantly, everyone else follows the policy you choose.\n\n— The Hush Team",
    recipients: ["newuser@stealth.demo"],
    tags: ["welcome", "onboarding"],
    folderHint: "inbox",
  },
  {
    id: "msg-pool-002",
    subject: "Set up your Stellar wallet",
    preview:
      "To start receiving postage refunds, connect your Stellar account address in settings.",
    body: "To start receiving postage refunds, connect your Stellar account address in settings. This lets the postage contract route credits directly back to you.\n\n— Hush Finance",
    recipients: ["newuser@stealth.demo"],
    tags: ["stellar", "onboarding"],
    folderHint: "inbox",
  },
  {
    id: "msg-pool-003",
    subject: "Postage receipt: msg_relay_8a2c",
    preview: "Your postage of 0.05 XLM has been settled on-chain. Ledger hash attached.",
    body: "Your postage of 0.05 XLM has been settled on-chain. Ledger hash: 3f2a1...b9cd.\n\nThis receipt is cryptographically verifiable at any time.",
    recipients: ["user@stealth.demo"],
    tags: ["stellar", "announcement"],
    folderHint: "receipts",
  },
  {
    id: "msg-pool-004",
    subject: "Relay node registered: relay-east-01",
    preview: "A new relay node has been registered and is awaiting on-chain verification.",
    body: "A new relay node (relay-east-01) has been registered and is awaiting on-chain verification. Estimated confirmation time: 2–4 ledger cycles.",
    recipients: ["admin@stealth.demo"],
    tags: ["stellar", "announcement"],
    folderHint: "priority",
  },
  {
    id: "msg-pool-005",
    subject: "Action required: confirm backup passphrase",
    preview:
      "We detected a sign-in from a new device. Verify your 24-word recovery phrase to continue.",
    body: "We detected a sign-in from a new device. Please verify your 24-word recovery phrase to confirm this was you and protect your account.\n\n— Hush Security",
    recipients: ["sec-audit@stealth.demo"],
    tags: ["security", "alert"],
    folderHint: "priority",
  },
  {
    id: "msg-pool-006",
    subject: "Hush Digest — June 2026",
    preview:
      "Two new regional relays online. Postage routing latency down 18%. Read the full update.",
    body: "This month we brought two new regional relays online, cutting median routing latency by 18%. The postage contract upgrade shipped on testnet — mainnet follows next sprint.\n\nRead more on the blog.",
    recipients: ["subscribers@stealth.demo"],
    tags: ["newsletter", "marketing"],
    folderHint: "inbox",
  },
  {
    id: "msg-pool-007",
    subject: "You're invited: Hush demo roundtable",
    preview: "Join us on July 9 at 3 PM for a live walkthrough of the Hush protocol and Q&A.",
    body: "Join us on July 9 at 3 PM (virtual) for a live walkthrough of the Hush protocol and an open Q&A session. RSVP by replying to this message.",
    recipients: ["invitee@stealth.demo"],
    tags: ["announcement", "onboarding"],
    folderHint: "inbox",
  },
  {
    id: "msg-pool-008",
    subject: "Cryptographic proof confirmed",
    preview: "Your message proof for msg_abc123 has been anchored to ledger block #8,204,451.",
    body: "Your message proof for msg_abc123 has been anchored to ledger block #8,204,451. The payload commitment is now immutable and verifiable by any third party.",
    recipients: ["user@stealth.demo"],
    tags: ["stellar", "security"],
    folderHint: "receipts",
  },
  {
    id: "msg-pool-009",
    subject: "Admin note: data freeze reminder",
    preview: "Demo data freeze begins 2026-07-01. Finalise all fixture sets before then.",
    body: "This is an internal admin reminder: demo data freeze begins 2026-07-01. Please finalise all fixture sets and campaign assignments before that date.",
    recipients: ["admin@stealth.demo"],
    tags: ["alert", "marketing"],
    folderHint: "priority",
  },
  {
    id: "msg-pool-010",
    subject: "Your sender policy has been updated",
    preview: "You changed your default policy to 'request'. New senders will now require approval.",
    body: "You changed your default sender policy to 'request'. New senders will now need to pay postage and await your approval before their messages are delivered.",
    recipients: ["user@stealth.demo"],
    tags: ["security", "onboarding"],
    folderHint: "inbox",
  },
];

// Pre-seed campaigns with a subset of the pool
const seededSnapshots: CampaignSnapshot[] = defaultCampaignSnapshots.map((snap) => {
  if (snap.id === "snap-welcome") {
    return {
      ...snap,
      drafts: [
        ...snap.drafts,
        {
          id: "msg-pool-001",
          subject: messagePool[0].subject,
          body: messagePool[0].body,
          recipients: messagePool[0].recipients,
        },
        {
          id: "msg-pool-002",
          subject: messagePool[1].subject,
          body: messagePool[1].body,
          recipients: messagePool[1].recipients,
        },
        {
          id: "msg-pool-007",
          subject: messagePool[6].subject,
          body: messagePool[6].body,
          recipients: messagePool[6].recipients,
        },
      ],
    };
  }
  if (snap.id === "snap-security") {
    return {
      ...snap,
      drafts: [
        ...snap.drafts,
        {
          id: "msg-pool-005",
          subject: messagePool[4].subject,
          body: messagePool[4].body,
          recipients: messagePool[4].recipients,
        },
        {
          id: "msg-pool-008",
          subject: messagePool[7].subject,
          body: messagePool[7].body,
          recipients: messagePool[7].recipients,
        },
      ],
    };
  }
  if (snap.id === "snap-newsletter") {
    return {
      ...snap,
      drafts: [
        ...snap.drafts,
        {
          id: "msg-pool-006",
          subject: messagePool[5].subject,
          body: messagePool[5].body,
          recipients: messagePool[5].recipients,
        },
        {
          id: "msg-pool-003",
          subject: messagePool[2].subject,
          body: messagePool[2].body,
          recipients: messagePool[2].recipients,
        },
      ],
    };
  }
  return snap;
});

// De-duplicate drafts by id (pool messages were already in defaultCampaignSnapshots as different ids)
function dedupDrafts(snap: CampaignSnapshot): CampaignSnapshot {
  const seen = new Set<string>();
  return {
    ...snap,
    drafts: snap.drafts.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    }),
  };
}

export const defaultAssignmentState: AssignmentState = {
  campaigns: seededSnapshots.map(dedupDrafts),
  pool: messagePool,
};
