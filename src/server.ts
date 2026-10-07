import handler from "@tanstack/react-start/server-entry";

import { handleApiRequest } from "./server/api/response";
import { getApiContext, getObjectStore } from "./server/api/context";
import { enforceRetention } from "./server/api/retention-service";
import { applySecurityHeaders } from "./server/security/headers";
import { processVerificationMailQueue } from "./services/notifications/worker";

export { StealthCoordinator } from "./server/api/stealth-coordinator";

export default {
  async fetch(...args: Parameters<typeof handler.fetch>) {
    const [request] = args;
    const url = new URL(request.url);
    const host = request.headers.get("host") || url.host;

    // 1. HTTP to HTTPS redirect in production-like envs (Cloudflare x-forwarded-proto)
    const proto = request.headers.get("x-forwarded-proto");
    if (proto === "http" && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      return applySecurityHeaders(
        new Response(null, {
          status: 301,
          headers: {
            Location: `https://${host}${url.pathname}${url.search}`,
          },
        }),
      );
    }

    // 2. Intercept and serve SEP-1 stellar.toml dynamically
    if (url.pathname === "/.well-known/stellar.toml") {
      const isPreview = host.includes("preview") || host.includes("staging");
      const isDev = host.includes("localhost") || host.includes("127.0.0.1");

      let fedServer: string;
      if (isDev) {
        fedServer = `http://${host}/api/v1/federation`;
      } else if (isPreview) {
        fedServer = `https://app-preview.betasmail.com/api/v1/federation`;
      } else {
        fedServer = `https://app.betasmail.com/api/v1/federation`;
      }

      const tomlContent = [
        `# Stellar TOML Configuration for Hush Mail`,
        `FEDERATION_SERVER="${fedServer}"`,
      ].join("\n");

      return applySecurityHeaders(
        new Response(tomlContent, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        }),
      );
    }

    // 3. Root domain redirect (betasmail.com -> app.betasmail.com)
    if (host === "betasmail.com" || host === "www.betasmail.com") {
      return applySecurityHeaders(
        new Response(null, {
          status: 301,
          headers: {
            Location: `https://app.betasmail.com${url.pathname}${url.search}`,
          },
        }),
      );
    }

    // 4. Default API options and request handling
    let response: Response;
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      response = await handleApiRequest(request, () => handler.fetch(...args));
    } else {
      response = await handler.fetch(...args);
    }
    return applySecurityHeaders(response);
  },
  async scheduled(controller: { scheduledTime: number }) {
    const context = await getApiContext();
    await enforceRetention(
      context.repository,
      await getObjectStore(),
      new Date(controller.scheduledTime),
    );
    // BETA-091: drain deferred verification-mail retries (backoff / bounce path).
    await processVerificationMailQueue();
  },
};
