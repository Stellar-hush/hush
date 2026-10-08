import type { ChangelogEntry } from "./types";

/**
 * Static release entries for the Changelog Panel.
 *
 * ## Safety & Privacy Boundaries
 * - **Demo Data**: All entries below contain static, demonstration release notes.
 * - **Data Hygiene**: Do NOT add real user data, private keys, secrets, or live customer mail.
 * - **Positioning**: Content aligns with Hush Mail's safety, speed, and sender-control values.
 */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: "v0.4.0-security-1",
    version: "0.4.0",
    date: "2026-06-17",
    category: "security",
    title: "Mailbox policy audit log",
    description:
      "Every policy change — sender allow/block, postage threshold updates — is now recorded in the audit log with actor, timestamp, and context.",
    link: { label: "View audit log", href: "#settings/audit" },
  },
  {
    id: "v0.4.0-ui-1",
    version: "0.4.0",
    date: "2026-06-17",
    category: "ui",
    title: "Settings redesign with tabbed layout",
    description:
      "Settings are now grouped into Account, Appearance, Notifications, Layout, Inbox control, Read receipts, Security, Shortcuts, and Audit log tabs.",
  },
  {
    id: "v0.4.0-ui-2",
    version: "0.4.0",
    date: "2026-06-17",
    category: "ui",
    title: "Inbox policy template gallery",
    description:
      "Pick from curated mailbox policy templates with side-by-side tradeoff and sender-experience previews before applying.",
  },
  {
    id: "v0.3.2-protocol-1",
    version: "0.3.2",
    date: "2026-06-10",
    category: "protocol",
    title: "Postage settlement improvements",
    description:
      "XLM postage is now settled atomically with delivery confirmation, eliminating a race condition where refunds could be delayed.",
    link: {
      label: "Protocol spec",
      href: "https://github.com/Stellar-hush/hush/issues/138",
    },
  },
  {
    id: "v0.3.2-api-1",
    version: "0.3.2",
    date: "2026-06-10",
    category: "api",
    title: "Relay diagnostics endpoint",
    description:
      "A new relay diagnostics panel exposes live relay health, hop latency, and delivery status for each message.",
  },
  {
    id: "v0.3.1-security-1",
    version: "0.3.1",
    date: "2026-06-03",
    category: "security",
    title: "Identity verification failure events",
    description:
      "Failed identity resolution attempts are now surfaced as structured events, letting you review and block suspicious addresses.",
  },
  {
    id: "v0.3.0-ui-1",
    version: "0.3.0",
    date: "2026-05-28",
    category: "ui",
    title: "Glass intensity control",
    description:
      "You can now choose between Subtle, Medium, and Strong glass effect intensities from the Appearance settings.",
  },
  {
    id: "v0.3.0-protocol-1",
    version: "0.3.0",
    date: "2026-05-28",
    category: "protocol",
    title: "Stellar SEP-0010 auth integration",
    description:
      "Authentication tokens are now issued via SEP-0010, tying session credentials to your Stellar keypair.",
    link: {
      label: "SEP-0010 spec",
      href: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md",
    },
  },
];

export const LATEST_VERSION = CHANGELOG_ENTRIES[0].version;
