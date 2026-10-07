# Cryptographic Benchmarks

This directory contains performance benchmarks for the Hush crypto service
operations: key generation, key wrapping, message sealing/opening, hashing,
and canonicalization.

## Running

```bash
npx tsx src/services/crypto/benchmarks.ts
```

No build step is required. The script uses Node.js's built-in Web Crypto API
(`crypto.subtle`) and `performance.now()` — no external dependencies.

## Requirements

- Node.js 20+ (Web Crypto API is stable)
- `tsx` (TypeScript executor) or `bun`

## Output

Results are printed as a console table with columns:

| Column      | Description                           |
| ----------- | ------------------------------------- |
| Operation   | Crypto function name                  |
| Payload     | Input size or parameter description   |
| Iterations  | Number of measured runs               |
| Warmup (ms) | Total time for warm-up iterations     |
| Avg (ms)    | Mean time per iteration               |
| Min (ms)    | Fastest iteration                     |
| Max (ms)    | Slowest iteration                     |
| Total (ms)  | Wall-clock sum of measured iterations |

No plaintext, keys, or secrets are logged.

## Benchmark Structure

Each benchmark runs in two phases:

1. **Warm-up** — 20% of the iteration count (minimum 1). These runs stabilise
   JIT compilation and V8 hidden-class transitions. Warm-up timing is reported
   separately and excluded from the measured average.

2. **Measured** — The remaining iterations are timed individually via
   `performance.now()`. Results are reported as avg/min/max.

## CI Variance

CI environments (GitHub Actions, etc.) typically exhibit 2–5× higher variance
than dedicated hardware due to:

- **CPU throttling** — Shared vCPUs, thermal capping, and noisy neighbours.
- **Virtualisation overhead** — Hypervisor context switches and NUMA effects.
- **Container resource limits** — cgroup CPU quotas and throttling periods.
- **Reduced clock precision** — `performance.now()` resolution may be clamped
  to 100 µs or worse in containerised environments.
- **ASLR and KASLR** — First-run penalty on cold caches and branch predictors.

### Recommended methodology

1. Run the benchmark suite **5 times** and report the median of the "Avg (ms)"
   column. A single run may be skewed by cold-start effects.
2. Compare results **within the same CI job** (e.g., before/after a change)
   rather than across jobs or platforms.
3. Treat any change less than **2× the standard deviation** across 5 runs as
   noise. Crypto operations with small variance (hashing, canonicalization)
   tighten this threshold; key generation and wrapping are inherently more
   variable due to Web Crypto's internal entropy collection.
4. For PRs that claim performance impact, include the raw output of a
   benchmark run or a link to a CI job with the benchmark step enabled.

### Expected ranges (reference — local Node.js 20 on x86_64)

| Operation                   | Payload                | Expected Avg |
| --------------------------- | ---------------------- | ------------ |
| generateRecipientKeyPair    | ECDH P-256             | 5–15 ms      |
| createSealingKey            | AES-256-GCM            | <1 ms        |
| wrapContentKey              | 1 recipient            | 5–15 ms      |
| wrapContentKeyForRecipients | 3 recipients           | 15–45 ms     |
| sealEnvelope                | 1 KB body              | 10–30 ms     |
| sealEnvelope                | 64 KB body             | 15–40 ms     |
| openEnvelope                | 1 KB body              | 10–30 ms     |
| openEnvelope                | 64 KB body             | 15–40 ms     |
| createCommitment            | 64 KB                  | <1 ms        |
| canonicalize                | large (16 attachments) | <2 ms        |

**These are approximate.** Always measure on your target hardware.

## Adding a new benchmark

1. Add a `BenchSuite` entry in the appropriate suite function in
   `benchmarks.ts`.
2. Set `iterations` high enough that the total measured time exceeds 100 ms
   (or adjust for very fast operations).
3. Ensure the function under test is `async` and calls no logging that could
   leak plaintext or keys.
4. Run the suite to verify it completes without error.

## Security

- The benchmark runner **never logs plaintext, keys, nonces, or secrets**.
- Ephemeral keys are generated per run and discarded after the suite
  completes.
- All `CryptoKey` objects are held in memory only during their benchmark
  and garbage-collected afterwards.
