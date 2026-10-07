#!/usr/bin/env node
/**
 * BETA-081 (Issue #1988) — encrypted backup CLI.
 *
 * Runs the backup commands (create / verify / restore / list / rehearsal)
 * against a local Cloudflare emulation of the beta data stores (Durable Object
 * identity records, KV, R2) using the repository's own backup worker. State
 * persists under `.wrangler/state/backups` (overridable with --persist).
 *
 * The archive is an AES-256-GCM sealed JSON file whose header never contains
 * keys or plaintext; the manifest inside the ciphertext fingerprints keys, and
 * a restore never replays application side effects (it writes keys verbatim),
 * so message and idempotency identities are preserved exactly.
 *
 * Usage:
 *   node scripts/backup/backup.mjs create [--out <file>] [--source <label>] [--stores <durable-object,kv,r2>] [--key <base64>]
 *   node scripts/backup/backup.mjs verify <archive-file> [--key <base64>]
 *   node scripts/backup/backup.mjs restore <archive-file> [--wipe-first] [--stores <durable-object,kv,r2>] [--key <base64>]
 *   node scripts/backup/backup.mjs list
 *   node scripts/backup/backup.mjs rehearsal [--out <file>] [--key <base64>]
 */
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const WORKER = join(ROOT, "src", "server", "backup", "worker.ts");
const DEFAULT_PERSIST = join(ROOT, ".wrangler", "state", "backups");

const COMMANDS = ["create", "verify", "restore", "list", "rehearsal"];

const args = process.argv.slice(2);
const command = args.shift();
if (!COMMANDS.includes(command ?? "")) {
  console.error(`Usage: backup.mjs <${COMMANDS.join("|")}> [options]`);
  process.exit(1);
}

const options = {
  stores: undefined,
  key: process.env.STEALTH_BACKUP_KEY,
  out: undefined,
  source: undefined,
  wipeFirst: false,
  persist: undefined,
  archiveFile: undefined,
};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--key") options.key = args[++i];
  else if (arg === "--stores") options.stores = args[++i];
  else if (arg === "--out") options.out = args[++i];
  else if (arg === "--source") options.source = args[++i];
  else if (arg === "--wipe-first") options.wipeFirst = true;
  else if (arg === "--persist") options.persist = args[++i];
  else if (!arg.startsWith("--") && !options.archiveFile) options.archiveFile = arg;
}

if (command === "verify" || command === "restore") {
  if (!options.archiveFile) {
    console.error(`${command} requires an archive file path`);
    process.exit(1);
  }
}

if (options.stores) {
  options.stores = options.stores
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ["durable-object", "kv", "r2"].includes(s));
  if (options.stores.length === 0) {
    console.error("--stores must be a comma-separated subset of durable-object,kv,r2");
    process.exit(1);
  }
}

const persist = options.persist ?? DEFAULT_PERSIST;
const runOptions = {
  key: options.key,
  source: options.source,
  stores: options.stores,
  wipeFirst: options.wipeFirst,
};

console.log(`✦ Hush backups — command: ${command}`);
if (options.archiveFile) console.log(`  archive:           ${options.archiveFile}`);
if (options.stores) console.log(`  stores:            ${options.stores.join(", ")}`);

const result = await build({
  entryPoints: [WORKER],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["cloudflare:workers"],
  write: false,
  logLevel: "silent",
});
const code = result.outputFiles[0].text;

const mf = new Miniflare({
  name: "stealth-backups",
  modules: true,
  script: code,
  compatibilityDate: "2025-09-24",
  compatibilityFlags: ["nodejs_compat"],
  durableObjects: { STEALTH_COORDINATOR: "StealthCoordinator" },
  kvNamespaces: { STEALTH_KV: "local-emulation-kv" },
  r2Buckets: { STEALTH_OBJECT_STORE: "local-emulation-r2" },
  durableObjectsPersist: persist,
  kvPersist: persist,
  r2Persist: persist,
});

async function dispatch(body) {
  const res = await mf.dispatchFetch("http://localhost/backup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  return { status: res.status, body: payload };
}

try {
  switch (command) {
    case "create": {
      const { status, body } = await dispatch({ command: "create", options: runOptions });
      if (status !== 200 || !body.ok) {
        console.error("✖ Backup create failed:", body.errors);
        process.exit(1);
      }
      const outFile =
        options.out ??
        join(persist, `stealth-backup-${body.archive.createdAt.replace(/[:.]/g, "-")}.json`);
      mkdirSync(join(persist), { recursive: true });
      writeFileSync(outFile, JSON.stringify(body.archive, null, 2));
      console.log(`  archive written:   ${outFile}`);
      console.log(
        `  encrypted:         ${body.archive.encryption.cipher} (keyId ${body.archive.encryption.keyId})`,
      );
      for (const store of body.stores) {
        console.log(`  ${store.store.padEnd(16)} ${store.count} keys, ${store.byteLength} bytes`);
      }
      console.log(`  created in:        ${body.durationMs} ms`);
      console.log("✓ Backup created.");
      break;
    }

    case "verify": {
      const archive = JSON.parse(readFileSync(options.archiveFile, "utf8"));
      const { status, body } = await dispatch({ command: "verify", options: runOptions, archive });
      if (status !== 200 || !body.ok) {
        console.error("✖ Backup verify failed:", body.errors);
        process.exit(1);
      }
      console.log(`  verified:          ${body.verified} entries, ${body.mismatches} mismatches`);
      console.log("✓ Backup integrity verified.");
      break;
    }

    case "restore": {
      const archive = JSON.parse(readFileSync(options.archiveFile, "utf8"));
      const { status, body } = await dispatch({ command: "restore", options: runOptions, archive });
      if (status !== 200 || !body.ok) {
        console.error("✖ Backup restore failed:", body.errors);
        process.exit(1);
      }
      console.log(`  restored:          ${body.restored} entries`);
      for (const store of body.stores) {
        console.log(`  ${store.store.padEnd(16)} ${store.count} keys, ${store.byteLength} bytes`);
      }
      console.log(`  restored in:       ${body.durationMs} ms`);
      console.log("✓ Backup restored.");
      break;
    }

    case "list": {
      const { status, body } = await dispatch({ command: "list", options: {} });
      if (status !== 200) {
        console.error("✖ Backup list failed");
        process.exit(1);
      }
      for (const store of body.stores) {
        console.log(`  ${store.store.padEnd(16)} ${store.keys} keys`);
      }
      break;
    }

    case "rehearsal": {
      const ns = await mf.getDurableObjectNamespace("STEALTH_COORDINATOR");
      const stub = ns.get(ns.idFromName("global-stealth-coordinator"));
      const kv = await mf.getKVNamespace("STEALTH_KV");
      const r2 = await mf.getR2Bucket("STEALTH_OBJECT_STORE");

      const seedAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
      console.log("  seeding fixture data (identity, policy, relay, object storage)…");
      await stub._debugSeed([
        {
          key: "user:id:u_1",
          value: {
            $v: 1,
            userId: "u_1",
            address: seedAddress,
            email: "alice@example.com",
            username: "alice",
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            version: 1,
          },
        },
        { key: "user:email:alice@example.com", value: "u_1" },
        { key: "user:username:alice", value: "u_1" },
        { key: `user:address:${seedAddress}`, value: "u_1" },
        {
          key: "session:s_1",
          value: {
            $v: 1,
            sessionId: "s_1",
            userId: "u_1",
            createdAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-02-01T00:00:00.000Z",
            lastActiveAt: "2026-01-01T00:00:00.000Z",
          },
        },
        {
          key: "policy:p_1",
          value: {
            $v: 1,
            policyId: "p_1",
            userId: "u_1",
            title: "Inbox rules",
            rules: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        {
          key: "idempotency:op_1",
          value: {
            $v: 1,
            key: "op_1",
            operation: "send",
            status: "completed",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ]);
      await kv.put(
        "sender-rule:sr_1",
        JSON.stringify({ ruleId: "sr_1", userId: "u_1", pattern: "spam" }),
      );
      await kv.put(
        "relay:message:msg_1",
        JSON.stringify({ messageId: "msg_1", recipient: "bob@example.com" }),
      );
      await r2.put("envelopes/m1/aaaa", new TextEncoder().encode("encrypted-envelope-bytes"));

      const created = await (
        await mf.dispatchFetch("http://localhost/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "create", options: runOptions }),
        })
      ).json();
      if (!created.ok) {
        console.error("✖ Rehearsal create failed:", created.errors);
        process.exit(1);
      }
      const outFile =
        options.out ??
        join(
          persist,
          `stealth-backup-rehearsal-${created.archive.createdAt.replace(/[:.]/g, "-")}.json`,
        );
      mkdirSync(persist, { recursive: true });
      writeFileSync(outFile, JSON.stringify(created.archive, null, 2));
      console.log(`  archive written:   ${outFile}`);

      const verifyBefore = await (
        await mf.dispatchFetch("http://localhost/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: "verify",
            options: runOptions,
            archive: created.archive,
          }),
        })
      ).json();
      if (!verifyBefore.ok) {
        console.error("✖ Rehearsal verify failed:", verifyBefore.errors);
        process.exit(1);
      }
      console.log(`  verified:          ${verifyBefore.verified} entries before wipe`);

      const restored = await (
        await mf.dispatchFetch("http://localhost/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: "restore",
            options: { ...runOptions, wipeFirst: true },
            archive: created.archive,
          }),
        })
      ).json();
      if (!restored.ok) {
        console.error("✖ Rehearsal restore failed:", restored.errors);
        process.exit(1);
      }
      console.log(`  restored:          ${restored.restored} entries in ${restored.durationMs} ms`);

      const verifyAfter = await (
        await mf.dispatchFetch("http://localhost/backup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: "verify",
            options: runOptions,
            archive: created.archive,
          }),
        })
      ).json();
      if (!verifyAfter.ok) {
        console.error("✖ Rehearsal post-restore verify failed:", verifyAfter.errors);
        process.exit(1);
      }

      const doKeys = await stub.listKeys("");
      const kvKeys = ((await (await kv.list({})).keys) ?? []).map((k) => k.name);
      const r2Keys = (await r2.list({})).objects.map((o) => o.key);
      console.log(
        `  restored keys:     durable-object=${doKeys.length}, kv=${kvKeys.length}, r2=${r2Keys.length}`,
      );
      console.log(`  archive:           ${outFile}`);
      console.log(`  RTO (restore):     ${restored.durationMs} ms`);
      console.log("✓ Rehearsal complete: backup → verify → wipe → restore → verify.");
      break;
    }
  }
} finally {
  await mf.dispose();
}
