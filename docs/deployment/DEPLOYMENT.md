# Workflow 2 — Live Protocol, Relay & Testnet Delivery

This document outlines the step-by-step process for deploying the Hush Soroban contracts (Policies, Postage, Receipts, Lifecycle) to a live Stellar network (Testnet or Mainnet) and ensuring the application runtime configuration is perfectly synced with the on-chain deployment.

## Prerequisites

1. **Stellar CLI**: Ensure `stellar-cli` is installed and available in your PATH.
   ```bash
   cargo install --locked stellar-cli --features opt
   ```
2. **Node/Bun**: Ensure you have Node.js or Bun installed to run the deployment scripts.
3. **Rust/Wasm Target**: Ensure your rust toolchain can compile to Wasm.
   ```bash
   rustup target add wasm32-unknown-unknown
   ```
4. **Deployer Account**: You must have a funded Stellar account. For Testnet, you can fund a new account using the Friendbot. Keep the secret key handy.

## Step 1: Pre-Deployment Checks

Before deploying, run all CI checks to ensure the contracts are valid.

```bash
bun run lint
bun run test
bun run test:e2e
```

Ensure all unit tests for the contracts pass:

```bash
cd contracts/soroban
cargo test
cd ../..
```

## Step 2: Running the Deployment Script

The automated deployment script handles building, optimizing, deploying, initializing, and binding all 4 contracts. It is strictly idempotent for idempotent operations, though Soroban currently creates a new contract instance on each deploy.

Run the script using Bun (or ts-node):

```bash
bun run scripts/stellar/deploy.ts \
  --network testnet \
  --deployer <YOUR_SECRET_KEY> \
  --network-passphrase "Test SDF Network ; September 2015"
```

> [!CAUTION]
> If deploying to **mainnet**, the script will refuse execution unless you explicitly pass the `--release-mode` flag.
>
> ```bash
> bun run scripts/stellar/deploy.ts \
>   --network mainnet \
>   --deployer <YOUR_SECRET_KEY> \
>   --network-passphrase "Public Global Stellar Network ; September 2015" \
>   --release-mode
> ```

### What the script does:

1. Compiles contracts via `stellar contract build`.
2. Optimizes WASM via `stellar contract optimize`.
3. Deploys instances to the network.
4. Initializes `postage` and `lifecycle` contracts.
5. Configures the lifecycle guard for `postage` and `receipts`.
6. Generates a signed `contract-manifest.json` in `infra/stellar/` and syncs it to `src/config/`.

## Step 3: Verifying the Deployment

Run the smoke test to verify all contracts in the generated manifest are active on-chain:

```bash
bun run scripts/stellar/smoke-test.ts --network testnet
```

If successful, you will see output indicating that all contracts (Policies, Postage, Receipts, Lifecycle) exist and are active.

## Step 4: Application Runtime

The Hush web application enforces **Runtime Drift Validation**.
When the application starts, `src/config/loader.ts` will parse your environment variables and compare them against `src/config/contract-manifest.json`.

If your `.env` (or environment variables in your deployment environment) defines a `STEALTH_POSTAGE_CONTRACT_ID` or `STEALTH_REGISTRY_CONTRACT_ID` that does _not_ match the manifest, the application will refuse to start in `preview` and `production` environments to prevent drift.

**Important:** Ensure you update your `.env` files or deployment secrets with the new contract IDs generated in the manifest!

## Rollback Procedures

If a deployment fails or introduces a critical bug:

1. Review the `contract-manifest.json` history.
2. The `contract-manifest.json` acts as your source of truth. You can restore the previous manifest file to roll back the application configuration, effectively pointing the application back to the previously deployed contract instances.
3. For serious issues, you can update the `Lifecycle` configuration to reject all new policies until a patch is deployed.
