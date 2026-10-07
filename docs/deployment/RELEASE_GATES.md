# Release Stage Gates

This runbook defines the mandatory go/no-go criteria for promoting Hush protocol
contracts, the client, and the API through testnet and production environments. A
release reviewer must be able to make a defensible decision from the evidence linked
here. Promotion is blocked when any critical gate is unmet.

**BETA-088 (#1995):** Every push/PR to `main` or `develop` runs the unified CI release
gate pipeline (`.github/workflows/ci.yml`). The final **Beta Release Gate Summary**
job aggregates gate results, artifact hashes, tool versions, and failure ownership.
Main is not releasable while the summary verdict is `fail` or `blocked`.

## CI Gate Matrix (automated)

| Gate ID                 | CI Job                           | Owner                  | Dependency         | Command / evidence                                                        |
| ----------------------- | -------------------------------- | ---------------------- | ------------------ | ------------------------------------------------------------------------- |
| `client-checks`         | Client Checks                    | `platform/client`      | BETA-088           | `bun install --frozen-lockfile`, lint, tsc, build                         |
| `build-reproducibility` | Client Checks                    | `platform/client`      | BETA-088           | `npm run ci:verify-drift`                                                 |
| `pinned-versions`       | Client Checks                    | `platform/release`     | BETA-088           | `npm run ci:verify-versions`                                              |
| `contract-checks`       | Contract Checks                  | `platform/contracts`   | BETA-086           | `cargo test --workspace`, release wasm build                              |
| `contract-registry`     | Contract Registry                | `platform/contracts`   | BETA-086           | `npm run ci:verify-wasm-hashes`                                           |
| `beta-migrations`       | Migration Gates                  | `platform/storage`     | BETA-082           | `npm run migrations:integrity-check`, forward/rollback                    |
| `beta-backup`           | Backup & Restore Gates           | `platform/storage`     | BETA-081           | `npm run backup:rehearsal`                                                |
| `beta-auth`             | Auth & Abuse Gates               | `security/platform`    | BETA-079           | `npm run test:beta:auth`                                                  |
| `beta-security`         | Security & Crypto Gates          | `security/platform`    | BETA-084, BETA-085 | crypto + managed-wallet + STEALTH-AUTH-V1 signed-request on mutating HTTP |
| `beta-live-data`        | Live-Data No-Mock                | `protocol/relay`       | BETA-050           | `npm run test:beta:live-data`                                             |
| `beta-performance`      | Performance Budget               | `platform/performance` | BETA-083           | `npm run test:load`                                                       |
| `beta-acceptance`       | Beta Usability & A11y Acceptance | `product/ux`           | BETA-098           | `npm run test:beta:acceptance` + Playwright `acceptance-journeys.spec.ts` |
| `e2e`                   | E2E & Browser Gates              | `platform/client`      | BETA-087           | Playwright chromium (pinned)                                              |
| `visual-e2e`            | Visual & Cross-Browser           | `platform/client`      | BETA-087           | `npm run test:visual` (committed Linux baselines)                         |
| `security`              | Security & Dependency Review     | `security/platform`    | BETA-088           | dependency-review (skipped on fork PRs), Gitleaks                         |
| `provenance`            | Provenance & Hashes              | `platform/release`     | BETA-088           | `npm run ci:collect-hashes`, `npm run ci:scan-artifacts`                  |
| `beta-soroban-live`     | Soroban Live Integration         | `platform/contracts`   | BETA-086           | Manual: `.github/workflows/beta-live-testnet.yml`                         |

Pinned versions: `scripts/ci/tool-versions.json`, `.node-version`, `rust-toolchain.toml`.

Contract builds use Rust `1.98.0`, the compiler used by the passing build that
produced the committed Wasm hashes. Keep `RUST_VERSION` in CI, the tool-version
manifest, and `rust-toolchain.toml` in sync. A floating `stable` channel is not a
reproducible compiler pin. Compiler upgrades require a reviewed rebuild and hash
update; do not update expected hashes merely to silence an unexplained mismatch.

If **Build reproducibility & drift** fails, regenerate and commit the drifted files:

```bash
bun scripts/generate-route-tree.ts
bun run generate:openapi
node scripts/generate-contract-bindings.mjs
git diff --name-only
```

Do not commit `gate-result-*.json` (local CI artifacts). The OpenAPI generator must write a trailing newline so the file matches Prettier.

### Release-gate semantics

| Verdict   | Meaning                                                                                       | Releasable |
| --------- | --------------------------------------------------------------------------------------------- | ---------- |
| `pass`    | Every required gate artifact exists and genuinely passed                                      | yes        |
| `blocked` | A required gate is explicitly blocked by a named unresolved dependency                        | no         |
| `fail`    | A required gate failed, or a required gate result is missing (`missing required gate result`) | no         |
| `skipped` | Only allowed for privileged `security` scans on fork PRs; never makes `releasable: true`      | no         |

Missing required artifacts are injected as `fail` with reason `missing required gate result`. They are never treated as pass.

Fork PRs skip privileged security scans. Live testnet gates require `workflow_dispatch`
with the protected `testnet` GitHub Environment.

## Release Record

Record these values before beginning a deployment:

| Field                    | Value |
| ------------------------ | ----- |
| Release/version          |       |
| Source commit            |       |
| API artifact hash        |       |
| Contract artifact hashes |       |
| Migration version        |       |
| Target environment       |       |
| Release manager          |       |
| Incident commander       |       |
| Deployment start         |       |

## 1. Pre-Flight Gates

### Code and API contract

- [ ] CI **Beta Release Gate Summary** verdict is `pass` for the exact source commit.
- [ ] CI passes lint, formatting, type checking, unit tests, integration tests, and
      contract tests for the exact source commit.
- [ ] The generated OpenAPI document is reviewed and its compatibility diff is
      attached to the release record.
- [ ] Every new or changed public route has success, validation, authentication,
      authorization, and idempotency coverage as applicable.
- [ ] API clients and canary probes use the release candidate's request and response
      contracts rather than hand-built assumptions.
- [ ] Soroban Wasm sizes and artifact SHA-256 hashes are recorded.

### Configuration and security keys

- [ ] Required environment variables are present in the target environment and
      validated without printing secret values.
- [ ] Network, contract IDs, database/storage endpoints, allowed origins, and feature
      flags match the approved environment manifest.
- [ ] Authentication verification keys are available to every API instance and the
      active key ID matches the signer configuration.
- [ ] Key rotation overlap is documented. Both old and new verification keys are
      available for the approved overlap window, or all old signatures are confirmed
      expired before the old key is removed.
- [ ] Signing keys, database credentials, and backup credentials are loaded from the
      secret manager; none are embedded in artifacts or deployment logs.
- [ ] Clock synchronization is healthy on signature-verifying and nonce-storage
      systems so expiry and replay checks are reliable.

### Migration readiness and backup

- [ ] Every schema or state migration has a named owner, expected duration, lock
      impact, retry behavior, and tested forward procedure.
- [ ] The migration was rehearsed against a production-sized sanitized dataset and
      its resulting schema/data invariants were verified.
- [ ] Backward compatibility between the current and candidate application versions
      is documented for the entire deployment window.
- [ ] A restorable storage backup or snapshot was completed immediately before the
      migration, and its location, encryption key reference, timestamp, and retention
      period are in the release record.
- [ ] A restore rehearsal has proven the backup can be read in an isolated environment.
      (BETA-081: run `npm run backup:rehearsal` per `docs/deployment/BACKUPS.md`.)
- [ ] Append-only financial transitions, externally published events, and on-chain
      writes affected by the release are identified as irreversible.

### Observability and operations

- [ ] Dashboards cover request rate, latency, error rate, authentication failures,
      authorization failures, replay rejections, storage errors, and migration status.
- [ ] Financial state-transition metrics and invariant alerts are enabled without
      exposing addresses, signatures, tokens, or message content.
- [ ] Alert thresholds, paging routes, log correlation IDs, and the on-call schedule
      are verified with a test signal.
- [ ] Operators can execute the documented [health checks](../api/README.md) and the
      [rollback and recovery procedure](#5-rollback-and-recovery-procedure).

## 2. Testnet Promotion Gates

- [ ] Migrations complete successfully and pass post-migration invariants on testnet.
- [ ] API contract tests pass against the deployed testnet endpoint.
- [ ] Authentication verifies valid signatures and rejects invalid, expired, replayed,
      route-substituted, and body-substituted requests.
- [ ] Storage backup and restore procedures are exercised with testnet data.
- [ ] New metrics, logs, dashboards, and alerts are visible to the on-call team.
- [ ] The full [canary validation sequence](#4-canary-validation-sequence) passes.
- [ ] Rollback is rehearsed up to the last reversible decision point.

## 3. Production Promotion Gates

- [ ] Security review and threat-model updates are approved. The beta threat model
      ([`docs/security/beta-threat-model.md`](../security/beta-threat-model.md)), control
      ownership map, verification checklist, and residual-risk register are reviewed together:
      the register ([`docs/security/beta-risk-register.md`](../security/beta-risk-register.md))
      must contain no open P0 rows, or an explicit acceptance recorded in the sign-off table below.
- [ ] Legal/compliance and product sign-off are recorded where required.
- [ ] The incident commander, database owner, security owner, and release manager are
      present for the deployment window.
- [ ] Load and failure testing meets the approved reliability target.
- [ ] User-facing documentation and support guidance reflect contract changes.
- [ ] The production backup completed and its restore metadata was independently checked.
- [ ] No irreversible migration begins until the release manager records an explicit
      go decision at the irreversible-change gate.
- [ ] Canary traffic limits, observation duration, abort thresholds, and expansion
      steps are agreed before deployment.

## 4. Canary Validation Sequence

Run these checks in order. Stop traffic expansion immediately when a step fails.

1. Deploy the candidate with zero public traffic and verify artifact hashes,
   configuration fingerprints, migration version, active authentication key IDs,
   and dependency connectivity.
2. Call `GET /health` and the protocol metadata endpoint from inside and outside the
   deployment boundary. Confirm expected status, version, and dependency health.
3. Run read-only API contract probes using synthetic accounts. Confirm response
   schemas, correlation IDs, latency, and that no state changes occur.
4. Run authentication negative probes for missing, invalid, expired, replayed, and
   request-substituted signatures. All must fail with the documented status and must
   not mutate storage.
5. Run one synthetic write through each changed state-transition path. Verify the
   API response, persisted record, emitted metrics/events, idempotent retry behavior,
   and financial invariants.
6. Route the approved canary percentage to the candidate for the defined observation
   window. Compare latency, error rate, auth failures, storage errors, and financial
   invariants with the control deployment.
7. Expand traffic only after the release manager and service owner sign off. Repeat
   the observation at each traffic step until full promotion.

Canary success does not make an irreversible schema migration reversible. It only
reduces uncertainty before the corresponding decision gate.

## 5. Rollback and Recovery Procedure

### Decision points

| Condition                                                  | Decision                   | Action                                                                                                                        |
| ---------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Candidate fails before migration                           | Roll back                  | Remove candidate instances; no data recovery required.                                                                        |
| Reversible migration fails                                 | Roll back                  | Stop writes, run the tested down migration, verify invariants, then restore the previous application.                         |
| Backward-compatible migration succeeds but candidate fails | Roll back application only | Keep the compatible schema and restore the previous application artifact.                                                     |
| Irreversible migration has started                         | Roll forward or recover    | Do not run an untested down migration. Stop traffic/writes and follow the recovery plan below.                                |
| Financial or on-chain transition is incorrect              | Contain and reconcile      | Pause affected writes, preserve evidence, and initiate incident response; deployment rollback cannot reverse published state. |

### Irreversible-change limitations

Destructive column removal, lossy data transformation, encryption/key-format changes,
append-only financial transitions, external notifications, and on-chain writes cannot
be undone by redeploying the previous application. For these changes:

- use expand/migrate/contract phases across separate releases;
- retain old fields and readers until the new representation is verified;
- define reconciliation or compensating actions before deployment;
- record the final reversible point and require explicit approval before crossing it;
- never describe a backup restore as a complete rollback when external or financial
  side effects have already occurred.

### Recovery sequence

1. Stop canary expansion and disable affected write paths with the approved feature
   flag or traffic rule.
2. Preserve logs, request IDs, migration output, database state, and artifact hashes.
3. Classify the release at the decision table above and record who made the decision.
4. For reversible changes, restore the previous artifact and execute only the tested
   rollback procedure.
5. For irreversible changes, deploy the approved forward fix or restore the backup to
   an isolated environment, reconcile post-backup writes, and validate invariants
   before replacing production state.
6. Re-run the [health checks](../api/README.md), API contract probes, authentication
   negative probes, storage invariants, and financial reconciliation checks.
7. Reopen traffic gradually using the canary sequence and publish the incident and
   recovery record.

## 6. Artifacts and Identifiers

### Contract IDs

| Component  | Network | Contract ID | Artifact hash (SHA-256) |
| ---------- | ------- | ----------- | ----------------------- |
| `policies` | Testnet |             |                         |
| `policies` | Mainnet |             |                         |
| `postage`  | Testnet |             |                         |
| `postage`  | Mainnet |             |                         |
| `receipts` | Testnet |             |                         |
| `receipts` | Mainnet |             |                         |

### Application artifacts

| Component      | Version | Environment | Build hash (SHA-256) |
| -------------- | ------- | ----------- | -------------------- |
| `stealth-mail` |         | Testnet     |                      |
| `stealth-mail` |         | Mainnet     |                      |

## 7. Promotion Sign-Off

| Role                   | Name | Decision/signature | Date |
| ---------------------- | ---- | ------------------ | ---- |
| Security reviewer      |      |                    |      |
| Database/storage owner |      |                    |      |
| Engineering lead       |      |                    |      |
| Product owner          |      |                    |      |
| Release manager        |      |                    |      |
