# Self-hosted SMTP staging (BETA-091)

Verification delivery must use an administrator-owned MTA. This directory only
documents local catchers and probe commands — **no credentials**.

## Local catcher

```bash
docker compose -f infra/docker-compose.smtp.yml up -d
```

| Endpoint                | Purpose                              |
| ----------------------- | ------------------------------------ |
| `127.0.0.1:1025`        | SMTP submission (cleartext lab only) |
| `http://127.0.0.1:8025` | Mailpit UI                           |

Wire Hush with the env vars listed in `docs/deployment/smtp-email-setup.md`.

## Health probe (no AUTH)

```bash
node scripts/verify-smtp-delivery.mjs --probe-only
```

## Production notes

- Prefer STARTTLS on 587 with validated certificates.
- Store `STEALTH_SMTP_PASSWORD` in the rotated secret store (BETA-077).
- Publish SPF / DKIM / DMARC via DNS; verify with `dig` commands in the deployment doc.
- Never commit private DKIM keys, SMTP passwords, or captured message bodies containing tokens.
