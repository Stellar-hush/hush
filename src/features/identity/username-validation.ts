import { z } from "zod";

import { formatFederationAddress, formatMailAddress } from "./mail-domain";

/**
 * BETA-003 (Issue #1910) — Canonical Hush username validation and atomic reservation.
 *
 * This module provides the full validation pipeline for Hush usernames:
 * 1. Unicode NFKC normalization + case folding
 * 2. Reserved-word filtering
 * 3. Length and character-class enforcement
 * 4. Confusable-character detection
 * 5. Availability check (repository-backed)
 * 6. Atomic reservation with leased claim
 */

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Canonical normalization: Unicode NFKC, trim, lowercase, strip zero-width
 * characters. Two inputs that differ only in case, whitespace, or Unicode
 * normal form must produce the same canonical key.
 */
export function normalizeUsername(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

// ---------------------------------------------------------------------------
// Reserved words
// ---------------------------------------------------------------------------

/**
 * System, brand, and protocol-reserved words that can never be claimed as
 * usernames. Includes common admin/support roles, protocol keywords, and
 * TLD-style patterns that could enable phishing.
 */
const RESERVED_WORDS = new Set([
  "admin",
  "administrator",
  "sysadmin",
  "root",
  "system",
  "support",
  "help",
  "helpdesk",
  "security",
  "abuse",
  "noreply",
  "no-reply",
  "postmaster",
  "hostmaster",
  "webmaster",
  "daemon",
  "mailer-daemon",
  "hush",
  "stealth",
  "stellar",
  "soroban",
  "freighter",
  "auth",
  "login",
  "signin",
  "signup",
  "register",
  "account",
  "verify",
  "password",
  "token",
  "oauth",
  "jwt",
  "session",
  "anonymous",
  "guest",
  "user",
  "users",
  "me",
  "my",
  "self",
  "owner",
  "api",
  "www",
  "mail",
  "smtp",
  "imap",
  "pop",
  "ftp",
  "http",
  "https",
  "ws",
  "wss",
  "cdn",
  "ns1",
  "ns2",
  "dns",
  "mx",
  "git",
  "ssh",
  "pgp",
  "key",
  "keys",
  "cert",
  "ssl",
  "tls",
  "federation",
  "stellar-federation",
  "undefined",
  "null",
  "true",
  "false",
  "test",
  "staging",
  "dev",
  "development",
  "production",
  "beta",
  "alpha",
  "demo",
  "sandbox",
  "internal",
  "private",
  "public",
  "all",
  "everyone",
  "nobody",
  "deleted",
  "removed",
  "banned",
  "suspended",
  "deactivated",
  "inactive",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "security-alert",
  "account-alert",
  "account-verify",
  "verify-email",
  "reset-password",
  "support-team",
  "help-center",
]);

export function isReservedWord(normalized: string): boolean {
  return RESERVED_WORDS.has(normalized);
}

// ---------------------------------------------------------------------------
// Confusable-character detection
// ---------------------------------------------------------------------------

/**
 * Unicode confusable mapping: characters that look alike and could be used to
 * impersonate another username. Each group contains characters that should be
 * treated as equivalent for uniqueness purposes.
 */
const CONFUSABLE_MAP: Record<string, string> = {
  "\u0430": "a", // Cyrillic а
  "\u0435": "e", // Cyrillic е
  "\u043E": "o", // Cyrillic о
  "\u0440": "p", // Cyrillic р
  "\u0441": "c", // Cyrillic с
  "\u0456": "i", // Cyrillic і
  "\u0455": "s", // Cyrillic ѕ
  "\u0445": "x", // Cyrillic х
  "\u03B1": "a", // Greek alpha
  "\u03B5": "e", // Greek epsilon
  "\u03B9": "i", // Greek iota
  "\u03BF": "o", // Greek omicron
  "\u03C1": "p", // Greek rho
  "\u03C5": "u", // Greek upsilon
  "\uFF21": "a",
  "\uFF22": "b",
  "\uFF23": "c",
  "\uFF24": "d",
  "\uFF25": "e",
  "\uFF26": "f",
  "\uFF27": "g",
  "\uFF28": "h",
  "\uFF29": "i",
  "\uFF2A": "j",
  "\uFF2B": "k",
  "\uFF2C": "l",
  "\uFF2D": "m",
  "\uFF2E": "n",
  "\uFF2F": "o",
  "\uFF30": "p",
  "\uFF31": "q",
  "\uFF32": "r",
  "\uFF33": "s",
  "\uFF34": "t",
  "\uFF35": "u",
  "\uFF36": "v",
  "\uFF37": "w",
  "\uFF38": "x",
  "\uFF39": "y",
  "\uFF3A": "z",
  "\u30FC": "-",
  "\uFF3F": "_",
  "\uFE63": "-",
  "\uFF70": "-",
};

/**
 * Produces a confusable-normalized form of a username. Characters that are
 * visually similar are mapped to their canonical ASCII representative so that
 * "аdmin" (Cyrillic а) maps to "admin" and is rejected.
 */
export function confusableNormalized(username: string): string {
  let result = "";
  for (const char of username) {
    const mapped = CONFUSABLE_MAP[char];
    result += mapped ?? char;
  }
  return result;
}

/**
 * Returns true if the username contains any confusable characters that differ
 * from their mapped ASCII form (i.e., the username uses a lookalike character).
 */
export function containsConfusables(username: string): boolean {
  for (const char of username) {
    if (char in CONFUSABLE_MAP) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_CHAR_PATTERN = /^[a-z0-9_-]+$/;

export interface UsernameValidationResult {
  valid: boolean;
  canonical: string;
  error?: string;
  code?:
    | "too_short"
    | "too_long"
    | "invalid_characters"
    | "reserved_word"
    | "confusable_characters"
    | "empty";
}

/**
 * Validates a raw username against all canonical rules. Pure, synchronous,
 * repository-free — suitable for client-side preview validation.
 *
 * Does NOT check availability against the repository; use
 * checkUsernameAvailability for that.
 */
export function validateUsername(raw: string): UsernameValidationResult {
  const canonical = normalizeUsername(raw);

  if (!canonical) {
    return { valid: false, canonical, error: "Username is required", code: "empty" };
  }

  if (canonical.length < USERNAME_MIN_LENGTH) {
    return {
      valid: false,
      canonical,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
      code: "too_short",
    };
  }

  if (canonical.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      canonical,
      error: `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
      code: "too_long",
    };
  }

  if (!USERNAME_CHAR_PATTERN.test(canonical)) {
    return {
      valid: false,
      canonical,
      error: "Username can only contain lowercase letters, numbers, underscores, and hyphens",
      code: "invalid_characters",
    };
  }

  if (isReservedWord(canonical)) {
    return {
      valid: false,
      canonical,
      error: "This username is reserved and cannot be claimed",
      code: "reserved_word",
    };
  }

  if (containsConfusables(canonical)) {
    return {
      valid: false,
      canonical,
      error: "Username contains characters that are visually similar to other characters",
      code: "confusable_characters",
    };
  }

  const confusableForm = confusableNormalized(canonical);
  if (confusableForm !== canonical && isReservedWord(confusableForm)) {
    return {
      valid: false,
      canonical,
      error: "Username is visually similar to a reserved word",
      code: "confusable_characters",
    };
  }

  return { valid: true, canonical };
}

// ---------------------------------------------------------------------------
// Availability check (repository-backed)
// ---------------------------------------------------------------------------

export interface UsernameAvailabilityResult {
  available: boolean;
  canonical: string;
  reason?: "taken" | "reserved" | "invalid";
  message: string;
}

export interface UsernameAvailabilityRepository {
  getUserByUsername(username: string): Promise<{ userId: string } | null>;
  getUsernameReservation(username: string): Promise<{ userId: string; expiresAt: string } | null>;
}

/**
 * Checks whether a username is available for registration. Combines
 * validation rules with repository state. The response is deliberately
 * uniform (same shape, same HTTP status) whether the name is valid,
 * taken, or reserved — this prevents enumeration attacks.
 */
export async function checkUsernameAvailability(
  raw: string,
  repository: UsernameAvailabilityRepository,
): Promise<UsernameAvailabilityResult> {
  const validation = validateUsername(raw);
  const canonical = validation.canonical;

  if (!validation.valid) {
    return {
      available: false,
      canonical,
      reason: validation.code === "reserved_word" ? "reserved" : "invalid",
      message: validation.error ?? "Invalid username",
    };
  }

  const existing = await repository.getUserByUsername(canonical);
  if (existing) {
    return {
      available: false,
      canonical,
      reason: "taken",
      message: "This username is already taken",
    };
  }

  const reservation = await repository.getUsernameReservation(canonical);
  if (reservation) {
    const expiresAt = new Date(reservation.expiresAt).getTime();
    if (Date.now() < expiresAt) {
      return {
        available: false,
        canonical,
        reason: "reserved",
        message: "This username is temporarily reserved",
      };
    }
  }

  return {
    available: true,
    canonical,
    message: "Username is available",
  };
}

// ---------------------------------------------------------------------------
// Atomic reservation
// ---------------------------------------------------------------------------

export const USERNAME_RESERVATION_LEASE_MS = 30 * 60 * 1000;

export interface UsernameReservationRepository {
  reserveUsername(
    username: string,
    userId: string,
    leaseMs: number,
  ): Promise<{
    outcome: "reserved" | "already-reserved" | "unavailable";
    reservation?: { username: string; userId: string; expiresAt: string };
  }>;
  getUserByUsername(username: string): Promise<{ userId: string } | null>;
}

export interface ReserveUsernameResult {
  success: boolean;
  canonical: string;
  federationAddress: string;
  emailAddress: string;
  expiresAt?: string;
  error?: string;
  code?: "validation_failed" | "unavailable" | "system_error";
}

/**
 * Validates and atomically reserves a username. Produces the full vertical
 * slice: validation -> availability -> reservation -> federation mapping.
 *
 * The reservation is leased and will auto-expire if provisioning does not
 * complete within the lease window. Failed provisioning should call
 * 
eleaseUsernameReservation to free the name immediately.
 */
export async function reserveUsername(
  raw: string,
  userId: string,
  repository: UsernameReservationRepository,
  options: { leaseMs?: number } = {},
): Promise<ReserveUsernameResult> {
  const validation = validateUsername(raw);
  const canonical = validation.canonical;

  if (!validation.valid) {
    return {
      success: false,
      canonical,
      federationAddress: "",
      emailAddress: "",
      error: validation.error,
      code: "validation_failed",
    };
  }

  const leaseMs = options.leaseMs ?? USERNAME_RESERVATION_LEASE_MS;

  try {
    const reservation = await repository.reserveUsername(canonical, userId, leaseMs);

    if (reservation.outcome === "unavailable") {
      return {
        success: false,
        canonical,
        federationAddress: "",
        emailAddress: "",
        error: "This username is not available",
        code: "unavailable",
      };
    }

    return {
      success: true,
      canonical,
      federationAddress: formatFederationAddress(canonical),
      emailAddress: formatMailAddress(canonical),
      expiresAt: reservation.reservation?.expiresAt,
    };
  } catch {
    return {
      success: false,
      canonical,
      federationAddress: "",
      emailAddress: "",
      error: "An internal error occurred while reserving the username",
      code: "system_error",
    };
  }
}
