import { describe, expect, it, vi } from "vitest";
import {
  formatConfigMatrix,
  getPublicConfig,
  getRedactedConfig,
  loadRuntimeConfig,
} from "../../../src/config";

vi.mock("../../../src/config/registry", () => ({
  validateRegistryDrift: vi.fn(),
}));

describe("BETA-001 :: Beta Runtime Configuration Contract", () => {
  const baseProdEnv = {
    STEALTH_CURSOR_SECRET: "prod-secret-key-32-chars-long-valid",
    STEALTH_SMTP_PASSWORD: "valid",
    STEALTH_RELAY_API_KEY: "valid",
    STEALTH_STORAGE_SECRET: "valid",
    STEALTH_RPC_API_KEY: "valid",
    STEALTH_OPERATOR_SECRET: "valid",
    STEALTH_KV_NAMESPACE_ID: "stealth-kv-beta-prod-id",
    STEALTH_REGISTRY_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    STEALTH_POSTAGE_CONTRACT_ID: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    STEALTH_APP_URL: "https://app.betasmail.com",
    STEALTH_CORS_ALLOWED_ORIGINS: "https://app.betasmail.com",
  };

  describe("Profile Loading & Defaults", () => {
    it("loads development profile with sensible local defaults", () => {
      const config = loadRuntimeConfig({ profile: "development" });

      expect(config.profile).toBe("development");
      expect(config.network.stellarNetwork).toBe("testnet");
      expect(config.network.horizonUrl).toBe("https://horizon-testnet.stellar.org");
      expect(config.network.sorobanRpcUrl).toBe("https://soroban-testnet.stellar.org");
      expect(config.storage.storageDriver).toBe("memory");
      expect(config.storage.kvNamespaceId).toBe("stealth-kv-dev");
      expect(config.secrets.cursorSecret).toBe("dev-cursor-secret-change-me");
      expect(config.relay.relayUrl).toBe("https://relay-testnet.betasmail.com");
      expect(config.contract.domainTag).toBe("Stealth_Mail_Protocol");
      expect(config.contract.protocolVersion).toBe("v1");
      expect(config.contract.policiesContractId).toBe("C".repeat(56));
      expect(config.origin.appUrl).toBe("http://localhost:3000");
    });

    it("loads test profile", () => {
      const config = loadRuntimeConfig({ profile: "test" });
      expect(config.profile).toBe("test");
    });

    it("loads preview profile", () => {
      const config = loadRuntimeConfig({ profile: "preview" });
      expect(config.profile).toBe("preview");
      expect(config.storage.storageDriver).toBe("hybrid");
      expect(config.storage.kvNamespaceId).toBe("stealth-kv-beta-preview");
    });

    it("loads production profile with a valid configuration", () => {
      const validProdEnv = {
        STEALTH_ENV: "production",
        STEALTH_CURSOR_SECRET: "prod-secret-key-32-chars-long-valid",
        STEALTH_KV_NAMESPACE_ID: "stealth-kv-beta-prod-id",
        STEALTH_REGISTRY_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        STEALTH_POSTAGE_CONTRACT_ID: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        STEALTH_APP_URL: "https://app.betasmail.com",
        STEALTH_CORS_ALLOWED_ORIGINS: "https://app.betasmail.com",
        STEALTH_SMTP_PASSWORD: "valid",
        STEALTH_RELAY_API_KEY: "valid",
        STEALTH_STORAGE_SECRET: "valid",
        STEALTH_RPC_API_KEY: "valid",
        STEALTH_OPERATOR_SECRET: "valid",
      };

      const config = loadRuntimeConfig({
        profile: "production",
        env: validProdEnv,
      });

      expect(config.profile).toBe("production");
      expect(config.network.stellarNetwork).toBe("mainnet");
      expect(config.network.horizonUrl).toBe("https://horizon.stellar.org");
      expect(config.storage.kvNamespaceId).toBe("stealth-kv-beta-prod-id");
      expect(config.secrets.cursorSecret).toBe("prod-secret-key-32-chars-long-valid");
      expect(config.origin.appUrl).toBe("https://app.betasmail.com");
    });
  });

  describe("Production Failure Gates & Boundary Checks", () => {
    it("fails production startup when STEALTH_CURSOR_SECRET is missing or empty", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_CURSOR_SECRET: "",
          },
        }),
      ).toThrow(/STEALTH_CURSOR_SECRET is required/);
    });

    it("fails production startup when STEALTH_CURSOR_SECRET is a placeholder", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_CURSOR_SECRET: "dev-cursor-secret-change-me",
          },
        }),
      ).toThrow(/STEALTH_CURSOR_SECRET is required and must not be a default\/placeholder/);
    });

    it("fails production startup when STEALTH_KV_NAMESPACE_ID is a placeholder", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_KV_NAMESPACE_ID: "placeholder-prod-id",
          },
        }),
      ).toThrow(/STEALTH_KV_NAMESPACE_ID must be configured and cannot be a placeholder/);
    });

    it("fails production startup when STEALTH_REGISTRY_CONTRACT_ID is a placeholder", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_REGISTRY_CONTRACT_ID: "C_REGISTRY_PLACEHOLDER",
          },
        }),
      ).toThrow(/STEALTH_REGISTRY_CONTRACT_ID is required and cannot be a placeholder/);
    });

    it("fails production startup when STEALTH_POLICIES_CONTRACT_ID is a placeholder", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_POLICIES_CONTRACT_ID: "C_POLICIES_PLACEHOLDER",
          },
        }),
      ).toThrow(/STEALTH_POLICIES_CONTRACT_ID is required and cannot be a placeholder/);
    });

    it("fails production startup when STEALTH_APP_URL is localhost", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_APP_URL: "http://localhost:3000",
          },
        }),
      ).toThrow(/STEALTH_APP_URL must be a valid public origin/);
    });

    it("fails production startup when CORS origins contain a wildcard", () => {
      expect(() =>
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_CORS_ALLOWED_ORIGINS: "*",
          },
        }),
      ).toThrow(/STEALTH_CORS_ALLOWED_ORIGINS must contain explicit origin URLs/);
    });
  });

  describe("Public/Secret Separation & Redaction Safety", () => {
    it("getPublicConfig strips secret parameters completely", () => {
      const config = loadRuntimeConfig({
        profile: "development",
        env: {
          STEALTH_CURSOR_SECRET: "super-secret-key",
          STEALTH_RELAY_API_KEY: "secret-relay-token",
        },
      });

      const publicConfig = getPublicConfig(config);

      expect((publicConfig as any).secrets).toBeUndefined();
      expect((publicConfig as any).relay.relayApiKey).toBeUndefined();
      expect(publicConfig.network.horizonUrl).toBe("https://horizon-testnet.stellar.org");
    });

    it("getRedactedConfig replaces secret values with [REDACTED]", () => {
      const config = loadRuntimeConfig({
        profile: "development",
        env: {
          STEALTH_CURSOR_SECRET: "super-secret-key",
          STEALTH_RELAY_API_KEY: "secret-relay-token",
        },
      });

      const redacted = getRedactedConfig(config) as any;

      expect(redacted.secrets.hasCursorSecret).toBe(true);
      expect(redacted.secrets.hasRelayApiKey).toBe(true);
      expect(redacted.secrets.hasStorageSecret).toBe(false);
    });

    it("never leaks actual secret values in error messages", () => {
      const sensitiveSecret = "my-ultra-secret-value-12345";
      let errorMessage = "";

      try {
        loadRuntimeConfig({
          profile: "production",
          env: {
            ...baseProdEnv,
            STEALTH_CURSOR_SECRET: sensitiveSecret,
            STEALTH_KV_NAMESPACE_ID: "placeholder-prod-id", // triggers failure
          },
        });
      } catch (err) {
        errorMessage = (err as Error).message;
      }

      expect(errorMessage).not.toContain(sensitiveSecret);
    });
  });

  describe("Config Matrix Formatting", () => {
    it("formatConfigMatrix outputs all 6 domain sections with redacted secrets", () => {
      const config = loadRuntimeConfig({
        profile: "development",
        env: {
          STEALTH_CURSOR_SECRET: "secret-123",
          STEALTH_RELAY_API_KEY: "api-key-456",
        },
      });

      const matrix = formatConfigMatrix(config);

      expect(matrix).toContain("=== Hush Mail Beta Runtime Configuration Matrix ===");
      expect(matrix).toContain("[Network]");
      expect(matrix).toContain("[Storage]");
      expect(matrix).toContain("[Session & Security]");
      expect(matrix).toContain("[Relay]");
      expect(matrix).toContain("[Contract]");
      expect(matrix).toContain("[Origin & CORS]");
      expect(matrix).toContain("[Secrets (Redacted)]");
      expect(matrix).toContain("Cursor Secret:         [CONFIGURED]");
      expect(matrix).toContain("Relay API Key:         [CONFIGURED]");
      expect(matrix).not.toContain("secret-123");
      expect(matrix).not.toContain("api-key-456");
    });
  });
});
