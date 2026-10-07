# Cryptographic Message Envelope Specification

To ensure interoperability across independent client implementations, the Hush protocol defines a single normative envelope and signature scheme.

## 1. Envelope Structure

The envelope is a JSON object with two top-level fields: `payload` and `signature`.

```json
{
  "payload": {
    "version": "v1",
    "sender": "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "recipient": "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    "timestamp": "2026-06-17T22:00:00Z",
    "encryption_metadata": {
      "algorithm": "AES-256-GCM",
      "nonce": "e3b0c44298fc1c149afbf4c8996fb924",
      "mac": "86355651ecbc6e969d27038e8e78e86c"
    },
    "content_commitment": "5b40cf39e4a86e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae29202",
    "attachments": [
      {
        "filename": "invoice.pdf",
        "content_type": "application/pdf",
        "size_bytes": 10240,
        "content_hash": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
      }
    ],
    "critical": ["custom_mandatory_header"]
  },
  "signature": {
    "scheme": "Ed25519",
    "value": "86355651ecbc6e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae2920286355651ecbc6e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae29202"
  }
}
```

### Fields

#### Payload

- `version` (string): The envelope format version (e.g. `"v1"`).
- `sender` (string): Stellar G-address of the sender.
- `recipient` (string): Stellar G-address of the recipient.
- `timestamp` (string): ISO 8601 UTC timestamp string.
- `encryption_metadata` (object): Encryption parameters.
  - `algorithm` (string): The normative v1 algorithm suite: `"AES-256-GCM"`.
  - `nonce` (string): 12-byte (24 hex characters) randomly generated nonce.
  - `mac` (string): 16-byte (32 hex characters) authentication tag from AES-GCM.
  - `ephemeral_public_key` (string, optional): Reserved for future public-key encryption suites.
  - `recipient_key_id` (string, optional): Identifier for recipient key (for key rotation).
  - `sender_key_id` (string, optional): Identifier for sender key (for key rotation).
- `content_commitment` (string): SHA-256 digest of the encrypted payload ciphertext.
- `attachments` (array): List of attachment descriptors.
  - `filename` (string): File name.
  - `content_type` (string): MIME type.
  - `size_bytes` (integer): Size of attachment in bytes.
  - `content_hash` (string): SHA-256 digest of the attachment data.
- `critical` (array of strings, optional): List of mandatory header names.

#### Signature

- `scheme` (string): The signature scheme (e.g., `"Ed25519"`).
- `value` (string): Hex-encoded signature bytes (128 hex characters for Ed25519).

---

## 2. Cryptographic Algorithm Suite (v1)

The normative algorithm suite for v1 envelopes is **AES-256-GCM**.

### Algorithm Parameters

- **Encryption**: AES-256-GCM (Galois/Counter Mode)
  - 256-bit symmetric key (randomly generated per envelope or derived via key agreement)
  - 96-bit (12-byte) nonce, randomly generated per encryption operation
  - 128-bit (16-byte) authentication tag, automatically appended by AES-GCM
  - Additional Authenticated Data (AAD): Canonicalized attachment descriptors

- **Content Commitment**: SHA-256 hash of the complete ciphertext (including authentication tag)

- **Signature Scheme**: Ed25519 over the canonicalized payload (see section 3)

### Design Rationale

AES-256-GCM was selected for v1 envelopes because:

1. **Native Platform Support**: Available in all modern browsers via Web Crypto API and in server environments
2. **Hardware Acceleration**: AES-NI instructions provide high performance on most platforms
3. **AEAD Properties**: Authenticated Encryption with Associated Data prevents tampering and provides integrity
4. **Standardization**: NIST-approved (FIPS 140-2), widely implemented, and well-studied

### Interoperability Requirements

Independent implementations MUST:

- Use AES-256-GCM with 12-byte random nonces for v1 envelopes
- Include attachment descriptors (canonicalized via JCS) as Additional Authenticated Data
- Verify the 16-byte authentication tag before accepting any decrypted plaintext
- Validate that `encryption_metadata.algorithm` exactly equals `"AES-256-GCM"`
- Reject envelopes with unknown or unsupported algorithm values (fail closed)

### Future Algorithm Suites

Future envelope versions MAY introduce additional algorithm suites (e.g., post-quantum algorithms, X25519-XSalsa20-Poly1305 for ephemeral key exchange). Implementations MUST explicitly check the `version` and `algorithm` fields and fail closed on unknown combinations.

---

## 3. Canonical Serialization (JCS)

To verify the signature, the `payload` object must be serialized to an unambiguous, canonical byte representation. Hush uses the **JSON Canonicalization Scheme (JCS)** as defined in [RFC 8785](https://tools.ietf.org/html/rfc8785).

Key JCS rules:

1. Object keys are sorted lexicographically by their UTF-16 code units.
2. No unnecessary whitespace (e.g. spaces, tab characters, newlines) is included around structural delimiters (`:`, `,`, `{`, `}`, `[`, `]`).
3. Strings are enclosed in double quotes (`"`), and standard JSON escaping is applied uniformly.
4. Boolean values are serialized as `true` or `false`, and null is `null`.

### Signature Coverage

The cryptographic signature covers the canonicalized byte representation of the `payload` object.

```text
signature = sign(private_key, jcs(payload))
```

---

## 4. Extensibility and Fail-Closed Validation

To allow safe feature updates, the envelope is extensible.

1. **Unknown Optional Fields**: An implementation may ignore any key in the `payload` that is not defined in this specification, _unless_ it is designated as critical.
2. **Unknown Mandatory Fields**: If a key name is listed in the `critical` array, the recipient implementation _must_ recognize and validate that field. If the parser encounters a field in `critical` that it does not recognize, validation must immediately fail (fail closed).
