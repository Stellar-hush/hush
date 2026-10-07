import { z } from "zod";

// ---------------------------------------------------------------------------
// StoredEnvelope — durable encrypted-message record (Issue #1936 BETA-029)
// Plaintext (subject, body) is intentionally absent from this schema.
// ---------------------------------------------------------------------------

export const stellarAddressSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^G[A-Z2-7]{55}$/, "Expected a Stellar G-address");

export const hash32Schema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/, "Expected a 32-byte lowercase hexadecimal hash");

export const stroopAmountSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)$/, "Expected a non-negative integer string")
  .refine((value) => {
    try {
      return BigInt(value) <= 2n ** 127n - 1n;
    } catch {
      return false;
    }
  }, "Amount exceeds Soroban i128");

export const senderRuleSchema = z.enum(["default", "allow", "block", "verify", "price"]);

/**
 * BETA-037 (Issue #1944) — live, versioned sender rules.
 *
 * `senderRuleActionSchema` covers the subset of rule types that can be explicitly
 * set via the API. "default" is the absence of a rule and is set by deleting.
 */
export const senderRuleActionSchema = z.enum(["allow", "block", "verify", "price"]);
export type SenderRuleAction = z.infer<typeof senderRuleActionSchema>;

/**
 * Chain synchronization status for a sender rule. Each state-changing
 * operation schedules a testnet contract write; this field tracks where
 * that write is in its lifecycle and whether local state matches chain state.
 *
 * - pending:   local rule recorded, testnet write scheduled but not yet submitted
 * - submitted: signed transaction submitted to testnet, awaiting confirmation
 * - confirmed: chain confirmed the rule matches local state
 * - failed:    testnet write failed after retries; local rule still applies off-chain
 * - drift:     chain version diverged from local (e.g. external set_sender_rule call)
 */
export const senderRuleChainStatusSchema = z.enum([
  "pending",
  "submitted",
  "confirmed",
  "failed",
  "drift",
]);

export type SenderRuleChainStatus = z.infer<typeof senderRuleChainStatusSchema>;

/**
 * Price rule payload: the minimum postage (in stroops) the sender must attach.
 * Only valid when rule is "price".
 */
export const senderRulePricePayloadSchema = z
  .object({
    minimumPostage: stroopAmountSchema,
  })
  .optional();

/**
 * Full versioned sender rule record. Persisted server-side (survives refresh)
 * and reconciled against testnet.
 */
export const senderRuleRecordSchema = z.object({
  owner: stellarAddressSchema,
  sender: stellarAddressSchema,
  rule: senderRuleActionSchema,
  pricePayload: senderRulePricePayloadSchema,
  version: z.number().int().nonnegative(),
  chainStatus: senderRuleChainStatusSchema,
  scheduledAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable().default(null),
  failureCount: z.number().int().nonnegative().default(0),
  lastError: z.string().max(300).nullable().default(null),
  txHash: z.string().nullable().default(null),
  idempotencyKey: z.string().min(1).optional(),
});

export type SenderRuleRecord = z.infer<typeof senderRuleRecordSchema>;

/**
 * Chain-side representation of a sender rule for reconciliation. Queried
 * from the Policies contract to compare against local state.
 */
export const chainSenderRuleSchema = z.object({
  rule: senderRuleActionSchema,
  minimumPostage: stroopAmountSchema.optional(),
  version: z.number().int().nonnegative(),
});

export type ChainSenderRule = z.infer<typeof chainSenderRuleSchema>;
export const postageStatusSchema = z.enum([
  "pending",
  "expired",
  "disputed",
  "settled",
  "refunded",
  "reclaimed",
]);
export const postageChainStatusSchema = z.enum([
  "not_submitted",
  "submitted",
  "confirmed",
  "failed",
]);

export const mailboxPolicySchema = z.object({
  allowUnknown: z.boolean(),
  minimumPostage: stroopAmountSchema,
  requireVerified: z.boolean(),
});

/**
 * Request body accepted when replacing a mailbox policy. `requireReceipt` is
 * optional: when absent it defaults to false and is carried into the scheduled
 * on-chain write as `require_receipt = false`.
 */
export const mailboxPolicyWriteSchema = z.object({
  allowUnknown: z.boolean(),
  minimumPostage: stroopAmountSchema,
  requireVerified: z.boolean(),
  requireReceipt: z.boolean().default(false),
  version: z.number().int().nonnegative().optional(),
});

/**
 * Request body for creating or updating a versioned sender rule.
 * `version` is required for updates (optimistic concurrency check);
 * omitted for creates.
 */
export const senderRuleWriteSchema = z
  .object({
    rule: senderRuleActionSchema,
    pricePayload: senderRulePricePayloadSchema,
    version: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .refine(
    (data) => {
      if (data.rule === "price" && !data.pricePayload?.minimumPostage) {
        return false;
      }
      return true;
    },
    { message: "pricePayload.minimumPostage is required when rule is 'price'" },
  );

// ---------------------------------------------------------------------------
// BETA-023 (Issue #1930) — privacy-safe mailbox policy provisioning
//
// The on-chain Policies contract persists a four-field policy (including the
// delivery-receipt preference). The off-chain `MailboxPolicy` deliberately
// stays at three fields for backward compatibility with stored records and
// existing callers; the delivery-receipt preference and the off-chain policy
// version travel with the durable write intent that is scheduled for the
// matching testnet contract write.
// ---------------------------------------------------------------------------

export const chainMailboxPolicySchema = z.object({
  allowUnknown: z.boolean(),
  minimumPostage: stroopAmountSchema,
  requireReceipt: z.boolean(),
  requireVerified: z.boolean(),
});

export const policyWriteStatusSchema = z.enum(["pending", "submitted", "confirmed", "failed"]);

/**
 * Durable intent to write a mailbox policy to the Policies contract on
 * testnet. `offchainVersion` is the off-chain policy version: it is bumped
 * only when the effective policy actually changes, never on a retry of the
 * same policy — mirroring the contract's version-as-change-marker contract
 * without re-submitting an identical write (which the contract would still
 * count as a version bump).
 *
 * `lastError` is a redacted, bounded failure reason; wallet seeds, tokens and
 * transaction payloads never appear in it.
 */
export const policyWriteIntentSchema = z.object({
  owner: stellarAddressSchema,
  policy: chainMailboxPolicySchema,
  offchainVersion: z.number().int().nonnegative(),
  status: policyWriteStatusSchema,
  scheduledAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  failureCount: z.number().int().nonnegative().default(0),
  lastError: z.string().max(300).nullable().default(null),
  txHash: z.string().nullable().default(null),
});

// ---------------------------------------------------------------------------
// BETA-043 (Issue #1950) — message lifecycle anchoring
//
// Durable record of a message commitment anchored to the on-chain Lifecycle
// contract on testnet. `messageId` is the message commitment (hash32); no
// plaintext or private metadata ever appears here. Anchoring is idempotent per
// message commitment: duplicate submissions collapse onto the stored anchor
// and map to the contract's DuplicateLifecycle as a success. `amount` is the
// on-chain postage amount in stroops carried verbatim into the bind call.
// ---------------------------------------------------------------------------

export const lifecycleAnchorStatusSchema = z.enum(["pending", "submitted", "confirmed", "failed"]);

export const lifecycleAnchorSchema = z.object({
  messageId: hash32Schema,
  sender: stellarAddressSchema,
  recipient: stellarAddressSchema,
  amount: stroopAmountSchema,
  verified: z.boolean(),
  receiptRequired: z.boolean(),
  status: lifecycleAnchorStatusSchema,
  scheduledAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  failureCount: z.number().int().nonnegative().default(0),
  lastError: z.string().max(300).nullable().default(null),
  txHash: z.string().nullable().default(null),
});

export const postageSchema = z.object({
  amount: stroopAmountSchema,
  createdAt: z.string().datetime(),
  messageId: hash32Schema,
  paymentHash: hash32Schema,
  recipient: stellarAddressSchema,
  sender: stellarAddressSchema,
  status: postageStatusSchema,
  // BETA-042: chain-sync bookkeeping fields. Kept optional so pre-existing
  // records and test fixtures remain assignable; the service writes all of
  // them explicitly when it touches the chain.
  chainStatus: postageChainStatusSchema.optional(),
  txHash: z.string().nullable().optional(),
  ledger: z.number().int().nonnegative().nullable().optional(),
  retryCount: z.number().int().nonnegative().optional(),
  lastError: z.string().max(500).nullable().optional(),
  submittedAt: z.string().datetime().nullable().optional(),
  confirmedAt: z.string().datetime().nullable().optional(),
});

export const DEFAULT_RECEIPT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export interface ReceiptSchemaOptions {
  maxFutureSkewMs?: number;
  now?: () => Date;
}

export function createReceiptSchema(options: ReceiptSchemaOptions = {}) {
  const { maxFutureSkewMs = DEFAULT_RECEIPT_FUTURE_TOLERANCE_MS, now = () => new Date() } = options;

  return z
    .object({
      deliveredAt: z.string().datetime({ offset: true }),
      messageId: hash32Schema,
      readAt: z.string().datetime({ offset: true }).nullable(),
      recipient: stellarAddressSchema,
      sender: stellarAddressSchema,
      payloadHash: hash32Schema.optional(),
      protocolVersion: z.number().int().positive().optional(),
      txHash: z.string().nullable().optional(),
      chainStatus: z.enum(["pending", "confirmed", "failed"]).nullable().optional(),
      ledgerSeq: z.number().int().nonnegative().nullable().optional(),
      confirmedAt: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .superRefine((data, ctx) => {
      const deliveredMs = Date.parse(data.deliveredAt);
      const referenceMs = now().getTime();
      const maxAllowedMs = referenceMs + maxFutureSkewMs;

      if (!isNaN(deliveredMs) && deliveredMs > maxAllowedMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Delivery timestamp is too far in the future",
          path: ["deliveredAt"],
        });
      }

      if (data.readAt !== null) {
        const readMs = Date.parse(data.readAt);

        if (!isNaN(readMs)) {
          if (!isNaN(deliveredMs) && readMs < deliveredMs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Read time cannot precede delivery time",
              path: ["readAt"],
            });
          }

          if (readMs > maxAllowedMs) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Read timestamp is too far in the future",
              path: ["readAt"],
            });
          }
        }
      }
    });
}

export const receiptSchema = createReceiptSchema();

export type MailboxPolicy = z.infer<typeof mailboxPolicySchema>;
export type ChainMailboxPolicy = z.infer<typeof chainMailboxPolicySchema>;
export type PolicyWriteIntent = z.infer<typeof policyWriteIntentSchema>;
export type PolicyWriteStatus = z.infer<typeof policyWriteStatusSchema>;
export type Postage = z.infer<typeof postageSchema>;
export type PostageStatus = z.infer<typeof postageStatusSchema>;
export type PostageChainStatus = z.infer<typeof postageChainStatusSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type SenderRule = z.infer<typeof senderRuleSchema>;
export type LifecycleAnchor = z.infer<typeof lifecycleAnchorSchema>;
export type LifecycleAnchorStatus = z.infer<typeof lifecycleAnchorStatusSchema>;

// ---------------------------------------------------------------------------
// BETA-036 (Issue #1943) — relay admission decision evidence
//
// Snapshotted at accept time so a later policy change cannot rewrite history.
// The record is safe to persist and return: no payload, no plaintext, no secrets.
// ---------------------------------------------------------------------------

export const admissionDispositionSchema = z.enum([
  "trusted",
  "request",
  "verified",
  "priced",
  "blocked",
]);

export const admissionReasonSchema = z.enum([
  "sender_allowed",
  "sender_blocked",
  "unknown_senders_disabled",
  "verification_required",
  "receipt_required",
  "insufficient_postage",
  "policy_satisfied",
  "tier_satisfied",
]);

export const admissionSourceSchema = z.enum(["chain", "offchain", "stale_chain_fallback"]);

export const admissionEvidenceSchema = z.object({
  allowed: z.boolean(),
  disposition: admissionDispositionSchema,
  reason: admissionReasonSchema,
  rule: senderRuleSchema,
  policyVersion: z.number().int().nonnegative(),
  requiredPostage: stroopAmountSchema,
  source: admissionSourceSchema,
  evaluatedAt: z.string().datetime(),
});

export type AdmissionDisposition = z.infer<typeof admissionDispositionSchema>;
export type AdmissionReason = z.infer<typeof admissionReasonSchema>;
export type AdmissionSource = z.infer<typeof admissionSourceSchema>;
export type AdmissionEvidence = z.infer<typeof admissionEvidenceSchema>;

// ---------------------------------------------------------------------------
// BETA-037 — durable chain-write intents for sender rules
// ---------------------------------------------------------------------------

/**
 * Durable intent to write a sender override to the Policies contract.
 * Mirrors {@link PolicyWriteIntent} idempotency: version bumps only on genuine
 * rule changes; retries of the same rule re-arm at the same version.
 */
export const senderRuleWriteIntentSchema = z.object({
  owner: stellarAddressSchema,
  sender: stellarAddressSchema,
  rule: senderRuleSchema,
  /** Required when `rule` is `price`; submitted via `set_sender_tier`. */
  minimumPostage: stroopAmountSchema.nullable().default(null),
  offchainVersion: z.number().int().nonnegative(),
  status: policyWriteStatusSchema,
  scheduledAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  failureCount: z.number().int().nonnegative().default(0),
  lastError: z.string().max(300).nullable().default(null),
  txHash: z.string().nullable().default(null),
});

/** Client-facing chain sync status for policy and sender-rule mutations. */
export const policySyncStatusSchema = z.enum(["pending", "confirmed", "failed", "drift"]);

export type SenderRuleWriteIntent = z.infer<typeof senderRuleWriteIntentSchema>;
export type PolicySyncStatus = z.infer<typeof policySyncStatusSchema>;

export const idempotencyRecordSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("in_progress"),
    // Issue #1498: canonical digest of the request that acquired this lease,
    // so a same-key-different-payload retry is detected as a conflict
    // instead of blocking behind (or later replaying) an unrelated request.
    requestDigest: z.string(),
    createdAt: z.string().datetime(),
    recoveryExpiryAt: z.string().datetime(),
  }),
  z.object({
    state: z.literal("completed"),
    status: z.number(),
    body: z.unknown(),
    requestDigest: z.string(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime(),
  }),
]);

export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export const messageDeliveryStateSchema = z.enum([
  "queued",
  "accepted",
  "anchored",
  "delivered",
  "read",
  "failed",
  "expired",
]);

export type MessageDeliveryState = z.infer<typeof messageDeliveryStateSchema>;

export const TERMINAL_DELIVERY_STATES: ReadonlySet<MessageDeliveryState> = new Set([
  "read",
  "failed",
  "expired",
]);

export const RETRYABLE_DELIVERY_STATES: ReadonlySet<MessageDeliveryState> = new Set([
  "queued",
  "accepted",
  "anchored",
]);

export const ALLOWED_DELIVERY_TRANSITIONS: Record<
  MessageDeliveryState,
  ReadonlySet<MessageDeliveryState>
> = {
  queued: new Set(["accepted", "failed", "expired"]),
  accepted: new Set(["anchored", "delivered", "failed", "expired"]),
  anchored: new Set(["delivered", "failed", "expired"]),
  delivered: new Set(["read", "failed", "expired"]),
  read: new Set([]),
  failed: new Set([]),
  expired: new Set([]),
};

export const messageDeliveryTransitionSchema = z.object({
  fromState: messageDeliveryStateSchema.nullable(),
  toState: messageDeliveryStateSchema,
  timestamp: z.string().datetime(),
  actor: z.string().min(1),
  reason: z.string().min(1),
  chainReference: z.string().nullable().optional(),
});

export type MessageDeliveryTransition = z.infer<typeof messageDeliveryTransitionSchema>;

export const messageDeliveryStatusRecordSchema = z.object({
  messageId: hash32Schema,
  state: messageDeliveryStateSchema,
  isTerminal: z.boolean(),
  isRetryable: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  actor: z.string(),
  reason: z.string(),
  chainReference: z.string().nullable().optional(),
  history: z.array(messageDeliveryTransitionSchema),
});

export type MessageDeliveryStatusRecord = z.infer<typeof messageDeliveryStatusRecordSchema>;

export const publicDeliveryStatusSchema = z.object({
  messageId: hash32Schema,
  state: messageDeliveryStateSchema,
  isTerminal: z.boolean(),
  isRetryable: z.boolean(),
  observedAt: z.string().datetime(),
  actor: z.string(),
  reason: z.string(),
  chainReference: z.string().nullable().optional(),
  history: z.array(messageDeliveryTransitionSchema),
});

export type PublicDeliveryStatus = z.infer<typeof publicDeliveryStatusSchema>;

// ---------------------------------------------------------------------------
// BETA-002: Durable User Account, Profile, Credential & AccountStatus Domain
// ---------------------------------------------------------------------------

export const accountStatusSchema = z.enum([
  "active",
  "suspended",
  "pending_verification",
  "deactivated",
]);

export const emailSchema = z.string().trim().toLowerCase().email("Expected a valid email address");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_-]{3,30}$/,
    "Username must be 3-30 lowercase alphanumeric characters, underscores, or hyphens",
  );

export const userSchema = z.object({
  userId: z.string().min(1, "User ID cannot be empty"),
  address: stellarAddressSchema,
  email: emailSchema,
  username: usernameSchema,
  status: accountStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

export const walletCapabilitySchema = z.enum(["sign", "send", "read"]);
export type WalletCapability = z.infer<typeof walletCapabilitySchema>;

export const externalWalletSchema = z.object({
  address: stellarAddressSchema,
  capabilities: z.array(walletCapabilitySchema).min(1),
  linkedAt: z.string().datetime(),
  network: z.string().min(1),
});

export type ExternalWallet = z.infer<typeof externalWalletSchema>;

export const externalWalletChallengeSchema = z.object({
  challenge: z.string().min(1),
  address: stellarAddressSchema,
  expiresAt: z.string().datetime(),
  network: z.string().min(1),
});

export type ExternalWalletChallenge = z.infer<typeof externalWalletChallengeSchema>;

export const activeSignerSchema = z.object({
  signerType: z.enum(["external", "managed"]),
  address: stellarAddressSchema,
  capabilities: z.array(walletCapabilitySchema),
  isFallback: z.boolean(),
});

export type ActiveSigner = z.infer<typeof activeSignerSchema>;

export const managedWalletStatusSchema = z.object({
  address: stellarAddressSchema,
  status: z.enum(["active", "funded", "unfunded"]),
  network: z.string().min(1),
  balance: z.object({
    available: z.string().nullable(),
    balanceXlm: z.string().nullable(),
  }),
  capabilities: z.array(walletCapabilitySchema),
  isDefaultSigner: z.boolean(),
  activeSigner: activeSignerSchema,
});

export type ManagedWalletStatus = z.infer<typeof managedWalletStatusSchema>;

export const networkPassphraseSchema = z.string().min(1);

// BETA-069 (Issue #1976): address display preference for Stellar address rendering.
export const addressDisplaySchema = z.enum(["full", "truncated"]).default("truncated");
export type AddressDisplay = z.infer<typeof addressDisplaySchema>;

export const profileSchema = z.object({
  userId: z.string().min(1, "User ID cannot be empty"),
  username: usernameSchema,
  displayName: z.string().trim().min(1, "Display name cannot be empty"),
  avatarUrl: z.string().url("Avatar URL must be a valid URL").nullable().optional(),
  avatarMetadata: z.record(z.unknown()).nullable().optional(),
  bio: z.string().max(500, "Bio cannot exceed 500 characters").nullable().optional(),
  // BETA-069: locale, timezone, and address display preferences
  locale: z
    .string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/, "Expected a BCP-47 locale tag")
    .optional()
    .default("en"),
  timezone: z.string().trim().min(1).max(64).optional().default("UTC"),
  addressDisplay: addressDisplaySchema.optional().default("truncated"),
  notifications: z
    .object({
      email: z.boolean().default(true),
      desktop: z.boolean().default(true),
      sound: z.boolean().default(false),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// BETA-069: Input schema for profile PATCH updates. Username is intentionally
// excluded — it is immutable unless a separately governed migration exists.
export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name cannot be empty")
    .max(80, "Display name cannot exceed 80 characters")
    .optional(),
  bio: z.string().max(500, "Bio cannot exceed 500 characters").nullable().optional(),
  avatarUrl: z.string().url("Avatar URL must be a valid URL").nullable().optional(),
  avatarMetadata: z.record(z.unknown()).nullable().optional(),
  locale: z
    .string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/, "Expected a BCP-47 locale tag")
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  addressDisplay: z.enum(["full", "truncated"]).optional(),
  notifications: z
    .object({
      email: z.boolean().optional(),
      desktop: z.boolean().optional(),
      sound: z.boolean().optional(),
    })
    .optional(),
  version: z.number().int().positive("Version must be a positive integer"),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const credentialAuthMethodSchema = z.enum([
  "stellar_header",
  "passkey",
  "password_hash",
  "delegation",
]);

export const credentialSchema = z.object({
  credentialId: z.string().min(1, "Credential ID cannot be empty"),
  userId: z.string().min(1, "User ID cannot be empty"),
  authMethod: credentialAuthMethodSchema,
  secretHash: z.string().min(1, "Secret hash cannot be empty"),
  walletKeyRef: z.string().min(1, "Wallet key ref cannot be empty"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const publicUserSchema = z.object({
  userId: z.string(),
  address: stellarAddressSchema,
  email: emailSchema,
  username: usernameSchema,
  status: accountStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const publicProfileSchema = z.object({
  userId: z.string(),
  username: usernameSchema,
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  avatarMetadata: z.record(z.unknown()).nullable().optional(),
  bio: z.string().nullable().optional(),
  locale: z.string().optional().default("en"),
  timezone: z.string().optional().default("UTC"),
  addressDisplay: z.enum(["full", "truncated"]).optional().default("truncated"),
  notifications: z
    .object({
      email: z.boolean().default(true),
      desktop: z.boolean().default(true),
      sound: z.boolean().default(false),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// BETA-069: Immutable account information composite for settings display.
export const accountInfoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  address: stellarAddressSchema,
  email: emailSchema,
  status: accountStatusSchema,
  createdAt: z.string().datetime(),
  network: z.string(),
  policyVersion: z.number().int().nonnegative().nullable(),
  betaLimitations: z.array(z.string()),
});

export type AccountInfo = z.infer<typeof accountInfoSchema>;

// ---------------------------------------------------------------------------
// BETA-005: Verification token lifecycle domain
// ---------------------------------------------------------------------------

export const passwordPolicySchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(256, "Password is too long")
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /\d/.test(value), "Password must include a number");

export const verificationPurposeSchema = z.enum(["email_verification", "password_reset"]);
export type VerificationPurpose = z.infer<typeof verificationPurposeSchema>;

export const verificationTokenHashSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-f0-9]{64}$/, "Expected a 64-character lowercase hexadecimal SHA-256 hash");

/**
 * Durable record for a single verification token.
 *
 * Security invariants (BETA-005):
 * - Only the SHA-256 hash of the token is ever persisted or logged. The
 *   plaintext token exists solely in the hand-off between the issuing service
 *   and the delivery adapter, and is never returned by the API.
 * - `consumedAt` is set exactly once under a per-token exclusive lock, making
 *   the token single-use even under concurrent verify requests.
 * - `replacedAt` marks a token invalidated by a newer issue (resend), so stale
 *   links fail closed.
 * - `attemptCount` counts failed verification attempts; reaching `maxAttempts`
 *   permanently locks the token (brute-force protection).
 */
export const verificationTokenSchema = z.object({
  tokenHash: verificationTokenHashSchema,
  userId: z.string().min(1, "User ID cannot be empty"),
  purpose: verificationPurposeSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  consumedAt: z.string().datetime().nullable(),
  replacedAt: z.string().datetime().nullable(),
  replacedByTokenHash: verificationTokenHashSchema.nullable().optional(),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
});

export type VerificationToken = z.infer<typeof verificationTokenSchema>;

// ---------------------------------------------------------------------------
// BETA-015 (Issue #1922) — system-managed Stellar testnet wallet provisioning
//
// Public metadata and encrypted secret material are stored together under a
// user-scoped record. Plaintext seeds never reach durable storage, API
// responses, or logs — only the public Stellar address and funding status are
// exposed to clients.
// ---------------------------------------------------------------------------

export const managedWalletFundingStatusSchema = z.enum(["pending", "funded", "failed"]);
export type ManagedWalletFundingStatus = z.infer<typeof managedWalletFundingStatusSchema>;

export const encryptedWalletSecretSchema = z.object({
  ciphertext: z.string().min(1, "Encrypted ciphertext cannot be empty"),
  nonce: z.string().min(1, "Encrypted nonce cannot be empty"),
  tag: z.string().min(1, "Encrypted tag cannot be empty"),
  keyVersion: z.number().int().positive().default(1),
});

export type EncryptedWalletSecret = z.infer<typeof encryptedWalletSecretSchema>;

export const managedWalletRecordSchema = z.object({
  userId: z.string().min(1, "User ID cannot be empty"),
  address: stellarAddressSchema,
  /** Beta managed wallets are testnet-only. */
  network: z.literal("testnet"),
  fundingStatus: managedWalletFundingStatusSchema,
  encryptedSecret: encryptedWalletSecretSchema,
  fundedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastError: z.string().max(300).nullable().default(null),
});

export type ManagedWalletRecord = z.infer<typeof managedWalletRecordSchema>;

/** Client-safe wallet metadata — never includes seed material. */
export const publicManagedWalletSchema = z.object({
  address: stellarAddressSchema,
  network: z.literal("testnet"),
  fundingStatus: managedWalletFundingStatusSchema,
  provisioned: z.boolean(),
  fundedAt: z.string().datetime().nullable().optional(),
});

export type PublicManagedWallet = z.infer<typeof publicManagedWalletSchema>;

export function toPublicManagedWallet(
  wallet: ManagedWalletRecord,
  provisioned: boolean,
): PublicManagedWallet {
  return {
    address: wallet.address,
    network: wallet.network,
    fundingStatus: wallet.fundingStatus,
    provisioned,
    fundedAt: wallet.fundedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// BETA-018 (Issue #1925) — durable testnet funding operations
//
// One operation per account. Retries resume the same operationId so worker
// restarts never double-fund. Queue projections never include seed material.
// ---------------------------------------------------------------------------

export const fundingErrorClassSchema = z.enum(["transient", "permanent"]);
export type FundingErrorClass = z.infer<typeof fundingErrorClassSchema>;

export const fundingOperationStatusSchema = z.enum(["pending", "retrying", "succeeded", "failed"]);
export type FundingOperationStatus = z.infer<typeof fundingOperationStatusSchema>;

export const fundingOperationSchema = z.object({
  operationId: z.string().min(1, "Funding operation ID cannot be empty"),
  userId: z.string().min(1, "User ID cannot be empty"),
  address: stellarAddressSchema,
  status: fundingOperationStatusSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextRetryAt: z.string().datetime().nullable().default(null),
  lastErrorClass: fundingErrorClassSchema.nullable().default(null),
  lastError: z.string().max(300).nullable().default(null),
  transactionId: z.string().max(128).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type FundingOperation = z.infer<typeof fundingOperationSchema>;

/** Administrator-visible queue item — never includes key material. */
export const publicFundingOperationSchema = fundingOperationSchema.omit({});
export type PublicFundingOperation = z.infer<typeof publicFundingOperationSchema>;

export function toPublicFundingOperation(operation: FundingOperation): PublicFundingOperation {
  return {
    operationId: operation.operationId,
    userId: operation.userId,
    address: operation.address,
    status: operation.status,
    attempt: operation.attempt,
    maxAttempts: operation.maxAttempts,
    nextRetryAt: operation.nextRetryAt,
    lastErrorClass: operation.lastErrorClass,
    lastError: operation.lastError,
    transactionId: operation.transactionId,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  };
}

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type User = z.infer<typeof userSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Credential = z.infer<typeof credentialSchema>;
export type CredentialAuthMethod = z.infer<typeof credentialAuthMethodSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;

// ---------------------------------------------------------------------------
// BETA-014: Transactional account-provisioning state machine
//
// A provisioning record is the durable, idempotent ledger for the account
// convergence flow: username reservation -> profile defaults -> wallet
// creation -> mailbox policy init. The user record only becomes "active"
// after every step completes, so a mid-flow failure can never leave a live
// half-account behind (the account stays pending_verification and the
// username reservation is released as compensation).
// ---------------------------------------------------------------------------

export const provisioningStatusSchema = z.enum(["pending", "retryable", "active", "failed"]);

export const provisioningStepSchema = z.enum([
  "username_reservation",
  "profile_defaults",
  "wallet_creation",
  "mailbox_policy_init",
]);

export const provisioningFailureSchema = z.object({
  step: provisioningStepSchema,
  code: z.string(),
  message: z.string(),
  failedAt: z.string().datetime(),
});

export const provisioningRecordSchema = z.object({
  userId: z.string().min(1, "User ID cannot be empty"),
  status: provisioningStatusSchema,
  requestedUsername: usernameSchema,
  displayName: z.string().trim().min(1, "Display name cannot be empty").nullable(),
  completedSteps: z.array(provisioningStepSchema),
  /** The step currently being attempted, or the step that failed last. */
  currentStep: provisioningStepSchema,
  attempts: z.number().int().nonnegative(),
  failure: provisioningFailureSchema.nullable(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

/**
 * A wallet bound to exactly one account. The initial on-chain address is the
 * account's own Stellar address until an external wallet provider exists
 * (dependency BETA-013); the record exists so wallet creation is a durable,
 * insert-once provisioning step instead of an implicit side effect.
 */
export const walletSchema = z.object({
  walletId: z.string().min(1, "Wallet ID cannot be empty"),
  userId: z.string().min(1, "User ID cannot be empty"),
  address: stellarAddressSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * A leased claim on a username. Held for the duration of provisioning and
 * released as compensation when a later step fails, so a retry can re-claim
 * it and a failed account never leaks a permanently squatted username.
 */
export const usernameReservationSchema = z.object({
  username: usernameSchema,
  userId: z.string().min(1, "User ID cannot be empty"),
  reservedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type ProvisioningStatus = z.infer<typeof provisioningStatusSchema>;
export type ProvisioningStep = z.infer<typeof provisioningStepSchema>;
export type ProvisioningFailure = z.infer<typeof provisioningFailureSchema>;
export type ProvisioningRecord = z.infer<typeof provisioningRecordSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type UsernameReservation = z.infer<typeof usernameReservationSchema>;

// BETA-080 (Issue #1987): account deletion is a durable, cancellable workflow.
export const accountDeletionStatusSchema = z.enum([
  "cooling_off",
  "processing",
  "partial_failure",
  "completed",
  "cancelled",
]);

export const accountDeletionRequestSchema = z.object({
  userId: z.string().min(1),
  requestedAt: z.string().datetime(),
  coolingOffEndsAt: z.string().datetime(),
  status: accountDeletionStatusSchema,
  attempt: z.number().int().nonnegative(),
  lastError: z.string().max(500).nullable(),
  updatedAt: z.string().datetime(),
});

export type AccountDeletionStatus = z.infer<typeof accountDeletionStatusSchema>;
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;

export interface AccountExport {
  format: "stealth-account-export-v1";
  generatedAt: string;
  account: PublicUser;
  profile: PublicProfile | null;
  contacts: Contact[];
  mailbox: StoredEnvelope[];
  senderRequests: UnknownSenderRequest[];
  publicKeys: PublishedKey[];
  ciphertextReferences: Array<{
    messageId: string;
    objectKey: string | null;
    contentCommitment: string | null;
    deletedAt: string | null;
  }>;
  onChainLimitations: string[];
}

// ---------------------------------------------------------------------------
// BETA-013 (Issue #1920): Profile-first account onboarding
//
// Onboarding is account-based and wallet-free: the account is resolved from
// the server session, and the durable draft is keyed by userId so the flow is
// resumable across refreshes and devices. Completion writes the user-chosen
// mailbox policy through the existing idempotent policy path — no wallet
// extension (and no client-supplied wallet address) is ever involved.
// ---------------------------------------------------------------------------

/** Flow position of the account onboarding wizard. */
export const onboardingStepSchema = z.enum([
  "profile",
  "stealth-address",
  "recovery",
  "sender-policy",
  "postage",
  "receipts",
  "review",
]);

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

export const onboardingStatusSchema = z.enum(["in_progress", "completed"]);

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

/** UI-level unknown-sender rule; converted to protocol policy booleans on completion. */
export const onboardingSenderPolicySchema = z.enum(["request", "verified", "block"]);

export type OnboardingSenderPolicy = z.infer<typeof onboardingSenderPolicySchema>;

/**
 * Durable server-backed onboarding draft. Exactly one record per user, so
 * duplicate saves can never create duplicates and a refresh or a second
 * device resumes from the same authoritative state. `completedAt` marks the
 * terminal state; completed drafts are replayed, never re-written.
 */
export const onboardingDraftSchema = z.object({
  userId: z.string().min(1, "User ID cannot be empty"),
  status: onboardingStatusSchema,
  step: onboardingStepSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Display name cannot be empty")
    .max(80, "Display name cannot exceed 80 characters"),
  recoveryAcknowledged: z.boolean(),
  unknownSenderRule: onboardingSenderPolicySchema,
  minimumPostage: z.string().regex(/^\d*\.?\d{0,7}$/, "Expected a non-negative XLM amount"),
  receiptOnDelivery: z.boolean(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
});

export type OnboardingDraftRecord = z.infer<typeof onboardingDraftSchema>;

/**
 * Safe projection of an onboarding draft for API responses and the bootstrap
 * snapshot. Never contains secrets, hashes, or wallet material.
 */
export const onboardingDraftProjectionSchema = onboardingDraftSchema.omit({
  userId: true,
  version: true,
});

export type OnboardingDraftProjection = z.infer<typeof onboardingDraftProjectionSchema>;

export function toPublicUser(user: User): PublicUser {
  return {
    userId: user.userId,
    address: user.address,
    email: user.email,
    username: user.username,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toPublicProfile(profile: Profile): PublicProfile {
  return {
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? null,
    avatarMetadata: profile.avatarMetadata ?? null,
    bio: profile.bio ?? null,
    locale: profile.locale ?? "en",
    timezone: profile.timezone ?? "UTC",
    addressDisplay: profile.addressDisplay ?? "truncated",
    notifications: profile.notifications ?? { email: true, desktop: true, sound: false },
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// BETA-006: Server-Side Session Domain
// ---------------------------------------------------------------------------

export const sessionSchema = z.object({
  sessionId: z.string().min(1, "Session ID cannot be empty"),
  userId: z.string().min(1, "User ID cannot be empty"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  absoluteExpiresAt: z.string().datetime().optional(),
  rotatedFromSessionId: z.string().optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  deviceFingerprint: z.string().optional().nullable(),
  // Issue #1917 (BETA-010): the last time the account holder authenticated
  // with a password (or via a one-code recovery). Optional so sessions
  // created before this feature remains valid; recovery-code regeneration
  // requires a session whose recentLoginAt is fresh.
  recentLoginAt: z.string().datetime().optional(),
});

export const publicSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  absoluteExpiresAt: z.string().datetime().optional(),
});

export const retiredSessionSchema = z.object({
  sessionId: z.string().min(1, "Session ID cannot be empty"),
  replacedBySessionId: z.string().min(1, "Replaced by Session ID cannot be empty"),
  userId: z.string().min(1, "User ID cannot be empty"),
  retiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type Session = z.infer<typeof sessionSchema>;
export type PublicSession = z.infer<typeof publicSessionSchema>;
export type RetiredSession = z.infer<typeof retiredSessionSchema>;

export function toPublicSession(session: Session): PublicSession {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    lastActiveAt: session.lastActiveAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
}

// ---------------------------------------------------------------------------
// BETA-010 (Issue #1917): One-time recovery code sets
//
// Recovery codes are single-use secrets for restoring account access. Only
// PBKDF2 hashes of the codes are ever persisted — the plaintext code is
// returned to the user exactly once, at generation time, and cannot be
// retrieved afterwards.
// ---------------------------------------------------------------------------

export const recoveryCodeStatusSchema = z.enum(["active", "exhausted"]);

export const recoveryCodeEntrySchema = z.object({
  hash: z.string().min(1, "Recovery code hash cannot be empty"),
  salt: z.string().min(1, "Recovery code salt cannot be empty"),
  usedAt: z.string().datetime().nullable(),
});

export const recoveryCodeSetSchema = z.object({
  userId: z.string().min(1, "User ID cannot be empty"),
  status: recoveryCodeStatusSchema,
  codes: z.array(recoveryCodeEntrySchema).min(1, "Recovery code set cannot be empty"),
  generatedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

export type RecoveryCodeEntry = z.infer<typeof recoveryCodeEntrySchema>;
export type RecoveryCodeSet = z.infer<typeof recoveryCodeSetSchema>;

/**
 * Safety-model view of a recovery set. Deliberately carries no hash material,
 * no codes, and no identifiers — only state and aggregate counters, so UI
 * surfaces can answer "is recovery ready?" without exposing secrets.
 */
export type RecoveryCodeSetStatusView = {
  status: "none" | "active" | "exhausted";
  totalCodes: number;
  remainingCodes: number;
  generatedAt: string | null;
};

// ---------------------------------------------------------------------------
// StoredEnvelope — durable encrypted-message record (Issue #1936 / BETA-029)
// ---------------------------------------------------------------------------

export const storedEnvelopeProtectedHeadersSchema = z
  .object({
    algorithm: z.string().optional(),
    ephemeral_public_key: z.string().optional(),
    nonce: z
      .string()
      .regex(/^[0-9a-fA-F]*$/)
      .refine((val) => val.length % 2 === 0, "Nonce must be even hex")
      .optional(),
    mac: z.string().optional(),
    version: z
      .string()
      .regex(/^v\d+$/, "Version must be v<digit>")
      .optional(),
    alg: z.string().optional(),
    kid: z.string().optional(),
    typ: z.string().optional(),
  })
  .catchall(z.unknown());

export const mailboxItemStatusSchema = z.enum(["pending", "delivered", "quarantined"]);
export type MailboxItemStatus = z.infer<typeof mailboxItemStatusSchema>;

export const storedEnvelopeSchema = z.object({
  envelopeId: z.string().optional(),
  messageId: hash32Schema,
  senderId: stellarAddressSchema,
  recipientId: stellarAddressSchema,
  ciphertext: z
    .string()
    .min(1, "Ciphertext cannot be empty")
    .max(20 * 1024 * 1024, "Ciphertext exceeds 20 MiB limit")
    .regex(/^[A-Za-z0-9+/=]+$/, "Ciphertext must be base64 encoded"),
  protectedHeaders: storedEnvelopeProtectedHeadersSchema,
  contentCommitment: hash32Schema.optional(),
  createdAt: z.string().datetime(),
  status: mailboxItemStatusSchema.default("pending"),
  deletedAt: z.string().datetime().nullable().optional(),
  objectRef: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type StoredEnvelopeProtectedHeaders = z.infer<typeof storedEnvelopeProtectedHeadersSchema>;
export type StoredEnvelope = z.infer<typeof storedEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Issue #1940 (BETA-033) — Authenticated Recipient Mailbox Queue Domain
// ---------------------------------------------------------------------------

export const mailboxQueueQuerySchema = z.object({
  recipient: stellarAddressSchema.optional(),
  status: z.enum(["pending", "delivered", "all"]).default("all"),
  includeTombstones: z.coerce.boolean().default(false),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type MailboxQueueQuery = z.infer<typeof mailboxQueueQuerySchema>;

export const mailboxLiveFolderSchema = z.enum([
  "inbox",
  "pending",
  "requests",
  "archive",
  "spam",
  "trash",
  "sent",
  "drafts",
  "outbox",
]);
export type MailboxLiveFolder = z.infer<typeof mailboxLiveFolderSchema>;

export const mailboxCountKeySchema = z.enum([
  "inbox",
  "requests",
  "sent",
  "drafts",
  "outbox",
  "archive",
  "spam",
  "trash",
  "unread",
  "starred",
]);
export type MailboxCountKey = z.infer<typeof mailboxCountKeySchema>;

export const mailboxCountsSchema = z.object({
  inbox: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  outbox: z.number().int().nonnegative(),
  archive: z.number().int().nonnegative(),
  spam: z.number().int().nonnegative(),
  trash: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
  starred: z.number().int().nonnegative(),
});
export type MailboxCounts = z.infer<typeof mailboxCountsSchema>;

export const mailboxFlagsPatchSchema = z
  .object({
    unread: z.boolean().optional(),
    starred: z.boolean().optional(),
    folder: z.enum(["inbox", "archive", "spam", "trash"]).optional(),
  })
  .refine(
    (value) =>
      value.unread !== undefined || value.starred !== undefined || value.folder !== undefined,
    { message: "At least one mailbox flag is required" },
  );
export type MailboxFlagsPatch = z.infer<typeof mailboxFlagsPatchSchema>;

export const mailboxSyncQuerySchema = z.object({
  sinceCursor: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MailboxSyncQuery = z.infer<typeof mailboxSyncQuerySchema>;

export const mailboxDescriptorSchema = z.object({
  messageId: hash32Schema,
  senderId: stellarAddressSchema,
  recipientId: stellarAddressSchema,
  status: mailboxItemStatusSchema,
  createdAt: z.string().datetime(),
  protectedHeaders: storedEnvelopeProtectedHeadersSchema,
  contentCommitment: hash32Schema.optional(),
  objectRef: z.string().optional(),
  isTombstone: z.boolean(),
  deletedAt: z.string().datetime().nullable().optional(),
  starred: z.boolean().optional(),
  unread: z.boolean().optional(),
  folder: mailboxLiveFolderSchema.optional(),
});

export type MailboxDescriptor = z.infer<typeof mailboxDescriptorSchema>;

export const mailboxQueueResponseSchema = z.object({
  items: z.array(mailboxDescriptorSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type MailboxQueueResponse = z.infer<typeof mailboxQueueResponseSchema>;

export const tombstoneRequestSchema = z.object({
  messageId: hash32Schema,
});

export type TombstoneRequest = z.infer<typeof tombstoneRequestSchema>;

export const unknownSenderRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "blocked",
  "expired",
]);
export const unknownSenderDecisionSchema = z.enum([
  "approve_once",
  "always_allow",
  "reject",
  "block",
  "expire",
]);
export const encryptedMessageReferenceSchema = z.object({
  messageId: hash32Schema,
  envelopeId: z.string().min(1).max(256).optional(),
  ciphertextHash: hash32Schema,
});
export const unknownSenderRequestSchema = z.object({
  requestId: z.string().uuid(),
  recipient: stellarAddressSchema,
  sender: stellarAddressSchema,
  message: encryptedMessageReferenceSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: unknownSenderRequestStatusSchema,
  decidedAt: z.string().datetime().optional(),
  decision: unknownSenderDecisionSchema.optional(),
});
export type UnknownSenderRequest = z.infer<typeof unknownSenderRequestSchema>;
export type UnknownSenderDecision = z.infer<typeof unknownSenderDecisionSchema>;

// ---------------------------------------------------------------------------
// BETA-027 (Issue #1934) — Versioned Public Encryption-Key Directory & Rotation
// ---------------------------------------------------------------------------

export const keyAlgorithmSchema = z.enum(["ed25519", "x25519", "secp256k1"]);
export const keyPurposeSchema = z.enum(["encryption", "signing", "device"]);
export const keyStatusSchema = z.enum(["active", "rotated", "retired", "revoked"]);

export type KeyAlgorithm = z.infer<typeof keyAlgorithmSchema>;
export type KeyPurpose = z.infer<typeof keyPurposeSchema>;
export type KeyStatus = z.infer<typeof keyStatusSchema>;

export const publishedKeySchema = z.object({
  keyId: z.string().min(1, "keyId cannot be empty"),
  owner: stellarAddressSchema,
  algorithm: keyAlgorithmSchema,
  purpose: keyPurposeSchema,
  publicKey: z
    .string()
    .min(1, "publicKey cannot be empty")
    .refine(
      (val) => !val.toLowerCase().includes("private") && !val.toLowerCase().includes("secret"),
      {
        message: "Private key material detected; only public keys are allowed",
      },
    ),
  version: z.number().int().positive(),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
  status: keyStatusSchema,
  signature: z.string().min(1, "signature is required"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable().optional(),
  revocationReason: z.string().max(500).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type PublishedKey = z.infer<typeof publishedKeySchema>;

export const keyDirectoryRecordSchema = z.object({
  owner: stellarAddressSchema,
  currentEncryptionKeyId: z.string().nullable(),
  currentSigningKeyId: z.string().nullable(),
  keys: z.array(publishedKeySchema),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

export type KeyDirectoryRecord = z.infer<typeof keyDirectoryRecordSchema>;

// ---------------------------------------------------------------------------
// Issue #1973 (BETA-066) — Live contacts CRUD, trust state, and safe import
//
// A contact is a durable, user-owned address-book entry. `address` holds the
// raw identifier the user supplied (Hush/Stellar G-address, local handle,
// or federation address); `canonicalAddress` is the resolved Hush identity
// once identity resolution succeeds (null while unresolved or invalid).
// `trust` reuses the mailbox sender-rule vocabulary so contacts and policy
// stay consistent, but a contact row is NEVER an implicit policy mutation.
// ---------------------------------------------------------------------------

export const contactSourceSchema = z.enum(["manual", "csv", "vcard", "api"]);

export const contactSchema = z.object({
  contactId: z.string().trim().min(1),
  owner: stellarAddressSchema,
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(300),
  canonicalAddress: stellarAddressSchema.nullable().default(null),
  trust: senderRuleSchema.default("default"),
  source: contactSourceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

export const contactCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(300),
  trust: senderRuleSchema.default("default"),
});

export const contactUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().min(1).max(300).optional(),
    trust: senderRuleSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.name === undefined && data.address === undefined && data.trust === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of name, address, or trust must be provided",
        path: [],
      });
    }
  });

export type Contact = z.infer<typeof contactSchema>;
export type ContactSource = z.infer<typeof contactSourceSchema>;
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

// ---------------------------------------------------------------------------
// Issue #1952 (BETA-045) — Durable jobs, retries, DLQ, and receipt indexing
// ---------------------------------------------------------------------------

export const durableJobTypeSchema = z.enum([
  "funding",
  "anchoring",
  "postage",
  "delivery",
  "receipts",
  "cleanup",
  "reconciliation",
]);
export type DurableJobType = z.infer<typeof durableJobTypeSchema>;

export const jobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "dead_letter",
  "abandoned",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobErrorCodeSchema = z.enum([
  "ERR_NETWORK_TRANSIENT",
  "ERR_RPC_TIMEOUT",
  "ERR_RATE_LIMITED",
  "ERR_INSUFFICIENT_FUNDS",
  "ERR_CONTRACT_REVERT",
  "ERR_DOMAIN_NOT_FOUND",
  "ERR_UNAUTHORIZED",
  "ERR_PAYLOAD_REJECTED",
  "ERR_DELIVERY_EXPIRED",
  "ERR_POISON_PAYLOAD",
  "ERR_CHECKPOINT_GAP",
  "ERR_UNKNOWN_PERMANENT",
]);
export type JobErrorCode = z.infer<typeof jobErrorCodeSchema>;

export const durableJobSchema = z.object({
  jobId: z.string().trim().min(1),
  type: durableJobTypeSchema,
  idempotencyKey: z.string().trim().min(1),
  payload: z.record(z.unknown()),
  status: jobStatusSchema.default("pending"),
  attempts: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(5),
  backoffMs: z.number().int().positive().default(1000),
  nextRunAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  failedAt: z.string().datetime().optional(),
  lastError: z.string().max(500).optional(),
  errorCode: z.string().optional(),
  checkpoint: z.string().optional(),
});
export type DurableJob = z.infer<typeof durableJobSchema>;

export const deadLetterStatusSchema = z.enum(["dead", "retried", "abandoned"]);
export type DeadLetterStatus = z.infer<typeof deadLetterStatusSchema>;

export const deadLetterSchema = z.object({
  deadLetterId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  jobType: durableJobTypeSchema,
  idempotencyKey: z.string().trim().min(1),
  payload: z.record(z.unknown()),
  attempts: z.number().int().nonnegative(),
  errorCode: z.string(),
  errorMessage: z.string(),
  deadLetteredAt: z.string().datetime(),
  status: deadLetterStatusSchema.default("dead"),
  retriedAt: z.string().datetime().optional(),
  abandonedAt: z.string().datetime().optional(),
  adminNotes: z.string().max(500).optional(),
});
export type DeadLetter = z.infer<typeof deadLetterSchema>;

export const receiptEventSchema = z.object({
  eventId: z.string().trim().min(1),
  streamId: z.string().trim().min(1),
  sequence: z.number().int().nonnegative(),
  messageId: hash32Schema,
  recipient: stellarAddressSchema,
  sender: stellarAddressSchema,
  deliveredAt: z.string().datetime(),
  readAt: z.string().datetime().nullable().optional(),
});
export type ReceiptEvent = z.infer<typeof receiptEventSchema>;

export const receiptCheckpointSchema = z.object({
  streamId: z.string().trim().min(1),
  lastSequence: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  lastIndexedAt: z.string().datetime(),
  gapCount: z.number().int().nonnegative().default(0),
});
export type ReceiptCheckpoint = z.infer<typeof receiptCheckpointSchema>;

// ---------------------------------------------------------------------------
// Issue #1954 (BETA-048) — Recoverable Send Operation State & Idempotency
// ---------------------------------------------------------------------------

export const sendOperationStatusSchema = z.enum([
  "created",
  "quoted",
  "escrowed",
  "submitted",
  "anchored",
  "delivered",
  "failed",
]);
export type SendOperationStatus = z.infer<typeof sendOperationStatusSchema>;

export const sendProofReferencesSchema = z.object({
  receiptId: z.string().optional(),
  anchorTxHash: z.string().optional(),
  postagePaymentHash: z.string().optional(),
  relayMessageId: z.string().optional(),
});
export type SendProofReferences = z.infer<typeof sendProofReferencesSchema>;

export const sendOperationStateSchema = z.object({
  version: z.number().int().positive().default(1),
  messageId: hash32Schema,
  sender: stellarAddressSchema,
  recipient: stellarAddressSchema,
  recipientDomain: z.string().default("stellar.network"),
  status: sendOperationStatusSchema.default("created"),
  quote: z.record(z.unknown()).optional(),
  postage: postageSchema.optional(),
  envelope: storedEnvelopeSchema.optional(),
  relaySubmission: z
    .object({
      accepted: z.boolean(),
      state: z.string(),
      attempts: z.number(),
    })
    .optional(),
  receipt: receiptSchema.optional(),
  anchorTxHash: z.string().optional(),
  proofReferences: sendProofReferencesSchema.optional(),
  idempotencyKey: z.string().min(1),
  failureReason: z.string().optional(),
  errorCode: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SendOperationState = z.infer<typeof sendOperationStateSchema>;

// ---------------------------------------------------------------------------
// Issue #1965 (BETA-058) — Durable Drafts, Scheduled Autosave & Conflict Handling
// ---------------------------------------------------------------------------

export const draftAttachmentDescriptorSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().default("application/octet-stream"),
  sizeBytes: z.number().int().nonnegative(),
  contentHash: z.string().trim().optional(),
});
export type DraftAttachmentDescriptor = z.infer<typeof draftAttachmentDescriptorSchema>;

export const draftContentSchema = z.object({
  to: z.array(z.string().trim()).default([]),
  cc: z.array(z.string().trim()).default([]),
  bcc: z.array(z.string().trim()).default([]),
  subject: z.string().default(""),
  body: z.string().default(""),
  attachments: z.array(draftAttachmentDescriptorSchema).default([]),
});
export type DraftContent = z.infer<typeof draftContentSchema>;

/**
 * Encrypted-at-rest persistence record for drafts.
 * Plaintext draft content (subject, body, recipients, attachments) is
 * sealed using AES-256-GCM with AAD bound to the owner and draftId.
 */
export const draftRecordSchema = z.object({
  draftId: z.string().trim().min(1),
  owner: stellarAddressSchema,
  encryptedPayload: z.string().min(1),
  nonce: z.string().min(1),
  tag: z.string().min(1),
  algorithm: z.literal("AES-256-GCM").default("AES-256-GCM"),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DraftRecord = z.infer<typeof draftRecordSchema>;

/**
 * Decrypted draft representation exposed to authenticated callers.
 */
export const draftSchema = z.object({
  draftId: z.string().trim().min(1),
  owner: stellarAddressSchema,
  to: z.array(z.string().trim()).default([]),
  cc: z.array(z.string().trim()).default([]),
  bcc: z.array(z.string().trim()).default([]),
  subject: z.string().default(""),
  body: z.string().default(""),
  attachments: z.array(draftAttachmentDescriptorSchema).default([]),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Draft = z.infer<typeof draftSchema>;

export const draftCreateSchema = z.object({
  draftId: z.string().trim().min(1).optional(),
  to: z
    .union([z.string(), z.array(z.string())])
    .transform((val) =>
      Array.isArray(val)
        ? val.map((s) => s.trim()).filter(Boolean)
        : val
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .optional()
    .default([]),
  cc: z
    .union([z.string(), z.array(z.string())])
    .transform((val) =>
      Array.isArray(val)
        ? val.map((s) => s.trim()).filter(Boolean)
        : val
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .optional()
    .default([]),
  bcc: z
    .union([z.string(), z.array(z.string())])
    .transform((val) =>
      Array.isArray(val)
        ? val.map((s) => s.trim()).filter(Boolean)
        : val
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .optional()
    .default([]),
  subject: z.string().optional().default(""),
  body: z.string().optional().default(""),
  attachments: z.array(draftAttachmentDescriptorSchema).optional().default([]),
});
export type DraftCreateInput = z.input<typeof draftCreateSchema>;

export const draftUpdateSchema = z.object({
  to: z
    .union([z.string(), z.array(z.string())])
    .transform((val) =>
      Array.isArray(val)
        ? val.map((s) => s.trim()).filter(Boolean)
        : val
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .optional(),
  cc: z
    .union([z.string(), z.array(z.string())])
    .transform((val) =>
      Array.isArray(val)
        ? val.map((s) => s.trim()).filter(Boolean)
        : val
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .optional(),
  bcc: z
    .union([z.string(), z.array(z.string())])
    .transform((val) =>
      Array.isArray(val)
        ? val.map((s) => s.trim()).filter(Boolean)
        : val
            .split(/[;,]/)
            .map((s) => s.trim())
            .filter(Boolean),
    )
    .optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  attachments: z.array(draftAttachmentDescriptorSchema).optional(),
  expectedVersion: z.number().int().positive(),
});
export type DraftUpdateInput = z.input<typeof draftUpdateSchema>;

// ---------------------------------------------------------------------------
// Issue #1972 (BETA-065) — Server-Backed Mailbox Search Domain
// ---------------------------------------------------------------------------

export const searchFilterSchema = z.object({
  folder: mailboxLiveFolderSchema.or(z.literal("all")).optional(),
  unread: z.boolean().optional(),
  starred: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  sender: z.string().trim().optional(),
  recipient: z.string().trim().optional(),
  afterDate: z.string().trim().optional(),
  beforeDate: z.string().trim().optional(),
  includeDeleted: z.boolean().default(false),
});
export type SearchFilter = z.infer<typeof searchFilterSchema>;

export const searchQuerySchema = z.object({
  q: z.string().default(""),
  folder: mailboxLiveFolderSchema.or(z.literal("all")).optional(),
  unread: z.coerce.boolean().optional(),
  starred: z.coerce.boolean().optional(),
  hasAttachments: z.coerce.boolean().optional(),
  sender: z.string().trim().optional(),
  recipient: z.string().trim().optional(),
  afterDate: z.string().trim().optional(),
  beforeDate: z.string().trim().optional(),
  includeDeleted: z.coerce.boolean().default(false),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchHighlightSchema = z.object({
  field: z.string(),
  snippet: z.string(),
});
export type SearchHighlight = z.infer<typeof searchHighlightSchema>;

export const searchResultItemSchema = z.object({
  type: z.enum(["message", "contact", "draft"]),
  id: z.string(),
  messageId: z.string().optional(),
  senderId: z.string(),
  recipientId: z.string(),
  folder: z.string(),
  subject: z.string().optional(),
  preview: z.string().optional(),
  createdAt: z.string().datetime(),
  unread: z.boolean(),
  starred: z.boolean(),
  hasAttachments: z.boolean(),
  isTombstone: z.boolean(),
  deletedAt: z.string().datetime().nullable().optional(),
  highlights: z.array(searchHighlightSchema).default([]),
});
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;

export const searchIndexLimitationsSchema = z.object({
  serverIndexLimited: z.literal(true).default(true),
  encryptedBodyIndexed: z.literal(false).default(false),
  safeMetadataFields: z.array(z.string()),
  notice: z.string(),
});
export type SearchIndexLimitations = z.infer<typeof searchIndexLimitationsSchema>;

export const searchResponseSchema = z.object({
  items: z.array(searchResultItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  totalMatches: z.number().int().nonnegative(),
  query: z.string(),
  parsedFilters: z.record(z.unknown()),
  indexLimitations: searchIndexLimitationsSchema,
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const inviteSchema = z.object({
  code: z.string().min(1),
  status: z.enum(["active", "revoked"]),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  revokedAt: z.string().datetime().nullable(),
  revokedBy: z.string().nullable(),
  reason: z.string().optional(),
});
export type Invite = z.infer<typeof inviteSchema>;

// ---------------------------------------------------------------------------
// Beta Tester Feedback Reports (Issue #2001 — BETA-094)
//
// Only safe diagnostic metadata is collected. Message body, tokens, private
// keys, seed phrases, and raw address books are NEVER included in a report.
// Screenshots must be explicitly consented to and are stripped server-side if
// consent is absent. Support IDs are random and do not encode user identity.
// ---------------------------------------------------------------------------

export const feedbackCategorySchema = z.enum([
  "bug",
  "performance",
  "ui",
  "security",
  "feature_request",
  "other",
]);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type FeedbackSeverity = z.infer<typeof feedbackSeveritySchema>;

export const feedbackStatusSchema = z.enum(["open", "triaged", "resolved", "closed", "wont_fix"]);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

/**
 * Safe redacted diagnostics attached to a report.
 * No plaintext message content, no tokens, no keys, no seeds.
 */
export const feedbackDiagnosticsSchema = z.object({
  /** Redacted app version string (e.g. "1.4.2-beta"). */
  appVersion: z.string().max(40).optional(),
  /** User-agent browser string — safe metadata only. */
  userAgent: z.string().max(300).optional(),
  /** Current client-side route path only (no query params, no IDs). */
  route: z.string().max(200).optional(),
  /** Active feature flags as recorded on the bootstrap snapshot. */
  featureFlags: z.record(z.boolean()).optional(),
  /** Browser-safe support ID from the most recent API response header. */
  supportId: z.string().max(128).optional(),
  /** Service dependency statuses from the last health check. */
  serviceStatus: z.record(z.string().max(20)).optional(),
});
export type FeedbackDiagnostics = z.infer<typeof feedbackDiagnosticsSchema>;

/**
 * Beta tester feedback report.
 *
 * Security invariants:
 * - `steps` is free text supplied by the user; server strips any pattern that
 *   looks like a token, private key, or seed phrase before persisting.
 * - `screenshotDataUrl` is only persisted when `screenshotConsent` is true.
 * - `reporterId` is a support-ID-style opaque token, never a real address.
 */
export const feedbackReportSchema = z.object({
  reportId: z.string().min(1),
  category: feedbackCategorySchema,
  severity: feedbackSeveritySchema,
  status: feedbackStatusSchema,
  /** Redacted reproduction steps — no message body or secrets. */
  steps: z.string().min(10).max(2000),
  /** True only when the user explicitly checked the consent box. */
  screenshotConsent: z.boolean(),
  /**
   * Base64 data URL of the screenshot, present only when `screenshotConsent`
   * is true and the payload passed server-side size limits. Stripped otherwise.
   */
  screenshotDataUrl: z.string().max(512_000).nullable(),
  diagnostics: feedbackDiagnosticsSchema.nullable(),
  /** Opaque support-token that identifies the reporting session — not an address. */
  reporterId: z.string().max(128),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Admin triage notes — visible in the operations console only. */
  triageNotes: z.string().max(1000).nullable(),
  /** Admin actor who closed / resolved this report. */
  resolvedBy: z.string().max(128).nullable(),
  resolvedAt: z.string().datetime().nullable(),
});
export type FeedbackReport = z.infer<typeof feedbackReportSchema>;

/**
 * Input schema for the POST /api/v1/feedback endpoint.
 * Only the fields the client may supply — reportId and timestamps are server-assigned.
 */
export const feedbackSubmitSchema = z.object({
  category: feedbackCategorySchema,
  severity: feedbackSeveritySchema,
  steps: z
    .string()
    .min(10, "Steps must be at least 10 characters")
    .max(2000, "Steps cannot exceed 2000 characters"),
  screenshotConsent: z.boolean(),
  screenshotDataUrl: z
    .string()
    .max(512_000, "Screenshot data exceeds the 512 KB limit")
    .nullable()
    .optional(),
  diagnostics: feedbackDiagnosticsSchema.nullable().optional(),
});
export type FeedbackSubmitInput = z.infer<typeof feedbackSubmitSchema>;
