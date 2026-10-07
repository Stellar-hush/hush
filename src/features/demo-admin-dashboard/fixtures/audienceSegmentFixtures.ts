import type { AudienceSegment, AudienceSegmentId } from "../types/audienceSegment";
import type { CampaignSnapshot } from "../types/campaignSnapshot";

export const defaultAudienceSegments: AudienceSegment[] = [
  {
    id: "investors",
    label: "Investors",
    description: "Accredited investors and VC partners who have expressed interest in Hush.",
    icon: "💼",
    estimatedSize: 340,
    criteria: [
      "signed up via investor referral link",
      "has verified Stellar wallet",
      "opted into investor digest",
    ],
  },
  {
    id: "founders",
    label: "Founders",
    description: "Startup founders and builders building on top of the Hush protocol.",
    icon: "🚀",
    estimatedSize: 210,
    criteria: [
      "registered via founder onboarding flow",
      "has relay node pending or active",
      "completed wallet setup",
    ],
  },
  {
    id: "events",
    label: "Event Attendees",
    description: "Attendees of Stellar ecosystem events who opted into Hush communications.",
    icon: "🎟️",
    estimatedSize: 580,
    criteria: [
      "registered for Stellar Summit 2026",
      "opted in to event digest",
      "checked in at event booth",
    ],
  },
  {
    id: "relay-operators",
    label: "Relay Operators",
    description: "Node operators running registered Hush relay infrastructure on-chain.",
    icon: "🔗",
    estimatedSize: 95,
    criteria: [
      "has relay node registered on-chain",
      "postage volume greater than 1000 XLM",
      "node uptime above 95% in last 30 days",
    ],
  },
  {
    id: "unknown-senders",
    label: "Unknown Senders",
    description:
      "Senders with no active policy or contact record — subject to default inbox rules.",
    icon: "❓",
    estimatedSize: 1200,
    criteria: [
      "no sender policy set by recipient",
      "not in recipient contacts list",
      "first message to this mailbox",
    ],
  },
];

export const AUDIENCE_SEGMENTS_BY_ID: Record<AudienceSegmentId, AudienceSegment> =
  Object.fromEntries(defaultAudienceSegments.map((s) => [s.id, s])) as Record<
    AudienceSegmentId,
    AudienceSegment
  >;

export const audienceSegmentSnapshots: CampaignSnapshot[] = [
  {
    id: "snap-investors",
    name: "Q3 Investor Update",
    description: "Quarterly protocol progress update sent to accredited investors and VC partners.",
    targetAudience: "investors",
    tags: ["announcement", "newsletter"],
    timestamp: "2026-06-17T10:00:00Z",
    status: "draft",
    drafts: [
      {
        id: "draft-investors-1",
        subject: "Hush Q3 2026 Protocol Update",
        body: "Dear Investor,\n\nWe are excited to share our Q3 2026 progress report.\n\nHighlights this quarter:\n- Mainnet relay network expanded to 12 nodes\n- Postage settlement latency reduced by 40%\n- 3,200 new registered mailboxes\n\nFull report attached.\n\nBest regards,\nThe Hush Team",
        recipients: ["investors@stealth.demo"],
      },
    ],
  },
  {
    id: "snap-founders",
    name: "Founder Onboarding Kit",
    description:
      "Two-part welcome sequence for founders building applications on the Hush protocol.",
    targetAudience: "founders",
    tags: ["onboarding", "welcome", "stellar"],
    timestamp: "2026-06-17T11:00:00Z",
    status: "active",
    drafts: [
      {
        id: "draft-founders-1",
        subject: "Welcome to the Hush Builder Program",
        body: "Hi there,\n\nWelcome to the Hush Builder Program! You now have access to testnet relay nodes and our developer sandbox.\n\nGet started: https://docs.stealth.demo\n\nCheers,\nHush DevRel",
        recipients: ["founders@stealth.demo"],
      },
      {
        id: "draft-founders-2",
        subject: "Your Hush API credentials are ready",
        body: "Hello,\n\nYour sandbox API credentials have been provisioned. You can find them in the developer portal.\n\nRemember: testnet XLM only — do not use real Stellar keys.\n\nHappy building,\nHush DevRel",
        recipients: ["founders@stealth.demo"],
      },
    ],
  },
  {
    id: "snap-events",
    name: "Stellar Summit Invite",
    description:
      "Event invitation and logistics digest for registered Stellar Summit 2026 attendees.",
    targetAudience: "events",
    tags: ["announcement", "marketing"],
    timestamp: "2026-06-16T14:00:00Z",
    status: "active",
    drafts: [
      {
        id: "draft-events-1",
        subject: "You're invited: Hush at Stellar Summit 2026",
        body: "Hello,\n\nWe will be hosting a live demo of Hush at Stellar Summit 2026 on July 15th.\n\nJoin us at Booth 14 for a walkthrough of private postage and relay verification.\n\nSee you there,\nHush Team",
        recipients: ["events@stealth.demo"],
      },
    ],
  },
  {
    id: "snap-relay-operators",
    name: "Relay Operator Digest",
    description:
      "Monthly operational digest for active relay node operators covering uptime, earnings, and protocol changes.",
    targetAudience: "relay-operators",
    tags: ["newsletter", "stellar", "announcement"],
    timestamp: "2026-06-15T08:00:00Z",
    status: "needs-review",
    drafts: [
      {
        id: "draft-relay-ops-1",
        subject: "Relay Operator Digest — June 2026",
        body: "Hello Operator,\n\nYour node stats for June:\n- Messages relayed: 4,821\n- Uptime: 98.7%\n- Postage earned: 12.4 XLM\n\nUpcoming: relay protocol upgrade scheduled for July 1st. Please review the changelog before updating.\n\nHush Infrastructure Team",
        recipients: ["relay-ops@stealth.demo"],
      },
    ],
  },
  {
    id: "snap-unknown-senders",
    name: "Cold Outreach Policy Notice",
    description:
      "Automated policy notice sent to senders who have no established relationship with the recipient.",
    targetAudience: "unknown-senders",
    tags: ["alert", "security"],
    timestamp: "2026-06-14T16:00:00Z",
    status: "draft",
    drafts: [
      {
        id: "draft-unknown-1",
        subject: "Your message requires postage verification",
        body: "Hello,\n\nThe recipient has enabled postage verification for unknown senders. To deliver your message, please attach a postage commitment of at least 0.1 XLM.\n\nLearn more about Hush postage at https://stealth.demo/postage\n\nHush Policy Engine",
        recipients: ["unknown@stealth.demo"],
      },
    ],
  },
];
