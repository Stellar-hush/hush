import type { PostageQuote } from "@/features/compose/usePostageQuote";

export type Attachment = {
  name: string;
  size: string;
  type: "file" | "image";
};

export type ComposeMode = "compose" | "reply" | "reply-all" | "forward" | "schedule";

export type RecipientResolutionState = "resolving" | "verified" | "unknown" | "invalid" | "blocked";

export type RecipientReadiness = {
  address: string;
  state: RecipientResolutionState;
  postage: "ready" | "required";
  message: string;
  resolvedAccount?: string; // Hush address if resolved
  policyType?: "allow" | "block" | "default"; // Trust policy
  encryptionKey?: string; // Public key for encryption
  provenance?: string; // cache source
  cached?: boolean; // is cached
  expiresAt?: string; // expiration ISO timestamp
  keyStatus?: string; // key status from key directory
};

export type ComposeDraft = {
  to: string;
  subject?: string;
  body: string;
  postage: string;
  blockedRecipients?: string[];
  /** Optional policy quote from the API — used to gate on trust/blocked/minimum postage. */
  policyQuote?: PostageQuote | null;
  /** Optional pre-resolved recipients. If omitted, we check only initial status. */
  resolvedRecipients?: RecipientReadiness[];
};

export type ComposeSubmission = {
  to: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  encrypted: boolean;
  receipt: boolean;
  postage: string;
  scheduled: boolean;
  mode?: ComposeMode;
};

export function parseRecipients(value: string) {
  return value
    .split(/[;,]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

/**
 * Get initial recipient readiness (synchronous, for instant feedback)
 * This is used before async resolution kicks in - shows "resolving" state
 */
export function getRecipientReadiness(
  value: string,
  postage: string,
  blockedRecipients: string[] = [],
): RecipientReadiness[] {
  const blocked = new Set(blockedRecipients.map((recipient) => recipient.toLowerCase().trim()));
  const postageReady = Number.parseFloat(postage) > 0;

  return parseRecipients(value).map((address) => {
    const normalized = address.toLowerCase();
    const isBlocked = blocked.has(normalized);

    // Initial state while resolving
    return {
      address,
      state: "resolving",
      postage: postageReady ? "ready" : "required",
      message: "Resolving recipient address…",
      policyType: isBlocked ? "block" : "default",
    };
  });
}

export function validateComposeDraft({
  to,
  body,
  postage,
  blockedRecipients = [],
  policyQuote,
  resolvedRecipients,
}: ComposeDraft) {
  const recipients = resolvedRecipients ?? getRecipientReadiness(to, postage, blockedRecipients);

  if (!recipients.length) return "Please enter a recipient";
  if (!body.trim()) return "Please enter a message";

  // Check for stale resolution
  const now = new Date();
  if (recipients.some((recipient) => recipient.expiresAt && now > new Date(recipient.expiresAt))) {
    return "Recipient resolution is stale — re-resolving…";
  }

  // Check if policy quote is expired
  if (policyQuote?.expiresAt && now > new Date(policyQuote.expiresAt)) {
    return "Policy quote is expired — re-quoting…";
  }

  // Check for key status (revoked, retired, missing encryption key)
  if (
    recipients.some(
      (recipient) =>
        recipient.state === "verified" &&
        (recipient.keyStatus === "revoked" || recipient.keyStatus === "retired"),
    )
  ) {
    return "Recipient encryption key has been revoked";
  }

  // Policy-level block check (sender explicitly blocked by recipient policy)
  if (policyQuote && !policyQuote.eligible) {
    return "Recipient has blocked this sender";
  }

  // Check for blocked recipients (local blocklist or resolver result)
  if (
    recipients.some(
      (recipient) => recipient.state === "blocked" || recipient.policyType === "block",
    )
  ) {
    return "Remove blocked recipients before sending";
  }

  // Check for unresolved or invalid recipients if we have pre-resolved list
  if (resolvedRecipients) {
    if (
      recipients.some(
        (recipient) => recipient.state === "resolving" || recipient.state === "invalid",
      )
    ) {
      return "All recipients must be verified before sending";
    }
  }

  // Trusted senders skip postage check entirely
  if (policyQuote?.trusted) {
    return null;
  }

  // Policy-aware postage check: compare against quoted minimum when available
  if (policyQuote && policyQuote.eligible) {
    const postageStroops = BigInt(Math.round(Number(postage) * 10_000_000));
    const minimumStroops = BigInt(policyQuote.amount);
    if (postageStroops < minimumStroops) {
      try {
        const minimumXlm = Number(minimumStroops) / 10_000_000;
        return `Postage below recipient's minimum (${minimumXlm} XLM required)`;
      } catch {
        return "Postage below recipient's minimum";
      }
    }
    return null;
  }

  // Fallback: basic postage check without policy data
  if (recipients.some((recipient) => recipient.postage === "required")) {
    return "Add postage before sending";
  }

  return null;
}
