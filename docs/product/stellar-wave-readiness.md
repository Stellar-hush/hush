# Stellar Wave repository readiness

This page is a maintainer brief for applying the Hush repository to the [Stellar Wave Program](https://www.drips.network/wave/stellar). Repository admission is decided by the program organizers; this document does not imply acceptance or an active listing.

## Prerequisite to resolve

There is currently no root `LICENSE` file. Confirm the applicable open-source license with the project owners and add it before describing the repository as open source or submitting it for a contributor program. Drips terms require contributions to follow the applicable license communicated by the repository or Wave app.

## Project summary

Hush is a private programmable mail client and protocol built on Stellar. It lets mailbox owners define sender access rules and gives senders a verifiable delivery path. Message bodies and attachments are encrypted and stored off-chain. Stellar accounts and Soroban contracts support identity, postage, policy, receipts, and message lifecycle proofs. The public repository includes the React and TypeScript application, API and relay services, protocol specifications and vectors, Rust Soroban contracts, deployment tooling, and unit, integration, contract, and browser tests. Hush is in beta, with local and testnet development paths. Its open work can be divided into reviewable tasks across Stellar integration, protocol interoperability, contract verification, relay reliability, accessibility, and contributor documentation.

## Stellar integration in the repository

| Capability | Implementation |
| --- | --- |
| Stellar identity and address resolution | `src/features/identity/`, `src/services/stellar/`, `src/routes/api/v1/federation.ts` |
| Sender policy and admission | `contracts/soroban/policies/`, `src/server/api/policy-service.ts` |
| Postage quote, escrow, and settlement | `contracts/soroban/postage/`, `src/services/stellar/postage-escrow.ts`, `src/server/api/postage-service.ts` |
| Delivery receipts | `contracts/soroban/receipts/`, `src/services/stellar/contracts/receipts.ts` |
| Message lifecycle | `contracts/soroban/lifecycle/`, `src/server/api/lifecycle-service.ts` |
| Private payload and attachment storage | `src/services/crypto/`, `src/services/storage/`, `src/services/attachment/` |

The application is not a wallet, token, or yield product. Stellar is used for identity and verifiable protocol actions; encrypted message content remains off-chain.

## Candidate contributor areas

Use the live issue backlog to choose work. The areas below are places to identify and scope issues; they are not claims that matching issues are currently open.

- **Soroban contracts:** add focused failure-path tests, improve event and storage documentation, or tighten contract interoperability checks.
- **Protocol interoperability:** add synthetic envelope, federation, or relay vectors and document how independent clients can run them.
- **Stellar service reliability:** improve retry, idempotency, or reconciliation behavior around RPC and contract interactions.
- **Mailbox accessibility:** improve keyboard and screen-reader support in policy, receipt, and sender request workflows.
- **Contributor experience:** clarify local contract development, testnet setup, and service boundaries in the relevant module guides.

For each Wave issue, provide a single outcome, relevant modules, expected behavior, acceptance criteria, and a bounded validation command. Keep separate workstreams in separate issues so contributors can make progress inside a short cycle.

## Maintainer preparation

After resolving the license prerequisite, maintainers should:

1. Confirm the GitHub organization and repository are public and that maintainers can install the Drips Wave GitHub App.
2. Read the official [maintainer participation guide](https://docs.drips.network/wave/maintainers/participating-in-a-wave/) and submit the repository through the Drips Wave app.
3. Review the open backlog and select only issues that are still relevant, unblocked, and safe to work on without production access or secrets.
4. Give each selected issue a concrete complexity estimate and acceptance criteria. Do not make contributors depend on private keys, production data, or unreviewable external changes.
5. Keep review capacity available during a Wave so pull requests can be reviewed and issues resolved before the cycle closes.

The Wave guide says maintainers onboard their GitHub organization, apply public repositories to the relevant program, and wait for organizer approval before adding issues. The Wave app and official documentation are authoritative for current requirements and timing.

## Local setup and verification

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for supported runtimes and repository checks. Contract changes belong under `contracts/soroban/`; client and service integration changes belong under `src/`. Use synthetic accounts, local adapters, and testnet only. Never put real seeds or production credentials in an issue, test fixture, log, or pull request.

## Links

- [Stellar Wave Program](https://www.drips.network/wave/stellar)
- [Drips Wave maintainer participation](https://docs.drips.network/wave/maintainers/participating-in-a-wave/)
- [Drips Wave overview](https://docs.drips.network/wave/)
