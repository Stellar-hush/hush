# Hush brand migration

The local product brand is **Hush** and the package/project slug is **stellar-hush**. The app UI, product copy, repository guides, metadata, package metadata, and primary color system have been updated to those names.

Some old identifiers are part of deployed integrations or stored data. They need a coordinated migration before they can be renamed safely.

| Existing identifier | Why it remains for now |
| --- | --- |
| `Stellar-Mail/stealth` GitHub repository | The repository URL and organization are managed by GitHub; local changes cannot rename the remote. |
| `stealth.me`, `stealth.xyz`, and related federation domains | Existing addresses, DNS, SEP-1, SMTP, CORS, cookies, and account resolution depend on domain ownership and routing. |
| `x-stealth-*` headers and `STEALTH_*` environment variables | Clients, signed requests, deployment secrets, CI, and operator configuration use these names. |
| `STEALTH-AUTH-V1` and the envelope signature domain | These values are cryptographic protocol identifiers covered by interoperability vectors and existing clients. |
| `StealthCoordinator`, KV bindings, and service names | Cloudflare Durable Object classes and deployed resource bindings can hold durable state. Renaming them requires a state migration. |
| `stealth-*` storage keys, contract package names, and migration IDs | Persisted browser data, contract artifacts, or database migrations may depend on these strings. |

## External cutover checklist

1. Choose and verify the Hush mail domains before changing resolver behavior, federation, DNS, or sender addresses.
2. Rename the GitHub repository to `stellar-hush` and update local remotes, CI links, issue templates, badges, and the Drips Wave application.
3. Add the project’s agreed open-source license before submitting the repository to a contributor program.
4. Design a versioned compatibility period for API headers and signed-request domain separators; do not silently alter existing signature bytes.
5. Plan migrations for Cloudflare Durable Objects, KV namespaces, object storage, SMTP identities, cookies, CORS, backups, and any persisted client keys.
6. Keep signed release evidence and historical protocol vectors immutable; add new versions when a compatibility contract changes.

The Hush showcase and Wave maintainer brief are ready for review. This checklist tracks the infrastructure and ownership changes that remain outside the local brand pass.
