# Attachment Extractor (V1)

**Release Tier:** V1  
**Audience:** Individual  
**Labels:** GrantFox OSS, Maybe Rewarded, Official Campaign, Tooling Ecosystem, V1 Launch Tool, Individual Tool

## Overview

The Attachment Extractor is an isolated tool designed to parse and extract file attachments and metadata from raw email payloads within the Hush protocol ecosystem. This module is built independently and remains completely isolated from the main application shell until a formal integration issue is created.

## Setup

1. Navigate to this directory: `cd tools/v1/individual/attachment-extractor`
2. Ensure dependencies are installed at the repository root level (`npm install`).
3. Run tests for this specific tool using vitest: `npx vitest tools/v1/individual/attachment-extractor/`

## Usage

_(Note: Code is currently in a stubbed state. See `extractor.ts` for the API contract.)_

```typescript
import { extractAttachments } from "./extractor";

const rawMailPayload = "From: sender@stealth.xyz\n...\n\n[Attachment Data]";
const result = await extractAttachments(rawMailPayload);

if (result.success) {
  console.log("Extracted:", result.attachments);
}
```

## Fixtures

When implementing the core behavior, place mock email payloads inside `tools/v1/individual/attachment-extractor/__fixtures__/`. Do not rely on global app fixtures (`src/fixtures`) to ensure this tool remains 100% isolated.

## Security and performance hardening

See `SECURITY_AND_PERFORMANCE.md` for the folder-local threat assumptions, unsafe input handling, and performance constraints for large messages, attachments, and future mailbox histories.

## Known Limitations

- Currently only supports parsing metadata (filename, content-type, size). Full binary extraction of multi-part payloads is pending implementation.
- Adheres to a hard limit of 25MB per extracted file to match network boundaries.

## OSS Contributor Review Notes

- **Isolation Check:** Verify that no imports in this directory point to `src/` (such as dashboard layouts, auth hooks, or database schemas). Generic types are acceptable if globally defined, but folder-local types are strongly preferred.
- **Test Coverage:** Review the `extractor.test.ts` file. Ensure that new implementations resolve the `.todo` items and provide comprehensive edge-case handling.
- **Reviewing:** Please test and validate this module as a fully standalone mini-product.
