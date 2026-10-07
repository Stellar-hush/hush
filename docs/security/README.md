# Hush security guide

Hush is beta software, not a security-certified or production-audited email service. These documents describe the current code and intended operating controls; they do not guarantee that every control is enabled in every deployment. Check [deployment status](../deployment/README.md) before relying on a hosted environment.

## Start here

- [Beta threat model](./beta-threat-model.md) — assets, actors, trust boundaries, abuse cases, and chain-specific threats.
- [Security-control map](./beta-control-map.md) — implementation, infrastructure, operator, and accepted beta controls with verification pointers.
- [Residual-risk register](./beta-risk-register.md) — open risks and their release impact.
- [Beta verification checklist](./beta-verification-checklist.md) — repeatable release checks and captured evidence. Historical evidence describes the commit and environment named in that document; it is not evidence for the current main branch.

## Protocol and data protection

- [Signed API authentication v1](./api-authentication-v1.md) — canonical request signing, challenge validity, nonce replay protection, and errors.
- [Metadata policy](./metadata-policy.md) — data inventory, minimization, retention, and stable-identifier risks.
- [Verification-token lifecycle](./verification-token-lifecycle.md) — issuance, expiry, resend, and consumption rules.

Message bodies and attachments are intended to be encrypted before off-chain storage. Public Stellar transactions and contract events can still reveal addresses, timing, payment amounts, and protocol activity. Do not equate encrypted content with anonymous or metadata-free communication.

## Browser and API boundary

The server applies security headers centrally and validates allowed request origins from runtime configuration. Production requires explicit origins and secure cookie settings; preview environments must use separate origins and must not share production cookies or secrets. Do not use wildcard origins with credentialed requests.

Several configuration names and protocol headers retain the legacy project prefix for compatibility. Their current names and protocol behavior are documented in the [API guide](../api/README.md) and [migration plan](../product/brand-migration.md). Do not silently change a signed header, domain separator, or accepted-origin policy as part of a visual rebrand.

Security evidence must be redacted. Never include session tokens, recovery codes, wallet seeds, private keys, API tokens, production credentials, or real message content in issues, logs, screenshots, or pull requests.

## Reporting a vulnerability

Use GitHub’s [private security advisory form](https://github.com/Stellar-hush/hush/security/advisories/new) for sensitive reports. Do not publish exploit details or secrets in a public issue. Include affected commit or version, impact, reproduction conditions, and a minimal proof that contains no real user data.
