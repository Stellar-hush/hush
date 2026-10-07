/**
 * Relay Docker entry point (Issue #1935 BETA-028).
 *
 * Serves the relay HTTP contract (`/health`, `/readiness`, `/version`,
 * `POST /messages`) with a plain Node HTTP server and in-memory persistence,
 * backed by an in-process worker that drains the queue through the existing
 * federation delivery client. Constructs the relay service directly instead of
 * importing the Cloudflare context factory so the bundle stays Node-resolvable.
 */
import { createServer, type IncomingMessage } from "node:http";

import { loadRuntimeConfig } from "@/config";
import { protocolManifest } from "@/server/api/protocol";
import { MemoryApiRepository } from "@/server/api/memory-repository";
import { getVersionInfo } from "@/server/api/version";
import { createConfiguredAdmissionEvaluator } from "@/services/relay/policy-chain";
import { ingestMailboxEnvelope } from "@/services/relay/ingest";
import { InProcessRelayWorker } from "@/services/relay/in-process-worker";
import { MemoryMailboxSyncPersistence } from "@/services/relay/memory-mailbox-sync";
import { MemoryRelayPersistence } from "@/services/relay/memory-persistence";
import { MailboxSyncService } from "@/services/relay/mailbox-sync-service";
import { handleMailboxSync } from "@/services/relay/mailbox-sync-transport";
import {
  RELAY_SERVICE_NAME,
  RelayService,
  type RelayServiceConfig,
} from "@/services/relay/relay-service";
import { submitToRelay } from "@/services/relay/submit";
import {
  handleRelayHealth,
  handleRelayReadiness,
  handleRelaySubmit,
  handleRelayVersion,
} from "@/services/relay/transport";

const PORT = Number(process.env.PORT ?? 3000);

function buildConfig(): RelayServiceConfig {
  const config = loadRuntimeConfig();
  return {
    serviceName: RELAY_SERVICE_NAME,
    version: getVersionInfo().build,
    apiVersion: protocolManifest.apiVersion,
    protocolVersion: config.contract.protocolVersion,
    timeoutMs: 1_000,
    network: {
      horizonUrl: config.network.horizonUrl,
      sorobanRpcUrl: config.network.sorobanRpcUrl,
      networkPassphrase: config.network.networkPassphrase,
    },
    audience: process.env.STEALTH_RELAY_AUDIENCE ?? "relay:test.stealth",
    policiesContractId: config.contract.policiesContractId,
  };
}

let service: RelayService | undefined;
let worker: InProcessRelayWorker | undefined;
let mailboxSync: MailboxSyncService | undefined;

function getService(): RelayService {
  if (service && mailboxSync) return service;

  const persistence = new MemoryRelayPersistence();
  const repository = new MemoryApiRepository();
  const runtime = loadRuntimeConfig();
  const mailboxPersistence = new MemoryMailboxSyncPersistence();
  mailboxSync = new MailboxSyncService(mailboxPersistence);
  worker = new InProcessRelayWorker(persistence, {
    onMessage: async (envelope) => {
      const outcome = await ingestMailboxEnvelope(mailboxPersistence, envelope);
      if (outcome.status !== "delivered") {
        return;
      }
      await submitToRelay(
        {
          messageId: envelope.messageId,
          sender: envelope.sender,
          recipient: envelope.recipient,
          recipientDomain: envelope.recipientDomain,
          payload: envelope.payload,
          ttlMs: envelope.ttlMs,
        },
        {
          resolveRelay: async (domain) => ({
            domain,
            endpoint: `https://${domain}/api/v1/relay/messages`,
            publicKey: "",
          }),
          transport: async () => ({ status: 202 }),
        },
      );
    },
  });

  service = new RelayService(persistence, worker, buildConfig(), {
    evaluator: createConfiguredAdmissionEvaluator({
      repository,
      policiesContractId: runtime.contract.policiesContractId,
      networkPassphrase: runtime.network.networkPassphrase,
      sorobanRpcUrl: runtime.network.sorobanRpcUrl,
    }),
    mailbox: repository,
    repository,
  });
  void worker.start();
  return service;
}

function getMailboxSync(): MailboxSyncService {
  getService();
  return mailboxSync!;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  const body =
    method === "GET" || method === "HEAD" ? undefined : (await readBody(req)).toString("utf8");
  return new Request(url, { method, headers, body });
}

const server = createServer(async (req, res) => {
  const request = await toWebRequest(req);
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  const relay = getService();

  let response: Response;
  if (method === "GET" && (path === "/health" || path === "/api/v1/relay/health")) {
    response = await handleRelayHealth(request, relay);
  } else if (method === "GET" && (path === "/readiness" || path === "/api/v1/relay/readiness")) {
    response = await handleRelayReadiness(request, relay);
  } else if (method === "GET" && (path === "/version" || path === "/api/v1/relay/version")) {
    response = await handleRelayVersion(request, relay);
  } else if (method === "POST" && (path === "/messages" || path === "/api/v1/relay/messages")) {
    response = await handleRelaySubmit(request, relay);
  } else if (method === "POST" && (path === "/mailbox/sync" || path === "/api/v1/mailbox/sync")) {
    response = await handleMailboxSync(request, getMailboxSync());
  } else {
    response = new Response(
      JSON.stringify({ error: { code: "not_found", message: "Not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, () => {
  console.log(`Hush relay listening on port ${PORT}`);
});

function shutdown(): void {
  service = undefined;
  mailboxSync = undefined;
  if (worker) {
    void worker.stop();
    worker = undefined;
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
