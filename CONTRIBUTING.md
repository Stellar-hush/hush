# Contributing To Hush Mail

Hush Mail handles identity, encrypted mail, managed testnet wallets, and on-chain protocol state. Changes must be reviewable, reproducible, and careful with user data.

## Product naming and legacy identifiers

Use **Hush** for the product and `stellar-hush` for the package/project slug in new UI, docs, examples, and filenames. The repository owner/name, deployed resource names, federation domains, signed protocol strings, and persisted storage keys still contain the previous project name. Do not rename those in isolation: follow [the brand migration guide](docs/product/brand-migration.md) and preserve their compatibility until the relevant external or data migration is complete. When editing one of those interfaces, label the old identifier as legacy and document its replacement plan.

## Before Starting

1. Link the work to an accepted issue with clear acceptance criteria.
2. Confirm dependencies and ownership of external deployment or provider steps.
3. Keep the change inside the issue's stated modules and non-goals.
4. Never place credentials, wallet seeds, private keys, tokens, or real message content in code, fixtures, logs, screenshots, issues, or pull requests.

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
