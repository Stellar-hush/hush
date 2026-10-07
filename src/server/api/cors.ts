export type CorsPolicy = {
  allowedOrigins: readonly string[];
  allowedMethods: readonly string[];
  allowedHeaders: readonly string[];
  allowCredentials?: boolean;
};

const DEFAULT_ALLOWED_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "PATCH",
] as const;
const DEFAULT_ALLOWED_HEADERS = [
  "Content-Type",
  "X-Idempotency-Key",
  "X-Request-Id",
  "X-Hush-Address",
] as const;

export const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
] as const;

function configuredList(value: string | undefined, fallback: readonly string[] = []): string[] {
  if (value === undefined) {
    return [...fallback];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendVary(headers: Headers, value: string) {
  const values = new Set(
    (headers.get("Vary") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
}

export function validateCorsPolicy(policy: CorsPolicy) {
  if (policy.allowedOrigins.includes("*")) {
    if (policy.allowCredentials) {
      throw new Error("Invalid CORS policy: wildcard origins cannot be combined with credentials.");
    }
    throw new Error("Invalid CORS policy: allowedOrigins must be an explicit origin allowlist.");
  }
}

export function corsPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): CorsPolicy {
  const isProduction =
    env.STEALTH_ENV === "production" ||
    (env.STEALTH_ENV === undefined && env.NODE_ENV === "production");
  const defaultOrigin = isProduction
    ? "https://app.betasmail.com"
    : (env.STEALTH_APP_URL ?? "http://localhost:3000");
  const policy: CorsPolicy = {
    allowedOrigins: isProduction
      ? [defaultOrigin]
      : [
          ...new Set([
            ...configuredList(env.STEALTH_CORS_ALLOWED_ORIGINS, [defaultOrigin]),
            ...LOCAL_DEV_ORIGINS,
          ]),
        ],
    allowedMethods: configuredList(env.STEALTH_CORS_ALLOWED_METHODS, DEFAULT_ALLOWED_METHODS),
    allowedHeaders: configuredList(env.STEALTH_CORS_ALLOWED_HEADERS, DEFAULT_ALLOWED_HEADERS),
    allowCredentials: env.STEALTH_CORS_ALLOW_CREDENTIALS?.toLowerCase() !== "false",
  };
  validateCorsPolicy(policy);
  return policy;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfEarlyResponse(request: Request, policy: CorsPolicy): Response | undefined {
  if (policy.allowedOrigins.some((origin) => origin.startsWith("http://localhost"))) {
    return undefined;
  }
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return undefined;
  if (!request.headers.get("cookie")) return undefined;
  if (request.headers.get("Origin") || request.headers.get("Referer")) return undefined;

  // SameSite=Lax is the primary browser defense; this closes clients that send
  // the session cookie without the browser's Origin/Referer context.
  const headers = new Headers();
  appendVary(headers, "Origin");
  return new Response(null, { status: 403, headers });
}

export const apiCorsPolicy = corsPolicyFromEnv();

export function corsEarlyResponse(request: Request, policy: CorsPolicy): Response | undefined {
  const url = new URL(request.url);
  const isFederation =
    url.pathname === "/api/v1/federation" || url.pathname === "/api/v1/federation/";

  const origin = request.headers.get("Origin");
  if (origin !== null && !isFederation && !policy.allowedOrigins.includes(origin)) {
    const headers = new Headers();
    appendVary(headers, "Origin");
    return new Response(null, { status: 403, headers });
  }

  if (request.method.toUpperCase() !== "OPTIONS") {
    return undefined;
  }

  if (isFederation) {
    const headers = new Headers({
      "Access-Control-Allow-Origin": origin ?? "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return new Response(null, { status: 204, headers });
  }

  if (origin === null) {
    return new Response(null, { status: 403 });
  }

  const requestedMethod = request.headers.get("Access-Control-Request-Method")?.toUpperCase();
  const allowedMethods = policy.allowedMethods.map((method) => method.toUpperCase());
  const requestedHeaders = (request.headers.get("Access-Control-Request-Headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const allowedHeaderNames = new Set(policy.allowedHeaders.map((header) => header.toLowerCase()));

  if (
    !requestedMethod ||
    !allowedMethods.includes(requestedMethod) ||
    requestedHeaders.some((header) => !allowedHeaderNames.has(header))
  ) {
    return new Response(null, { status: 403 });
  }

  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": policy.allowedHeaders.join(", "),
  });
  if (policy.allowCredentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  appendVary(headers, "Origin");
  appendVary(headers, "Access-Control-Request-Method");
  appendVary(headers, "Access-Control-Request-Headers");

  return new Response(null, { status: 204, headers });
}

export function applyCors(request: Request, response: Response, policy: CorsPolicy): Response {
  const url = new URL(request.url);
  const isFederation =
    url.pathname === "/api/v1/federation" || url.pathname === "/api/v1/federation/";
  const origin = request.headers.get("Origin");

  if (isFederation) {
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin ?? "*");
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  if (origin === null || !policy.allowedOrigins.includes(origin)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  if (policy.allowCredentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  appendVary(headers, "Origin");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
