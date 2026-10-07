import type { RecipientReadiness } from "@/components/mail/composeValidation";
import {
  defaultIdentityResolver,
  IdentityResolverService,
  LOCAL_STEALTH_DOMAINS,
} from "@/features/identity/resolver";
import { fetchKeyDirectory } from "./recipientKeyResolution";

export type RecipientResolutionContext = {
  /** Resolve a contact by name or address */
  resolveContact?: (input: string) => Promise<{
    id: string;
    name: string;
    address: string;
    publicKey?: string;
    trusted?: boolean;
  } | null>;

  /** Resolve a Stellar federation address (name*domain) */
  resolveFederation?: (address: string) => Promise<{
    publicKey: string;
    domain: string;
  } | null>;

  /** Optional custom identity resolver */
  identityResolver?: IdentityResolverService;

  /** Get user's policy for unverified recipients */
  getUnverifiedPolicy?: () => Promise<"allow" | "block" | "review">;

  /** Check if recipient is explicitly blocked */
  isBlockedRecipient?: (address: string) => Promise<boolean>;
};

/**
 * Resolves a single recipient address to determine if it's valid, verified, unknown, or blocked.
 * Supports:
 * - Hush addresses (S...)
 * - Stellar G-addresses (G...)
 * - Hush email handles (username@stealth.me, username@stealth.xyz)
 * - Federation addresses (name*domain)
 * - Aliases
 * - Contacts
 *
 * @param address The recipient address to resolve
 * @param blockedRecipients Local set of blocked addresses for quick filtering
 * @param context Optional resolution context for contact/federation lookup
 */
export async function resolveRecipient(
  address: string,
  blockedRecipients: Set<string>,
  context?: RecipientResolutionContext,
  signal?: AbortSignal,
): Promise<RecipientReadiness> {
  const checkAbort = () => {
    if (signal?.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }
  };
  checkAbort();

  const normalized = address.toLowerCase().trim();

  // Check if blocked locally first (fast path)
  if (blockedRecipients.has(normalized)) {
    return {
      address,
      state: "blocked",
      postage: "required",
      message: "This recipient is blocked",
      policyType: "block",
    };
  }

  // Validate format
  const validation = validateRecipientFormat(normalized);
  if (!validation.valid) {
    return {
      address,
      state: "invalid",
      postage: "required",
      message: validation.error || "Invalid address format",
    };
  }

  // Check if blocked via context (async check)
  if (context?.isBlockedRecipient) {
    const isBlocked = await context.isBlockedRecipient(normalized);
    checkAbort();
    if (isBlocked) {
      return {
        address,
        state: "blocked",
        postage: "required",
        message: "This recipient is blocked",
        policyType: "block",
      };
    }
  }

  let readiness: RecipientReadiness | null = null;

  // Try to resolve via contact database
  if (context?.resolveContact && !isStellarFormat(normalized)) {
    try {
      const contact = await context.resolveContact(normalized);
      checkAbort();
      if (contact) {
        readiness = {
          address,
          state: "verified",
          postage: "required",
          message: `Contact verified: ${contact.name}`,
          resolvedAccount: contact.address,
          policyType: contact.trusted ? "allow" : "default",
          encryptionKey: contact.publicKey,
          provenance: "contact",
          cached: true,
        };
      }
    } catch (error) {
      console.warn(`Failed to resolve contact for ${address}:`, error);
    }
  }

  // Try to resolve via federation context if explicitly provided
  if (!readiness && isFederationFormat(normalized) && context?.resolveFederation) {
    try {
      const result = await context.resolveFederation(normalized);
      checkAbort();
      if (result) {
        readiness = {
          address,
          state: "verified",
          postage: "required",
          message: `Resolved via Stellar federation (${result.domain})`,
          resolvedAccount: result.publicKey,
          policyType: "default",
          encryptionKey: result.publicKey,
          provenance: "stellar_federation",
          cached: false,
        };
      }
    } catch (error) {
      console.warn(`Failed to resolve federation address ${address}:`, error);
    }
  }

  if (!readiness) {
    // Try resolving via unified IdentityResolverService
    const resolver = context?.identityResolver ?? defaultIdentityResolver;
    try {
      const resolved = await resolver.resolve(normalized, { timeoutMs: 1500, signal });
      checkAbort();
      if (resolved.resolved && resolved.status === "active") {
        readiness = {
          address,
          state: "verified",
          postage: "required",
          message: `Resolved identity: ${resolved.canonicalAddress}`,
          resolvedAccount: resolved.account ?? undefined,
          policyType: resolved.policy?.requireVerified ? "default" : "allow",
          encryptionKey: resolved.publicKey ?? undefined,
          provenance: resolved.freshness.source,
          cached: resolved.freshness.cached,
          expiresAt: resolved.freshness.expiresAt,
        };
      } else if (resolved.status === "suspended" || resolved.status === "deactivated") {
        readiness = {
          address,
          state: "blocked",
          postage: "required",
          message: `Recipient account is ${resolved.status}`,
          policyType: "block",
        };
      }
    } catch (error) {
      console.warn(`IdentityResolver resolution error for ${address}:`, error);
    }
  }

  // Default: unknown but valid format
  if (!readiness) {
    readiness = {
      address,
      state: "unknown",
      postage: "required",
      message: "Recipient address unresolved — verification pending",
      policyType: "default",
    };
  }

  // Validate the key status via key directory if we have a known account or Stellar address format
  const targetAccount =
    readiness.resolvedAccount ??
    (isStellarFormat(normalized) ? normalized.toUpperCase() : undefined);

  if (targetAccount && (readiness.state === "verified" || isStellarFormat(normalized))) {
    try {
      const keyDir = await fetchKeyDirectory(targetAccount, signal);
      if (keyDir) {
        readiness.resolvedAccount = targetAccount;
        const encKey = keyDir.currentKeys?.encryption;
        if (encKey) {
          if (encKey.status === "revoked") {
            readiness.state = "blocked";
            readiness.keyStatus = "revoked";
            readiness.message = "Recipient encryption key has been revoked";
            readiness.policyType = "block";
          } else if (encKey.status === "retired") {
            readiness.state = "blocked";
            readiness.keyStatus = "retired";
            readiness.message = "Recipient encryption key is retired";
            readiness.policyType = "block";
          } else if (encKey.status === "active") {
            if (readiness.state === "unknown") {
              readiness.state = "verified";
            }
            readiness.keyStatus = "active";
            readiness.encryptionKey = encKey.publicKey;
          } else {
            readiness.keyStatus = encKey.status;
          }
        } else {
          // Server responded but no encryption key is published
          readiness.state = "invalid";
          readiness.keyStatus = "missing";
          readiness.message = "No active encryption key published for recipient";
        }
      } else if (readiness.state === "verified") {
        // Directory unreachable — keep verified, flag key check as unavailable
        readiness.keyStatus = "unavailable";
      }
    } catch (err: any) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      // Network/timeout error — keep verified if already verified, flag key check as unavailable
      if (readiness.state === "verified") {
        readiness.keyStatus = "unavailable";
      }
    }
  }

  return readiness;
}

/**
 * Helper to check if address is already in Stellar format (G or S prefix)
 */
function isStellarFormat(address: string): boolean {
  return /^[GS][A-Z0-9]{55}$/i.test(address);
}

/**
 * Helper to check if address is a federation address (name*domain)
 */
function isFederationFormat(address: string): boolean {
  return /\*/.test(address) && address.includes(".");
}

/**
 * Batch resolve multiple recipients
 */
export async function resolveRecipients(
  addresses: string[],
  blockedRecipients: string[] = [],
  context?: RecipientResolutionContext,
  signal?: AbortSignal,
): Promise<RecipientReadiness[]> {
  const blockedSet = new Set(blockedRecipients.map((r) => r.toLowerCase().trim()));
  return Promise.all(addresses.map((addr) => resolveRecipient(addr, blockedSet, context, signal)));
}

/**
 * Validate recipient address format
 */
export function validateRecipientFormat(address: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = address.trim().toLowerCase();

  if (!trimmed) {
    return { valid: false, error: "Address is required" };
  }

  // Hush address (S...)
  if (/^s[a-z0-9]{55}$/i.test(trimmed)) {
    return { valid: true };
  }

  // Stellar G-address (56 chars, starts with G)
  if (/^g[a-z2-7]{55}$/i.test(trimmed)) {
    return { valid: true };
  }

  // Federation address (name*domain)
  if (/^[a-z0-9._-]+\*[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
    return { valid: true };
  }

  // Hush email format (name@stealth.me, name@stealth.xyz, etc.)
  const email = /^([a-z0-9._%+-]+)@([^@]+)$/i.exec(trimmed);
  if (email && LOCAL_STEALTH_DOMAINS.has(email[2])) {
    return { valid: true };
  }

  // Alias (simple string, no spaces or special chars except hyphen/underscore)
  if (/^[a-z0-9._-]{3,}$/i.test(trimmed) && !trimmed.includes("@")) {
    return { valid: true };
  }

  return {
    valid: false,
    error:
      "Enter a Hush address, Stellar address, federation address (name*domain), or contact alias",
  };
}
