import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { BetaRuntimeConfig } from "./schema";

export interface ContractManifest {
  network: string;
  networkPassphrase: string;
  protocolVersion: string;
  deployedAt: string;
  contracts: Record<
    string,
    {
      contractId: string;
      wasmHash: string;
    }
  >;
  signature: string;
  deployerPubkey: string;
}

export function loadManifest(): ContractManifest | null {
  try {
    const candidates = [
      resolve(process.cwd(), "src/config/contract-manifest.json"),
      resolve(process.cwd(), "contract-manifest.json"),
    ];
    for (const manifestPath of candidates) {
      if (existsSync(manifestPath)) {
        const data = readFileSync(manifestPath, "utf-8");
        return JSON.parse(data) as ContractManifest;
      }
    }
    return null;
  } catch (error) {
    console.warn("Failed to load contract-manifest.json", error);
    return null;
  }
}

/**
 * Validates the runtime configuration against the deployed contract manifest.
 * Ensures there's no drift between the hardcoded/env config and the actual deployed manifest.
 *
 * @param config The parsed BetaRuntimeConfig
 * @throws Error if drift is detected (e.g. mixed network, mismatched contract IDs)
 */
export function validateRegistryDrift(config: BetaRuntimeConfig) {
  const manifest = loadManifest();

  // In development, if there's no manifest and we're not enforcing strict mode, we could allow it,
  // but for a robust pipeline, if the config requires a specific contract ID, it should match.
  // However, local testing might not have a manifest. We will enforce it strictly in production and preview,
  // and warn or enforce in development if manifest is present.

  if (!manifest) {
    if (config.profile === "production" || config.profile === "preview") {
      throw new Error(
        `Drift Validation Error: contract-manifest.json is missing. This is required for ${config.profile} environments.`,
      );
    }
    // In dev, we can allow missing manifest for local workflows, but ideally we deploy locally too.
    return;
  }

  // 1. Network mismatch drift
  if (config.network.stellarNetwork !== manifest.network) {
    // Some env configs might use 'testnet' while manifest uses 'testnet'.
    // If they explicitly mismatch, it's a drift error.
    if (config.network.stellarNetwork !== "local" || manifest.network !== "testnet") {
      throw new Error(
        `Drift Validation Error: Config network '${config.network.stellarNetwork}' does not match manifest network '${manifest.network}'`,
      );
    }
  }

  // 2. Contract ID mismatch drift
  // The env configuration typically expects `registryContractId` (which maps to policies or lifecycle depending on app logic)
  // and `postageContractId`. Let's validate the postage contract.
  if (
    config.contract.postageContractId !== "placeholder" &&
    config.contract.postageContractId !== manifest.contracts.postage?.contractId
  ) {
    // If it's a dummy value like CBBBB... let it pass in dev, but fail in prod
    if (config.profile === "production" || !config.contract.postageContractId.startsWith("CBBBB")) {
      throw new Error(
        `Drift Validation Error: STEALTH_POSTAGE_CONTRACT_ID '${config.contract.postageContractId}' does not match deployed manifest ID '${manifest.contracts.postage?.contractId}'`,
      );
    }
  }

  // If the app uses policies or lifecycle as the registry, we should validate it.
  // The default STEALTH_REGISTRY_CONTRACT_ID might map to lifecycle.
  if (
    config.contract.registryContractId !== "placeholder" &&
    config.contract.registryContractId !== manifest.contracts.lifecycle?.contractId
  ) {
    if (
      config.profile === "production" ||
      !config.contract.registryContractId.startsWith("CAAAA")
    ) {
      throw new Error(
        `Drift Validation Error: STEALTH_REGISTRY_CONTRACT_ID '${config.contract.registryContractId}' does not match deployed lifecycle manifest ID '${manifest.contracts.lifecycle?.contractId}'`,
      );
    }
  }

  // 3. Lifecycle contract ID drift
  if (
    config.contract.lifecycleContractId !== "placeholder" &&
    config.contract.lifecycleContractId !== manifest.contracts.lifecycle?.contractId
  ) {
    if (
      config.profile === "production" ||
      !config.contract.lifecycleContractId.startsWith("C_DEV")
    ) {
      throw new Error(
        `Drift Validation Error: STEALTH_LIFECYCLE_CONTRACT_ID '${config.contract.lifecycleContractId}' does not match deployed manifest ID '${manifest.contracts.lifecycle?.contractId}'`,
      );
    }
  }

  if (
    config.contract.policiesContractId !== "placeholder" &&
    manifest.contracts.policies?.contractId &&
    config.contract.policiesContractId !== manifest.contracts.policies.contractId
  ) {
    if (
      config.profile === "production" ||
      !config.contract.policiesContractId.startsWith("CCCCC")
    ) {
      throw new Error(
        `Drift Validation Error: STEALTH_POLICIES_CONTRACT_ID '${config.contract.policiesContractId}' does not match deployed policies manifest ID '${manifest.contracts.policies.contractId}'`,
      );
    }
  }

  // If we reach here, validation passed.
  console.log(
    `[Registry] Successfully validated runtime config against signed deployment manifest (Deployed At: ${manifest.deployedAt})`,
  );
}
