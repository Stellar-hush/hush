# Hush Mail API

The TanStack Start worker exposes versioned endpoints under `/api/v1`.

## Endpoint groups

- Operations: `GET /health`, `GET /health?check=readiness`, `GET /protocol`, `GET /openapi.json`
- Policy: read or replace mailbox defaults, manage sender overrides, and evaluate admission
- Postage: quote, submit, retrieve, settle, and refund message postage
- Receipts: record delivery, retrieve participant state, and acknowledge reads

Amounts are decimal strings in stroops because Soroban uses i128 values that can exceed JavaScript's
safe integer range. Message IDs and payment hashes are lowercase 32-byte hexadecimal strings.

## Response headers

All JSON API responses include `Content-Type: application/json; charset=utf-8`, `Cache-Control`,
`X-Request-ID`, and `X-Content-Type-Options: nosniff`. The security header is applied centrally and
cannot be overridden by individual routes. CORS headers remain independently configurable and are
preserved when responses are created.

## Idempotency

Certain endpoints support idempotency via the optional `X-Idempotency-Key` header to ensure safe
retry behavior during network failures or race conditions. Currently supported:

- `POST /api/v1/postage/` - Postage submission
- `POST /api/v1/postage/:messageId/settle` - Postage settlement
- `POST /api/v1/postage/:messageId/refund` - Postage refund

See [SETTLEMENT_IDEMPOTENCY.md](./SETTLEMENT_IDEMPOTENCY.md) and [REFUND_IDEMPOTENCY.md](./REFUND_IDEMPOTENCY.md) for detailed documentation on
idempotency semantics, retry scenarios, and client best practices.

## Input Validation

Endpoints enforce strict validation for Stellar addresses and other identifiers:

- `POST /api/v1/postage/quote` - Quote request validation

See [POSTAGE_QUOTE_VALIDATION.md](./POSTAGE_QUOTE_VALIDATION.md) for comprehensive documentation on
validation rules, error responses, and boundary cases.

Query strings for every endpoint are normalized and validated (length limits, empty-name and
control-character rejection, and Unicode NFC normalization) before schema parsing. See
[QUERY_NORMALIZATION.md](./QUERY_NORMALIZATION.md) for the rules and configuration.

## Development identity

Protected endpoints require `x-stealth-address` with the Stellar address acting on the request.
This header only preserves authorization boundaries during development. It is not authentication.
Production must derive the actor from a verified wallet challenge or signed session and must ignore
caller-supplied identity headers at the public edge.

### Authentication challenge validity

Signed authentication challenges are valid for five minutes by default, with 30 seconds of
client/server clock-skew tolerance on both ends of the window. Deployments can change these values
with `STEALTH_AUTH_CHALLENGE_LIFETIME_MS` and `STEALTH_AUTH_CLOCK_SKEW_MS`; both values are integer
milliseconds. The complete configuration rules are documented in [`src/config/README.md`](../../src/config/README.md).

The same window governs signed requests, so a request and the challenge it carries are never judged
against different durations.

A challenge is validated against the expiry it was issued with. Reconfiguring
`STEALTH_AUTH_CHALLENGE_LIFETIME_MS` therefore applies to challenges issued afterwards and never
retroactively extends or shortens ones already in flight; the configured lifetime is the fallback
when no expiry was stamped.

Challenges older than the window fail with the machine-readable error code `expired_challenge` and
the reason `AUTH_EXPIRED`. Challenges dated farther into the future than the allowed skew fail with
`challenge_not_yet_valid` and the reason `AUTH_NOT_YET_VALID`. Both errors use HTTP 422 and the
standard API error envelope, and carry the reason in `details.reason` so a client can tell "your
clock is behind" from "your clock is ahead" without parsing prose.

### Authentication nonce lifecycle

Signed authentication begins by issuing a cryptographically random 32-byte nonce. Each nonce is
stored with its actor, authentication purpose, creation time, and expiration time. Its lifetime is
five minutes by default and can be configured with `STEALTH_AUTH_NONCE_TTL_MS` as documented in
[`src/config/README.md`](../../src/config/README.md).

Consumption atomically checks the actor, purpose, and expiration before marking the nonce used.
Only one concurrent request can succeed; replay attempts are rejected, and actor or purpose
mismatches do not consume the legitimate caller's nonce. Production storage adapters must provide
the same atomic compare-and-consume guarantee as the in-memory development implementation.

The versioned production signing contract, verification order, validity windows, replay rules, and
executable examples are in the [signed API authentication protocol v1](../security/api-authentication-v1.md).

```bash
curl -X PUT http://localhost:8080/api/v1/policies/GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
  -H "content-type: application/json" \
  -H "x-stealth-address: GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
  -d '{"allowUnknown":true,"requireVerified":true,"minimumPostage":"10000000"}'
```

## Persistence and chain integration

The current repository adapter is process-memory storage for local endpoint development. Before
production deployment, replace it with a Cloudflare Durable Object, D1, or another durable adapter.
The production postage adapter must verify `paymentHash` against Stellar before accepting a proof,
and mutations must submit or reconcile with the Soroban contracts rather than treating memory state
as chain truth.

Rate limiting, replay-resistant signed authentication, idempotency keys, durable persistence, and
contract event reconciliation remain required production gates.
