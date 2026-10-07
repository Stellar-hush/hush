# Hush brand and compatibility migration

This guide separates the new public product identity from technical identifiers that still belong to existing protocols, deployments, or stored data. Contributors should use **Hush** in new product copy and `stellar-hush` as the package/project slug. Legacy identifiers are documented below so they can be migrated deliberately instead of being copied into new work by accident.

## Completed

- Product name, showcase copy, metadata, icon, and design tokens now use Hush.
- The package/project slug is `stellar-hush`.
- The public GitHub repository is [Stellar-hush/hush](https://github.com/Stellar-hush/hush), and local `origin` points there.
- The repository has an MIT license.
- The GitHub About description and topics identify Hush as an open-source beta on Stellar.
- Root documentation and Wave maintainer material now describe the product, contribution areas, and beta boundaries.

## Identifiers still in transition

| Legacy identifier                                                                        | Why it remains                                                                                                                                                             | Safe next action                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stealth.me`, `stealth.xyz`, `betasmail.com`, and related federation or SMTP domains     | Mailbox addresses, DNS, SEP-1, cookies, CORS, SMTP identities, and account resolution depend on domain ownership and routing. No replacement mail domain is selected here. | Select and verify a Hush domain first; then plan DNS, federation, address aliases, cookie, CORS, and mail-flow migration.                         |
| `x-stealth-*` request headers and `STEALTH_*` variables                                  | Existing clients, signed requests, GitHub secrets, local `.env` files, Cloudflare bindings, and runbooks use these names.                                                  | Introduce new aliases with explicit precedence and a deprecation window; update clients and deployment configuration before removing old aliases. |
| `STEALTH-AUTH-V1`, envelope signature domain separators, and `stealth-*` crypto contexts | Changing these values changes signed bytes or derived keys and can prevent old messages and clients from verifying or decrypting data.                                     | Define a versioned protocol, add independent v2 vectors and dual verification, and preserve v1 verification for existing data.                    |
| `StealthCoordinator`, Cloudflare Worker names, KV/R2 names, and Durable Object bindings  | These may address live resources and persistent state. A new class or namespace can look like an empty database rather than the old service.                               | Inventory account resources, test export/import and rollback, migrate state, verify health, and only then switch traffic.                         |
| Browser storage keys and migration IDs                                                   | Existing browsers and databases may contain records under these keys.                                                                                                      | Add dual-read or copy-forward migration with telemetry that avoids collecting content; retire old keys after a supported upgrade window.          |
| Soroban crate names and expected Wasm hashes                                             | Contract source names and Wasm artifact hashes are tied to reproducible build and deployment evidence.                                                                     | Keep deployed artifacts immutable; change names or hashes only through a reviewed contract release and updated reproducibility evidence.          |
| Archived release records and signed evidence                                             | Editing historical files can invalidate signatures or make the evidence describe a different artifact.                                                                     | Preserve signed records. Add a Hush-era addendum or new version when clarification is needed.                                                     |

## Deployment status

The GitHub repository has moved to `Stellar-hush/hush`, but Cloudflare configuration still uses legacy service names and custom domains. No Cloudflare account authentication or staging secrets were configured when this guide was updated, and no verified public Hush demo URL is claimed. Do not point a public About link at a placeholder or assume the main-branch CI workflow deployed a site.

For a durable Hush-branded deployment, maintainers need to:

1. Choose the public application and mail domains and verify DNS control.
2. Set up the Cloudflare account, Worker/KV/R2/DO resources, secrets, GitHub staging environment, and deployment variables.
3. Decide whether to migrate the existing service and its state or create a separate preview with synthetic data.
4. Update canonical URLs, security headers, cookie settings, CORS, federation documents, SMTP identities, monitoring, backups, and runbooks together.
5. Deploy through the gated staging workflow, verify the anonymous showcase and health endpoint, and publish the URL only after those checks pass.

The root [deployment guide](../deployment/README.md) describes the current workflow and status. A temporary preview account can help reviewers try an isolated demonstration, but it is not a durable production deployment; see Cloudflare’s [temporary deployment claims](https://developers.cloudflare.com/workers/platform/claim-deployments/) and claim the preview before its time limit.

## Protocol and data migration rules

1. **Do not silently change signed bytes.** Version headers, domain separators, canonicalization, and key-derivation contexts. Publish old and new test vectors.
2. **Accept both versions during a defined transition.** New clients can send the new form; servers continue to verify the old form until usage and data are migrated.
3. **Migrate state before switching bindings.** Back up KV, R2, and Durable Object data, restore into isolated resources, compare records, and exercise rollback.
4. **Keep the old domains reachable while addresses move.** Publish forwarding/federation and sender guidance before retiring aliases.
5. **Never rewrite signed evidence.** Add a new Hush-era record that points to the historical artifact instead.
6. **Document retirement.** For each old identifier, record owner, replacement, compatibility period, rollback condition, and removal commit.

## Contributor guidance

Use Hush in new UI, docs, examples, and filenames. When touching a remaining legacy boundary:

- keep the current identifier operational until its migration is approved and deployed;
- describe it as a legacy compatibility name rather than the product name;
- update the relevant protocol, migration, or deployment documentation;
- add compatibility and rollback evidence for the boundary being changed;
- avoid broad global replacement across encrypted-data formats, signed material, or historical records.

The current public narrative is in the [root README](../../README.md), [product guide](./README.md), [architecture guide](../architecture/README.md), and [Stellar Wave maintainer brief](./stellar-wave-readiness.md).
