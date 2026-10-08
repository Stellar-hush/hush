# Hush product guide

This is the product-focused index for Hush: who it serves, what the beta is exploring, how a recipient controls access, and what is still being validated. For a quick summary and setup, start with the [root README](../../README.md).

## The product in one minute

Hush is an open-source beta for private, programmable email on Stellar. It gives recipients a way to set admission rules for unfamiliar senders and gives the mail flow verifiable identity and delivery evidence. Bodies and attachments are designed to travel encrypted off-chain; Stellar supports identity, optional postage, policy, receipts, and lifecycle events.

The product’s core bet is that an inbox should let the owner decide what “unknown sender” means. A user may choose a low-friction inbox, require a sender to prove an identity, request approval, ask for postage, or block contact. The right default depends on the mailbox and person; the product should make the trade-offs visible rather than force a single rule.

## Intended users

The early product is aimed at people and organizations who receive valuable but noisy or risky inbound communication: founders, independent professionals, communities, and teams that need trusted correspondence without making every channel public. This is a hypothesis under beta evaluation, not evidence of product-market fit.

See [initial wedge and ideal customer profile](initial-wedge-and-icp.md) for the audience assumptions and [launch metrics](launch-metrics-and-north-star.md) for the proposed measures to validate them.

## Recipient flow

1. **Set mailbox rules.** Choose whether unknown senders are allowed, require identity verification, require approval, or need minimum postage.
2. **Receive a request.** When an unknown sender does not meet the selected path, the recipient can review the request and its available provenance.
3. **Make a decision.** Accept, decline, block, or request the missing evidence according to the mailbox policy.
4. **Review delivery evidence.** Inspect available identity, encryption, postage, receipt, and lifecycle information with clear labels for verified, pending, missing, or invalid proof.
5. **Adjust the policy.** Refine the rules as abuse patterns and legitimate contact needs change.

The detailed control and acceptance notes are in [sender-controlled inbox pilot](sender-controlled-inbox-pilot.md), [sender assurance levels](sender-assurance-levels.md), and [beta acceptance](beta-acceptance/README.md).

## Product principles

- **Recipient control:** let each mailbox choose its own admission policy.
- **Clear sender expectations:** explain requirements before a sender pays or submits a message.
- **Private content:** keep message bodies and attachments out of the public ledger and minimize their exposure in logs and diagnostics.
- **Verifiable claims:** distinguish cryptographically verified evidence from unverified display names or missing data.
- **Open standards:** document message, identity, and relay behavior so independent clients can interoperate.
- **Useful failure states:** explain what failed and whether the user can retry, change policy, or contact support.
- **Honest beta scope:** never imply that a local mock, testnet action, or generated illustration is evidence of a production service.

## Current beta boundary

Hush includes the application, API and relay code, crypto modules, protocol notes and vectors, Soroban contract source, and local/testnet development paths. A feature’s presence in the repository does not mean that it is deployed or available to public users. Hosted service availability depends on verified DNS, configured secrets, persistent resources, release gates, and operational support.

The repository currently has a Hush-branded public showcase route in the app. The URL is only useful to reviewers after the app is deployed and checked. The authoritative status and endpoint belong in [deployment docs](../deployment/README.md), not in an unverified product claim.

### Things the beta does not promise

- uninterrupted or production-grade mail delivery;
- compatibility with every conventional email provider or SMTP workflow;
- anonymous or metadata-free communication;
- that every sender identity, postage payment, or receipt is verified in every environment;
- that testnet assets have financial value;
- production audit or certification of the cryptographic and contract system.

## Feature areas and documentation

| Product area                 | Purpose                                                           | Guide                                                                 |
| ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Identity and assurance       | Show what is known about an account and how evidence was obtained | [Sender assurance levels](sender-assurance-levels.md)                 |
| Sender request and admission | Review unfamiliar senders against recipient-defined rules         | [Sender-controlled inbox pilot](sender-controlled-inbox-pilot.md)     |
| Postage and incentives       | Make optional sender-paid admission costs clear and auditable     | [Postage pricing model](../protocol/postage-pricing-model.md)         |
| Account recovery             | Recover access without silently weakening key security            | [Account recovery](account-recovery.md)                               |
| Legacy email integration     | Plan compatibility with the existing email ecosystem              | [Interoperability roadmap](legacy-email-interoperability-roadmap.md)  |
| Shared mailboxes             | Define organizational ownership and role boundaries               | [Organization mailboxes and RBAC](organization-mailboxes-and-rbac.md) |
| Accessibility and usability  | Define beta tasks and evidence for key user paths                 | [Beta acceptance](beta-acceptance/README.md)                          |

## How to review the project

Reviewers and contributors can use this order:

1. Read the [root README](../../README.md) for the product and local setup.
2. Read [architecture](../architecture/README.md) for component boundaries.
3. Read [security](../security/README.md) for assets, threats, controls, and remaining risks.
4. Use the [Stellar Wave readiness brief](stellar-wave-readiness.md) to understand contributor work and application status.
5. Check the [deployment status](../deployment/README.md) before expecting a hosted demo.

## Product documentation index

- [Initial wedge and ideal customer profile](initial-wedge-and-icp.md)
- [Launch metrics and north-star metric](launch-metrics-and-north-star.md)
- [Sender-controlled inbox pilot](sender-controlled-inbox-pilot.md)
- [Sender assurance levels](sender-assurance-levels.md)
- [Beta usability and accessibility acceptance](beta-acceptance/README.md)
- [Account recovery](account-recovery.md)
- [Legacy email interoperability roadmap](legacy-email-interoperability-roadmap.md)
- [Organization mailboxes and role-based access](organization-mailboxes-and-rbac.md)
- [Stellar Wave repository readiness](stellar-wave-readiness.md)
