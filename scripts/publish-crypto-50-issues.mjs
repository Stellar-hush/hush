import fs from "node:fs";

const issues = [
  {
    title: "Implement recipient-decryptable envelope key wrapping",
    evidence:
      "src/services/crypto/envelope.ts generates a fresh extractable AES-256-GCM key for each message but does not export, wrap, or transmit that key for the recipient.",
    problem:
      "The current ciphertext cannot be opened by the intended recipient because no recipient-bound key material is included in the sealed envelope.",
    implementation:
      "Add a crypto key-wrapping layer that derives or imports the recipient encryption public key, wraps the generated content-encryption key, and stores only the wrapped key plus required algorithm metadata in the envelope.",
    area: "src/services/crypto/key-wrap.ts",
    criteria: [
      "A recipient with the matching private key can recover the content key and decrypt the body.",
      "A non-recipient key cannot unwrap the content key.",
      "The raw content key is never serialized, logged, or returned from public APIs.",
      "Round-trip and wrong-key tests cover the complete flow.",
    ],
  },
  {
    title: "Add a complete openEnvelope decryption path",
    evidence:
      "The crypto folder currently exposes sealEnvelope only; there is no matching parser, verifier, key unwrap, or decrypt operation.",
    problem: "Inbound encrypted messages cannot be processed safely or consistently by the client.",
    implementation:
      "Create openEnvelope with strict parsing, version checks, recipient key resolution, key unwrapping, authenticated decryption, commitment validation, and typed results.",
    area: "src/services/crypto/open-envelope.ts",
    criteria: [
      "Valid envelopes decrypt to the original plaintext.",
      "Tampered payloads, ciphertext, tags, and wrapped keys fail closed.",
      "Errors are typed and do not expose plaintext or secret material.",
      "Tests cover valid, malformed, wrong-recipient, and corrupted inputs.",
    ],
  },
  {
    title: "Align the crypto implementation with the normative envelope algorithm suite",
    evidence:
      "envelope.ts emits AES-256-GCM metadata while protocol/messages/envelope_spec.md currently specifies X25519-XSalsa20-Poly1305 with an ephemeral public key.",
    problem:
      "Independent implementations cannot interoperate when the code and normative specification describe different cryptographic suites.",
    implementation:
      "Choose and document the supported v1 suite, update implementation and metadata accordingly, and add explicit migration handling for any previously emitted draft envelopes.",
    area: "src/services/crypto/algorithm-suite.ts",
    criteria: [
      "One normative v1 suite is defined in code and documentation.",
      "Emitted metadata matches the selected suite exactly.",
      "Unsupported suites return a stable error.",
      "Compatibility tests prevent future code/spec drift.",
    ],
  },
  {
    title: "Add authenticated additional data for envelope routing metadata",
    evidence:
      "The current AES-GCM call encrypts only the message body and does not pass sender, recipient, timestamp, version, or attachment descriptors as additional authenticated data.",
    problem:
      "Routing and policy metadata can be altered independently of ciphertext authentication unless separately protected and verified.",
    implementation:
      "Define a canonical protected-header structure and bind it to the AEAD operation as additional authenticated data during sealing and opening.",
    area: "src/services/crypto/aad.ts",
    criteria: [
      "Sender, recipient, version, timestamp, and protected attachment metadata are authenticated.",
      "Any protected-field mutation causes decryption failure.",
      "AAD encoding is deterministic.",
      "Test vectors cover field-by-field tampering.",
    ],
  },
  {
    title: "Replace the ad hoc canonicalizer with verified RFC 8785 JCS behavior",
    evidence:
      "canonicalizePayload implements a small RFC 8785-style recursive serializer but does not demonstrate full number, Unicode, escaping, and edge-case compliance.",
    problem:
      "Signature interoperability can fail across runtimes when canonical JSON behavior differs on valid edge cases.",
    implementation:
      "Adopt or implement a fully tested JCS encoder with explicit unsupported-value handling and deterministic UTF-8 byte output.",
    area: "src/services/crypto/jcs.ts",
    criteria: [
      "Official or equivalent RFC 8785 vectors pass.",
      "Unsupported values such as NaN, Infinity, BigInt, and undefined fail explicitly.",
      "Unicode and escaping behavior is deterministic across runtimes.",
      "The send pipeline signs canonical bytes from the shared encoder.",
    ],
  },
  {
    title: "Validate envelope payloads with a strict runtime schema before crypto operations",
    evidence:
      "Envelope interfaces are TypeScript-only and the current implementation does not perform runtime validation on untrusted envelope objects.",
    problem:
      "Malformed types, oversized strings, unknown critical fields, or invalid encodings can reach cryptographic operations and produce inconsistent failures.",
    implementation:
      "Add strict runtime schemas for sealed envelopes, payloads, encryption metadata, signatures, attachments, and version-specific fields.",
    area: "src/services/crypto/schema.ts",
    criteria: [
      "All untrusted envelopes are parsed before verification or decryption.",
      "Unknown critical fields fail closed.",
      "Bounds exist for every string, array, and encoded byte field.",
      "Schema tests cover malformed and boundary inputs.",
    ],
  },
  {
    title: "Create a typed cryptographic error taxonomy",
    evidence:
      "sealEnvelope currently throws generic Error instances and the send pipeline collapses encryption failures into a single generic message.",
    problem:
      "Callers cannot safely distinguish invalid input, unsupported versions, malformed encodings, verification failures, wrong recipients, and unavailable crypto primitives.",
    implementation:
      "Define non-secret CryptoError codes and typed result helpers, then map internal failures without exposing key material or plaintext.",
    area: "src/services/crypto/errors.ts",
    criteria: [
      "Stable codes cover parse, validation, algorithm, key, signature, commitment, and decrypt failures.",
      "Public messages contain no sensitive values.",
      "Callers can branch without parsing message text.",
      "Tests verify error mapping and redaction.",
    ],
  },
  {
    title: "Make content-encryption keys non-extractable by default",
    evidence:
      "The current AES key is generated with extractable set to true even though sealEnvelope does not intentionally export it.",
    problem:
      "Unnecessary key extractability increases the impact of accidental misuse or future code paths that expose raw key bytes.",
    implementation:
      "Generate non-extractable keys where the selected wrapping design permits, and isolate any required export inside a minimal auditable key-wrapping boundary.",
    area: "src/services/crypto/content-key.ts",
    criteria: [
      "Content keys are non-extractable outside the wrapping boundary.",
      "Public functions never expose CryptoKey or raw key material unnecessarily.",
      "The design works in supported browser runtimes.",
      "Tests assert extractability and allowed usages.",
    ],
  },
  {
    title: "Restrict generated cryptographic key usages to the minimum required operations",
    evidence:
      "sealEnvelope generates the content key with both encrypt and decrypt usages even though the sealing path only encrypts.",
    problem:
      "Over-broad CryptoKey usages weaken least-privilege guarantees and make misuse harder to detect.",
    implementation:
      "Create explicit key factories for sealing, opening, wrapping, unwrapping, signing, and verification with minimal usage sets.",
    area: "src/services/crypto/keys.ts",
    criteria: [
      "Each key type has the smallest valid usage list.",
      "Incorrect operations fail predictably.",
      "Factories document extractability and lifetime.",
      "Unit tests inspect usage restrictions.",
    ],
  },
  {
    title: "Add cryptographically secure message identifier generation to the crypto boundary",
    evidence:
      "The send pipeline falls back from crypto.randomUUID to Date.now plus Math.random when randomUUID is unavailable.",
    problem:
      "Predictable identifiers can increase collision and correlation risk and should not be used for security-sensitive message records.",
    implementation:
      "Provide a crypto-backed identifier helper using getRandomValues with a documented encoding and no Math.random fallback.",
    area: "src/services/crypto/random.ts",
    criteria: [
      "Identifiers use only cryptographically secure randomness.",
      "The format has documented entropy and length.",
      "Unsupported environments fail explicitly rather than downgrading.",
      "Collision and format tests cover large deterministic samples.",
    ],
  },
  {
    title: "Centralize secure nonce generation and validation",
    evidence:
      "The current implementation creates a 12-byte AES-GCM IV inline and serializes it as hex without a shared nonce policy.",
    problem:
      "Future algorithms and decrypt paths need consistent nonce lengths, uniqueness checks, encoding, and validation.",
    implementation:
      "Create algorithm-aware nonce helpers with secure generation, strict decoding, expected-length checks, and test seams.",
    area: "src/services/crypto/nonce.ts",
    criteria: [
      "Nonce length is derived from the selected algorithm suite.",
      "Malformed and wrong-length nonces fail before crypto calls.",
      "Production uses crypto.getRandomValues only.",
      "Tests cover deterministic injection without weakening production.",
    ],
  },
  {
    title: "Add strict hexadecimal and base64 codec helpers for cryptographic fields",
    evidence:
      "envelope.ts contains local toHex and toBase64 helpers but no shared strict decoders or canonical encoding rules.",
    problem:
      "Permissive or inconsistent decoding can accept malformed ciphertext, tags, signatures, nonces, and keys.",
    implementation:
      "Create shared codecs that validate alphabet, padding, case policy, byte length, and canonical round trips.",
    area: "src/services/crypto/codec.ts",
    criteria: [
      "Invalid characters and malformed padding are rejected.",
      "Expected byte lengths can be enforced by callers.",
      "Encoding is canonical and round-trippable.",
      "Property tests cover random byte arrays and malformed inputs.",
    ],
  },
  {
    title: "Separate the AES-GCM authentication tag from ciphertext consistently",
    evidence:
      "Web Crypto returns ciphertext with the GCM tag appended, while the envelope also stores the final 16 bytes separately as mac without removing them from ciphertext.",
    problem:
      "Duplicating tag bytes creates ambiguous wire semantics and can break independent decrypt implementations.",
    implementation:
      "Define whether ciphertext includes the tag or stores it separately, then enforce one representation in sealing, opening, schema, and documentation.",
    area: "src/services/crypto/aead.ts",
    criteria: [
      "The wire representation has one unambiguous tag rule.",
      "Seal and open share the same parser and formatter.",
      "Legacy draft data is handled or rejected explicitly.",
      "Interoperability tests verify exact bytes.",
    ],
  },
  {
    title: "Bind content commitments to a versioned digest format",
    evidence:
      "The current content_commitment is an unprefixed SHA-256 hex digest of the full Web Crypto output.",
    problem:
      "A bare digest does not identify its algorithm, byte representation, or exact committed object for future migrations.",
    implementation:
      "Introduce a versioned commitment descriptor defining algorithm, encoding, and commitment target, with strict verification before decryption.",
    area: "src/services/crypto/commitment.ts",
    criteria: [
      "Commitments identify digest algorithm and encoding.",
      "The committed byte sequence is precisely documented.",
      "Mismatches fail with a stable error.",
      "Vectors cover valid and tampered ciphertext.",
    ],
  },
  {
    title: "Encrypt attachment bytes instead of storing only attachment hashes",
    evidence:
      "Current attachment handling computes descriptors and hashes but does not encrypt or include attachment data in the sealed result.",
    problem:
      "Messages with attachments cannot provide confidential attachment delivery through the current envelope.",
    implementation:
      "Add encrypted attachment payloads or chunk references protected by the message key hierarchy, with authenticated descriptors and content commitments.",
    area: "src/services/crypto/attachments.ts",
    criteria: [
      "Attachment bytes are confidential and integrity-protected.",
      "Descriptor tampering is detected.",
      "The receiver can decrypt and verify each attachment independently.",
      "Tests cover zero, one, and multiple attachments.",
    ],
  },
  {
    title: "Remove filename-and-size fallback hashing for missing attachment data",
    evidence:
      "When attachment.data is absent, envelope.ts hashes filename plus size_bytes and records that value as content_hash.",
    problem:
      "A metadata-derived value is not a cryptographic commitment to the actual attachment content and can create false integrity claims.",
    implementation:
      "Require actual bytes or an externally verified content hash with explicit provenance before sealing an attachment descriptor.",
    area: "src/services/crypto/attachments.ts",
    criteria: [
      "No content_hash is synthesized from filename and size.",
      "Callers must supply bytes or a validated digest descriptor.",
      "Mismatch between bytes and supplied digest fails.",
      "Tests cover missing, valid, and inconsistent inputs.",
    ],
  },
  {
    title: "Add streaming attachment encryption for large files",
    evidence:
      "The current attachment input accepts complete ArrayBuffer values and the envelope implementation has no streaming crypto interface.",
    problem:
      "Large attachments can require excessive memory when fully buffered before encryption.",
    implementation:
      "Design chunked authenticated encryption with sequence numbers, per-chunk nonces, final manifest authentication, and cancellation support.",
    area: "src/services/crypto/attachment-stream.ts",
    criteria: [
      "Large attachments can encrypt without full-file buffering.",
      "Chunk reordering, truncation, duplication, and substitution are detected.",
      "Cancellation releases resources.",
      "Tests cover boundary chunk sizes and corrupted streams.",
    ],
  },
  {
    title: "Enforce cryptographic payload and attachment size limits",
    evidence:
      "sealEnvelope validates only that the body is non-empty and applies no byte limits to plaintext, ciphertext, filenames, metadata, or attachment arrays.",
    problem:
      "Unbounded inputs can cause memory pressure, slow hashing, and oversized relay payloads.",
    implementation:
      "Add centrally configured byte and count limits measured before expensive operations, with separate limits for body, attachments, metadata, and total envelope size.",
    area: "src/services/crypto/limits.ts",
    criteria: [
      "Limits are measured in encoded bytes where relevant.",
      "Oversized input fails before encryption or hashing completes.",
      "Boundary values are documented.",
      "Tests cover exact maximums and one-byte overflow.",
    ],
  },
  {
    title: "Support secure multi-recipient envelope encryption",
    evidence:
      "The send pipeline parses multiple recipients but passes only the first recipient to sealEnvelope.",
    problem:
      "Additional recipients are listed in outbox state without receiving decryptable key material.",
    implementation:
      "Encrypt the body once with one content key and create a recipient-specific wrapped-key entry for every validated recipient.",
    area: "src/services/crypto/multi-recipient.ts",
    criteria: [
      "Every recipient can unwrap the same content key independently.",
      "One recipient cannot use another recipient entry.",
      "Duplicate recipients are normalized and rejected or deduplicated deterministically.",
      "Tests cover multiple recipients and partial tampering.",
    ],
  },
  {
    title: "Hide recipient lists with privacy-preserving recipient key entries",
    evidence:
      "The current payload exposes a single plaintext recipient and a future multi-recipient design could expose the full recipient set.",
    problem:
      "Visible recipient lists leak social and organizational metadata even when message contents are encrypted.",
    implementation:
      "Design optional anonymous or privacy-preserving recipient key identifiers that allow local recipient matching without publishing the complete recipient list.",
    area: "src/services/crypto/recipient-privacy.ts",
    criteria: [
      "A recipient can locate its key entry efficiently.",
      "Unrelated observers cannot trivially enumerate all recipient addresses.",
      "Collision and false-match behavior is defined.",
      "Compatibility and threat-model documentation is included.",
    ],
  },
  {
    title: "Add sender-authenticated envelope signature verification",
    evidence:
      "The send pipeline obtains a wallet signature but the crypto folder has no signature verification function for inbound envelopes.",
    problem:
      "Recipients cannot establish that the claimed sender authorized the protected envelope payload.",
    implementation:
      "Add canonical-byte signature verification using the claimed Stellar account, strict signature decoding, signer-address matching, and domain separation.",
    area: "src/services/crypto/signature.ts",
    criteria: [
      "Valid Ed25519 signatures verify against the expected sender.",
      "Wrong signer, malformed signature, and changed payload fail.",
      "Verification does not trust signerAddress metadata alone.",
      "Test vectors cover valid and invalid signatures.",
    ],
  },
  {
    title: "Add domain separation to message-envelope signatures",
    evidence:
      "authorizeSend currently signs the canonical payload string directly with no protocol identifier, network, version, or operation prefix.",
    problem:
      "The same signed bytes could be misinterpreted by another feature or protocol context.",
    implementation:
      "Define a versioned signature preimage containing a fixed Hush domain tag, network identifier, operation type, and canonical payload bytes.",
    area: "src/services/crypto/signing-preimage.ts",
    criteria: [
      "Signatures are bound to the Hush envelope operation.",
      "Network and protocol version are included.",
      "Changing the domain tag invalidates verification.",
      "Preimage vectors are deterministic.",
    ],
  },
  {
    title: "Verify that wallet signer identity matches the envelope sender",
    evidence:
      "authorizeSend returns signerAddress and the send pipeline stores a signature, but no visible check compares signerAddress with input.sender before submission.",
    problem: "A connected wallet could sign an envelope claiming a different sender address.",
    implementation:
      "Normalize both addresses and reject signing results when the wallet signer is not the declared sender or an explicitly authorized delegate.",
    area: "src/services/crypto/sender-binding.ts",
    criteria: [
      "Direct sends require signer and sender equality.",
      "Delegated signing requires an explicit verified authorization input.",
      "Mismatch stops before persistence and relay submission.",
      "Tests cover matching, mismatch, and delegated cases.",
    ],
  },
  {
    title: "Add envelope signature coverage for ciphertext binding",
    evidence:
      "The wallet signs only the payload object while ciphertext is serialized as a separate top-level field during relay submission.",
    problem:
      "The signature format should make the exact relationship between payload commitments and transmitted ciphertext unambiguous.",
    implementation:
      "Define and verify a signed structure that binds the ciphertext commitment, protected headers, suite identifier, and version without signing plaintext.",
    area: "src/services/crypto/signed-envelope.ts",
    criteria: [
      "Replacing ciphertext invalidates either commitment verification or signature verification.",
      "The signed preimage is versioned and deterministic.",
      "Ciphertext bytes are not duplicated unnecessarily in the signature input.",
      "Tests cover substitution and commitment mismatch.",
    ],
  },
  {
    title: "Implement crypto suite version negotiation and fail-closed selection",
    evidence:
      "EnvelopePayload fixes version to v1 while encryption_metadata.algorithm is an unrestricted string.",
    problem:
      "Future algorithm upgrades require explicit supported-suite selection without downgrade attacks.",
    implementation:
      "Create a registry of supported envelope versions and algorithm suites with exact parameter requirements and a fail-closed negotiation policy.",
    area: "src/services/crypto/suites.ts",
    criteria: [
      "Only registered version-suite combinations are accepted.",
      "Unknown and deprecated suites return stable errors.",
      "Negotiation cannot silently downgrade security.",
      "Tests cover supported, unsupported, and downgrade scenarios.",
    ],
  },
  {
    title: "Add a crypto capability descriptor for supported clients",
    evidence:
      "The current crypto module has no machine-readable way to report supported envelope versions, algorithms, limits, or key formats.",
    problem:
      "Clients cannot safely determine whether they can exchange envelopes before attempting encryption.",
    implementation:
      "Expose a non-secret immutable capability descriptor generated from the crypto suite registry.",
    area: "src/services/crypto/capabilities.ts",
    criteria: [
      "Capabilities list supported versions, suites, key formats, and limits.",
      "Values are derived from one source of truth.",
      "Capabilities reveal no private keys or environment secrets.",
      "Tests detect drift between registry and descriptor.",
    ],
  },
  {
    title: "Add envelope timestamp validation with bounded clock skew",
    evidence:
      "sealEnvelope writes the current ISO timestamp, but the crypto folder has no validation for malformed, stale, or excessively future timestamps.",
    problem: "Signatures and replay controls need a clear temporal validity policy.",
    implementation:
      "Add strict UTC timestamp parsing and configurable age and future-skew checks using an injectable clock.",
    area: "src/services/crypto/time.ts",
    criteria: [
      "Malformed and non-UTC timestamps fail.",
      "Maximum age and future skew are configurable.",
      "Boundary behavior is deterministic.",
      "Tests use a controllable clock.",
    ],
  },
  {
    title: "Add replay-detection hooks for opened encrypted envelopes",
    evidence:
      "The crypto module creates timestamps and nonces but has no interface for detecting repeated message identities or envelope fingerprints.",
    problem:
      "A valid signed ciphertext can be submitted or processed multiple times unless higher layers receive a stable replay key.",
    implementation:
      "Derive a versioned envelope fingerprint and expose a replay-check interface without embedding storage concerns in primitive crypto code.",
    area: "src/services/crypto/fingerprint.ts",
    criteria: [
      "Identical protected envelopes produce the same fingerprint.",
      "Meaningful protected-field changes produce a different fingerprint.",
      "The fingerprint excludes plaintext.",
      "Tests cover deterministic and tampered cases.",
    ],
  },
  {
    title: "Create a secure recipient key-resolution interface",
    evidence:
      "The current crypto implementation has no abstraction for locating a recipient encryption public key or validating its provenance.",
    problem:
      "Key wrapping cannot be secure if arbitrary or stale recipient keys are accepted without identity binding.",
    implementation:
      "Define a resolver interface returning normalized key material, key identifier, validity period, provenance, and revocation status.",
    area: "src/services/crypto/key-resolver.ts",
    criteria: [
      "Resolved keys are bound to the requested recipient.",
      "Expired and revoked keys fail.",
      "Resolver output is validated before use.",
      "Tests use deterministic trusted and untrusted resolvers.",
    ],
  },
  {
    title: "Add cryptographic key identifiers and rotation metadata",
    evidence:
      "The current envelope metadata has an optional ephemeral_public_key but no stable recipient key identifier, issuance time, or rotation state.",
    problem:
      "Recipients with rotated or multiple device keys need to know which private key should unwrap an envelope.",
    implementation:
      "Define collision-resistant key identifiers and versioned key metadata for recipient and sender verification keys.",
    area: "src/services/crypto/key-id.ts",
    criteria: [
      "Key IDs are derived or assigned deterministically under a documented scheme.",
      "Envelopes identify the intended recipient key without exposing private material.",
      "Rotated keys can remain decryptable according to policy.",
      "Tests cover multiple keys and collisions.",
    ],
  },
  {
    title: "Add device-specific recipient encryption keys",
    evidence:
      "The current envelope model assumes one recipient address and has no device-key representation.",
    problem:
      "Users with multiple devices need decryptable messages without copying one long-lived private key to every device.",
    implementation:
      "Support multiple active device encryption keys per recipient and wrap the content key to each authorized device entry.",
    area: "src/services/crypto/device-keys.ts",
    criteria: [
      "Every active device key can decrypt new messages.",
      "Removed devices stop receiving new wrapped keys.",
      "Device identifiers reveal minimal metadata.",
      "Tests cover add, remove, and multi-device encryption.",
    ],
  },
  {
    title: "Add key revocation enforcement during envelope sealing",
    evidence: "There is no crypto-layer check for revoked recipient or signing keys.",
    problem:
      "Encrypting to a revoked key or accepting a revoked signer can preserve access that the user intended to terminate.",
    implementation:
      "Represent revocation status in trusted key-resolution results and enforce it consistently during sealing and opening.",
    area: "src/services/crypto/revocation.ts",
    criteria: [
      "Revoked recipient keys are not used for new envelopes.",
      "Revoked signer keys fail verification according to timestamp policy.",
      "Revocation decisions are testable with an injected clock.",
      "Errors do not leak sensitive directory data.",
    ],
  },
  {
    title: "Design a forward-secrecy-ready session key hierarchy",
    evidence:
      "The current implementation creates independent random content keys but has no session, chain, or ratchet abstraction.",
    problem:
      "Future compromise of a long-lived recipient key may expose previously captured wrapped message keys depending on the chosen wrapping scheme.",
    implementation:
      "Define an extensible key hierarchy and session interface that can support ephemeral agreement and future ratcheting without changing envelope primitives again.",
    area: "src/services/crypto/session.ts",
    criteria: [
      "Long-lived identity keys are separated from message content keys.",
      "Session state is versioned and serializable without plaintext.",
      "The initial design documents forward-secrecy guarantees and limitations.",
      "Deterministic tests cover key derivation boundaries.",
    ],
  },
  {
    title: "Add HKDF-based domain-separated key derivation helpers",
    evidence:
      "The current module generates one AES key directly and has no shared KDF for deriving distinct body, attachment, commitment, or wrapping subkeys.",
    problem:
      "Reusing one key across different cryptographic purposes can create unsafe coupling and blocks clean key hierarchy design.",
    implementation:
      "Implement HKDF helpers with explicit salt, context labels, output lengths, and suite binding.",
    area: "src/services/crypto/kdf.ts",
    criteria: [
      "Each purpose uses a unique fixed context label.",
      "Outputs are deterministic for vectors and distinct across purposes.",
      "Invalid lengths and missing context fail.",
      "RFC-compatible vectors pass.",
    ],
  },
  {
    title: "Use constant-time byte comparison for cryptographic values",
    evidence:
      "The current crypto folder has no shared comparison helper for commitments, tags, key identifiers, or signatures.",
    problem:
      "Ordinary string equality can introduce avoidable timing differences when comparing secret-derived values.",
    implementation:
      "Add a constant-time comparison helper for equal-length byte arrays and ensure decoders validate lengths before comparison.",
    area: "src/services/crypto/constant-time.ts",
    criteria: [
      "Equal and unequal same-length values are handled without early exit.",
      "Length mismatch follows a documented safe path.",
      "Call sites use decoded bytes rather than encoded strings.",
      "Tests cover all positions of first difference.",
    ],
  },
  {
    title: "Add best-effort secret buffer disposal utilities",
    evidence:
      "Plaintext Uint8Array values and temporary key-export buffers are created without a shared cleanup strategy.",
    problem:
      "JavaScript cannot guarantee memory erasure, but avoidable copies and long-lived buffers should still be minimized and cleared where practical.",
    implementation:
      "Create scoped utilities for zeroing mutable temporary buffers and document runtime limitations clearly.",
    area: "src/services/crypto/secret-buffer.ts",
    criteria: [
      "Temporary plaintext and raw-key byte arrays are cleared in finally blocks where possible.",
      "Utilities do not claim guaranteed erasure.",
      "Public APIs minimize secret copies.",
      "Tests verify observable zeroing for mutable buffers.",
    ],
  },
  {
    title: "Add browser and worker runtime compatibility checks for crypto primitives",
    evidence:
      "envelope.ts directly uses global crypto, btoa, TextEncoder, and Web Crypto without a capability check or adapter.",
    problem:
      "Different browser, worker, test, and server runtimes can fail in inconsistent ways or silently use incompatible APIs.",
    implementation:
      "Create a runtime crypto adapter that validates required primitives and exposes injectable implementations for tests.",
    area: "src/services/crypto/runtime.ts",
    criteria: [
      "Required primitives are checked before use.",
      "Unsupported runtimes return a typed capability error.",
      "Production never falls back to insecure randomness.",
      "Tests cover browser-like, worker-like, and missing-capability environments.",
    ],
  },
  {
    title: "Add deterministic cryptographic test-vector injection without production downgrades",
    evidence:
      "Current crypto functions call global randomness and Date directly, making exact vectors difficult to reproduce.",
    problem:
      "Interoperability and regression tests need deterministic nonces, keys, and timestamps while production must remain securely random.",
    implementation:
      "Introduce internal dependency injection for randomness and clock values that is inaccessible by default production entry points.",
    area: "src/services/crypto/testing.ts",
    criteria: [
      "Tests can reproduce exact envelopes byte-for-byte.",
      "Production entry points use secure defaults only.",
      "Test hooks cannot be activated by message input.",
      "Vectors cover sealing and opening.",
    ],
  },
  {
    title: "Add crypto round-trip tests for Unicode and binary edge cases",
    evidence:
      "The current body path uses TextEncoder but no dedicated crypto tests demonstrate behavior for Unicode normalization, null characters, or large multi-byte content.",
    problem:
      "Text encoding differences can change commitments, signatures, and decrypted content across clients.",
    implementation:
      "Create round-trip fixtures for multilingual text, combining characters, emoji, null bytes represented in strings, and boundary-size payloads.",
    area: "tests/unit/crypto/envelope-roundtrip.test.ts",
    criteria: [
      "Decrypted strings exactly match original code points.",
      "Canonicalization behavior is defined separately from plaintext normalization.",
      "Commitments remain deterministic.",
      "Fixtures run in all supported test environments.",
    ],
  },
  {
    title: "Add property-based tests for crypto codecs and envelope invariants",
    evidence:
      "The repository has protocol vectors but no visible property-based crypto suite for arbitrary byte arrays and envelope shapes.",
    problem:
      "Example tests can miss malformed encodings, boundary lengths, and unexpected combinations.",
    implementation:
      "Add bounded generators for bytes, nonces, ciphertexts, attachment descriptors, and versioned envelopes with reproducible seeds.",
    area: "tests/unit/crypto/property.test.ts",
    criteria: [
      "Encode-decode round trips hold for arbitrary bytes.",
      "Invalid lengths and alphabets are rejected.",
      "Seal-open invariants hold for generated valid inputs.",
      "Failures report reproducible seeds.",
    ],
  },
  {
    title: "Add bounded fuzz testing for encrypted envelope parsing",
    evidence:
      "Inbound envelope parsing is not yet implemented and no fuzz corpus exists for hostile cryptographic input.",
    problem:
      "Malformed nested JSON, oversized encodings, and corrupted crypto fields can reveal crashes or expensive parser behavior.",
    implementation:
      "Create a fixed CI fuzz corpus plus bounded mutation tests around schema parsing, decoding, verification, and decryption boundaries.",
    area: "tests/unit/crypto/fuzz.test.ts",
    criteria: [
      "Malformed inputs never crash the test process.",
      "Resource limits are enforced before expensive operations.",
      "Failures return typed errors only.",
      "The normal CI suite runs within a bounded duration.",
    ],
  },
  {
    title: "Add cryptographic negative tests for every protected envelope field",
    evidence: "The current implementation has no open path or systematic tamper matrix.",
    problem:
      "A field may accidentally remain unauthenticated unless every protected value is mutated independently in tests.",
    implementation:
      "Create a table-driven tamper suite covering version, sender, recipient, timestamp, algorithm, nonce, tag, key entries, commitments, attachments, and ciphertext.",
    area: "tests/unit/crypto/tamper-matrix.test.ts",
    criteria: [
      "Every protected field has at least one mutation case.",
      "All mutations fail at the expected verification stage.",
      "No failed case returns plaintext.",
      "The matrix is easy to extend with new fields.",
    ],
  },
  {
    title: "Add cryptographic performance benchmarks for message sealing and opening",
    evidence:
      "The repository has load testing but no focused measurements for crypto latency or allocation behavior.",
    problem:
      "Algorithm and attachment design choices need measurable budgets on representative devices and payload sizes.",
    implementation:
      "Add repeatable local benchmarks for key generation, wrapping, sealing, opening, hashing, canonicalization, and attachment chunking.",
    area: "src/services/crypto/benchmarks.ts",
    criteria: [
      "Benchmarks cover small, medium, and maximum supported messages.",
      "Results separate warm-up from measured runs.",
      "No benchmark logs plaintext or keys.",
      "Documentation states that CI thresholds account for runner variance.",
    ],
  },
  {
    title: "Add memory-usage safeguards for large encrypted messages",
    evidence:
      "The current implementation buffers plaintext, ciphertext, hashes, and base64 strings in memory at the same time.",
    problem:
      "Large messages can create multiple full-size copies and cause browser memory pressure.",
    implementation:
      "Measure allocation hotspots, reduce unnecessary conversions, prefer byte-oriented APIs, and integrate streaming where possible.",
    area: "src/services/crypto/memory.ts",
    criteria: [
      "The sealing path avoids redundant full-size copies where practical.",
      "Maximum supported payloads complete within a documented memory budget.",
      "Cancellation releases references promptly.",
      "Regression tests or benchmarks track allocation-sensitive paths.",
    ],
  },
  {
    title: "Add safe cryptographic telemetry without message or key leakage",
    evidence:
      "The crypto folder has no observability interface, while the send pipeline currently reports only generic stage failures.",
    problem:
      "Operators need failure rates and latency information without exposing addresses, ciphertext, signatures, nonces, or key identifiers.",
    implementation:
      "Define a narrow telemetry adapter emitting fixed event names, suite versions, duration buckets, and non-sensitive result codes.",
    area: "src/services/crypto/telemetry.ts",
    criteria: [
      "Telemetry contains no plaintext, ciphertext, keys, signatures, addresses, or raw identifiers.",
      "Metric labels have bounded cardinality.",
      "Telemetry failures never fail crypto operations.",
      "Redaction tests inspect emitted payloads.",
    ],
  },
  {
    title: "Add crypto configuration validation at application startup",
    evidence:
      "Algorithm identifiers, limits, and runtime capabilities are currently implicit in code and not validated as one configuration.",
    problem:
      "Misconfigured deployments may fail only when a user attempts to send or open a message.",
    implementation:
      "Create immutable crypto configuration validation for supported suites, limits, key resolvers, clocks, and runtime primitives.",
    area: "src/services/crypto/config.ts",
    criteria: [
      "Invalid combinations fail before serving crypto operations.",
      "Secret values are never included in validation errors.",
      "Development and production requirements are explicit.",
      "Tests cover valid and invalid configurations.",
    ],
  },
  {
    title: "Create a versioned encrypted-envelope migration layer",
    evidence:
      "EnvelopePayload is fixed to v1 and no migration or legacy parser exists despite current code/spec algorithm differences.",
    problem:
      "Existing draft or persisted envelopes can become unreadable when the format or suite changes.",
    implementation:
      "Add version-specific decoders and a migration boundary that preserves original authenticated bytes while producing a normalized internal model.",
    area: "src/services/crypto/migrations.ts",
    criteria: [
      "Each supported version has an isolated decoder.",
      "Unknown future versions fail closed.",
      "Migration never changes bytes before signature verification.",
      "Fixtures cover at least one legacy draft shape.",
    ],
  },
  {
    title: "Add critical-field enforcement to the crypto parser",
    evidence:
      "The normative specification defines a critical array and requires unknown mandatory fields to fail closed, but the current TypeScript payload omits critical.",
    problem: "Clients may ignore security-relevant extensions they do not understand.",
    implementation:
      "Represent critical fields in the runtime schema and validate them against the active version-suite registry before cryptographic processing.",
    area: "src/services/crypto/critical-fields.ts",
    criteria: [
      "Known critical fields are validated.",
      "Unknown critical names fail closed.",
      "Unknown optional fields follow the documented compatibility policy.",
      "Tests cover duplicates, missing fields, and unknown names.",
    ],
  },
  {
    title: "Normalize and validate sender and recipient identifiers before encryption",
    evidence:
      "sealEnvelope accepts sender and recipient strings without visible Stellar address or federation-address validation.",
    problem:
      "Invalid or non-canonical identifiers can be signed into envelopes and create mismatched key resolution or routing behavior.",
    implementation:
      "Add a crypto-boundary identifier normalizer that distinguishes account addresses from supported higher-level address forms and returns canonical identity data.",
    area: "src/services/crypto/identity.ts",
    criteria: [
      "Malformed identifiers fail before key lookup or encryption.",
      "Canonical account addresses are used for cryptographic binding.",
      "Display forms are not substituted for verified identities.",
      "Tests cover valid, malformed, and ambiguous forms.",
    ],
  },
  {
    title: "Authenticate attachment filenames and MIME types as protected metadata",
    evidence:
      "Attachment descriptors are placed in payload metadata, but current AEAD encryption does not bind them as additional authenticated data.",
    problem:
      "A modified filename or MIME type can mislead the receiving application even when attachment bytes remain unchanged.",
    implementation:
      "Canonicalize and authenticate attachment descriptors together with encrypted attachment commitments.",
    area: "src/services/crypto/attachment-metadata.ts",
    criteria: [
      "Filename, MIME type, size, ordering, and content commitment are authenticated.",
      "Metadata mutation fails verification.",
      "Unsafe filename normalization is handled before display, not inside cryptographic identity.",
      "Tests cover descriptor substitution and reordering.",
    ],
  },
  {
    title: "Add deterministic attachment ordering rules to sealed envelopes",
    evidence:
      "Attachments are emitted in caller-provided order with no documented canonical ordering or stable identifier.",
    problem:
      "Independent clients can produce different signatures and manifests for the same logical attachment set.",
    implementation:
      "Define whether attachment order is semantically significant; if not, assign stable attachment IDs and canonical ordering before signing.",
    area: "src/services/crypto/attachments.ts",
    criteria: [
      "Ordering semantics are explicit.",
      "Canonical manifests produce deterministic signed bytes.",
      "Duplicate attachment identifiers fail.",
      "Tests cover permutations and duplicates.",
    ],
  },
  {
    title: "Add detached encrypted payload support for relay-friendly large messages",
    evidence:
      "The current SealedEnvelope returns one base64 ciphertext string embedded in the relay JSON payload.",
    problem: "Large ciphertexts increase JSON overhead and may exceed relay or storage limits.",
    implementation:
      "Define a detached ciphertext reference format with authenticated digest, byte length, content type, and retrieval binding.",
    area: "src/services/crypto/detached-payload.ts",
    criteria: [
      "The envelope authenticates the detached object digest and size.",
      "Object substitution and truncation fail.",
      "Inline and detached modes are versioned explicitly.",
      "Tests cover retrieval mismatch and unavailable objects.",
    ],
  },
  {
    title: "Add encrypted subject support to prevent metadata leakage",
    evidence:
      "The send pipeline encrypts only body while subject is persisted separately in outbox state and is not part of the sealed payload.",
    problem:
      "Subjects often contain sensitive message content and should not remain plaintext by default.",
    implementation:
      "Move subject into the encrypted content structure and expose only an optional privacy-preserving placeholder outside ciphertext.",
    area: "src/services/crypto/message-content.ts",
    criteria: [
      "Subject and body are encrypted together or under derived subkeys.",
      "The relay envelope does not require plaintext subject.",
      "Backward compatibility is explicit.",
      "Round-trip tests cover empty and Unicode subjects.",
    ],
  },
  {
    title: "Define a structured encrypted message-content format",
    evidence:
      "sealEnvelope currently encrypts a raw body string only, while subject and future message fields live outside the ciphertext.",
    problem:
      "Adding rich content later without a structured plaintext schema will create incompatible ad hoc encodings.",
    implementation:
      "Define a versioned internal plaintext object for subject, body, content type, optional reply metadata, and encrypted attachment manifest references.",
    area: "src/services/crypto/message-content.ts",
    criteria: [
      "The plaintext format has its own version.",
      "Unknown critical plaintext fields fail after decryption.",
      "Encoding is deterministic where commitments require it.",
      "Tests cover encode-decode and migration.",
    ],
  },
  {
    title: "Add secure reply-to cryptographic binding",
    evidence:
      "The current encrypted body format has no authenticated relationship to a prior message identifier or envelope fingerprint.",
    problem: "Reply threading can be forged or detached from the message being answered.",
    implementation:
      "Add an optional encrypted reply reference bound to the parent envelope fingerprint and sender-visible policy.",
    area: "src/services/crypto/thread-binding.ts",
    criteria: [
      "Reply references use stable parent fingerprints.",
      "Tampering with the reference fails authenticated decryption.",
      "Absence remains valid for new threads.",
      "Tests cover valid, wrong-parent, and malformed references.",
    ],
  },
  {
    title: "Add crypto-safe handling for empty and whitespace-only message content",
    evidence:
      "sealEnvelope rejects any body whose trimmed value is empty, even though future encrypted subjects, attachments, or structured content may make a message meaningful.",
    problem:
      "Validation is tied to one raw string instead of the complete encrypted content model.",
    implementation:
      "Move content-presence rules into the structured message-content schema and distinguish intentionally empty body from absent meaningful content.",
    area: "src/services/crypto/message-content.ts",
    criteria: [
      "Attachment-only or subject-only messages follow an explicit policy.",
      "Whitespace is preserved when valid content exists.",
      "Completely empty content fails with a typed validation error.",
      "Tests cover all combinations.",
    ],
  },
  {
    title: "Add a crypto conformance suite for seal, sign, verify, and open",
    evidence:
      "Existing protocol issues cover broad interoperability vectors, but the current crypto implementation lacks a complete executable lifecycle suite.",
    problem:
      "Individual helper tests do not prove that the entire client crypto pipeline interoperates and fails closed.",
    implementation:
      "Create a conformance harness that executes deterministic sealing, key wrapping, signing, parsing, verification, opening, attachment handling, and tamper rejection.",
    area: "tests/unit/crypto/conformance.test.ts",
    criteria: [
      "The suite covers at least one complete valid lifecycle.",
      "Every cryptographic stage has a negative vector.",
      "Expected bytes and errors are stable.",
      "Fixtures are language-neutral where possible.",
    ],
  },
  {
    title: "Document the crypto threat model and explicit non-goals",
    evidence:
      "The crypto implementation contains security comments but no folder-level threat model covering metadata, key compromise, malicious relays, compromised devices, and replay.",
    problem:
      "Contributors cannot evaluate whether new crypto changes preserve the intended security properties.",
    implementation:
      "Add a threat model describing assets, trust boundaries, attacker capabilities, protected metadata, key lifecycle assumptions, and acknowledged limitations.",
    area: "src/services/crypto/THREAT_MODEL.md",
    criteria: [
      "The model covers client, wallet, relay, storage, and recipient-key directory trust boundaries.",
      "Confidentiality, integrity, authenticity, replay, and metadata goals are explicit.",
      "Non-goals and residual risks are stated.",
      "Each major crypto module links to relevant assumptions.",
    ],
  },
  {
    title: "Add crypto module architecture and dependency-boundary documentation",
    evidence:
      "src/services/crypto currently has one envelope file and no documented internal layering for primitives, formats, keys, and orchestration.",
    problem:
      "Future contributors may mix protocol parsing, key resolution, storage, UI, and cryptographic primitives in unsafe ways.",
    implementation:
      "Define module boundaries for codecs, schemas, primitives, key management, envelope orchestration, testing seams, and integrations.",
    area: "src/services/crypto/README.md",
    criteria: [
      "Allowed dependency directions are documented.",
      "Primitive modules do not import UI, relay, or storage layers.",
      "Public entry points and internal-only helpers are identified.",
      "A folder-level testing strategy is included.",
    ],
  },
  {
    title: "Add a crypto security review checklist for pull requests",
    evidence:
      "The repository has general contribution workflows but no focused checklist for changes to encryption, signatures, key handling, canonicalization, or randomness.",
    problem: "Security-sensitive regressions can enter through apparently small refactors.",
    implementation:
      "Create a concise review checklist covering algorithm changes, nonce uniqueness, key usage, secret exposure, canonical bytes, compatibility, negative tests, and documentation.",
    area: "src/services/crypto/SECURITY_REVIEW.md",
    criteria: [
      "The checklist is specific to this crypto subsystem.",
      "It distinguishes mandatory review items from optional guidance.",
      "It links to conformance and threat-model documents.",
      "Future crypto issues reference the checklist.",
    ],
  },
  {
    title: "Add CI drift checks between crypto code and envelope specification",
    evidence:
      "The current code and envelope specification already disagree on the algorithm suite and metadata shape.",
    problem: "Documentation and implementation can diverge again without automated checks.",
    implementation:
      "Generate or validate machine-readable suite metadata and schemas from a shared source, then fail CI when docs, runtime schema, and emitted values disagree.",
    area: "src/services/crypto/spec-consistency.ts",
    criteria: [
      "Supported version and suite identifiers have one source of truth.",
      "Runtime schema and documentation examples are validated.",
      "Intentional changes require fixture updates.",
      "CI reports exact drift locations.",
    ],
  },
  {
    title: "Add crypto release compatibility gates for persisted envelopes",
    evidence:
      "Encrypted envelopes are persisted in outbox state, but there is no release gate proving that new code can still parse and open supported historical fixtures.",
    problem: "A deployment can make users unable to read previously stored messages.",
    implementation:
      "Maintain historical encrypted fixtures and run backward-compatibility open tests before release.",
    area: "tests/unit/crypto/compatibility.test.ts",
    criteria: [
      "Every supported envelope version has at least one historical fixture.",
      "New releases must open all supported fixtures.",
      "Removed support requires an explicit migration and release note.",
      "Fixtures contain no real user secrets.",
    ],
  },
  {
    title: "Add a production-ready crypto facade with narrow public APIs",
    evidence:
      "The current module exports low-level payload types, canonicalization, and sealEnvelope directly from one file.",
    problem:
      "Callers can become coupled to internal representations and bypass validation, suite selection, or safe defaults.",
    implementation:
      "Expose a narrow facade for seal, verify, open, capabilities, and typed errors while keeping primitives and internal formats non-public.",
    area: "src/services/crypto/index.ts",
    criteria: [
      "Public APIs accept validated high-level inputs.",
      "Internal key and primitive helpers are not exported accidentally.",
      "Safe defaults are mandatory.",
      "An API-surface test detects unintended exports.",
    ],
  },
];

if (issues.length !== 50) {
  throw new Error(`Expected 50 crypto issues, found ${issues.length}`);
}
if (new Set(issues.map((issue) => issue.title)).size !== issues.length) {
  throw new Error("Duplicate crypto issue titles found");
}

const requiredLabels = [
  "Maybe Rewarded",
  "GrantFox OSS",
  "Official Campaign | FWC26",
  "cryptography",
];

function body(issue) {
  return [
    "## Repository evidence",
    issue.evidence,
    "",
    "## Problem",
    issue.problem,
    "",
    "## Proposed implementation",
    issue.implementation,
    "",
    "## Acceptance criteria",
    ...issue.criteria.map((item) => `- [ ] ${item}`),
    "",
    "## Implementation scope",
    `Primary area: \`${issue.area}\``,
    "",
    "Keep implementation inside `src/services/crypto/` and directly related crypto tests or documentation. Do not modify API, Soroban contract, relay, UI, routing, or unrelated feature folders unless a separately approved integration issue explicitly requires it.",
  ].join("\n");
}

const output = issues.map((issue, index) => ({
  draft_id: `CRYPTO-${String(index + 1).padStart(3, "0")}`,
  title: issue.title,
  body: body(issue),
  labels: requiredLabels,
  area: issue.area,
}));

fs.writeFileSync(
  "stealth-crypto-50-issue-drafts.json",
  JSON.stringify(
    {
      repository: "Stellar-Mail/stealth",
      workstream: "src/services/crypto",
      count: output.length,
      issues: output,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Generated ${output.length} crypto issue drafts.`);
