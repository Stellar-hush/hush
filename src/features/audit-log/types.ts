/**
 * Audit log types for Hush protocol events.
 * Message body content is intentionally excluded.
 */

export type AuditCategory = "policy" | "delivery" | "security" | "billing";

export type AuditEventKind =
  // Policy
  | "policy.default_changed"
  | "policy.sender_allowed"
  | "policy.sender_blocked"
  | "policy.sender_verified"
  // Delivery
  | "delivery.message_received"
  | "delivery.receipt_issued"
  | "delivery.message_bounced"
  // Security
  | "session.started"
  | "session.ended"
  | "identity.resolved"
  | "identity.verification_failed"
  // Billing
  | "postage.attached"
  | "postage.settled"
  | "postage.refunded";

export const CATEGORY_FOR_KIND: Record<AuditEventKind, AuditCategory> = {
  "policy.default_changed": "policy",
  "policy.sender_allowed": "policy",
  "policy.sender_blocked": "policy",
  "policy.sender_verified": "policy",
  "delivery.message_received": "delivery",
  "delivery.receipt_issued": "delivery",
  "delivery.message_bounced": "delivery",
  "session.started": "security",
  "session.ended": "security",
  "identity.resolved": "security",
  "identity.verification_failed": "security",
  "postage.attached": "billing",
  "postage.settled": "billing",
  "postage.refunded": "billing",
};

export type AuditActor =
  | { type: "user"; address: string; displayName?: string }
  | { type: "system" }
  | { type: "relay"; relayId: string };

export type AuditEvent = {
  id: string;
  kind: AuditEventKind;
  category: AuditCategory;
  ts: string; // ISO-8601
  actor: AuditActor;
  /** Human-readable one-line summary — no sensitive body content. */
  summary: string;
  /** Optional linked context; message bodies are never included. */
  context?: {
    messageId?: string;
    senderAddress?: string;
    senderDisplayName?: string;
    amount?: string;
    currency?: string;
    policyValue?: string;
  };
};

export type AuditFilter = {
  category: AuditCategory | "all";
  search: string;
};
