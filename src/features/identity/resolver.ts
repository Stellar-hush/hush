import { Federation } from "@stellar/stellar-sdk";
import { LOCAL_MAIL_DOMAINS, MAIL_DOMAIN, formatMailAddress } from "./mail-domain";
import type {
  ResolvedIdentity,
  ResolutionFreshness,
  ResolutionError,
  AccountStatus,
  MailboxPolicy,
  PublicProfile,
} from "./types";

export const LOCAL_STEALTH_DOMAINS = new Set<string>(LOCAL_MAIL_DOMAINS);

export interface IdentityRepositoryAdapter {
  getUserByUsername(username: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  getUserByAddress(address: string): Promise<any>;
  getPolicy(address: string): Promise<any>;
  getProfile(userId: string): Promise<any>;
}

export interface ResolverOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  bypassCache?: boolean;
  repository?: IdentityRepositoryAdapter;
  customFederationResolver?: (address: string) => Promise<{
    account_id: string;
    memo_type?: string;
    memo?: string;
  } | null>;
}

interface CacheEntry {
  result: ResolvedIdentity;
  expiresAt: number;
}

/**
 * Normalizes input identifier using Unicode NFKC and case folding.
 */
export function normalizeIdentifier(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, ""); // strip zero-width spaces
}

/**
 * Parses an identifier into structured resolution parts.
 */
export type ParsedIdentifier =
  | { type: "stellar_address"; address: string }
  | { type: "stealth_address"; address: string }
  | { type: "local_handle"; username: string; domain: string }
  | {
      type: "federation_address";
      username: string;
      domain: string;
      raw: string;
    }
  | { type: "email_address"; username: string; domain: string; raw: string }
  | { type: "invalid"; raw: string; reason: string };

export function parseIdentifier(rawInput: string): ParsedIdentifier {
  const normalized = normalizeIdentifier(rawInput);
  if (!normalized) {
    return {
      type: "invalid",
      raw: rawInput,
      reason: "Identifier cannot be empty",
    };
  }

  // 1. Stellar Public G-address (56 chars starting with G)
  if (/^g[a-z2-7]{55}$/i.test(normalized)) {
    return { type: "stellar_address", address: normalized.toUpperCase() };
  }

  // 2. Hush S-address (56 chars starting with S)
  if (/^s[a-z2-7]{55}$/i.test(normalized)) {
    return { type: "stealth_address", address: normalized.toUpperCase() };
  }

  // 3. Federation address with asterisk: user*domain.tld
  if (normalized.includes("*")) {
    const parts = normalized.split("*");
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      const username = parts[0];
      const domain = parts[1];
      if (LOCAL_STEALTH_DOMAINS.has(domain)) {
        return { type: "local_handle", username, domain };
      }
      return { type: "federation_address", username, domain, raw: normalized };
    }
    return {
      type: "invalid",
      raw: normalized,
      reason: "Invalid federation address format",
    };
  }

  // 4. Email address: user@domain.tld
  if (normalized.includes("@")) {
    const parts = normalized.split("@");
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      const username = parts[0];
      const domain = parts[1];
      if (LOCAL_STEALTH_DOMAINS.has(domain)) {
        return { type: "local_handle", username, domain };
      }
      return { type: "email_address", username, domain, raw: normalized };
    }
    return { type: "invalid", raw: normalized, reason: "Invalid email format" };
  }

  // 5. Bare username / handle (alphanumeric, dot, underscore, dash)
  if (/^[a-z0-9._-]{3,64}$/.test(normalized)) {
    return { type: "local_handle", username: normalized, domain: MAIL_DOMAIN };
  }

  return {
    type: "invalid",
    raw: normalized,
    reason: "Unrecognized identifier format",
  };
}

/**
 * Production-ready Hush Address and Stellar Federation Resolver.
 */
export class IdentityResolverService {
  private positiveCache = new Map<string, CacheEntry>();
  private negativeCache = new Map<string, CacheEntry>();
  private addressToKeysIndex = new Map<string, Set<string>>();

  private readonly maxCacheSize: number;
  private readonly defaultPositiveTtlMs: number;
  private readonly defaultNegativeTtlMs: number;

  constructor(
    options: {
      maxCacheSize?: number;
      positiveTtlMs?: number;
      negativeTtlMs?: number;
    } = {},
  ) {
    this.maxCacheSize = options.maxCacheSize ?? 1000;
    this.defaultPositiveTtlMs = options.positiveTtlMs ?? 5 * 60 * 1000; // 5 minutes
    this.defaultNegativeTtlMs = options.negativeTtlMs ?? 30 * 1000; // 30 seconds
  }

  /**
   * Main entry point to resolve an address, handle, or federation identifier.
   */
  public async resolve(
    rawIdentifier: string,
    options: ResolverOptions = {},
  ): Promise<ResolvedIdentity> {
    const normalized = normalizeIdentifier(rawIdentifier);
    const parsed = parseIdentifier(rawIdentifier);

    if (parsed.type === "invalid") {
      return this.createErrorResult(
        rawIdentifier,
        normalized,
        "invalid_format",
        parsed.reason,
        "negative_cache",
        0,
      );
    }

    const cacheKey = normalized;
    const now = Date.now();

    // 1. Check positive cache unless bypassed
    if (!options.bypassCache) {
      const cached = this.positiveCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return {
          ...cached.result,
          freshness: {
            ...cached.result.freshness,
            cached: true,
            ttlMs: cached.expiresAt - now,
          },
        };
      } else if (cached) {
        this.positiveCache.delete(cacheKey);
      }

      // Check negative cache
      const negCached = this.negativeCache.get(cacheKey);
      if (negCached && negCached.expiresAt > now) {
        return {
          ...negCached.result,
          freshness: {
            ...negCached.result.freshness,
            cached: true,
            ttlMs: negCached.expiresAt - now,
          },
        };
      } else if (negCached) {
        this.negativeCache.delete(cacheKey);
      }
    }

    // In browser client path
    if (typeof window !== "undefined") {
      const timeoutMs = options.timeoutMs ?? 2000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      if (options.signal) {
        options.signal.addEventListener("abort", () => controller.abort());
      }

      try {
        const queryParams = new URLSearchParams({
          identifier: normalized,
        });
        if (options.bypassCache) {
          queryParams.set("bypassCache", "true");
        }

        const url = `/api/v1/identity/resolve?${queryParams.toString()}`;
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const body = await response.json();
        const result = body.data as ResolvedIdentity;

        // Cache according to resolved status
        if (result.resolved && result.status === "active") {
          this.setPositiveCache(cacheKey, result);
          if (result.account) {
            this.indexAddress(result.account, cacheKey);
          }
        } else {
          this.setNegativeCache(cacheKey, result);
        }

        return result;
      } catch (err: any) {
        const isTimeout = err?.message === "Resolution timeout" || controller.signal.aborted;
        const errorResult = this.createErrorResult(
          rawIdentifier,
          normalized,
          isTimeout ? "timeout" : "network_error",
          isTimeout ? "Resolution timed out" : "Identity resolution failed",
          "negative_cache",
          this.defaultNegativeTtlMs,
        );
        this.setNegativeCache(cacheKey, errorResult);
        return errorResult;
      } finally {
        clearTimeout(timer);
      }
    }

    // Setup timeout controller
    const timeoutMs = options.timeoutMs ?? 2000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const result = await Promise.race([
        this.executeResolution(parsed, normalized, options, controller.signal),
        new Promise<ResolvedIdentity>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("Resolution timeout"));
          });
        }),
      ]);

      // Cache according to resolved status
      if (result.resolved && result.status === "active") {
        this.setPositiveCache(cacheKey, result);
        if (result.account) {
          this.indexAddress(result.account, cacheKey);
        }
      } else {
        this.setNegativeCache(cacheKey, result);
      }

      return result;
    } catch (err: any) {
      const isTimeout = err?.message === "Resolution timeout" || controller.signal.aborted;
      const errorResult = this.createErrorResult(
        rawIdentifier,
        normalized,
        isTimeout ? "timeout" : "network_error",
        isTimeout ? "Resolution timed out" : "Identity resolution failed",
        "negative_cache",
        this.defaultNegativeTtlMs,
      );
      this.setNegativeCache(cacheKey, errorResult);
      return errorResult;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Internal dispatcher for resolution by identifier type.
   */
  private async executeResolution(
    parsed: ParsedIdentifier,
    normalized: string,
    options: ResolverOptions,
    signal: AbortSignal,
  ): Promise<ResolvedIdentity> {
    const repository = options.repository ?? (globalThis as any).__stealthApiRepository;

    switch (parsed.type) {
      case "stellar_address":
      case "stealth_address":
        return this.resolveDirectAddress(parsed.address, normalized, repository);

      case "local_handle":
        return this.resolveLocalHandle(parsed.username, parsed.domain, normalized, repository);

      case "email_address":
        return this.resolveEmailAddress(parsed.username, parsed.domain, normalized, repository);

      case "federation_address":
        return this.resolveFederationAddress(parsed.raw, normalized, options, signal);

      default:
        return this.createErrorResult(
          normalized,
          normalized,
          "invalid_format",
          "Unsupported format",
          "negative_cache",
          0,
        );
    }
  }

  /**
   * Resolves direct Stellar or Hush public address (G... or S...).
   */
  private async resolveDirectAddress(
    address: string,
    normalized: string,
    repository?: IdentityRepositoryAdapter,
  ): Promise<ResolvedIdentity> {
    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + this.defaultPositiveTtlMs).toISOString();

    let user: any = null;
    if (repository) {
      try {
        user = await repository.getUserByAddress(address);
      } catch {
        // Fallback to direct address representation
      }
    }

    if (user) {
      if (user.status !== "active") {
        return {
          identifier: normalized,
          canonicalAddress: address,
          account: address,
          resolved: false,
          status: user.status,
          publicKey: null,
          encryptionKeyVersion: null,
          policyEndpoint: `/api/v1/policies/${address}`,
          freshness: {
            resolvedAt: nowIso,
            cached: false,
            ttlMs: this.defaultNegativeTtlMs,
            source: "stealth_local",
            expiresAt: new Date(Date.now() + this.defaultNegativeTtlMs).toISOString(),
          },
          error: {
            code: user.status,
            message: `Account is ${user.status}`,
          },
        };
      }

      let policy: MailboxPolicy | null = null;
      let profile: PublicProfile | null = null;
      if (repository) {
        try {
          const rawPolicy = await repository.getPolicy(address);
          policy = rawPolicy;
          const rawProfile = await repository.getProfile(user.userId);
          if (rawProfile) {
            profile = {
              userId: rawProfile.userId,
              username: rawProfile.username,
              displayName: rawProfile.displayName,
              avatarUrl: rawProfile.avatarUrl ?? null,
              bio: rawProfile.bio ?? null,
              createdAt: rawProfile.createdAt,
              updatedAt: rawProfile.updatedAt,
            };
          }
        } catch {
          // Ignore repository lookup failures on optional policy and profile
        }
      }

      return {
        identifier: normalized,
        canonicalAddress: formatMailAddress(user.username),
        account: address,
        resolved: true,
        status: "active",
        publicKey: address,
        encryptionKeyVersion: 1,
        policyEndpoint: `/api/v1/policies/${address}`,
        policy,
        profile,
        freshness: {
          resolvedAt: nowIso,
          cached: false,
          ttlMs: this.defaultPositiveTtlMs,
          source: "stealth_local",
          expiresAt: expiresAtIso,
        },
      };
    }

    // Direct address not registered in local repository
    return {
      identifier: normalized,
      canonicalAddress: address,
      account: address,
      resolved: true,
      status: "unknown",
      publicKey: address,
      encryptionKeyVersion: null,
      policyEndpoint: `/api/v1/policies/${address}`,
      freshness: {
        resolvedAt: nowIso,
        cached: false,
        ttlMs: this.defaultPositiveTtlMs,
        source: "direct_address",
        expiresAt: expiresAtIso,
      },
    };
  }

  /**
   * Resolves local Hush handle: username@stealth.me or username*stealth.me.
   */
  private async resolveLocalHandle(
    username: string,
    domain: string,
    normalized: string,
    repository?: IdentityRepositoryAdapter,
  ): Promise<ResolvedIdentity> {
    const nowIso = new Date().toISOString();
    const canonical = formatMailAddress(username);

    if (!repository) {
      return this.createErrorResult(
        canonical,
        normalized,
        "not_found",
        "Repository not available for local resolution",
        "negative_cache",
        this.defaultNegativeTtlMs,
      );
    }

    const user = await repository.getUserByUsername(username);
    if (!user) {
      return this.createErrorResult(
        canonical,
        normalized,
        "not_found",
        "Recipient identity not found",
        "negative_cache",
        this.defaultNegativeTtlMs,
      );
    }

    // Disabled / pending / suspended accounts cannot be returned as active
    if (user.status !== "active") {
      return {
        identifier: normalized,
        canonicalAddress: canonical,
        account: user.address,
        resolved: false,
        status: user.status,
        publicKey: null,
        encryptionKeyVersion: null,
        policyEndpoint: `/api/v1/policies/${user.address}`,
        freshness: {
          resolvedAt: nowIso,
          cached: false,
          ttlMs: this.defaultNegativeTtlMs,
          source: "stealth_local",
          expiresAt: new Date(Date.now() + this.defaultNegativeTtlMs).toISOString(),
        },
        error: {
          code: user.status,
          message: `Account is ${user.status}`,
        },
      };
    }

    const policy = await repository.getPolicy(user.address);
    const rawProfile = await repository.getProfile(user.userId);
    const profile: PublicProfile | null = rawProfile
      ? {
          userId: rawProfile.userId,
          username: rawProfile.username,
          displayName: rawProfile.displayName,
          avatarUrl: rawProfile.avatarUrl ?? null,
          bio: rawProfile.bio ?? null,
          createdAt: rawProfile.createdAt,
          updatedAt: rawProfile.updatedAt,
        }
      : null;

    return {
      identifier: normalized,
      canonicalAddress: canonical,
      account: user.address,
      resolved: true,
      status: "active",
      publicKey: user.address,
      encryptionKeyVersion: 1,
      policyEndpoint: `/api/v1/policies/${user.address}`,
      policy,
      profile,
      freshness: {
        resolvedAt: nowIso,
        cached: false,
        ttlMs: this.defaultPositiveTtlMs,
        source: "stealth_local",
        expiresAt: new Date(Date.now() + this.defaultPositiveTtlMs).toISOString(),
      },
    };
  }

  /**
   * Resolves email-formatted address.
   */
  private async resolveEmailAddress(
    username: string,
    domain: string,
    normalized: string,
    repository?: IdentityRepositoryAdapter,
  ): Promise<ResolvedIdentity> {
    // If local stealth domain, delegate to local handle
    if (LOCAL_STEALTH_DOMAINS.has(domain)) {
      return this.resolveLocalHandle(username, domain, normalized, repository);
    }

    // Try finding by email in repository
    if (repository) {
      const user = await repository.getUserByEmail(normalized);
      if (user) {
        if (user.status !== "active") {
          return {
            identifier: normalized,
            canonicalAddress: normalized,
            account: user.address,
            resolved: false,
            status: user.status,
            publicKey: null,
            encryptionKeyVersion: null,
            policyEndpoint: `/api/v1/policies/${user.address}`,
            freshness: {
              resolvedAt: new Date().toISOString(),
              cached: false,
              ttlMs: this.defaultNegativeTtlMs,
              source: "stealth_local",
              expiresAt: new Date(Date.now() + this.defaultNegativeTtlMs).toISOString(),
            },
            error: {
              code: user.status,
              message: `Account is ${user.status}`,
            },
          };
        }

        const policy = await repository.getPolicy(user.address);
        const rawProfile = await repository.getProfile(user.userId);
        return {
          identifier: normalized,
          canonicalAddress: formatMailAddress(user.username),
          account: user.address,
          resolved: true,
          status: "active",
          publicKey: user.address,
          encryptionKeyVersion: 1,
          policyEndpoint: `/api/v1/policies/${user.address}`,
          policy,
          profile: rawProfile
            ? {
                userId: rawProfile.userId,
                username: rawProfile.username,
                displayName: rawProfile.displayName,
                avatarUrl: rawProfile.avatarUrl ?? null,
                bio: rawProfile.bio ?? null,
                createdAt: rawProfile.createdAt,
                updatedAt: rawProfile.updatedAt,
              }
            : null,
          freshness: {
            resolvedAt: new Date().toISOString(),
            cached: false,
            ttlMs: this.defaultPositiveTtlMs,
            source: "stealth_local",
            expiresAt: new Date(Date.now() + this.defaultPositiveTtlMs).toISOString(),
          },
        };
      }
    }

    return this.createErrorResult(
      normalized,
      normalized,
      "not_found",
      "Email recipient not found",
      "negative_cache",
      this.defaultNegativeTtlMs,
    );
  }

  /**
   * Resolves external Stellar Federation address (user*domain.com).
   */
  private async resolveFederationAddress(
    fedAddress: string,
    normalized: string,
    options: ResolverOptions,
    signal: AbortSignal,
  ): Promise<ResolvedIdentity> {
    const nowIso = new Date().toISOString();

    try {
      if (options.customFederationResolver) {
        const customRes = await options.customFederationResolver(fedAddress);
        if (customRes?.account_id) {
          return {
            identifier: normalized,
            canonicalAddress: fedAddress,
            account: customRes.account_id,
            resolved: true,
            status: "unknown",
            publicKey: customRes.account_id,
            encryptionKeyVersion: null,
            policyEndpoint: null,
            memo: customRes.memo,
            memoType: (customRes.memo_type as any) ?? undefined,
            freshness: {
              resolvedAt: nowIso,
              cached: false,
              ttlMs: this.defaultPositiveTtlMs,
              source: "stellar_federation",
              expiresAt: new Date(Date.now() + this.defaultPositiveTtlMs).toISOString(),
            },
          };
        }
      }

      // Use standard Stellar Federation resolver
      const fedRecord = await Federation.Server.resolve(fedAddress, {
        allowHttp: process.env.NODE_ENV === "test",
      });

      if (fedRecord && fedRecord.account_id) {
        return {
          identifier: normalized,
          canonicalAddress: fedAddress,
          account: fedRecord.account_id,
          resolved: true,
          status: "unknown",
          publicKey: fedRecord.account_id,
          encryptionKeyVersion: null,
          policyEndpoint: null,
          memo: fedRecord.memo,
          memoType: (fedRecord.memo_type as any) ?? undefined,
          freshness: {
            resolvedAt: nowIso,
            cached: false,
            ttlMs: this.defaultPositiveTtlMs,
            source: "stellar_federation",
            expiresAt: new Date(Date.now() + this.defaultPositiveTtlMs).toISOString(),
          },
        };
      }

      return this.createErrorResult(
        fedAddress,
        normalized,
        "not_found",
        "Federation account not found",
        "negative_cache",
        this.defaultNegativeTtlMs,
      );
    } catch (error: any) {
      if (signal.aborted) {
        throw new Error("Resolution timeout");
      }
      return this.createErrorResult(
        fedAddress,
        normalized,
        "not_found",
        error?.message || "Federation resolution failed",
        "negative_cache",
        this.defaultNegativeTtlMs,
      );
    }
  }

  /**
   * Helper to construct a standardized error result.
   */
  private createErrorResult(
    canonical: string,
    normalized: string,
    code: ResolutionError["code"],
    message: string,
    source: ResolutionFreshness["source"],
    ttlMs: number,
  ): ResolvedIdentity {
    const nowIso = new Date().toISOString();
    return {
      identifier: normalized,
      canonicalAddress: canonical,
      account: null,
      resolved: false,
      status: "unknown",
      publicKey: null,
      encryptionKeyVersion: null,
      policyEndpoint: null,
      freshness: {
        resolvedAt: nowIso,
        cached: false,
        ttlMs,
        source,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      },
      error: { code, message },
    };
  }

  /**
   * Caches a successful resolution result.
   */
  private setPositiveCache(key: string, result: ResolvedIdentity): void {
    if (this.positiveCache.size >= this.maxCacheSize) {
      // Evict oldest entry (FIFO / Map keys order)
      const oldestKey = this.positiveCache.keys().next().value;
      if (oldestKey) this.positiveCache.delete(oldestKey);
    }
    this.positiveCache.set(key, {
      result,
      expiresAt: Date.now() + this.defaultPositiveTtlMs,
    });
  }

  /**
   * Caches a negative resolution result.
   */
  private setNegativeCache(key: string, result: ResolvedIdentity): void {
    if (this.negativeCache.size >= this.maxCacheSize) {
      const oldestKey = this.negativeCache.keys().next().value;
      if (oldestKey) this.negativeCache.delete(oldestKey);
    }
    this.negativeCache.set(key, {
      result,
      expiresAt: Date.now() + this.defaultNegativeTtlMs,
    });
  }

  /**
   * Indexes a Stellar address to the cache keys that resolved to it.
   */
  private indexAddress(address: string, cacheKey: string): void {
    let keySet = this.addressToKeysIndex.get(address);
    if (!keySet) {
      keySet = new Set();
      this.addressToKeysIndex.set(address, keySet);
    }
    keySet.add(cacheKey);
  }

  /**
   * Revocation-aware invalidation: purges an identifier from cache.
   */
  public invalidate(identifier: string): void {
    const normalized = normalizeIdentifier(identifier);
    this.positiveCache.delete(normalized);
    this.negativeCache.delete(normalized);
  }

  /**
   * Revocation-aware invalidation: purges all cache entries associated with a Stellar account.
   */
  public invalidateAccount(address: string): void {
    const normalizedAddress = normalizeIdentifier(address);
    this.invalidate(normalizedAddress);

    const keys = this.addressToKeysIndex.get(address.toUpperCase());
    if (keys) {
      for (const k of keys) {
        this.positiveCache.delete(k);
        this.negativeCache.delete(k);
      }
      this.addressToKeysIndex.delete(address.toUpperCase());
    }
  }

  /**
   * Clears the entire cache.
   */
  public clearCache(): void {
    this.positiveCache.clear();
    this.negativeCache.clear();
    this.addressToKeysIndex.clear();
  }

  /**
   * Returns cache stats for telemetry and testing.
   */
  public getCacheStats(): { positiveSize: number; negativeSize: number } {
    return {
      positiveSize: this.positiveCache.size,
      negativeSize: this.negativeCache.size,
    };
  }
}

// Global default singleton instance
export const defaultIdentityResolver = new IdentityResolverService();
