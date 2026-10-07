# Deployment

Deployment runbooks, environment setup, Cloudflare notes, network configuration, and release checklists.

## Current public status

Hush's main branch is configured for Cloudflare Workers, but a main-branch push is not by itself a
deployment. The staging workflow waits for CI on the exact commit and deploys only when the beta
release-gate summary is successful. The last verified deployment attempt was gated off after CI
failed formatting and the Soroban postage Wasm hash check; no public Hush demo URL was verified by
that run. Follow the current [GitHub Actions runs](https://github.com/Stellar-hush/hush/actions)
before sharing a hosted URL.

The web application is server-rendered through the Cloudflare Vite integration. Preview and
staging require configured Cloudflare account credentials, environment secrets, resource IDs,
testnet contract configuration, and health checks. Never publish a placeholder origin as a demo.

The deployed service, Worker, bindings, buckets, environment variables, custom domains, and some
runbook examples still carry legacy `stealth` identifiers. They are kept to avoid breaking existing
resources and stored data. Domain and resource cutover must follow the [brand migration plan](../product/brand-migration.md).

### Deployment path

1. Push changes to `main`; CI builds the client and contracts and runs the required checks.
2. CI writes per-gate evidence and a release-gate summary for that commit.
3. The staging workflow waits for that exact CI run and stops if any required gate fails or is
   missing.
4. After passing gates, staging verifies its secrets, runs configured migrations, deploys the
   preview/staging Worker, and performs health checks.
5. Production is a separate release workflow that requires an approved release commit and explicit
   release-manager input. A documentation push never deploys production.

Deployment workflows may need repository/environment secrets and a successfully enabled GitHub
Actions environment. Secret values must never be copied into this document or repository.

- [Operational Alerts and Runbooks](ALERTS.md) - System alerts, investigation guides, and runbooks.
- [Prometheus Alert Rules](alerts.yaml) - Prometheus alerting rules configuration for anomalies.
- [Service-Level Objectives & SLIs](SLO.md) - Service-level indicators, targets, formulas, traffic exclusions, and alerting guidance.
- [Schema Migrations](MIGRATIONS.md) - Migration order and rollback guidance for durable storage.
- [R2 Encrypted Object Storage](R2.md) - R2 bucket setup, deterministic object naming, integrity checks, and orphan cleanup.
- [Self-hosted SMTP verification delivery (BETA-091)](smtp-email-setup.md) - Administrator SMTP, STARTTLS, DKIM/SPF/DMARC checks, queues, bounce handling, and redacted observability.
- [Deployment Workflows (BETA-089)](DEPLOYMENT_WORKFLOWS.md) - GitHub Actions workflows for staging and production deployments from GitHub.

## Beta Runtime Configuration Contract (BETA-001)

The Hush Mail beta deployment requires a unified configuration contract across six core domains. Secret parameters are strictly separated from client-facing public parameters and scrubbed (`[REDACTED]`) from logs.

### Redacted Configuration Matrix

| Variable                             | Domain   | Visibility | Required Profile | Default / Sample Value                                     | Description                                                         |
| :----------------------------------- | :------- | :--------- | :--------------- | :--------------------------------------------------------- | :------------------------------------------------------------------ |
| `STEALTH_ENV`                        | Network  | Public     | All              | `development`                                              | Deployment profile (`development`, `test`, `preview`, `production`) |
| `STEALTH_STELLAR_NETWORK`            | Network  | Public     | All              | `testnet`                                                  | Target Stellar network (`testnet`, `mainnet`, `futurenet`, `local`) |
| `STEALTH_HORIZON_URL`                | Network  | Public     | All              | `https://horizon-testnet.stellar.org`                      | Horizon RPC endpoint URL                                            |
| `STEALTH_SOROBAN_RPC_URL`            | Network  | Public     | All              | `https://soroban-testnet.stellar.org`                      | Soroban RPC endpoint URL                                            |
| `STEALTH_NETWORK_PASSPHRASE`         | Network  | Public     | All              | `Test SDF Network ; September 2015`                        | Stellar network passphrase                                          |
| `STEALTH_STORAGE_DRIVER`             | Storage  | Public     | All              | `memory` (dev) / `hybrid` (prod)                           | Storage engine driver (`memory`, `cloudflare-kv`, `hybrid`)         |
| `STEALTH_KV_NAMESPACE_ID`            | Storage  | Public     | Production       | `stealth-kv-beta-prod-id`                                  | Cloudflare KV namespace ID                                          |
| `STEALTH_KV`                         | Storage  | Public     | Production       | `[Cloudflare Binding]`                                     | Cloudflare Workers KV binding handle                                |
| `STEALTH_COORDINATOR`                | Storage  | Public     | Production       | `[Cloudflare Binding]`                                     | Cloudflare Workers Durable Object binding handle                    |
| `STEALTH_CURSOR_SECRET`              | Session  | **Secret** | Production       | `[REDACTED]`                                               | Secret key used for signing pagination cursors                      |
| `STEALTH_AUTH_CHALLENGE_LIFETIME_MS` | Session  | Public     | All              | `300000` (5 mins)                                          | Auth challenge validity duration in ms                              |
| `STEALTH_AUTH_CLOCK_SKEW_MS`         | Session  | Public     | All              | `30000` (30 secs)                                          | Allowed client/server clock skew in ms                              |
| `STEALTH_AUTH_NONCE_TTL_MS`          | Session  | Public     | All              | `300000` (5 mins)                                          | Signed authentication nonce TTL in ms                               |
| `STEALTH_QUOTE_LIFETIME_MS`          | Session  | Public     | All              | `300000` (5 mins)                                          | Postage quote lifetime in ms                                        |
| `STEALTH_RELAY_URL`                  | Relay    | Public     | All              | `https://relay-testnet.stealth.mail`                       | Hush message relay endpoint                                         |
| `STEALTH_RELAY_API_KEY`              | Relay    | **Secret** | Optional         | `[REDACTED]`                                               | Optional secret API key for relay authentication                    |
| `STEALTH_RELAY_TIMEOUT_MS`           | Relay    | Public     | All              | `10000` (10 secs)                                          | Relay request timeout in ms                                         |
| `STEALTH_REGISTRY_CONTRACT_ID`       | Contract | Public     | Production       | `CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | Soroban Identity Registry contract ID                               |
| `STEALTH_POSTAGE_CONTRACT_ID`        | Contract | Public     | Production       | `CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB`  | Soroban Postage/Fee contract ID                                     |
| `STEALTH_DOMAIN_TAG`                 | Contract | Public     | All              | `Stealth_Mail_Protocol`                                    | Protocol signature domain separator                                 |
| `STEALTH_PROTOCOL_VERSION`           | Contract | Public     | All              | `v1`                                                       | Supported protocol version                                          |
| `STEALTH_APP_URL`                    | Origin   | Public     | All              | `https://app.stealth.mail`                                 | Web app public origin URL                                           |
| `STEALTH_CORS_ALLOWED_ORIGINS`       | Origin   | Public     | Production       | `https://app.stealth.mail`                                 | Comma-separated list of allowed CORS origins                        |
| `STEALTH_CORS_ALLOWED_METHODS`       | Origin   | Public     | All              | `GET,POST,PUT,DELETE,OPTIONS,HEAD`                         | Allowed HTTP methods                                                |
| `STEALTH_CORS_ALLOWED_HEADERS`       | Origin   | Public     | All              | `Content-Type,Authorization,...`                           | Allowed request headers                                             |
| `STEALTH_CORS_ALLOW_CREDENTIALS`     | Origin   | Public     | All              | `true`                                                     | CORS credentials allowance flag                                     |

---

### Local Beta Environment Example (`.env.beta.example`)

```ini
# --- Profile ---
STEALTH_ENV=development

# --- 1. Network ---
STEALTH_STELLAR_NETWORK=testnet
STEALTH_HORIZON_URL=https://horizon-testnet.stellar.org
STEALTH_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STEALTH_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# --- 2. Storage ---
STEALTH_STORAGE_DRIVER=memory
STEALTH_KV_NAMESPACE_ID=stealth-kv-dev

# --- 3. Session & Security (SECRETS MUST NOT BE COMMITTED) ---
STEALTH_CURSOR_SECRET=dev-cursor-secret-change-me
STEALTH_AUTH_CHALLENGE_LIFETIME_MS=300000
STEALTH_AUTH_CLOCK_SKEW_MS=30000
STEALTH_AUTH_NONCE_TTL_MS=300000
STEALTH_QUOTE_LIFETIME_MS=300000

# --- 4. Relay ---
STEALTH_RELAY_URL=https://relay-testnet.stealth.mail
STEALTH_RELAY_TIMEOUT_MS=10000

# --- 5. Contract ---
STEALTH_REGISTRY_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
STEALTH_POSTAGE_CONTRACT_ID=CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
STEALTH_DOMAIN_TAG=Stealth_Mail_Protocol
STEALTH_PROTOCOL_VERSION=v1

# --- 6. Origin & CORS ---
STEALTH_APP_URL=http://localhost:3000
STEALTH_CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
STEALTH_CORS_ALLOW_CREDENTIALS=true
```

---

### Cloudflare Persistence Bindings (BETA-024 / Issue #1931)

The committed `wrangler.jsonc` defines `preview` and `production` environments
with distinct KV namespaces, Durable Object bindings, and `secrets.required`
(`STEALTH_CURSOR_SECRET`). **No real resource IDs are committed** — KV ids are
`{VAR_NAME}` placeholders injected at deploy time:

```bash
# Variables (see .env.example):
#   STEALTH_KV_LOCAL_ID / STEALTH_KV_PREVIEW_ID / STEALTH_KV_PRODUCTION_ID
bun run config:generate        # writes .wrangler/generated/wrangler.jsonc
bun run config:check           # CI guard: no real IDs/secrets committed, envs isolated

wrangler deploy --env production --config .wrangler/generated/wrangler.jsonc
```

Identity record migrations (dry-run / forward / rollback / integrity-check)
are documented in [Schema Migrations](MIGRATIONS.md).
