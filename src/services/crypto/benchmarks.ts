/**
 * Cryptographic performance benchmarks for Hush message sealing and opening.
 *
 * Run with: npx tsx src/services/crypto/benchmarks.ts
 *
 * Results are printed as a table. No plaintext, keys, or secrets are logged.
 * Warm-up iterations run before each measured batch to stabilise JIT and
 * isolate measurement from first-run overhead.
 */

import { sealEnvelope } from "./envelope";
import { openEnvelope, WrappedKeyProvider } from "./open-envelope";
import {
  generateRecipientKeyPair,
  importRecipientPublicKey,
  importRecipientPrivateKey,
  wrapContentKey,
  unwrapContentKey,
  wrapContentKeyForRecipients,
} from "./key-wrap";
import { createCommitment } from "./commitment";
import { canonicalize } from "./jcs";
import { createSealingKey, createOpeningKey } from "./keys";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface BenchmarkResult {
  operation: string;
  payload: string;
  iterations: number;
  warmupMs: number;
  avgMs: string;
  minMs: string;
  maxMs: string;
  totalMs: string;
}

interface BenchSuite {
  operation: string;
  payload: string;
  iterations: number;
  fn: () => Promise<void>;
}

type ResultsRow = Record<string, string>;

/* ------------------------------------------------------------------ */
/*  Timing helpers                                                     */
/* ------------------------------------------------------------------ */

async function measure(
  operation: string,
  payload: string,
  iterations: number,
  fn: () => Promise<void>,
): Promise<BenchmarkResult> {
  const warmupIters = Math.max(1, Math.floor(iterations / 5));
  const timings: number[] = [];

  const warmupStart = performance.now();
  for (let i = 0; i < warmupIters; i++) {
    await fn();
  }
  const warmupMs = performance.now() - warmupStart;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }

  const totalMs = timings.reduce((a, b) => a + b, 0);
  return {
    operation,
    payload,
    iterations,
    warmupMs: Math.round(warmupMs),
    avgMs: (totalMs / iterations).toFixed(3),
    minMs: Math.min(...timings).toFixed(3),
    maxMs: Math.max(...timings).toFixed(3),
    totalMs: totalMs.toFixed(1),
  };
}

function runSuite(suite: BenchSuite[]): Promise<BenchmarkResult[]> {
  return Promise.all(suite.map((b) => measure(b.operation, b.payload, b.iterations, b.fn)));
}

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                     */
/* ------------------------------------------------------------------ */

function makeBody(sizeBytes: number): string {
  return "x".repeat(sizeBytes);
}

function makePayload(depth: number): unknown {
  return {
    version: "v1",
    sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    timestamp: new Date().toISOString(),
    encryption_metadata: {
      algorithm: "AES-256-GCM",
      nonce: "aabbccddeeff001122334455",
      mac: "aabbccddeeff00112233445566778899",
    },
    content_commitment:
      "v1:sha256:hex:a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    attachments: Array.from({ length: depth }, (_, i) => ({
      filename: `file-${i}.pdf`,
      content_type: "application/pdf",
      size_bytes: 1024 * 1024,
      content_hash: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Benchmark suites                                                   */
/* ------------------------------------------------------------------ */

async function benchmarkKeyGeneration(): Promise<BenchmarkResult[]> {
  const suite: BenchSuite[] = [
    {
      operation: "generateRecipientKeyPair",
      payload: "ECDH P-256",
      iterations: 50,
      fn: async () => {
        await generateRecipientKeyPair();
      },
    },
    {
      operation: "createSealingKey",
      payload: "AES-256-GCM",
      iterations: 100,
      fn: async () => {
        const raw = new Uint8Array(32);
        crypto.getRandomValues(raw);
        await createSealingKey(raw);
      },
    },
    {
      operation: "createOpeningKey",
      payload: "AES-256-GCM",
      iterations: 100,
      fn: async () => {
        const raw = new Uint8Array(32);
        crypto.getRandomValues(raw);
        await createOpeningKey(raw);
      },
    },
  ];

  return runSuite(suite);
}

async function benchmarkKeyWrapping(): Promise<BenchmarkResult[]> {
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const pair = await generateRecipientKeyPair();
  const recipientKeys = await Promise.all([
    generateRecipientKeyPair().then((p) => p.publicKey),
    generateRecipientKeyPair().then((p) => p.publicKey),
    generateRecipientKeyPair().then((p) => p.publicKey),
  ]);
  const singleKey = [recipientKeys[0]];
  let wrappedSingle: Awaited<ReturnType<typeof wrapContentKeyForRecipients>> = [];

  const suite: BenchSuite[] = [
    {
      operation: "wrapContentKey",
      payload: "1 recipient",
      iterations: 50,
      fn: async () => {
        await wrapContentKey(contentKey, recipientKeys[0]);
      },
    },
    {
      operation: "wrapContentKeyForRecipients",
      payload: "3 recipients",
      iterations: 30,
      fn: async () => {
        await wrapContentKeyForRecipients(contentKey, recipientKeys);
      },
    },
    {
      operation: "unwrapContentKey",
      payload: "3 entries",
      iterations: 30,
      fn: async () => {
        if (wrappedSingle.length === 0) {
          wrappedSingle = await wrapContentKeyForRecipients(contentKey, singleKey);
        }
        await unwrapContentKey(pair.privateKey, wrappedSingle);
      },
    },
  ];

  return runSuite(suite);
}

async function benchmarkHashing(): Promise<BenchmarkResult[]> {
  const smallData = new Uint8Array(1024);
  const largeData = new Uint8Array(64 * 1024);
  crypto.getRandomValues(smallData);
  crypto.getRandomValues(largeData);

  const suite: BenchSuite[] = [
    {
      operation: "createCommitment",
      payload: "1 KB",
      iterations: 200,
      fn: async () => {
        await createCommitment(smallData);
      },
    },
    {
      operation: "createCommitment",
      payload: "64 KB",
      iterations: 200,
      fn: async () => {
        await createCommitment(largeData);
      },
    },
  ];

  return runSuite(suite);
}

async function benchmarkCanonicalization(): Promise<BenchmarkResult[]> {
  const smallPayload = makePayload(0);
  const largePayload = makePayload(16);

  const suite: BenchSuite[] = [
    {
      operation: "canonicalize",
      payload: "small (no attachments)",
      iterations: 500,
      fn: async () => {
        canonicalize(smallPayload);
      },
    },
    {
      operation: "canonicalize",
      payload: "large (16 attachments)",
      iterations: 500,
      fn: async () => {
        canonicalize(largePayload);
      },
    },
  ];

  return runSuite(suite);
}

async function benchmarkSealing(): Promise<BenchmarkResult[]> {
  const pair = await generateRecipientKeyPair();
  const smallBody = makeBody(1024);
  const mediumBody = makeBody(32 * 1024);
  const maxBody = makeBody(64 * 1024);

  const suite: BenchSuite[] = [
    {
      operation: "sealEnvelope",
      payload: "1 KB body + 1 recipient",
      iterations: 20,
      fn: async () => {
        await sealEnvelope({
          sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
          recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
          body: smallBody,
          recipientPublicKeys: [pair.publicKeySpkiBase64],
        });
      },
    },
    {
      operation: "sealEnvelope",
      payload: "32 KB body + 1 recipient",
      iterations: 20,
      fn: async () => {
        await sealEnvelope({
          sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
          recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
          body: mediumBody,
          recipientPublicKeys: [pair.publicKeySpkiBase64],
        });
      },
    },
    {
      operation: "sealEnvelope",
      payload: "64 KB body + 1 recipient",
      iterations: 20,
      fn: async () => {
        await sealEnvelope({
          sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
          recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
          body: maxBody,
          recipientPublicKeys: [pair.publicKeySpkiBase64],
        });
      },
    },
  ];

  return runSuite(suite);
}

async function benchmarkOpening(): Promise<BenchmarkResult[]> {
  const pair = await generateRecipientKeyPair();
  const smallBody = makeBody(1024);
  const mediumBody = makeBody(32 * 1024);
  const maxBody = makeBody(64 * 1024);

  const sealedSmall = await sealEnvelope({
    sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    body: smallBody,
    recipientPublicKeys: [pair.publicKeySpkiBase64],
  });
  const sealedMedium = await sealEnvelope({
    sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    body: mediumBody,
    recipientPublicKeys: [pair.publicKeySpkiBase64],
  });
  const sealedMax = await sealEnvelope({
    sender: "GD5KD2SB3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    recipient: "GCVANL2B3U6K7BMTQGZ6QLM45TV4VJLJ4A7OQBKLMNOPQRSTUVWXYZ",
    body: maxBody,
    recipientPublicKeys: [pair.publicKeySpkiBase64],
  });

  const keyProvider = new WrappedKeyProvider(pair.privateKeyPkcs8Base64);

  const suite: BenchSuite[] = [
    {
      operation: "openEnvelope",
      payload: "1 KB body + unwrap",
      iterations: 20,
      fn: async () => {
        await openEnvelope(sealedSmall, keyProvider);
      },
    },
    {
      operation: "openEnvelope",
      payload: "32 KB body + unwrap",
      iterations: 20,
      fn: async () => {
        await openEnvelope(sealedMedium, keyProvider);
      },
    },
    {
      operation: "openEnvelope",
      payload: "64 KB body + unwrap",
      iterations: 20,
      fn: async () => {
        await openEnvelope(sealedMax, keyProvider);
      },
    },
  ];

  return runSuite(suite);
}

/* ------------------------------------------------------------------ */
/*  Reporter                                                          */
/* ------------------------------------------------------------------ */

function printResults(results: BenchmarkResult[]): void {
  const rows: ResultsRow[] = results.map((r) => ({
    Operation: r.operation,
    Payload: r.payload,
    Iterations: String(r.iterations),
    "Warmup (ms)": String(r.warmupMs),
    "Avg (ms)": r.avgMs,
    "Min (ms)": r.minMs,
    "Max (ms)": r.maxMs,
    "Total (ms)": r.totalMs,
  }));

  if (typeof console.table === "function") {
    console.table(rows);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }

  const totalWallMs = results.reduce((sum, r) => sum + Number(r.totalMs), 0);
  console.log(`\nTotal benchmark wall time: ${totalWallMs.toFixed(0)} ms`);
  console.log("No plaintext or keys were logged.");
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                  */
/* ------------------------------------------------------------------ */

async function runBenchmarks(): Promise<void> {
  console.log("Hush Crypto Benchmarks");
  console.log("=".repeat(40));
  console.log(`Node.js ${process.version} — ${process.arch}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("");

  const allResults: BenchmarkResult[] = [];

  console.log("[1/6] Key generation...");
  allResults.push(...(await benchmarkKeyGeneration()));

  console.log("[2/6] Key wrapping...");
  allResults.push(...(await benchmarkKeyWrapping()));

  console.log("[3/6] Hashing...");
  allResults.push(...(await benchmarkHashing()));

  console.log("[4/6] Canonicalization...");
  allResults.push(...(await benchmarkCanonicalization()));

  console.log("[5/6] Message sealing...");
  allResults.push(...(await benchmarkSealing()));

  console.log("[6/6] Message opening...");
  allResults.push(...(await benchmarkOpening()));

  console.log("\n");
  printResults(allResults);
}

runBenchmarks().catch((err: unknown) => {
  console.error("Benchmarks failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
