# Contact Extractor Specs

## Scope

Extract contact information from email messages and save it to a structured local store for individual use.

## Objectives

- Parse email headers and body for contact data (name, email address, phone number, organization)
- Provide a review interface for extracted contacts before saving
- Deduplicate and merge contacts when the same person appears across multiple messages
- Store contacts in a deterministic, portable format
- Keep all functionality isolated within the tool workspace

## Non-goals

- Integration with the main Hush inbox or routing system
- On-chain Stellar contact storage or wallet functionality
- Database schema changes or persistent storage outside the tool
- Social graph, contact discovery, or network crawling
- Automatic contact syncing with external providers
- Encryption or key management (beyond what the platform provides)

## Folder Ownership Rules

- All work must stay inside `tools/v1/individual/contact-extractor/`
- No modifications to files outside this directory
- No imports from or dependencies on internal application modules
- All test data must be fake, deterministic, and safe for public review

## Independent Review Requirements

- Every file must be reviewable without knowledge of other parts of the codebase
- Documentation must explain the purpose and usage of each component
- Test plans must be self-contained and executable in isolation
- No secrets, private keys, or real user data may appear in this folder

## High-level Architecture

The Contact Extractor will be organized as a self-contained tool with the following suggested structure:

- `components/` — UI components for contact review and editing
- `services/` — Extraction logic, parsing, and storage
- `hooks/` — State management and side-effect hooks
- `tests/` — Unit tests and fixture-based validation
- `docs/` — Setup, usage, and contributor documentation
- `fixtures/` — Sample messages and expected extraction output

## Future Integration Note

This tool is currently documentation-only. No source code has been implemented. When implementation begins, all work must remain inside the designated folder. Any future integration with the main application requires a separate, dedicated issue that explicitly authorizes the integration boundary.
