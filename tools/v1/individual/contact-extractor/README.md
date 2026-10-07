# Contact Extractor

Extract and save contacts from email messages for individual use.

## Overview

The Contact Extractor is a self-contained tooling workspace for extracting contact information from email messages and saving it in a structured format. It is designed for individual users who need to build and maintain a personal contact list from their inbox.

This repository folder contains the isolated workspace for the Contact Extractor tool. No source code exists yet; this directory currently holds specifications, documentation, and a test plan for future contributors.

## Audience

Individual Hush users who want to extract contact details from email messages for personal organization and reference.

## Ownership Boundary

All work for this tool must stay inside:

```text
tools/v1/individual/contact-extractor/
```

Do not wire this tool into the main app, routing, inbox architecture, wallet core, Stellar core, database schema, or existing design system unless a future integration issue explicitly allows it.

## Quick Start

```bash
# Navigate to the tool workspace
cd tools/v1/individual/contact-extractor/

# Install dependencies (when implementation exists)
# npm install

# Run tests (when tests exist)
# npm test
```

## Usage Overview

When implemented, the Contact Extractor will:

1. Parse email messages for contact information (name, email address, phone, organization)
2. Extract structured contact data from message headers and body
3. Save extracted contacts to a local store
4. Support deduplication and merging of existing contacts

## Example Workflow

1. User selects one or more email messages
2. Contact Extractor scans messages for contact data
3. Extracted contacts are presented for review
4. User confirms or edits extracted details
5. Contacts are saved to the user's contact list

## Fixture Expectations

Test fixtures should contain:

- Sample email messages with embedded contact information
- Edge cases (messages with no contacts, malformed headers, multiple contacts)
- Expected extraction output for each fixture
- Deduplication scenarios (same contact from multiple messages)

## Known Limitations

- This tool is in the planning phase. No implementation exists yet.
- Extraction accuracy depends on message format and structure.
- Contact deduplication logic is not yet specified.
- Integration with the main application is out of scope.
- No Stellar or on-chain functionality is planned for this tool.

## OSS Review Notes

- All documentation and future implementation must be reviewable independently.
- No secrets, private keys, or real user data should appear anywhere in this folder.
- All test data must be fake, deterministic, and safe for public repository review.
- Contributors must follow the folder ownership boundary strictly.

## Validation Checklist

Before submitting changes, verify:

- [ ] All files are inside `tools/v1/individual/contact-extractor/`
- [ ] No source code outside this folder was modified
- [ ] No real user data, secrets, or private keys are present
- [ ] All test data is fake and deterministic
- [ ] Prettier formatting passes (`bun x prettier --check .`)
- [ ] Documentation is clear and reviewable by an independent contributor
- [ ] Known limitations are documented
