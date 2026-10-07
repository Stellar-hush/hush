# Algorithm Suite Documentation

## Overview

This document provides the normative specification for the cryptographic algorithm suite used in Hush v1 message envelopes. It serves as the authoritative reference for:

- Independent client implementations
- Security audits
- Protocol evolution planning
- Interoperability testing

## v1 Normative Algorithm Suite

### Primary Algorithm: AES-256-GCM

Hush v1 envelopes use **AES-256-GCM** (Advanced Encryption Standard, 256-bit key, Galois/Counter Mode) as the sole supported encryption algorithm.

#### Parameters

| Parameter          | Value                     | Format                                            |
| ------------------ | ------------------------- | ------------------------------------------------- |
| Algorithm          | `AES-256-GCM`             | String literal in `encryption_metadata.algorithm` |
| Key Size           | 256 bits                  | 32 bytes                                          |
| Nonce Size         | 96 bits                   | 12 bytes (24 hex characters)                      |
| Authentication Tag | 128 bits                  | 16 bytes (32 hex characters)                      |
| Mode               | GCM (Galois/Counter Mode) | Provides AEAD properties                          |

#### Metadata Fields

Every v1 envelope MUST include the following `encryption_metadata` fields:

```json
{
  "algorithm": "AES-256-GCM",
  "nonce": "e3b0c44298fc1c149afbf4c8996fb924",
  "mac": "86355651ecbc6e969d27038e8e78e86c"
}
```

Optional fields:

- `recipient_key_id`: Identifier for the recipient's key (for key rotation scenarios)
- `sender_key_id`: Identifier for the sender's key
- `ephemeral_public_key`: Reserved for future public-key encryption suites (not used in v1)

### Additional Authenticated Data (AAD)

AES-GCM's AEAD properties are used to protect attachment metadata. The AAD consists of:

- Canonicalized attachment descriptors (JCS-serialized array of `{filename, content_type, size_bytes, content_hash}`)

This ensures attachment metadata cannot be tampered with or swapped without detection.

### Content Commitment

Every envelope includes a SHA-256 content commitment:

- **Format**: `v1:sha256:hex:<64 hex characters>`
- **Input**: Complete ciphertext including the 16-byte GCM authentication tag
- **Purpose**: Provides a reproducible hash for on-chain registration without revealing plaintext

Example:

```
v1:sha256:hex:5b40cf39e4a86e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae29202
```

## Design Rationale

### Why AES-256-GCM?

1. **Native Platform Support**
   - Available in all modern browsers via the Web Crypto API
   - No external dependencies or polyfills required
   - Consistent behavior across Chrome, Firefox, Safari, Edge

2. **Performance**
   - Hardware acceleration via AES-NI instructions on Intel/AMD CPUs
   - ARM CPUs also provide dedicated AES instructions
   - Significantly faster than software-only implementations

3. **Security Properties**
   - **AEAD (Authenticated Encryption with Associated Data)**: Provides both confidentiality and integrity
   - **128-bit authentication tag**: Prevents forgery attacks (probability of success: 2^-128)
   - **Nonce uniqueness enforcement**: Each message gets a fresh random nonce

4. **Standardization**
   - NIST-approved (FIPS 140-2)
   - ISO/IEC 19772:2009 standard
   - Extensively analyzed by the cryptographic community

5. **Industry Adoption**
   - Used by TLS 1.3, IPsec, SSH
   - Default choice for modern encrypted communications

### Why NOT X25519-XSalsa20-Poly1305?

The initial specification draft mentioned **X25519-XSalsa20-Poly1305**, but this was changed to **AES-256-GCM** for the following reasons:

1. **Architecture Mismatch**
   - X25519-XSalsa20-Poly1305 is designed for **public-key encryption** with ephemeral key exchange
   - Hush uses **symmetric encryption** with out-of-band key agreement via Stellar identity keys
   - Forcing X25519 into a symmetric-only flow would add complexity without security benefits

2. **Web Crypto API Limitations**
   - X25519 is not part of the Web Crypto API standard
   - XSalsa20-Poly1305 is not available in Web Crypto
   - Implementing these would require large JavaScript libraries (e.g., libsodium.js, TweetNaCl)
   - Bundle size and maintenance burden would increase significantly

3. **No Security Advantage**
   - Both AES-256-GCM and XSalsa20-Poly1305 provide equivalent security levels (256-bit keys)
   - Both provide AEAD properties
   - Hush's threat model doesn't require the specific properties of X25519 ephemeral keys

4. **Future-Proofing**
   - If ephemeral key exchange is needed in the future, it can be added as a separate v2 suite
   - The registry-based architecture supports multiple algorithms simultaneously
   - Migration paths are built into the suite validation logic

## Implementation Requirements

### For Encryption (Sealing)

Independent implementations MUST:

1. **Algorithm Validation**
   - Verify the envelope version is `v1`
   - Confirm the only permitted algorithm for v1 is `AES-256-GCM`
   - Reject any attempt to seal with an unsupported algorithm

2. **Key Generation**
   - Generate a fresh 256-bit AES key using a cryptographically secure random number generator
   - Keys MUST be generated per-envelope (not reused across messages)
   - Key derivation MAY be used (e.g., HKDF) if deriving from a master secret

3. **Nonce Generation**
   - Generate a fresh 12-byte nonce using a cryptographically secure RNG
   - Nonces MUST be unique per encryption operation with the same key
   - Never reuse a nonce with the same key (this breaks GCM security)

4. **AAD Construction**
   - Canonicalize attachment descriptors using RFC 8785 (JCS)
   - Pass the canonicalized byte string as AAD to AES-GCM
   - Empty array if no attachments: `[]`

5. **Encryption**
   - Encrypt the message body with AES-256-GCM
   - The ciphertext will include the 16-byte authentication tag appended automatically
   - Base64-encode the complete ciphertext (plaintext encrypted bytes + tag)

6. **Metadata Emission**
   - Set `encryption_metadata.algorithm` to exactly `"AES-256-GCM"`
   - Set `encryption_metadata.nonce` to the hex-encoded 12-byte nonce (24 hex chars)
   - Set `encryption_metadata.mac` to the hex-encoded 16-byte tag (32 hex chars)

7. **Content Commitment**
   - Compute SHA-256 over the complete ciphertext (including tag)
   - Format as `v1:sha256:hex:<64 hex characters>`

### For Decryption (Opening)

Independent implementations MUST:

1. **Version Validation**
   - Check `payload.version` is `v1`
   - Reject unknown versions with `crypto_version_error`

2. **Algorithm Validation**
   - Check `encryption_metadata.algorithm` is exactly `"AES-256-GCM"`
   - Reject unsupported algorithms with `crypto_algorithm_error`
   - Error messages MUST NOT leak algorithm names or key material

3. **Content Commitment Verification**
   - Parse the `content_commitment` field (format: `v1:sha256:hex:<hash>`)
   - Decode the base64 ciphertext
   - Compute SHA-256 over the decoded ciphertext bytes
   - Compare against the declared commitment
   - Reject on mismatch with `crypto_integrity_error`

4. **AAD Reconstruction**
   - Extract attachment descriptors from `payload.attachments`
   - Canonicalize using RFC 8785 (same as sealing)
   - Pass to AES-GCM as AAD

5. **Tag Verification**
   - Extract the last 16 bytes of the ciphertext as the GCM tag
   - Compare against `encryption_metadata.mac` (hex-decoded)
   - Use constant-time comparison to prevent timing attacks
   - Reject on mismatch with `crypto_integrity_error`

6. **Decryption**
   - Decode nonce from `encryption_metadata.nonce` (hex to 12 bytes)
   - Decrypt with AES-GCM using key, nonce, ciphertext, and AAD
   - Web Crypto API automatically verifies the tag; failure throws
   - On decryption failure, return `crypto_decrypt_error` (never reveal why)

7. **Fail-Closed Principles**
   - Any validation failure MUST abort immediately
   - Error messages MUST NOT contain plaintext, keys, or nonces
   - Use stable error codes (`crypto_version_error`, `crypto_algorithm_error`, etc.)

## Test Vectors

See `tests/unit/crypto/spec-compatibility.test.ts` for comprehensive test vectors covering:

- Metadata emission (algorithm, nonce, mac formats)
- Unsupported suite rejection
- Error stability (non-secret error messages)
- Round-trip encryption/decryption

## Future Algorithm Suites

### Adding New Suites

If a new algorithm needs to be supported (e.g., post-quantum encryption, X25519-based key exchange):

1. **Define the Suite**
   - Add entry to `SUITE_REGISTRY.suites` in `suites.ts`
   - Specify `name`, `keyBits`, `nonceBytes`, `webCryptoName`, `status`

2. **Create New Version**
   - Add a new version entry (e.g., `v2`) to `SUITE_REGISTRY.versions`
   - Link the new suite name to the version
   - Mark old suites as `deprecated` if needed (allows opening, blocks sealing)

3. **Implement Crypto Logic**
   - Add encryption path in `envelope.ts`
   - Add decryption path in `open-envelope.ts`
   - Handle algorithm-specific metadata (e.g., ephemeral keys for X25519)

4. **Update Documentation**
   - Update this file with the new normative suite
   - Update `protocol/messages/envelope_spec.md`
   - Add migration guide for old envelopes

5. **Add Tests**
   - Add suite-specific tests
   - Update `spec-compatibility.test.ts`
   - Ensure old envelopes still decrypt (backward compatibility)

### Migration Path Example

To add X25519-XSalsa20-Poly1305 as a v2 suite:

```typescript
// In suites.ts
export const SUITE_REGISTRY = {
  versions: [
    { version: "v1", suites: ["AES-256-GCM"], status: "supported" },
    {
      version: "v2",
      suites: ["X25519-XSalsa20-Poly1305"],
      status: "supported",
    },
  ],
  suites: [
    {
      name: "AES-256-GCM",
      keyBits: 256,
      nonceBytes: 12,
      webCryptoName: "AES-GCM",
      status: "supported", // Still allowed for v1
    },
    {
      name: "X25519-XSalsa20-Poly1305",
      keyBits: 256,
      nonceBytes: 24,
      webCryptoName: "XSalsa20-Poly1305",
      status: "supported",
    },
  ],
};
```

Old v1 envelopes continue to work, new v2 envelopes use X25519.

## Security Considerations

### Key Management

- **Key Rotation**: Use `recipient_key_id` and `sender_key_id` to support key rotation
- **Key Storage**: Keys MUST be stored securely (e.g., in browser IndexedDB with appropriate access controls)
- **Key Derivation**: If deriving keys from a master secret, use HKDF-SHA256 with appropriate context strings

### Nonce Uniqueness

- **Critical**: Never reuse a nonce with the same key under AES-GCM
- **Impact**: Nonce reuse breaks confidentiality and allows forgery attacks
- **Mitigation**: Always use a cryptographically secure RNG; consider counter-based nonces with proper state management

### Side-Channel Resistance

- **Constant-Time Comparison**: Always use constant-time comparison for MACs and tags
- **Memory Clearing**: Zero out plaintext and keys after use
- **Timing Attacks**: Decryption failures MUST take constant time regardless of failure reason

### Downgrade Protection

- **Fail-Closed**: Unknown algorithms MUST be rejected immediately
- **Version Enforcement**: Only explicitly supported versions are accepted
- **No Fallback**: Do not fall back to weaker algorithms on failure

## References

- [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final): AES-GCM specification
- [RFC 8785](https://tools.ietf.org/html/rfc8785): JSON Canonicalization Scheme (JCS)
- [RFC 8032](https://tools.ietf.org/html/rfc8032): Edwards-Curve Digital Signature Algorithm (EdDSA)
- [W3C Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)
- [FIPS 140-2](https://csrc.nist.gov/publications/detail/fips/140/2/final): Security Requirements for Cryptographic Modules

## Changelog

- **2026-01-XX**: Initial v1 specification with AES-256-GCM as normative suite
- **Note**: Previous draft mentioned X25519-XSalsa20-Poly1305 but was never implemented; aligned spec with implementation
