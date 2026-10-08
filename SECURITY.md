# Security Policy

## Reporting A Vulnerability

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/Stellar-hush/hush/security/advisories/new). Do not open a public issue with exploit details, credentials, private keys, wallet seeds, tokens, personal data, or message content.

Include the affected commit or release, impact, reproducible sanitized steps, and any known mitigation. Maintainers will acknowledge the report, establish severity and ownership, and coordinate disclosure after a fix is available.

## Supported Scope

Security fixes target the current `main` branch and active beta deployment. Historical branches, local demo data, and unsupported forks are outside the maintained security boundary unless the same issue affects current code.

## Handling Requirements

- Rotate any exposed credential before investigating its code history.
- Use redacted logs and synthetic accounts for reproduction.
- Keep vulnerability details in the private advisory until coordinated disclosure.
- Add regression coverage for the successful exploit path and the expected denial path.
- Re-run identity, authorization, cryptography, contract, and deployment checks affected by the fix.
