# Security and Performance Hardening — Stellar Team Payout Request

Tool: `tools/v2/team/stellar-team-payout-request/`
Issue: [#667](https://github.com/Stellar-hush/hush/issues/667) — Security and
performance hardening (V2 team tool).

This document records the threat assumptions, unsafe inputs, and performance
constraints for the Stellar Team Payout Request tool. All hardening lives in
`security.ts` (folder-local; no network, no secrets, no main-app linkage).

## Trust boundaries

- The tool constructs a batch payout: a `source` account, a memo, and a list of
  `(address, amount)` recipients. These inputs come from users/UI and are
  **untrusted** — they must not be able to trigger malformed on-chain calls,
  amplify work, or exhaust resources.
- The tool performs no signing or network I/O itself; hardening is about
  validating inputs before any future integration and bounding batch work.

## Threat assumptions

| #   | Threat                                                                                     | Assumption                                                                       |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| T1  | **Bad target address** — a malformed address causes failed/abusive transfers.              | Addresses match a structural Stellar pattern (`G` + 55 base32 chars).            |
| T2  | **Bad amount** — negative / non-finite / huge amounts cause math errors or drain.          | Amounts are finite, strictly positive, and ≤ `MAX_PAYOUT_AMOUNT` (1e15 stroops). |
| T3  | **Batch amplification** — a 10k-recipient list multiplies downstream ops.                  | Recipients are capped at `MAX_RECIPIENTS` (100).                                 |
| T4  | **Hostile memo** — control bytes / oversized memo break storage or the Stellar memo limit. | Memo is sanitized (control bytes stripped) and clamped to `MAX_MEMO_CHARS` (28). |
| T5  | **Duplicate execution** — replaying a payout double-pays.                                  | `idempotencyKey` is mandatory; missing key is rejected.                          |

## Unsafe inputs and handling

| Input                  | Unsafe shape              | Handling in `security.ts`         |
| ---------------------- | ------------------------- | --------------------------------- |
| `source`               | non-string / wrong shape  | structural Stellar-address check  |
| `recipients[].address` | malformed                 | per-recipient address check       |
| `recipients[].amount`  | ≤0 / NaN / ∞ / huge       | finite + bounds check             |
| `recipients`           | empty / >100              | required + cap (`MAX_RECIPIENTS`) |
| `memo`                 | control bytes / >28 chars | `stripControlChars` + clamp       |
| `idempotencyKey`       | missing / empty           | required check                    |

## Hardened API

- `hardenPayoutRequest(input)` → `{ value, issues }` — validate + sanitize; refuse
  execution when `issues.length > 0`.
- `capBatch(recipients)` → at most `MAX_RECIPIENTS` recipients.
- `totalAmount(recipients)` → finite-only sum, for short-circuiting oversize batches.

## Performance notes (large datasets)

- `capBatch` bounds recipient lists so downstream per-recipient work is fixed.
- `totalAmount` is O(n) over recipients with no allocation beyond the sum; it
  ignores `NaN`/`Infinity` so a single bad entry can't poison the total.
- Sanitization is a single linear pass; cost is O(n) in input length.
- All changes are confined to `tools/v2/team/stellar-team-payout-request/`.

## Acceptance criteria

- [x] Explicit handling for malformed / hostile input (`hardenPayoutRequest`)
- [x] Avoids unnecessary work on large datasets (`capBatch`, `totalAmount`)
- [x] No existing security-sensitive app code modified
- [x] Files changed limited to `tools/v2/team/stellar-team-payout-request/`
- [x] Self-contained, reviewable mini-product change
