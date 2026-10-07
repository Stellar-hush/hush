/**
 * Algorithm Suite Definition and Documentation
 *
 * This module serves as the normative reference for the cryptographic
 * algorithm suite used in Hush v1 envelopes. It centralizes the
 * documentation and rationale for the chosen primitives, ensuring
 * consistency between code, specification, and external implementations.
 *
 * ## Normative v1 Algorithm Suite
 *
 * **Encryption**: AES-256-GCM (Galois/Counter Mode)
 * - **Key size**: 256 bits (32 bytes)
 * - **Nonce size**: 96 bits (12 bytes), randomly generated per message
 * - **Authentication tag**: 128 bits (16 bytes), appended to ciphertext
 * - **Additional authenticated data (AAD)**: Attachment descriptors (canonicalized)
 *
 * **Key Derivation**: Native Web Crypto API key generation
 * - Symmetric keys generated via `crypto.subtle.generateKey`
 * - Keys are non-extractable for security (extractable=true only for envelope operations)
 *
 * **Content Commitment**: SHA-256
 * - Commitment format: `v1:sha256:hex:<64 hex characters>`
 * - Computed over the complete ciphertext (including GCM authentication tag)
 *
 * **Signature Scheme**: Ed25519 (for envelope payload signing)
 * - Signature size: 64 bytes (128 hex characters)
 * - Payload canonicalization: RFC 8785 (JSON Canonicalization Scheme)
 *
 * ## Design Rationale
 *
 * 1. **AES-256-GCM** was chosen for:
 *    - Native browser support via Web Crypto API (no external dependencies)
 *    - Hardware acceleration on modern platforms
 *    - AEAD (Authenticated Encryption with Associated Data) properties
 *    - NIST-approved and widely standardized (FIPS 140-2)
 *
 * 2. **Why not X25519-XSalsa20-Poly1305?**
 *    - While X25519-XSalsa20-Poly1305 is excellent for public-key encryption,
 *      Hush's architecture uses symmetric encryption with out-of-band
 *      key agreement (via Stellar identity keys and capability delegation).
 *    - AES-GCM provides equivalent security with better platform support.
 *
 * 3. **Extensibility**:
 *    - The suite registry (`suites.ts`) allows adding new algorithms in future
 *      envelope versions without breaking backward compatibility.
 *    - Deprecated suites can be marked as "deprecated" status, allowing
 *      decryption of old messages while preventing creation of new ones.
 *
 * ## Migration Path
 *
 * If a future version needs to support X25519-XSalsa20-Poly1305 or another
 * algorithm:
 *
 * 1. Add the new suite to `SUITE_REGISTRY.suites` with status="supported"
 * 2. Create a new version entry (e.g., "v2") linking to the new suite
 * 3. Implement encryption/decryption logic in `envelope.ts` / `open-envelope.ts`
 * 4. Mark the old suite as "deprecated" if needed (allows opening, blocks sealing)
 * 5. Update this documentation to reflect the new normative suite
 *
 * ## External Implementation Guidance
 *
 * Implementations in other languages/platforms must:
 *
 * - Use AES-256-GCM with 12-byte nonces (96 bits) for v1 envelopes
 * - Generate cryptographically secure random nonces (never reuse with same key)
 * - Include attachment descriptors as AAD (canonicalized via JCS)
 * - Verify the 16-byte authentication tag before decryption
 * - Validate content commitment matches SHA-256 of ciphertext+tag
 * - Reject any envelope with `algorithm` ≠ "AES-256-GCM" for v1
 * - Fail closed on unknown versions or unsupported suites
 *
 * ## References
 *
 * - NIST SP 800-38D: AES-GCM specification
 * - RFC 8785: JSON Canonicalization Scheme (JCS)
 * - RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)
 * - W3C Web Cryptography API: https://www.w3.org/TR/WebCryptoAPI/
 */

import { SUITE_REGISTRY, getDefaultSuite, getDefaultVersion } from "./suites";

/**
 * Get the normative algorithm suite for the current envelope version.
 * This is the single source of truth for what algorithm should be used
 * when sealing new envelopes.
 */
export function getNormativeV1Suite() {
  const suite = getDefaultSuite();
  const version = getDefaultVersion();

  if (version !== "v1") {
    throw new Error("Normative suite query is only valid for v1 envelopes");
  }

  return {
    version,
    algorithm: suite.name,
    keyBits: suite.keyBits,
    nonceBytes: suite.nonceBytes,
    webCryptoName: suite.webCryptoName,
  } as const;
}

/**
 * Get a human-readable description of the v1 algorithm suite.
 * Useful for UI display, documentation, and error messages.
 */
export function getAlgorithmSuiteDescription(): string {
  const suite = getNormativeV1Suite();
  return `${suite.algorithm} (${suite.keyBits}-bit key, ${suite.nonceBytes}-byte nonce)`;
}

/**
 * Validate that a given algorithm name matches the normative v1 suite.
 * Throws a descriptive error if the algorithm is not supported.
 */
export function assertNormativeAlgorithm(algorithm: string): void {
  const normative = getNormativeV1Suite();
  if (algorithm !== normative.algorithm) {
    throw new Error(
      `Unsupported algorithm: ${algorithm}. ` +
        `The normative v1 suite requires ${normative.algorithm}.`,
    );
  }
}

/**
 * Check if a given algorithm is the normative v1 algorithm.
 * Returns boolean without throwing.
 */
export function isNormativeV1Algorithm(algorithm: string): boolean {
  const normative = getNormativeV1Suite();
  return algorithm === normative.algorithm;
}

/**
 * Export the registry for external documentation/tooling.
 * This is the complete list of supported and deprecated suites.
 */
export const ALGORITHM_SUITE_REGISTRY = SUITE_REGISTRY;
