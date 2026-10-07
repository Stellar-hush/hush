# Encrypted Backups & Restore Procedures

This document defines the backup and restore runbook for the Hush beta data
stores, as required by **BETA-081 (Issue #1988)**. It covers backup scope,
encryption, schedules, retention, access control, restoration order, measured
RTO/RPO, and the documented isolated restore rehearsal.

## Backup Scope

A backup captures the recoverable state of the three beta data stores:

| Store          | Binding                | Content                                                                                                                                  |
| :------------- | :--------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Object | `STEALTH_COORDINATOR`  | Authoritative identity, session, credential, profile, wallet, policy, postage, receipt, idempotency, and counter records.                |
| KV             | `STEALTH_KV`           | Mirror/cache records: policies, sender rules, contacts, key directory, keys, external wallets, relay metadata and job state (`relay:*`). |
| R2             | `STEALTH_OBJECT_STORE` | Encrypted envelope payloads (`envelopes/…`), attachment chunks (`attachments/…`), and transient staging (`staged/…`).                    |

A backup therefore contains **everything needed to recover a beta environment**:
identity, session, policy, relay metadata, object storage, and job state.

## Encryption

Backups are sealed with **AES-256-GCM** using a key derived via
**HKDF-SHA256** from a dedicated `STEALTH_BACKUP_KEY` secret (base64-encoded
32 bytes), bound to the purpose label `stealth-backup-v1`.

- The archive **header is plaintext but never contains keys or values**; it
  carries only format/version/timestamp/source and a non-secret `keyId`
  fingerprint so operators can confirm which key version sealed the archive.
- The **ciphertext** carries the integrity manifest (one SHA-256 digest per
  entry) plus all store entries. Keys inside the manifest are **fingerprinted**
  (never echoed verbatim), and values never appear in any report or log.
- The header fields are bound as AEAD additional data, so tampering with the
  timestamp or source fails authentication.
- `STEALTH_BACKUP_KEY` is **separate from production keys** (cursor, storage,
  relay, operator, …), so rotating backup material never touches live
  signing/wrapping material.

Guarantees (verified by `tests/unit/backup/*`):

- **Backups never contain plaintext wallet seeds or decrypted mail.** Wallet
  seeds are stored as managed-wallet envelopes and mail bodies as encrypted R2
  payloads, and the entire archive is additionally AEAD-sealed.
- **Restore preserves message and idempotency identities without double side
  effects.** Restore performs raw key/value writes (never application replay),
  so `idempotency:` and `counter:` records are restored verbatim — a message
  already processed stays recognized as a duplicate.
- **Integrity manifests**: `verify` authenticates the AEAD seal and recomputes
  every digest; any mismatch or tamper fails the command closed.

## Rotation & Access Control

- Rotate `STEALTH_BACKUP_KEY` on the **90-day cadence** (same as the standard
  inventory in `SECRETS.md`). Rotation creates a new `keyId` in future archives;
  past archives remain decryptable under their original key, so retain prior
  keys until all archives sealed under them reach end of retention.
- Access to `STEALTH_BACKUP_KEY` and to archive files is restricted to the
  operator role. No plaintext credentials or backup values ever appear in
  repository files, client bundles, or CI logs.

## CLI & Retention

The commands run the repository's own backup worker against a local Cloudflare
emulation (Miniflare). State persists under `.wrangler/state/backups`, so
create/restore are restartable and operate on the same emulated store.

```bash
npm run backup:create                      # create an encrypted archive
npm run backup:verify -- <archive.json>    # integrity + tamper check
npm run backup:restore -- <archive.json>   # restore all stores
npm run backup:restore -- <archive.json> -- --wipe-first   # isolated rehearsal (wipes first)
npm run backup:list                        # per-store key counts
npm run backup:rehearsal                   # seed → create → verify → wipe → restore → verify
```

Options: `--key <base64>` overrides the bound secret; `--stores
<durable-object,kv,r2>` restricts create/restore; `--source <label>` records a
redacted environment label; `--persist <dir>` overrides the emulation state
directory.

Archives are written as `.json` files (created under the persist directory by
default). Keep archives in a location with **at-least-daily RPO** coverage and
a **retention period** of at least the maximum re-runnable scheduler horizon
plus one rotation period; retain each key version until its last archive is
past retention. A scheduled backup (daily minimum) plus the on-demand CLI above
satisfies the documented RPO.

## Restoration Order

`restore` applies entries in a documented stage order so dependent records
exist before they are referenced:

1. **Identity & sessions** — `user:*`, `session:*`, `credential:*`,
   `profile:*`, `provisioning:*`, `verification*`, `wallet:*`, `policy-init:*`.
2. **Mailbox policy & sender rules** — `policy:*`, `policy-write:*`,
   `sender-rule:*`, `contacts:*`, `key-directory:*`, `keys:*`,
   `external-wallet:*`, `wallet-challenge:*`.
3. **Relay metadata & job state** — `relay:*`, `envelope:*`, `postage:*`,
   `receipt:*`, `sender-request:*`, `idempotency:*`, `counter:*`.
4. **Object storage payloads** — R2 `staged/`, `envelopes/`, `attachments/`.

Restore is **failing-closed**: the AEAD seal must authenticate and every entry
digest must match the manifest before any write occurs.

## RTO / RPO Targets

- **RTO target**: full restore of a beta environment **≤ 30 minutes**.
  The rehearsal CLI prints measured restore time; the emulated round-trip
  typically completes in milliseconds-to-seconds for fixture data, and the
  duration is recorded per run as evidence.
- **RPO target**: **≤ 24 hours** (daily scheduled backups), improved to the
  archive cadence actually configured.

## Rehearsal (Isolated Restore Evidence)

Run the documented isolated restore rehearsal with **redacted evidence**:

```bash
npm run backup:rehearsal
```

This seeds fixture identity/policy/relay/object-storage data, creates an
encrypted archive, verifies it, **wipes all three stores**, restores from the
archive, and verifies again — printing per-store key counts and the measured
restore duration. No plaintext seeds, mail, emails, or usernames are printed at
any point; the archive header and all reports contain only fingerprints and
counts.

### Production Invocation

A separate backup worker **cannot** share Durable Object storage with the app
worker, so the same engine also runs in-process on the real coordinator via the
operator-facing backup commands (mirroring `StealthCoordinator`
identity-migration behavior); wiring an authenticated admin route is a
follow-up. Locally, the CLI exercises the full engine against Miniflare
emulation before it is ever pointed at real storage.
