# Contributing To Hush Mail

Hush Mail handles identity, encrypted mail, managed testnet wallets, and on-chain protocol state. Changes must be reviewable, reproducible, and careful with user data.

## Product naming and legacy identifiers

Use **Hush** for the product and `stellar-hush` for the package/project slug in new UI, docs, examples, and filenames. The repository owner/name, deployed resource names, federation domains, signed protocol strings, and persisted storage keys still contain the previous project name. Do not rename those in isolation: follow [the brand migration guide](docs/product/brand-migration.md) and preserve their compatibility until the relevant external or data migration is complete. When editing one of those interfaces, label the old identifier as legacy and document its replacement plan.

## Repository map

| Path                    | Responsibility                                                         |
| ----------------------- | ---------------------------------------------------------------------- |
| `src/routes/`           | Web routes and versioned API endpoints                                 |
| `src/features/`         | User-facing identity, mail, compose, policy, proof, and settings flows |
| `src/server/api/`       | API authorization, domain services, validation, and repositories       |
| `src/services/crypto/`  | Envelope, key, signature, and attachment cryptography                  |
| `src/services/relay/`   | Relay transport, authentication, admission, and delivery persistence   |
| `src/services/stellar/` | Stellar RPC, identity, wallet, and Soroban adapters                    |
| `contracts/soroban/`    | Rust smart contracts and contract tests                                |
| `protocol/`             | Wire formats, schemas, synthetic vectors, and interoperability notes   |
| `docs/`                 | Product, architecture, API, security, and deployment guides            |

Start with the root [README](README.md), then the [architecture map](docs/architecture/README.md). Prefer a feature-local README and tests for module-specific behavior.

## Before Starting

1. Link the work to an accepted issue with clear acceptance criteria.
2. Confirm dependencies and ownership of external deployment or provider steps.
3. Keep the change inside the issue's stated modules and non-goals.
4. Never place credentials, wallet seeds, private keys, tokens, or real message content in code, fixtures, logs, screenshots, issues, or pull requests.

### Local setup

Use Node.js 24 or newer and Bun 1.3.14. Rust and the `wasm32v1-none` target are needed for Soroban contract work; the repository pins the Rust toolchain in `rust-toolchain.toml`.

```bash
git clone https://github.com/Stellar-hush/hush.git
cd hush
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

The default profile is for local development. Use synthetic identities and messages. Testnet paths
may require a funded test account and configured endpoint, but never commit real seeds or API
credentials. See [runtime configuration](src/config/README.md) and the [deployment guide](docs/deployment/README.md) before changing an environment boundary.

### Picking and scoping work

Good starter work includes documentation, focused protocol vectors, accessibility fixes, and
bounded failure-path tests. Before starting a Wave issue, confirm it is still open and unassigned,
then state the expected behavior, touched modules, acceptance criteria, and validation command in
the issue or pull request. Do not begin production migrations, change live domains, or modify
contract deployment IDs as an incidental part of a feature.

## Pull Requests

- Use a Conventional Commits title such as `feat(mail): add durable sync cursor recovery`.
- Complete every section of the pull request template.
- Link the issue with `Closes #123`, `Fixes #123`, `Resolves #123`, or `Related: #123`.
- Include exact validation commands and results. State every skipped check and why it was skipped.
- Keep generated output, formatting churn, merge-conflict cleanup, and unrelated refactors out of feature PRs.
- PRs over 75 files or 8,000 changed text lines require the `large-change-approved` label and maintainer justification.
- Security, protocol, deployment, and contract changes require focused failure-path and authorization tests.

## Required Checks

All required GitHub checks must pass on the exact reviewed commit. A maintainer must not merge by relying on a successful run from an older commit or by treating an optional/skipped live integration as evidence.

Run the relevant local checks before requesting review:

```bash
bun run format:check
bun run lint
bun x tsc --noEmit
bun run test
bun run build
```

Also run contract, integration, E2E, visual, migration, or deployment checks when the changed boundary requires them.

## Review And Merge

- At least one code-owner approval is required.
- Stale approvals are dismissed after new changes.
- The final push must be approved by someone other than its author.
- Review conversations must be resolved before merge.
- Squash merge is the default so `main` keeps one attributable change per PR.

Closing an issue records delivery; discovered regressions should use a new linked issue rather than rewriting a merged PR's history.
