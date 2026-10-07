# Self-hosted verification delivery (BETA-091)

Verification and password-reset messages must leave Hush through an **administrator-owned SMTP** endpoint. Do not configure Resend or another paid sending API as the production transport.

## Vendor-neutral configuration

| Variable                         | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `STEALTH_NOTIFICATION_TRANSPORT` | `smtp` (production) or `sink` (local capture only) |
| `STEALTH_SMTP_HOST`              | Administrator SMTP hostname                        |
| `STEALTH_SMTP_PORT`              | Usually `587` (STARTTLS) or `465` (implicit TLS)   |
| `STEALTH_SMTP_SECURE`            | `true` for port 465                                |
| `STEALTH_SMTP_STARTTLS`          | `true` for port 587 (default when not 465)         |
| `STEALTH_SMTP_USERNAME`          | Optional AUTH PLAIN username                       |
| `STEALTH_SMTP_PASSWORD`          | Secret — never commit; required in production      |
| `STEALTH_NOTIFICATION_FROM`      | Envelope / From address (align with SPF)           |

Switch vendors by changing host/port/credentials only. Application code stays transport-pluggable via `createNotificationAdapter`.

## STARTTLS and TLS validation

1. Prefer port **587 + STARTTLS** with certificate validation (`rejectUnauthorized`).
2. Prefer port **465** only when the MTA requires implicit TLS.
3. Never send `AUTH PLAIN` on a cleartext session.
4. Probe reachability without presenting credentials:

```bash
# Banner probe (no AUTH). Replace host/port for your MTA.
node scripts/verify-smtp-delivery.mjs --probe-only
```

## DKIM / SPF / DMARC (repository-side checklist)

These controls live on your DNS + MTA. Hush does not embed private DKIM keys. Record redacted evidence in the PR; never paste private keys.

### SPF

```bash
dig +short TXT your-sending-domain.example
# Expect a TXT record that includes `v=spf1` and your MTA / relay IPs.
```

### DKIM

```bash
dig +short TXT selector._domainkey.your-sending-domain.example
# Expect `v=DKIM1; k=rsa; p=...` (public key only).
```

Confirm the MTA signs outbound mail with the same selector. Keep the private key in the secret store rotated under BETA-077 — never in git.

### DMARC

```bash
dig +short TXT _dmarc.your-sending-domain.example
# Expect `v=DMARC1; p=quarantine` (or `reject` after warm-up) and a rua mailbox you control.
```

### Alignment check

Send one controlled message to a catch-all you own, then inspect `Authentication-Results` for `spf=pass`, `dkim=pass`, and `dmarc=pass`. Redact message bodies and tokens before attaching evidence.

## Queues, retries, and bounce handling

Runtime behavior (see `src/services/notifications/`):

- Delivery states: `queued` → `accepted`/`sent` → `delivered` | `deferred`/`soft_bounce` | `hard_bounce` | `rejected` | `complaint` | `unsubscribed` | `failed`
- Idempotency key: `messageId`
- Retries: exponential backoff with jitter; hard bounces and permanent rejects go to a DLQ (no further send)
- Observability records store **provider event id**, **recipient domain or hash**, **event type**, **timestamp**, and a **sanitized reason class** — never the plaintext token or full mailbox local-part

Provider DSN / bounce webhooks should call into `VerificationMailQueue.applyProviderEvent` with the outbound `messageId`.

Authenticated ingestion endpoint (operator secret):

```http
POST /api/v1/notifications/delivery-events
Authorization: Bearer <STEALTH_OPERATOR_SECRET>
Content-Type: application/json

{
  "messageId": "vm_…",
  "eventType": "hard_bounce",
  "providerEventId": "dsn-1",
  "reason": "550 mailbox unavailable"
}
```

Deferred SMTP retries are drained by the Workers `scheduled` handler via `processVerificationMailQueue` (not only on the next request). Send callbacks that close over plaintext verification URLs are purged as soon as a message reaches a terminal state (sent, delivered, hard bounce, DLQ, etc.).

## Development capture and beta invite fallback

- Non-production profiles may use `STEALTH_NOTIFICATION_TRANSPORT=sink` to capture messages in memory (hard-refused in production).
- When SMTP is selected in non-production and the MTA is unreachable, the invite/signup path may fall back to the capture sink so beta flows remain exercisable without a paid vendor. Production never falls back.

## Health, rate, and redaction

```bash
# Full staging exercise: success path + bounce/retry + zero token leakage
node scripts/verify-smtp-delivery.mjs
```

Operators should confirm:

1. One successful signup / resend / reset delivery
2. One deferred or hard-bounce path with retry or DLQ
3. Logs and queue records contain **no** verification tokens, passwords, seeds, or SMTP passwords
4. Resend and password-reset remain rate-limited (cooldown / IP gates)

## Staging compose (Mailpit)

See `infra/docker-compose.smtp.yml` for a local SMTP catcher. Point:

```ini
STEALTH_NOTIFICATION_TRANSPORT=smtp
STEALTH_SMTP_HOST=127.0.0.1
STEALTH_SMTP_PORT=1025
STEALTH_SMTP_SECURE=false
STEALTH_SMTP_STARTTLS=false
STEALTH_NOTIFICATION_FROM=noreply@localhost
```

Mailpit UI (when enabled): `http://127.0.0.1:8025` — inspect captured mail without a paid API.

## Rollback

1. Set `STEALTH_NOTIFICATION_TRANSPORT=sink` only in non-production to restore capture.
2. In production, roll back the SMTP host/credentials via the secret store; do not commit replacements.
3. Drain or abandon DLQ entries after fixing the MTA; do not replay hard bounces.
