import type { MessageTemplate } from "./types";

/**
 * Deterministic, fake message templates for demo population.
 *
 * Recipients use reserved example domains and the demo `*stealth.demo`
 * federation handle so nothing here references real people, secrets, or live
 * addresses. The list is static so tests and snapshots stay stable.
 */
export const messageTemplates: MessageTemplate[] = [
  {
    id: "welcome-intro",
    name: "Welcome to Hush",
    category: "welcome",
    description: "Friendly onboarding note for a brand-new demo account.",
    subject: "Welcome to Hush — your private mailbox is ready",
    body: "Hi there,\n\nYour Hush mailbox is set up. You decide who can reach you: trusted contacts arrive instantly, everyone else follows the policy you choose.\n\nReply any time to start a conversation.\n\n— The Hush demo team",
    recipients: ["new.user*stealth.demo"],
    tags: ["onboarding", "intro", "getting started"],
  },
  {
    id: "postage-receipt",
    name: "Postage receipt",
    category: "transactional",
    description: "Confirmation that demo postage settled for a message.",
    subject: "Postage settled for your message",
    body: "Your message postage has settled.\n\nAmount: 0.0001 XLM\nStatus: settled\nReference: demo-memo-0001\n\nThis is a demo receipt and carries no real value.",
    recipients: ["billing*stealth.demo"],
    tags: ["postage", "receipt", "payment", "xlm"],
  },
  {
    id: "verify-code",
    name: "Verification code",
    category: "security",
    description: "One-time passkey layout for testing the OTP reader card.",
    subject: "Your Hush verification code",
    body: "Use the one-time passkey below to finish signing in.\n\nCode: 482 015\n\nThis demo code expires in 10 minutes. If you didn't request it, you can ignore this message.",
    recipients: ["security*stealth.demo"],
    tags: ["otp", "passkey", "login", "2fa"],
  },
  {
    id: "event-invite",
    name: "Event invitation",
    category: "event",
    description: "Calendar-style invite to exercise the event mail card.",
    subject: "You're invited: Hush demo roundtable",
    body: "You're invited to the Hush demo roundtable.\n\nDate: 2026-07-09\nTime: 3:00 PM\nLocation: Demo room\n\nReply to let us know if you can make it.",
    recipients: ["events*stealth.demo"],
    tags: ["event", "calendar", "invite", "rsvp"],
  },
  {
    id: "product-newsletter",
    name: "Product newsletter",
    category: "newsletter",
    description: "Longer-form update for testing list and link rendering.",
    subject: "Hush demo digest — what's new",
    body: "Here's what's new in the demo build:\n\n- Refreshed inbox layout\n- Faster command palette\n- Friendlier first-run onboarding\n\nThanks for following along.",
    recipients: ["digest*stealth.demo"],
    tags: ["newsletter", "digest", "updates", "product"],
  },
  {
    id: "delivery-proof",
    name: "Delivery proof",
    category: "transactional",
    description: "Receipt-style proof message for the delivery surfaces.",
    subject: "Delivery receipt settled",
    body: "Delivery receipt settled.\n\nMessage: demo-48fb\nEvent: read_proof\nFee: 0.00002 XLM\n\nThis is synthetic demo data.",
    recipients: ["receipts*stealth.demo"],
    tags: ["proof", "receipt", "delivery", "soroban"],
  },
  {
    id: "campaign-review-note",
    name: "Campaign review note",
    category: "internal",
    description: "Internal campaign status note for demo admin review and copy readiness.",
    subject: "Internal campaign copy review note",
    body: "Status: ready for review\nNext step: confirm the new campaign templates and insert this internal note template into the demo draft dataset.\n\nThis is an internal demo note and not customer-facing content.",
    recipients: ["campaign-team*stealth.demo"],
    tags: ["internal", "campaign", "review"],
  },
];
