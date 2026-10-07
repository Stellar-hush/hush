# Beta Verification Checklist (BETA-076)

Companion to the [beta threat model](./beta-threat-model.md), [control map](./beta-control-map.md),
and [risk register](./beta-risk-register.md). This checklist is the prioritized, repeatable
procedure for verifying the security posture of the live beta path. Every item names its exact
command and records redacted evidence captured while preparing this branch. Items marked
**CI-verified** could not execute on the authoring workstation (limitations documented inline) and
are executed by the corresponding GitHub Actions jobs on every push; the PR must show those jobs
green before sign-off.

## Evidence environment

Captured with `node scripts/security/beta-evidence.mjs` at verification time:

| Item                     | Value                                                                                  |
| :----------------------- | :------------------------------------------------------------------------------------- |
| Product / package        | Hush / `stellar-hush` (private, unversioned package)                                   |
| Base commit              | `d6a9ccaed896b571a04e25e8828fb512ac24ba2f` (main)                                      |
| Branch                   | `beta-076-threat-model-ownership-map`                                                  |
| Node.js                  | 24.15.0                                                                                |
| Bun                      | 1.3.14                                                                                 |
| Rustc / Cargo            | 1.97.1 (contracts verified with aligned `1.96.0` toolchain, see VC-P0-9)               |
| soroban-sdk              | 26                                                                                     |
| Contract crates          | policies, postage, receipts, lifecycle                                                 |
| Worker entrypoint        | src/server.ts (wrangler.jsonc main)                                                    |
| Bindings declared        | STEALTH_KV, STEALTH_OBJECT_STORE                                                       |
| Manifest ID placeholders | {VAR_NAME}, {STEALTH_KV_LOCAL_ID}, {STEALTH_KV_PREVIEW_ID}, {STEALTH_KV_PRODUCTION_ID} |
| Secret values            | [REDACTED] — never read by the script                                                  |

## P0 — release-blocking (must be green before any promotion)

| ID       | Check                              | Command                                                        | Status | Captured result (redacted)                                                                                                                                                                                                                                                                                             |
| :------- | :--------------------------------- | :------------------------------------------------------------- | :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VC-P0-1  | Format gate                        | `bun x prettier --check .`                                     | PASS   | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                           |
| VC-P0-2  | Lint                               | `bun run lint`                                                 | PASS   | eslint exits 0, no warnings on changed paths                                                                                                                                                                                                                                                                           |
| VC-P0-3  | Typecheck                          | `bun x tsc --noEmit`                                           | PASS   | exits 0                                                                                                                                                                                                                                                                                                                |
| VC-P0-4  | OpenAPI spec generation            | `bun run generate:openapi`                                     | PASS\* | Generator succeeds; see note N1 on pre-existing additive drift vs the committed spec (tracked as RR-09)                                                                                                                                                                                                                |
| VC-P0-5  | Unit tests incl. BETA-076 controls | `bun run test`                                                 | PASS   | 184 files / 2161 tests passed (+3 expected-fail), two consecutive green runs; includes `tests/unit/security/beta-controls.test.ts` (19 assertions, 8 control sections)                                                                                                                                                 |
| VC-P0-6  | Wrangler secret-hygiene guard      | `bun run config:check`                                         | PASS   | "Committed wrangler.jsonc uses only placeholder tokens (no real IDs committed)."                                                                                                                                                                                                                                       |
| VC-P0-7  | Migration safety commands          | `bun run migrations:dry-run` then `migrations:integrity-check` | PASS   | All families report `failed=0`; integrity-check exits 0 (one transient Node-on-Windows teardown crash after completion; clean on retry)                                                                                                                                                                                |
| VC-P0-8  | Secret scan                        | CI gitleaks job / local `gitleaks detect --redact`             | PASS\* | gitleaks binary not installed locally and the CI job is license-gated (AL-04 / RR-07). Compensating evidence: VC-P0-6 guard green + `scripts/security/beta-evidence.mjs` refuses to emit evidence if any manifest contains a real resource ID (ran clean). No plaintext tokens/keys/seeds appear in this branch's diff |
| VC-P0-9  | Contract wasm build                | `cargo build --target wasm32v1-none --release`                 | PASS   | "Finished `release` profile [optimized] target(s)" — required toolchain alignment documented in note N2                                                                                                                                                                                                                |
| VC-P0-10 | Client production build            | `bun run build`                                                | PASS   | "✓ built in ~25s", dist emitted                                                                                                                                                                                                                                                                                        |

Notes:

- **N1 (VC-P0-4):** Regenerating `openapi.json` produces an additive-only drift against the copy
  committed on main (zero removed definitions; insertions only), which predates this branch and is
  identical on a clean checkout of main. The optic compatibility check therefore sees the same
  non-breaking delta as every other PR from current main. The staleness itself is registered as
  **RR-09** with owner and remediation.
- **N2 (VC-P0-9):** The workstation's installed `stable` toolchains ship a `wasm32v1-none` std built
  by rustc 1.96.0 against 1.97.1 compilers (dist-channel mismatch), so builds fail with E0514 until
  the compiler is aligned: `rustup toolchain install 1.96.0 --profile minimal --target wasm32v1-none`
  followed by `cargo +1.96.0-x86_64-pc-windows-gnu build --target wasm32v1-none --release`. CI pins
  `stable` on Linux where no such mismatch exists.

## P1 — verify before opening the beta beyond the trusted cohort

| ID      | Check                                                     | Command / source                                                               | Status      | Evidence / notes                                                                                                                                                                                                                                                                                                                                 |
| :------ | :-------------------------------------------------------- | :----------------------------------------------------------------------------- | :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VC-P1-1 | Contract host test suites                                 | `cargo test --workspace` (CI contract-checks job)                              | CI-verified | Locally blocked by a Windows-gnu linker limitation: mingw ld fails with `export ordinal too large: 75463` when linking the debug cdylib. Zero Rust changes in this branch (`git diff --stat contracts/` is empty apart from an intentionally reverted lockfile sync); the CI job runs on ubuntu and must be green on the PR                      |
| VC-P1-2 | Two-user encrypted journey end-to-end                     | `bun run test:e2e` (CI e2e job), `tests/e2e/auth/two-user-journey.spec.ts`     | CI-verified | Locally blocked: the Cloudflare vite dev plugin accepts connections but never serves responses on native Windows (workerd runtime hang), so Playwright's webServer probe times out despite Vite reporting ready in ~11s. Diagnosis repeated across IPv4/IPv6, curl and PowerShell clients. The CI job runs on ubuntu and must be green on the PR |
| VC-P1-3 | Rollback rehearsal up to last reversible decision point   | Operator procedure: [`RELEASE_GATES.md`](../deployment/RELEASE_GATES.md) §2/§5 | Procedure   | Executed per release window by Release Manager + operator; migration rollback mechanics proven automatically by VC-P1-4                                                                                                                                                                                                                          |
| VC-P1-4 | Migration rollback round trip (automated portion)         | `tests/unit/security/beta-controls.test.ts` § SC-20/SC-11                      | PASS        | v1→v2→v1 restores byte-equal records; rollback without explicit positive `--target-version` refuses to run                                                                                                                                                                                                                                       |
| VC-P1-5 | Auth negative probes (replay/substitution/tamper denials) | `tests/unit/api/auth/*` + vectors `test-fixtures/auth/signed-request-v1.json`  | PASS        | Included in the VC-P0-5 suite run                                                                                                                                                                                                                                                                                                                |

## P2 — hardening before public invite

| ID      | Check                                                  | Command / source                                     | Status    | Notes                                                                                                           |
| :------ | :----------------------------------------------------- | :--------------------------------------------------- | :-------- | :-------------------------------------------------------------------------------------------------------------- |
| VC-P2-1 | Relay-side padding-boundary enforcement (closes RR-03) | Envelope ingest path, `src/server/api/envelope.ts`   | Open item | Owner: Privacy Owner; add rejection of non-conforming payload sizes with a rate-limited metric before enforcing |
| VC-P2-2 | Colocated test blind spot remediation (closes RR-04)   | Fix 3 failing colocated suites, widen vitest include | Open item | Owner: Security Owner; do not widen include until green                                                         |
| VC-P2-3 | Load test                                              | `bun run test:load`                                  | Not run   | Deferred to the load/failure testing gate in RELEASE_GATES §3                                                   |
| VC-P2-4 | Toolchain pin alignment between CI jobs (closes RR-08) | `.github/workflows/ci.yml`                           | Open item | Owner: Release Manager; separate CI PR                                                                          |

## Proven behavioral paths

The automated proof lives in `tests/unit/security/beta-controls.test.ts` (executed within VC-P0-5):

- **Success path:** content key wrapped to a recipient unwraps and encrypts/decrypts (SC-08);
  migration forward/rollback restores byte-equal records (SC-20).
- **Denial paths:** quota exhaustion returns denial + `retryAfter` (SC-06); auth-failure lockout
  with exponential delay (SC-05); foreign-origin and bad-method CORS requests get 403 (SC-07);
  identifier-bearing analytics payloads throw (SC-13); non-normative algorithms rejected (SC-01);
  wrong-recipient unwrap yields nothing usable (SC-08); committed real resource IDs rejected (SC-24).
- **Recovery/rollback paths:** rollback requires explicit target version and restores exact prior
  records (SC-20); resolved-config guard fails closed on unresolved placeholders (SC-24).

## BETA-095 — beta invitation, cohort, feature-flag & kill-switch controls

Controlled testing needs staged exposure and the ability to disable risky capabilities without
redeploying. Controls are owned by the **Release Operator** and enforced by the code paths listed in
the [control map](./beta-control-map.md) (SC-26–SC-31).

| ID        | Check                                                                                     | Command                                                      | Status | Captured result (redacted)                                                                                                                   |
| :-------- | :---------------------------------------------------------------------------------------- | :----------------------------------------------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| VC-B095-1 | Beta control unit suite (precedence, stale cache, rollback, concurrency, cohorts/invites) | `bun x vitest run tests/unit/api/beta-controls.test.ts`      | PASS   | 20 tests passed; covers SC-26/SC-28/SC-29/SC-31                                                                                              |
| VC-B095-2 | Admin route RBAC + audit-reason gates                                                     | `bun x vitest run tests/unit/api/admin-beta-routes.test.ts`  | PASS   | 9 tests passed; 401/403/422/200 assertions on operator mutations (SC-30)                                                                     |
| VC-B095-3 | Operator→security-tester→beta-user journey on the real beta path                          | `bun scripts/beta/verify-beta-controls.mjs`                  | PASS   | denial 503 + recovery + rollback proven; redacted evidence in `scripts/beta/beta-controls-evidence.json`; controlConfig + gitCommit recorded |
| VC-B095-4 | Read-only client state exposes no secrets                                                 | `tests/unit/api/admin-beta-routes.test.ts` (no-secrets scan) | PASS   | deep key scan over `GET /api/v1/beta/state` response finds zero secret-bearing fields                                                        |
| VC-B095-5 | Fail-closed kill switch on unavailable store                                              | `tests/unit/api/beta-controls.test.ts` (fail-closed section) | PASS   | `evaluateKillSwitch` returns `enabled:false, source:"fail_closed"` when the store read throws                                                |

### Proven behavioral paths (BETA-095)

- **Successful path:** operator opens a capability; beta-user request proceeds past the kill switch
  (returns non-503, reaching downstream validation).
- **Denial path:** operator closes `attachments` (or any of the 7 switches); beta-user attempt is
  rejected with `503 beta_capability_disabled` including the disabled `capability`.
- **Recovery path:** operator reopens the switch; the same beta-user attempt now passes the gate.
- **Rollback path:** operator closes again under uncertainty; denial resumes immediately.
- **Concurrency path:** two operators editing the same switch with a stale `expectedVersion` get a
  `409 conflict`; reloading the current version and retrying succeeds.
- **Stale-cache path:** a change written on another node is served stale within the TTL, then
  propagates after the bounded TTL elapses.

### Dependency gates (do not sign off while incomplete)

- **BETA-080 (#1987)** user data export / deletion / retention — assumed merged; retention policy
  hooks (`SC-14`) already enforced.
- **BETA-093 (#2000)** actionable alerts + operator runbooks — assumed merged; this issue adds the
  operator-facing controls those runbooks act upon.

## Sign-off

Record execution results in the release record table of
[`RELEASE_GATES.md`](../deployment/RELEASE_GATES.md). A P0 row failing after merge blocks the
release gate exactly like an open P0 risk register row.
