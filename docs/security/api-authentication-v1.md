# Signed API authentication protocol v1

Status: interoperability specification. The canonicalization and time-window rules are implemented
in `src/server/api/auth/signed-request.ts`. Mutating HTTP API routes resolve principals through
`authenticateSignedRequest()` in `src/server/api/auth/signed-request-verify.ts` (wired from
`extractPrincipal` / `getApiContext`). A non-production escape hatch
(`STEALTH_AUTH_ALLOW_HEADER_ONLY=1`, disabled when `STEALTH_AUTH_REQUIRE_SIGNED=1` or
`import.meta.env.PROD`) may accept bare `x-stealth-address` for local tests only.

## Protocol identifier and cryptography

Version 1 uses the domain separator `STEALTH-AUTH-V1`, SHA-256 body digests, and Ed25519 signatures.
The signer is the Stellar account in `x-stealth-address`, and the verifier must resolve an authorized
Ed25519 public key for that account. Clients must never transmit a secret seed. A server must reject
unknown versions rather than attempting a compatible interpretation.

## Required headers

| Header             | Requirement                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Host`             | Authority of the intended API server, without surrounding whitespace.                                                                                |
| `X-Hush-Address`   | Valid Stellar G-address whose authorized public key verifies the signature.                                                                          |
| `X-Hush-Nonce`     | Lowercase hexadecimal encoding of 32 cryptographically random bytes.                                                                                 |
| `X-Hush-Timestamp` | UTC RFC 3339 timestamp with millisecond precision, for example `2026-07-22T12:00:00.000Z`.                                                           |
| `X-Hush-Audience`  | Identifier of the deployment the signature is scoped to, for example `stealth-api.example.test`. Checked against the server's accepted audience set. |
| `X-Hush-Signature` | Base64 encoding of the 64-byte Ed25519 signature over the canonical request. It is transported but omitted from the canonical request.               |
| `Content-Type`     | Required by an endpoint when it has a body; use `application/json`. It is not signed in v1.                                                          |

Header names are case-insensitive on the wire. Signed header values are trimmed and internal runs of
ASCII space or tab become one space. Duplicate required headers are invalid and must be rejected
before canonicalization.

## Canonical request

The exact UTF-8 string contains these lines, with LF (`0x0a`) separators and no final LF:

```text
STEALTH-AUTH-V1
<UPPERCASE HTTP METHOD>
<PATH>?<CANONICAL QUERY>
host:<NORMALIZED VALUE>
x-stealth-address:<NORMALIZED VALUE>
x-stealth-nonce:<NORMALIZED VALUE>
x-stealth-timestamp:<NORMALIZED VALUE>
x-stealth-audience:<NORMALIZED VALUE>
host;x-stealth-address;x-stealth-nonce;x-stealth-timestamp;x-stealth-audience
<LOWERCASE SHA-256 HEX OF EXACT BODY BYTES>
```

The path is the URL pathname (or `/` when empty). Query names and values are decoded by the URL
parser, percent-encoded with UTF-8, sorted first by encoded name and then encoded value, and joined
with `&`; duplicate pairs are retained. Omit `?` when there is no query. The body digest covers the
exact bytes received, including an empty body, so JSON is not reparsed or reformatted.

The fields above are all required signed fields. Method, target, authority, actor, nonce, timestamp,
audience, and body are therefore bound to one signature and cannot be substituted independently: a
signature captured for one method, route, body, or audience fails verification for any other, and
reordering an equivalent request's query parameters or header whitespace never changes its canonical
string. `x-stealth-audience` in particular stops a signature that was scoped to one deployment (for
example staging) from being replayed against another that happens to trust the same signing key.

## Nonces, timestamps, and challenges

Clients generate every nonce with a cryptographically secure random generator. A nonce is scoped to
the signing actor and authentication purpose, stored in shared durable storage, and consumed with an
atomic compare-and-set only after all other checks succeed. The default challenge/request lifetime is
five minutes. Servers allow 30 seconds of clock skew on both inclusive boundaries:

```text
timestamp - 30 seconds <= server time <= timestamp + 5 minutes + 30 seconds
```

Thus a request exactly 30 seconds in the future or exactly 5 minutes 30 seconds old is valid. One
millisecond beyond either boundary is rejected. Deployments configure both durations with
`STEALTH_AUTH_CHALLENGE_LIFETIME_MS` and `STEALTH_AUTH_CLOCK_SKEW_MS`, and must publish their policy.
One configuration governs both challenge issuance and signed-request verification, so the two halves
of the protocol cannot disagree.

When a challenge carries an explicit expiry, that expiry is authoritative and replaces
`timestamp + lifetime` as the upper bound. Reconfiguring the lifetime therefore applies to challenges
issued afterwards and never retroactively extends or shortens ones already in flight. A challenge
nonce expires with its validity window and can never extend request validity.

## Verification and replay protection

The server performs these checks in order, without revealing whether an account or key exists:

1. Require one well-formed instance of every header and the supported version.
2. Validate `x-stealth-audience` against the deployment's accepted audience set
   (`validateSignedRequestAudience`) and reject before any other check if it does not match.
3. Parse the timestamp and reject requests outside the configured time window.
4. Validate the nonce format and load its actor-, purpose-, and expiry-bound challenge record.
5. Recreate the canonical request from the received method, URL, headers, and exact body bytes.
6. Resolve an authorized Ed25519 public key for `x-stealth-address`, decode the base64 signature, and
   verify it over the canonical request's UTF-8 bytes using a constant-time crypto implementation.
7. Atomically consume the nonce. Only the winning consumer proceeds; concurrent or later consumers
   are replay attempts.
8. Derive the authenticated actor from the verified account. Never accept a bare
   `x-stealth-address` as authentication at a public edge.

Failed format, time, key, or signature checks must not consume the nonce, allowing the legitimate
client to correct a transport error. A successful verification consumes it even if later endpoint
authorization or business validation fails.

## Error responses

Failures use the standard JSON API error envelope and do not echo signatures or nonce records.

| Condition                                                                                     | HTTP | Stable code               | `details.reason`     | Retry guidance                                      |
| --------------------------------------------------------------------------------------------- | ---: | ------------------------- | -------------------- | --------------------------------------------------- |
| Missing/malformed header, unknown version, wrong audience, invalid account, invalid signature |  401 | `unauthorized`            | —                    | Obtain a new challenge and sign again.              |
| Timestamp or challenge expired                                                                |  422 | `expired_challenge`       | `AUTH_EXPIRED`       | Obtain a new challenge.                             |
| Timestamp too far in the future                                                               |  422 | `challenge_not_yet_valid` | `AUTH_NOT_YET_VALID` | Correct the clock, then sign a fresh challenge.     |
| Unparseable or inverted challenge timestamps                                                  |  422 | `validation_error`        | —                    | Correct the request, then sign a fresh challenge.   |
| Nonce already consumed (replay)                                                               |  409 | `conflict`                | —                    | Never retry the signed request; obtain a new nonce. |
| Verified actor lacks endpoint permission                                                      |  403 | `forbidden`               | —                    | Do not retry unchanged.                             |
| Authentication rate limit exceeded                                                            |  429 | `too_many_requests`       | —                    | Honor `Retry-After`.                                |

Both timing failures share HTTP 422, so `details.reason` is what lets a client distinguish a clock
that is behind from one that is ahead without parsing prose.

Servers should keep client-facing authentication messages generic while recording a correlation ID
and specific internal reason. Logs must not contain raw signatures, secret material, or complete
challenge records.

## Executable vectors

[`signed-request-v1.json`](../../test-fixtures/auth/signed-request-v1.json) contains a valid request,
an invalid signature, a request cryptographically valid but scoped to a different `x-stealth-audience`,
an expired request, accepted and rejected clock-skew boundaries, and a first-use/replay pair, plus a
malformed request with a missing required header. Accepted vectors declare the expected authenticated
principal. All domains, identities, messages, nonces, signatures, and the public key are synthetic
examples. No private key or secret seed is included. `npm test` recreates each canonical string in
memory, verifies every Ed25519 result and expected principal, evaluates time boundaries, checks
`validateSignedRequestAudience` against the fixture's accepted audience, exercises replay state, and
confirms malformed input is rejected, so changes to implementation or fixtures fail together.

[`signed-request-binding.test.ts`](../../tests/unit/api/auth/signed-request-binding.test.ts) signs one
base request with a freshly generated Ed25519 key and proves end to end -- not just by comparing
canonical strings -- that the resulting signature fails verification once the method, route, query,
body, or audience changes, and that it still verifies for a request that is merely an equivalent
re-encoding (reordered query parameters, differently-cased or padded header values).
