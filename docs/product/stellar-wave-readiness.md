# Hush and the Stellar Wave

This maintainer brief gives reviewers a direct path to understand the product, inspect its public documentation, and identify useful contribution areas without first navigating the source tree. It is preparation material, not an application or a claim that the repository has been accepted into the program.

## At a glance

- **Project:** Hush, an open-source beta exploring private, programmable email with Stellar identity and Soroban-backed protocol actions.
- **Repository:** [Stellar-hush/hush](https://github.com/Stellar-hush/hush)
- **License:** MIT, in the repository’s root [`LICENSE`](../../LICENSE).
- **Stage:** beta. Local and testnet development paths exist; production service readiness has not been established by the project documentation.
- **Hosted demo:** no verified Hush demo URL is currently published in this repository. A public showcase page is present in the app, but reviewers need a deployed URL before they can try it without installing the project.
- **Program:** [Stellar Wave](https://www.drips.network/wave/stellar). Repository admission and issue selection are decided by the program organizers.

## What Hush does

Most email systems let unknown senders attempt delivery before the recipient has much say. Hush explores recipient-controlled admission: the mailbox owner can define how an unfamiliar sender is handled, including identity checks, explicit approval, optional postage, or rejection. The sender’s message body and attachments are encrypted and carried off-chain; Stellar is used for identities and verifiable actions such as policy, postage, receipts, and message lifecycle state.

Hush is a mail client and protocol experiment, not a wallet, token, or yield product. It does not claim that every workflow is live in a public environment. Feature availability depends on the configured runtime, relay, storage, and contract adapters.

### Reviewer path

1. Read the [root README](../../README.md) for the product model, beta boundaries, and local setup.
2. Use the app’s landing page or hosted demo when a verified preview URL is available; demo content must be synthetic.
3. Follow the [architecture overview](../architecture/README.md) to understand client, API, relay, storage, and Stellar responsibilities.
4. Check the [security overview](../security/README.md) and its threat model and risk register for privacy boundaries and known limitations.
5. Use the [contributor guide](../../CONTRIBUTING.md) and live GitHub issues to select bounded work.

## How Stellar is used

| Concern          | Role of Stellar / Soroban                                                     | Repository map                                                              |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Identity         | Resolve Stellar accounts and federation handles to keys and sender provenance | `src/features/identity/`, `src/services/stellar/`                           |
| Admission policy | Represent and evaluate recipient rules for unknown senders                    | `contracts/soroban/policies/`, `src/server/api/policy-service.ts`           |
| Postage          | Quote and account for sender-authorized postage when a mailbox requires it    | `contracts/soroban/postage/`, `src/services/stellar/postage-escrow.ts`      |
| Receipts         | Record delivery and participant acknowledgement state                         | `contracts/soroban/receipts/`, `src/services/stellar/contracts/receipts.ts` |
| Lifecycle        | Track message protocol state without publishing message content               | `contracts/soroban/lifecycle/`, `src/server/api/lifecycle-service.ts`       |
| Private payload  | Encrypt and transport message bodies and attachments off-chain                | `src/services/crypto/`, `src/services/storage/`, `src/services/attachment/` |

On-chain actions are public and can reveal account relationships, timing, payment amounts, and contract interactions. “Private mail” does not mean every aspect of network activity is private. See the [metadata policy](../security/metadata-policy.md) and [beta threat model](../security/beta-threat-model.md).

## Current review and deployment status

The repository has an MIT license and is public under the Hush organization. The latest reviewed main commit (`7ea2db2`) passed contract checks and the security/dependency review, but one client unit test failed: the light-theme warning token missed WCAG AA contrast on a preview surface. Staging was correctly gated off. The color has since been adjusted; the next CI run must verify the correction. A pushed commit alone does not mean a staging deployment succeeded. The [deployment guide](../deployment/README.md) records current evidence and release gates.

The staging pipeline only deploys after CI for the exact commit succeeds and the release-gate summary marks it releasable. Cloudflare resources, secrets, old federation domains, and persisted state are still tied to legacy identifiers. A Hush-branded URL must not be advertised until DNS, bindings, secrets, health checks, and the deployed app are verified together.

## Contribution opportunities

These areas are intended to produce reviewable, self-contained issues. They are themes, not statements that a matching issue is currently open; use the [live issue tracker](https://github.com/Stellar-hush/hush/issues) for current assignments.

### Protocol interoperability

- Add synthetic test vectors for envelope encoding, relay authentication, federation resolution, or proof verification.
- Document how an independent client can produce and verify a message envelope.
- Improve versioning and compatibility guidance without silently changing existing signature bytes.

### Soroban contracts

- Add focused authorization, boundary, and failure-path tests.
- Improve event, storage, and upgrade documentation for one contract at a time.
- Strengthen reproducible build and artifact-hash checks. Contract artifacts must match the repository’s pinned toolchain and manifest expectations.

### Relay and storage reliability

- Improve retry, idempotency, timeout, and reconciliation behavior using local adapters and synthetic requests.
- Add bounded observability that does not log payload content, credentials, or stable identifiers unnecessarily.
- Clarify backup, retention, and object integrity behavior.

### Product quality and accessibility

- Improve keyboard, screen-reader, and small-screen behavior in inbox, sender-review, policy, and proof-inspection flows.
- Clarify sender requirements and policy outcomes in UI copy.
- Add tests for user-visible loading, empty, error, and recovery states.

### Contributor experience

- Make a single module’s local setup easier to reproduce.
- Add architecture notes, examples, or scripts for testnet adapters without requiring production secrets.
- Turn large work into smaller issues with explicit ownership and acceptance criteria.

## Issue quality bar

Every candidate issue should state:

- the user or maintainer problem and why it matters to Hush;
- the expected result, including concrete acceptance criteria;
- relevant modules and likely owners;
- a bounded validation command or review artifact;
- known blockers and dependencies;
- whether the work uses local fakes, testnet, or an external service.

Do not assign issues that need private keys, production credentials, real user mail, unreviewable deployment changes, or an unspecified product/domain decision. Keep each issue sized so a contributor can complete and a maintainer can review it during the Wave cycle.

## Applying to the Stellar Wave

The current [Drips maintainer guide](https://docs.drips.network/wave/maintainers/participating-in-a-wave/) describes organization onboarding, installing the Drips Wave GitHub App, syncing public repositories, and applying to a program. Repository applications require organizer approval. Issues should be added to the program only after approval; maintainers then assign complexity and keep enough review capacity to close accepted work during the active cycle.

Before applying, maintainers should:

1. Confirm the organization has the authority and account access to manage the public repository and install the Drips app.
2. Publish a verified hosted demo or clearly state that reviewers must run the app locally. A temporary showcase can use the committed [`wrangler.review.jsonc`](../../wrangler.review.jsonc), but it requires the account holder to accept Cloudflare's Terms and is not a working production mail service.
3. Ensure the README, license, contributor guide, security documentation, and deployment status agree with one another.
4. Curate current, unblocked, testable issues and identify maintainers who can respond during the Wave.
5. Check the [program page](https://www.drips.network/wave/stellar) and [current terms](https://docs.drips.network/wave/terms-and-rules/) for current timing and participation rules.

Wave timing and acceptance criteria can change. The Drips app and official documentation are authoritative; this repository page is not an application, endorsement, or guarantee of acceptance or rewards.

## Links

- [Hush repository](https://github.com/Stellar-hush/hush)
- [Live issues](https://github.com/Stellar-hush/hush/issues)
- [Stellar Wave program](https://www.drips.network/wave/stellar)
- [Drips Wave maintainer participation](https://docs.drips.network/wave/maintainers/participating-in-a-wave/)
- [Drips Wave terms and rules](https://docs.drips.network/wave/terms-and-rules/)
