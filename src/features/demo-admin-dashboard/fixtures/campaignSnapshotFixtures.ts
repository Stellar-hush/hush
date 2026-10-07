import { CampaignSnapshot } from "../types/campaignSnapshot";

export const defaultCampaignSnapshots: CampaignSnapshot[] = [
  {
    id: "snap-welcome",
    name: "Welcome Onboarding Series",
    description:
      "Introductory sequence sent to newly registered accounts explaining platform features.",
    targetAudience: "New Signups",
    tags: ["onboarding", "welcome", "stellar"],
    timestamp: "2026-06-16T12:00:00Z",
    status: "active",
    drafts: [
      {
        id: "draft-welcome-1",
        subject: "Welcome to Hush!",
        body: "Hi there!\n\nWelcome to Hush, the secure messaging platform powered by Stellar.\n\nBest,\nHush Team",
        recipients: ["newuser@stealth.demo"],
      },
      {
        id: "draft-welcome-2",
        subject: "Setting up your Stellar Wallet",
        body: "Hello!\n\nTo start receiving postage refunds, please set up your Stellar wallet address.\n\nCheers,\nHush Team",
        recipients: ["newuser@stealth.demo"],
      },
    ],
  },
  {
    id: "snap-security",
    name: "Security Auditing Flow",
    description:
      "Critical security alerts and passphrase confirmation steps for secure environments.",
    targetAudience: "High-Value Accounts",
    tags: ["security", "onboarding", "alert"],
    timestamp: "2026-06-15T09:30:00Z",
    status: "needs-review",
    drafts: [
      {
        id: "draft-security-1",
        subject: "Action Required: Confirm backup passphrase",
        body: "Hello,\n\nWe detected a login from a new device. Please make sure you have backed up your 24-word recovery phrase.\n\nSincerely,\nHush Security",
        recipients: ["sec-audit@stealth.demo"],
      },
    ],
  },
  {
    id: "snap-newsletter",
    name: "Monthly Newsletter",
    description:
      "Standard monthly update highlighting the new relay configurations and protocol updates.",
    targetAudience: "Newsletter Subscribers",
    tags: ["newsletter", "marketing", "announcement"],
    timestamp: "2026-06-14T15:45:00Z",
    status: "draft",
    drafts: [
      {
        id: "draft-news-1",
        subject: "Hush Digest - June 2026",
        body: "Hello from the Hush Team!\n\nThis month, we have successfully optimized our postage routing and added 2 new regional relays.\n\nRead more on our blog.",
        recipients: ["subscribers@stealth.demo"],
      },
    ],
  },
];
