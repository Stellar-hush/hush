/**
 * Address canonicalization helpers for the Hush authorization layer.
 *
 * Stellar addresses are case-sensitive by the protocol but user-supplied input
 * may contain leading/trailing whitespace or lowercase characters that an
 * attacker could exploit to bypass naïve string-equality checks.
 *
 * These utilities normalize actor addresses before any authorization comparison
 * so that alternate-form submissions (e.g., padded or lowercased addresses) are
 * resolved to the same canonical form and rejected correctly by ownership checks.
 *
 * Used by: authorization layer, security regression suite (BETA-084 / #1991).
 */

/**
 * Regular expression for a syntactically valid Stellar public key.
 *
 * A Stellar public key (G-address) is a 56-character base-32 encoded string
 * starting with 'G'. This is a structural check only — it does not validate
 * the checksum embedded in the Stellar strkey encoding.
 */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Normalize a user-supplied actor address to its canonical form.
 *
 * Steps applied:
 *   1. Trim leading and trailing whitespace (catches padding attacks).
 *   2. Uppercase the result (catches lowercase-bypass attacks).
 *
 * The function does NOT throw on invalid input — callers that require a valid
 * Stellar address should follow up with {@link assertCanonicalAddress}.
 *
 * @param address Raw address string from a request header or body.
 * @returns The trimmed, uppercased address string.
 */
export function normalizeActorAddress(address: string): string {
  return address.trim().toUpperCase();
}

/**
 * Return true when the provided string is a syntactically valid Stellar G-address
 * in its canonical (trimmed, uppercase) form.
 *
 * This is used in security tests to verify that canonicalized alternate forms
 * (e.g., padded or lowercase variants) either match or fail consistently.
 *
 * @param address Address string to validate — should already be normalized.
 */
export function isCanonicalStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address);
}

/**
 * Normalize and validate a Stellar address in one step.
 *
 * @throws {Error} When the normalized form is not a valid Stellar G-address.
 * @returns The canonical address string.
 */
export function canonicalizeAndValidate(address: string): string {
  const canonical = normalizeActorAddress(address);
  if (!isCanonicalStellarAddress(canonical)) {
    throw new Error(`Invalid Stellar address after canonicalization: "${canonical}"`);
  }
  return canonical;
}

/**
 * Determine whether two address strings refer to the same canonical identity.
 *
 * Both inputs are normalized before comparison, so whitespace-padded or
 * lowercase variants of the same address are treated as equal.
 *
 * @returns true when both addresses canonicalize to the same string.
 */
export function isSameCanonicalAddress(a: string, b: string): boolean {
  return normalizeActorAddress(a) === normalizeActorAddress(b);
}
