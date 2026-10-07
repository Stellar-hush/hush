# Upgrade Governance and State Migration

Status: proposed
Scope: `contracts` (upgrade authority, timelock, Wasm update flow, state
versions, migration, freeze, rollback)
Related: `contracts/soroban` workspace, `docs/protocol/README.md`

## 1. Motivation

Immutable bugs are unacceptable, but unconstrained upgrades undermine protocol
trust. This document defines how Hush contracts may be upgraded: who may
authorize an upgrade, how long a delay protects users, how on-chain state is
migrated without loss, and which emergency powers exist.

## 2. Governance model

| Concept              | Definition                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authority**        | The single address permitted to propose upgrades and change governance. Queryable via `upgrade_authority()`.                                               |
| **Timelock delay**   | Minimum seconds between `propose_upgrade` and `execute_upgrade`. Queryable via `timelock_delay_seconds()`. Protects users by giving them a window to exit. |
| **Emergency powers** | Explicit, separately-gated capabilities: `freeze` (halt execution) and `rollback` (revert state version). Always recorded in the audit log.                |

### Roles

- `authority` — controls routine upgrades and timelock changes.
- `emergency` — a distinct capability bit (held by the authority by default, but
  revocable/redundant via multisig in production). Required for `freeze` and
  `rollback`. This separation makes "emergency" an _explicit_ act, satisfying the
  acceptance criterion, rather than an implicit admin override.

Multisig / M-of-N is an operational detail layered on top of `authority` (e.g.,
the authority address is a multisig contract). The primitives here do not assume
a single EOA.

## 3. Wasm update flow

1. **Build & hash.** The new Wasm blob is built reproducibly; its SHA-256
   (`wasm_hash`) is recorded.
2. **Propose.** `propose_upgrade(wasm_hash, new_state_version)` — callable only
   by `authority`, only when not frozen. Records `proposed_at = now` and the
   pending tuple. Rejects if a pending upgrade already exists (no overwrite).
3. **Timelock.** `execute_upgrade()` is rejected until
   `now >= proposed_at + timelock_delay_seconds`.
4. **Execute.** On success: the contract instance's Wasm is updated (Soroban
   `set_wasm_hash` / instance storage swap), `state_version` is advanced via the
   idempotent migration (§4), `wasm_hash` is appended to the deployment runbook
   (§6), and the pending tuple is cleared.

The timelock delay itself is queryable (`timelock_delay_seconds()`) and
changeable only by `authority` via `set_timelock_delay`.

## 4. State versions and idempotent migration

Every contract stores an explicit `state_version: u32`. Migrations are addressed
by **target version**, not by "run once" flags.

```
migrate_state(target):
  if state_version >= target: return OK (idempotent no-op)
  for v in (state_version + 1) ..= target:
    apply_migration_step(v)   # each step is itself re-entrant-safe
  state_version = target
  return OK
```

Properties (proven by `tests/unit/protocol/upgrade-governance.test.ts`):

- **Idempotent** — calling `migrate_state(target)` any number of times yields the
  same `state_version` and the same observable state; no step is applied twice.
- **Order-preserving** — versions advance monotonically; a step `v` is never
  skipped or repeated.
- **State-preserving** — the migration reshapes storage in place; no user record
  is dropped. A testnet upgrade therefore preserves all state.

## 5. Freeze and rollback

- `freeze()` — callable by `authority` or `emergency`. Sets `frozen = true`,
  which blocks `propose_upgrade` and `execute_upgrade`. `unfreeze()` reverses it.
- `rollback(target_version)` — callable **only** by `emergency`. Reverts
  `state_version` to `target` (requires `target < current`). Idempotent: rolling
  back to the current version is a no-op. Each rollback is appended to the audit
  log with the caller and timestamp.

Freeze and rollback are _explicit_: they require the dedicated capability and are
always written to the audit log, so "emergency powers" are never silent.

## 6. Deployment runbook (artifact hashes)

A non-upgradable, append-only log records every deployment:

```
{ version, wasm_hash, deployed_at, proposer, executor }
```

This lets any auditor independently verify that the on-chain Wasm matches a
published, reproducible build hash. The runbook is queryable
(`deployment_runbook()`) for independent audit.

## 7. Reference implementation

The normative Soroban `#[contract]` binding follows the flow above and lives in
`contracts/soroban/upgrade/`. To keep the governance/migration _logic_ verifiable
without the Wasm toolchain, the same state machine is provided as a pure,
dependency-free reference module: `src/services/contracts/upgradeGovernance.ts`,
exercised by `tests/unit/protocol/upgrade-governance.test.ts`. Both implement the
identical idempotency, timelock, freeze, and rollback semantics.

## 8. Acceptance criteria mapping

| Criterion                                  | Where satisfied                                   |
| ------------------------------------------ | ------------------------------------------------- |
| Authority and delay are queryable          | `upgrade_authority()`, `timelock_delay_seconds()` |
| Migration is idempotent                    | §4 + `migrate_state` tests                        |
| Emergency powers are explicit              | §5 (`emergency` capability bit, audit-logged)     |
| Deployment runbook records artifact hashes | §6 + `deployment_runbook()`                       |

**Success signal:** an idempotent migration that preserves all state and a runbook
an auditor can verify against published Wasm hashes.
