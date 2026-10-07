# Secrets Inventory & Operational Procedures

This document defines the secrets inventory for the Hush Beta release, outlining their required environment ownership, rotation cadence, and emergency revocation procedures in accordance with the principle of least privilege.

## Secret Inventory

Secrets are scoped to specific runtime identities via the `STEALTH_ROLE` environment variable to ensure jobs receive only their required capabilities.

| Variable Name             | Description                                                                           | Role Scope                   |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| `STEALTH_CURSOR_SECRET`   | Used to sign/verify cursor tokens for pagination and session states.                  | `web`, `all`                 |
| `STEALTH_RELAY_API_KEY`   | Authenticates connections from the Web application to the SMTP Relay service.         | `relay`, `all`               |
| `STEALTH_STORAGE_SECRET`  | API Secret or Access Token to interact with external/bound Object Storage or DBs.     | `indexer`, `all`             |
| `STEALTH_SMTP_PASSWORD`   | Credentials to authenticate the system against the outbound SMTP provider.            | `web`, `all`                 |
| `STEALTH_RPC_API_KEY`     | Token for making authenticated calls against the Soroban RPC.                         | `operator`, `indexer`, `all` |
| `STEALTH_OPERATOR_SECRET` | Custody secret key for the operator wallet to broadcast signed network transactions.  | `operator`, `all`            |
| `STEALTH_BACKUP_KEY`      | Base64-encoded 32-byte key sealing encrypted backups (AES-256-GCM, BETA-081).         | `operator`, `all`            |
| `STEALTH_ADMIN_ADDRESSES` | Comma-separated Stellar G-addresses allowed to call `/api/v1/admin/*` (not a secret). | `operator`, `all`            |

## Environment Ownership

All production secrets must be provisioned and managed strictly through the designated secret stores (e.g., Cloudflare Workers Secrets).
**Important Requirements**:

- **No plaintext credentials** shall exist in repository files, client bundles, or CI logs.
- Developers and contributors are **never** given production credentials. They must use the local environment equivalents configured in `development` profiles or `.env` files (which are ignored by git).
- Secrets are securely bound at runtime during deployment.

## Rotation Cadence

1. **Standard Rotation**: Secrets (Cursor, Storage, Relay, RPC, and SMTP) must be rotated on a **90-day** cadence. `STEALTH_BACKUP_KEY` follows the same cadence; retain prior backup keys until every archive sealed under them passes retention.
2. **Wallet/Operator Rotation**: Operator keys should follow the same 90-day cadence. The application supports updating credentials without breaking user wallet encryption.
3. **Automated Audits**: Ensure a scheduled check verifies that secrets are up-to-date and have not leaked in scanning pipelines.

## Emergency Revocation Procedure

In the event of a suspected or confirmed compromise:

1. **Identify the compromised key(s)** from the inventory above.
2. **Revoke the key** directly at the issuer/provider console (e.g., invalidate the SMTP password with the provider, block the RPC API key).
3. **Generate new credentials**.
4. **Update the secret bindings** in the infrastructure:
   ```bash
   wrangler secret put <SECRET_NAME> --env production
   ```
5. **Redeploy the affected services** immediately to roll out the new credentials and drop invalid active connections.
6. Check system logs to verify the affected service has recovered its operational state using the new secret.
