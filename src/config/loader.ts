import {
  runtimeConfigSchema,
  type BetaRuntimeConfig,
  type ConfigProfile,
  type NotificationTransport,
  type PublicConfig,
} from "./schema";
import { BETA_CAPABILITIES } from "../server/api/beta-controls/types";
import { loadManifest, validateRegistryDrift } from "./registry";

const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"];

const DEFAULT_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "x-stealth-address",
  "x-stealth-delegation",
  "x-request-id",
  "traceparent",
  "tracestate",
  "baggage",
];

export interface LoadConfigOptions {
  profile?: ConfigProfile;
  env?: Record<string, unknown>;
}

function parseList(value: unknown, defaultList: string[]): string[] {
  if (typeof value === "string") {
    const split = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (split.length > 0) return split;
  }
  if (Array.isArray(value)) {
    const filtered = value
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
    if (filtered.length > 0) return filtered;
  }
  return [...defaultList];
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  return fallback;
}

function isPlaceholderSecret(secret: string | undefined): boolean {
  if (!secret) return true;
  const lower = secret.toLowerCase().trim();
  return (
    lower === "" ||
    lower === "dev-secret" ||
    lower === "dev-cursor-secret-change-me" ||
    lower === "placeholder" ||
    lower === "change-me"
  );
}

function isPlaceholderKvId(id: string | undefined): boolean {
  if (!id) return true;
  const lower = id.toLowerCase().trim();
  return (
    lower === "" ||
    lower === "placeholder-prod-id" ||
    lower === "placeholder-preview-id" ||
    lower === "placeholder"
  );
}

function isPlaceholderContractId(id: string | undefined): boolean {
  if (!id) return true;
  return id.includes("PLACEHOLDER") || id === "placeholder";
}

/**
 * Load and validate the complete Beta Runtime Configuration contract.
 */
export function loadRuntimeConfig(options: LoadConfigOptions = {}): BetaRuntimeConfig {
  const env: Record<string, unknown> = {
    ...(typeof process !== "undefined" ? process.env : {}),
    ...(options.env ?? {}),
  };

  // Determine profile
  const profileRaw =
    options.profile ??
    (env.STEALTH_ENV as string) ??
    (env.NODE_ENV as string) ??
    (env.MODE as string) ??
    "development";

  let profile: ConfigProfile = "development";
  if (profileRaw === "production" || profileRaw === "prod") profile = "production";
  else if (profileRaw === "preview" || profileRaw === "staging") profile = "preview";
  else if (profileRaw === "test") profile = "test";
  else profile = "development";

  const isProd = profile === "production";
  const isPreview = profile === "preview";

  const roleRaw = (env.STEALTH_ROLE as string) ?? "all";
  const role = ["all", "web", "relay", "indexer", "operator"].includes(roleRaw)
    ? (roleRaw as any)
    : "all";

  // 1. Network
  const stellarNetwork = (env.STEALTH_STELLAR_NETWORK as any) ?? (isProd ? "mainnet" : "testnet");
  const horizonUrl =
    (env.STEALTH_HORIZON_URL as string) ??
    (stellarNetwork === "mainnet"
      ? "https://horizon.stellar.org"
      : "https://horizon-testnet.stellar.org");
  const sorobanRpcUrl =
    (env.STEALTH_SOROBAN_RPC_URL as string) ??
    (stellarNetwork === "mainnet"
      ? "https://soroban-rpc.mainnet.stellar.org"
      : "https://soroban-testnet.stellar.org");
  const networkPassphrase =
    (env.STEALTH_NETWORK_PASSPHRASE as string) ??
    (stellarNetwork === "mainnet"
      ? "Public Global Stellar Network ; September 2015"
      : "Test SDF Network ; September 2015");

  // 2. Storage
  const storageDriver =
    (env.STEALTH_STORAGE_DRIVER as any) ?? (isProd || isPreview ? "hybrid" : "memory");
  const kvNamespaceId =
    (env.STEALTH_KV_NAMESPACE_ID as string) ??
    (isProd ? "stealth-kv-beta-prod" : isPreview ? "stealth-kv-beta-preview" : "stealth-kv-dev");
  const kvBinding = options.env?.STEALTH_KV ?? env.STEALTH_KV;
  const coordinatorBinding = options.env?.STEALTH_COORDINATOR ?? env.STEALTH_COORDINATOR;

  // 3. Session & Security
  const authChallengeLifetimeMs = parseNumber(env.STEALTH_AUTH_CHALLENGE_LIFETIME_MS, 300000);
  const authClockSkewMs = parseNumber(env.STEALTH_AUTH_CLOCK_SKEW_MS, 30000);
  const authNonceTtlMs = parseNumber(env.STEALTH_AUTH_NONCE_TTL_MS, 300000);
  const quoteLifetimeMs = parseNumber(env.STEALTH_QUOTE_LIFETIME_MS, 300000);

  // 4. Relay
  const relayUrl =
    (env.STEALTH_RELAY_URL as string) ??
    (isProd ? "https://relay.betasmail.com" : "https://relay-testnet.betasmail.com");
  const relayTimeoutMs = parseNumber(env.STEALTH_RELAY_TIMEOUT_MS, 10000);

  // Secrets
  const cursorSecret =
    (env.STEALTH_CURSOR_SECRET as string) ?? (isProd ? "" : "dev-cursor-secret-change-me");
  const relayApiKey = (env.STEALTH_RELAY_API_KEY as string) || undefined;
  const storageSecret = (env.STEALTH_STORAGE_SECRET as string) || undefined;
  const smtpPassword = (env.STEALTH_SMTP_PASSWORD as string) || undefined;
  const rpcApiKey = (env.STEALTH_RPC_API_KEY as string) || undefined;
  const operatorSecret = (env.STEALTH_OPERATOR_SECRET as string) || undefined;

  // 5. Contract
  const registryContractId =
    (env.STEALTH_REGISTRY_CONTRACT_ID as string) ??
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const postageContractId =
    (env.STEALTH_POSTAGE_CONTRACT_ID as string) ??
    "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  const lifecycleContractId =
    (env.STEALTH_LIFECYCLE_CONTRACT_ID as string) ?? "C_DEV_LIFECYCLE_CONTRACT";
  const receiptsContractId =
    (env.STEALTH_RECEIPTS_CONTRACT_ID as string) ??
    "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
  const policiesContractId = (env.STEALTH_POLICIES_CONTRACT_ID as string) ?? "C".repeat(56);
  const domainTag = (env.STEALTH_DOMAIN_TAG as string) ?? "Stealth_Mail_Protocol";
  const protocolVersion = (env.STEALTH_PROTOCOL_VERSION as string) ?? "v1";

  // 6. Origin
  const appUrl =
    (env.STEALTH_APP_URL as string) ??
    (isProd ? "https://app.betasmail.com" : "http://localhost:3000");
  const allowedOrigins = parseList(
    env.STEALTH_CORS_ALLOWED_ORIGINS,
    isProd
      ? ["https://app.betasmail.com"]
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:8080",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:8080",
        ],
  );
  const allowedMethods = parseList(env.STEALTH_CORS_ALLOWED_METHODS, DEFAULT_ALLOWED_METHODS);
  const allowedHeaders = parseList(env.STEALTH_CORS_ALLOWED_HEADERS, DEFAULT_ALLOWED_HEADERS);
  const allowCredentials =
    typeof env.STEALTH_CORS_ALLOW_CREDENTIALS === "boolean"
      ? env.STEALTH_CORS_ALLOW_CREDENTIALS
      : typeof env.STEALTH_CORS_ALLOW_CREDENTIALS === "string"
        ? env.STEALTH_CORS_ALLOW_CREDENTIALS.toLowerCase() === "true"
        : true;

  // 7. Notifications (BETA-005). The production default is SMTP; deployments
  // must point it at their own mail server (no third-party vendor). Non-prod
  // profiles default to the local capture sink.
  const notificationTransport: NotificationTransport =
    (env.STEALTH_NOTIFICATION_TRANSPORT as NotificationTransport) ?? (isProd ? "smtp" : "sink");
  const smtpHost = (env.STEALTH_SMTP_HOST as string) ?? (isProd ? "smtp.invalid" : "localhost");
  const smtpPort = parseNumber(env.STEALTH_SMTP_PORT, 587);
  const smtpSecure = parseBool(env.STEALTH_SMTP_SECURE, smtpPort === 465);
  const smtpStartTls = parseBool(env.STEALTH_SMTP_STARTTLS, smtpPort !== 465);
  const smtpUsername = (env.STEALTH_SMTP_USERNAME as string) || undefined;
  const notificationFrom =
    (env.STEALTH_NOTIFICATION_FROM as string) ??
    (isProd ? "noreply@app.betasmail.com" : "stealth@localhost");
  const verificationTokenLifetimeMs = parseNumber(
    env.STEALTH_VERIFICATION_TOKEN_LIFETIME_MS,
    24 * 60 * 60 * 1000,
  );
  const verificationResendCooldownMs = parseNumber(
    env.STEALTH_VERIFICATION_RESEND_COOLDOWN_MS,
    60 * 1000,
  );
  const verificationMaxAttempts = parseNumber(env.STEALTH_VERIFICATION_MAX_ATTEMPTS, 5);

  // 8. Beta controls (BETA-095). Kill switches default to the configured
  // baseline (`STEALTH_BETA_KILLSWITCH_DEFAULT`, default "open") so the stack
  // runs normally out of the box; operators may then close any individual
  // switch at runtime without redeploy. A missing/unreachable store still
  // fails closed at enforcement time.
  const controlTtlSeconds = parseNumber(env.STEALTH_BETA_CONTROL_TTL_SECONDS, 5);
  const killSwitchBaseline = (env.STEALTH_BETA_KILLSWITCH_DEFAULT as string) ?? "open";
  const killSwitchDefaults: Record<string, "open" | "closed"> = {};
  for (const capability of BETA_CAPABILITIES) {
    const override = env[`STEALTH_BETA_KILLSWITCH_${capability.toUpperCase()}`] as
      | string
      | undefined;
    if (override === "open" || override === "closed") {
      killSwitchDefaults[capability] = override;
    } else {
      killSwitchDefaults[capability] = killSwitchBaseline === "closed" ? "closed" : "open";
    }
  }
  const featureFlagDefaults: Record<string, boolean> = {};
  for (const envKey of Object.keys(env)) {
    const match = /^STEALTH_BETA_FLAG_(.+)$/.exec(envKey);
    if (match) {
      featureFlagDefaults[match[1].toLowerCase()] = parseBool(env[envKey], false);
    }
  }

  // Perform validation gates according to profile
  if (isProd) {
    if ((role === "all" || role === "web") && isPlaceholderSecret(cursorSecret)) {
      throw new Error(
        "Configuration error: STEALTH_CURSOR_SECRET is required and must not be a default/placeholder secret for web/all roles in production.",
      );
    }
    if ((role === "all" || role === "web") && isPlaceholderSecret(smtpPassword)) {
      throw new Error(
        "Configuration error: STEALTH_SMTP_PASSWORD is required for web/all roles in production.",
      );
    }
    if ((role === "all" || role === "relay") && isPlaceholderSecret(relayApiKey)) {
      throw new Error(
        "Configuration error: STEALTH_RELAY_API_KEY is required for relay/all roles in production.",
      );
    }
    if ((role === "all" || role === "indexer") && isPlaceholderSecret(storageSecret)) {
      throw new Error(
        "Configuration error: STEALTH_STORAGE_SECRET is required for indexer/all roles in production.",
      );
    }
    if (
      (role === "all" || role === "indexer" || role === "operator") &&
      isPlaceholderSecret(rpcApiKey)
    ) {
      throw new Error(
        "Configuration error: STEALTH_RPC_API_KEY is required for operator/indexer/all roles in production.",
      );
    }
    if ((role === "all" || role === "operator") && isPlaceholderSecret(operatorSecret)) {
      throw new Error(
        "Configuration error: STEALTH_OPERATOR_SECRET is required for operator/all roles in production.",
      );
    }
    if (isPlaceholderKvId(kvNamespaceId)) {
      throw new Error(
        "Configuration error: STEALTH_KV_NAMESPACE_ID must be configured and cannot be a placeholder in production.",
      );
    }
    if (isPlaceholderContractId(registryContractId) || !registryContractId) {
      throw new Error(
        "Configuration error: STEALTH_REGISTRY_CONTRACT_ID is required and cannot be a placeholder in production.",
      );
    }
    if (isPlaceholderContractId(postageContractId) || !postageContractId) {
      throw new Error(
        "Configuration error: STEALTH_POSTAGE_CONTRACT_ID is required and cannot be a placeholder in production.",
      );
    }
    if (isPlaceholderContractId(lifecycleContractId) || !lifecycleContractId) {
      throw new Error(
        "Configuration error: STEALTH_LIFECYCLE_CONTRACT_ID is required and cannot be a placeholder in production.",
      );
    }
    if (isPlaceholderContractId(receiptsContractId) || !receiptsContractId) {
      throw new Error(
        "Configuration error: STEALTH_RECEIPTS_CONTRACT_ID is required and cannot be a placeholder in production.",
      );
    }
    if (isPlaceholderContractId(policiesContractId) || !policiesContractId) {
      throw new Error(
        "Configuration error: STEALTH_POLICIES_CONTRACT_ID is required and cannot be a placeholder in production.",
      );
    }
    if (!appUrl || appUrl.includes("localhost")) {
      throw new Error(
        "Configuration error: STEALTH_APP_URL must be a valid public origin in production.",
      );
    }
    if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
      throw new Error(
        "Configuration error: STEALTH_CORS_ALLOWED_ORIGINS must contain explicit origin URLs in production.",
      );
    }
  }

  const rawConfig = {
    profile,
    role,
    network: {
      network: profile,
      stellarNetwork,
      horizonUrl,
      sorobanRpcUrl,
      networkPassphrase,
    },
    storage: {
      storageDriver,
      kvNamespaceId,
      kvBinding,
      coordinatorBinding,
    },
    session: {
      authChallengeLifetimeMs,
      authClockSkewMs,
      authNonceTtlMs,
      quoteLifetimeMs,
    },
    relay: {
      relayUrl,
      relayTimeoutMs,
    },
    secrets: {
      cursorSecret,
      relayApiKey,
      storageSecret,
      smtpPassword,
      rpcApiKey,
      operatorSecret,
    },
    contract: {
      registryContractId,
      postageContractId,
      lifecycleContractId,
      receiptsContractId,
      policiesContractId,
      domainTag,
      protocolVersion,
    },
    origin: {
      appUrl,
      allowedOrigins,
      allowedMethods,
      allowedHeaders,
      allowCredentials,
      inviteCodeRequired: parseBool(env.STEALTH_INVITE_CODE_REQUIRED, false),
      validInviteCodes: parseList(env.STEALTH_VALID_INVITE_CODES, []),
    },
    notifications: {
      transport: notificationTransport,
      fromAddress: notificationFrom,
      verification: {
        tokenLifetimeMs: verificationTokenLifetimeMs,
        resendCooldownMs: verificationResendCooldownMs,
        maxAttempts: verificationMaxAttempts,
      },
      smtp: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        startTls: smtpStartTls,
        username: smtpUsername,
        password: smtpPassword,
      },
    },
    betaControl: {
      controlTtlSeconds,
      killSwitchDefaults,
      featureFlagDefaults,
    },
  };

  const parsed = runtimeConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const formattedErrors = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration validation failed: ${formattedErrors}`);
  }

  validateRegistryDrift(parsed.data);

  return parsed.data;
}

/**
 * Extracts a client-safe public configuration object with ZERO secrets.
 */
export function getPublicConfig(config: BetaRuntimeConfig): PublicConfig {
  return {
    profile: config.profile,
    role: config.role,
    network: config.network,
    storage: {
      storageDriver: config.storage.storageDriver,
      kvNamespaceId: config.storage.kvNamespaceId,
    },
    session: {
      authChallengeLifetimeMs: config.session.authChallengeLifetimeMs,
      authClockSkewMs: config.session.authClockSkewMs,
      authNonceTtlMs: config.session.authNonceTtlMs,
      quoteLifetimeMs: config.session.quoteLifetimeMs,
    },
    relay: {
      relayUrl: config.relay.relayUrl,
      relayTimeoutMs: config.relay.relayTimeoutMs,
    },
    contract: config.contract,
    origin: config.origin,
    notifications: {
      transport: config.notifications.transport,
      fromAddress: config.notifications.fromAddress,
      verification: config.notifications.verification,
      smtp: {
        host: config.notifications.smtp.host,
        port: config.notifications.smtp.port,
        secure: config.notifications.smtp.secure,
        startTls: config.notifications.smtp.startTls,
      },
    },
  };
}

/**
 * Returns a redacted copy of the configuration safe for server logs and diagnostics.
 */
export function getRedactedConfig(config: BetaRuntimeConfig): Record<string, unknown> {
  return {
    profile: config.profile,
    role: config.role,
    network: config.network,
    storage: {
      storageDriver: config.storage.storageDriver,
      kvNamespaceId: config.storage.kvNamespaceId,
      hasKvBinding: Boolean(config.storage.kvBinding),
      hasCoordinatorBinding: Boolean(config.storage.coordinatorBinding),
    },
    session: {
      authChallengeLifetimeMs: config.session.authChallengeLifetimeMs,
      authClockSkewMs: config.session.authClockSkewMs,
      authNonceTtlMs: config.session.authNonceTtlMs,
      quoteLifetimeMs: config.session.quoteLifetimeMs,
    },
    relay: {
      relayUrl: config.relay.relayUrl,
      relayTimeoutMs: config.relay.relayTimeoutMs,
    },
    contract: config.contract,
    origin: config.origin,
    notifications: {
      transport: config.notifications.transport,
      fromAddress: config.notifications.fromAddress,
      verification: config.notifications.verification,
      smtp: {
        host: config.notifications.smtp.host,
        port: config.notifications.smtp.port,
        secure: config.notifications.smtp.secure,
        startTls: config.notifications.smtp.startTls,
        hasUsername: Boolean(config.notifications.smtp.username),
        username: config.notifications.smtp.username ? "[REDACTED]" : undefined,
        password: config.notifications.smtp.password ? "[REDACTED]" : undefined,
      },
    },
    secrets: {
      hasCursorSecret: Boolean(config.secrets.cursorSecret),
      hasRelayApiKey: Boolean(config.secrets.relayApiKey),
      hasStorageSecret: Boolean(config.secrets.storageSecret),
      hasSmtpPassword: Boolean(config.secrets.smtpPassword),
      hasRpcApiKey: Boolean(config.secrets.rpcApiKey),
      hasOperatorSecret: Boolean(config.secrets.operatorSecret),
    },
  };
}

/**
 * Formats a human-readable redacted configuration matrix for operational logs.
 */
export function formatConfigMatrix(config: BetaRuntimeConfig): string {
  const redacted = getRedactedConfig(config) as any;
  const lines: string[] = [
    `=== Hush Mail Beta Runtime Configuration Matrix ===`,
    `Profile:                 ${config.profile}`,
    `Role:                    ${config.role}`,
    `[Network]`,
    `  Stellar Network:       ${config.network.stellarNetwork}`,
    `  Horizon RPC:           ${config.network.horizonUrl}`,
    `  Soroban RPC:           ${config.network.sorobanRpcUrl}`,
    `  Network Passphrase:    ${config.network.networkPassphrase}`,
    `[Storage]`,
    `  Storage Driver:        ${config.storage.storageDriver}`,
    `  KV Namespace ID:       ${config.storage.kvNamespaceId}`,
    `  Cloudflare KV:         ${redacted.storage.hasKvBinding ? "Bound" : "Unbound"}`,
    `  Durable Coordinator:   ${redacted.storage.hasCoordinatorBinding ? "Bound" : "Unbound"}`,
    `[Session & Security]`,
    `  Challenge TTL:         ${config.session.authChallengeLifetimeMs} ms`,
    `  Clock Skew:            ${config.session.authClockSkewMs} ms`,
    `  Nonce TTL:             ${config.session.authNonceTtlMs} ms`,
    `  Quote Lifetime:        ${config.session.quoteLifetimeMs} ms`,
    `[Relay]`,
    `  Relay URL:             ${config.relay.relayUrl}`,
    `  Relay Timeout:         ${config.relay.relayTimeoutMs} ms`,
    `[Secrets (Redacted)]`,
    `  Cursor Secret:         ${redacted.secrets.hasCursorSecret ? "[CONFIGURED]" : "Missing"}`,
    `  Relay API Key:         ${redacted.secrets.hasRelayApiKey ? "[CONFIGURED]" : "Missing"}`,
    `  Storage Secret:        ${redacted.secrets.hasStorageSecret ? "[CONFIGURED]" : "Missing"}`,
    `  SMTP Password:         ${redacted.secrets.hasSmtpPassword ? "[CONFIGURED]" : "Missing"}`,
    `  RPC API Key:           ${redacted.secrets.hasRpcApiKey ? "[CONFIGURED]" : "Missing"}`,
    `  Operator Secret:       ${redacted.secrets.hasOperatorSecret ? "[CONFIGURED]" : "Missing"}`,
    `[Contract]`,
    `  Registry Contract:     ${config.contract.registryContractId}`,
    `  Postage Contract:      ${config.contract.postageContractId}`,
    `  Lifecycle Contract:    ${config.contract.lifecycleContractId}`,
    `  Receipts Contract:     ${config.contract.receiptsContractId}`,
    `  Policies Contract:     ${config.contract.policiesContractId}`,
    `  Domain Tag:            ${config.contract.domainTag}`,
    `  Protocol Version:      ${config.contract.protocolVersion}`,
    `[Origin & CORS]`,
    `  App URL:               ${config.origin.appUrl}`,
    `  Allowed Origins:       ${config.origin.allowedOrigins.join(", ")}`,
    `  Allowed Methods:       ${config.origin.allowedMethods.join(", ")}`,
    `[Notifications]`,
    `  Transport:             ${config.notifications.transport}`,
    `  From Address:          ${config.notifications.fromAddress}`,
    `  Token Lifetime:        ${config.notifications.verification.tokenLifetimeMs} ms`,
    `  Resend Cooldown:       ${config.notifications.verification.resendCooldownMs} ms`,
    `  Max Attempts:          ${config.notifications.verification.maxAttempts}`,
    `  SMTP Host:             ${config.notifications.smtp.host}:${config.notifications.smtp.port}`,
    `  SMTP TLS:              secure=${config.notifications.smtp.secure} starttls=${config.notifications.smtp.startTls}`,
    `  SMTP Credentials:      ${redacted.notifications.smtp.username ? "[REDACTED]" : "None"}`,
    `======================================================`,
  ];
  return lines.join("\n");
}
