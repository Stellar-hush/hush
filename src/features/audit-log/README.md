# Audit Log Contributor Handoff

This module renders the existing Hush Mail audit timeline for protocol event review. It is a local app surface, not a new tool folder, and changes here should preserve the current safety promise: reviewers can inspect sender-control and delivery metadata without exposing message bodies, secrets, or live customer mail.

## Local Files

- `AuditLog.tsx` owns the reader-facing timeline, category filters, search input, copy action, JSON export action, empty state, and per-row event detail.
- `useAuditLog.ts` owns local filtering, plain-text diagnostic formatting, clipboard copy, and browser-side JSON export.
- `data.ts` provides mock audit events for local development and demos.
- `types.ts` defines the `AuditEvent`, `AuditActor`, `AuditCategory`, `AuditEventKind`, and `AuditFilter` contracts.
- `index.ts` exports the component, hook, and public types for the rest of the app.

Keep future edits inside this folder unless a small shared UI helper is already needed by multiple existing surfaces.

## Data Contract

An audit event is intentionally metadata-only:

- `id`: stable local row identity for React rendering.
- `kind`: normalized event name such as `policy.sender_allowed`, `delivery.receipt_issued`, or `identity.verification_failed`.
- `category`: one of `policy`, `delivery`, `security`, or `billing`; the category drives the filter controls, dot color, and icon.
- `ts`: ISO-8601 timestamp rendered as a local time with seconds.
- `actor`: `user`, `relay`, or `system`; user and relay actors may show shortened addresses, display names, or relay IDs.
- `summary`: a short human-readable sentence for the row.
- `context`: optional linked metadata such as `messageId`, sender identity hints, postage amount/currency, or policy value.

The contract deliberately excludes message bodies, full mailbox content, private keys, auth tokens, and raw secrets. If a new event kind is added, update `AuditEventKind`, `CATEGORY_FOR_KIND`, category display metadata in `AuditLog.tsx`, mock data, and this handoff together.

## User-Facing States

- Empty timeline: `EmptyState` explains that policy changes, sender decisions, delivery proofs, and session events will appear after activity starts, while message body content is never recorded.
- Filtered empty state: when filters or search remove every row, `EmptyState` offers a `Clear filters` action instead of implying the audit trail is empty.
- Default timeline: rows are ordered by the provided event array and show the summary, actor, optional context, category label for assistive tech, and timestamp with a hover title for the full local datetime.
- Category filter: `All`, `Policy`, `Delivery`, `Security`, and `Billing` narrow the current event set without mutating source data. Active filters expose `aria-pressed` and keyboard-visible focus rings.
- Search filter: case-insensitive matching across summary, kind, sender display name, and message ID, with an inline clear control when text is present.
- Copy diagnostics: copies the filtered event set as plain text for support and review. The action is disabled when no rows are visible, shows loading/success/error feedback, and never includes message bodies.
- Export JSON: downloads the filtered event set as `stealth-audit-YYYY-MM-DD.json`. The action is disabled when no rows are visible and surfaces a recovery message if the browser blocks download.

Filtering, copying, and exporting are read-only from the app's perspective. They should never write back to protocol state, mailbox state, or server-side audit storage without a separate reviewed API contract.

## Safety And Privacy Notes

- Demo rows in `data.ts` are fake local fixtures. Do not replace them with real user mail, real payment proofs, real private keys, or production logs.
- Message body content is out of scope. The UI may show message IDs, shortened addresses, sender display names, event kinds, and postage metadata, but it should not reveal email bodies or attachments.
- Clipboard and JSON export are trust-sensitive because they can move diagnostic metadata outside the app. Keep exported fields bounded to the `AuditEvent` contract and avoid adding opaque blobs.
- Search should stay local to the provided event list. Do not trigger network lookups or mailbox queries from the search input.
- Timestamp rendering uses the viewer's locale. If an absolute audit trail is required later, show the original ISO value or timezone explicitly instead of replacing the stored timestamp.
- Actor labels are display hints, not cryptographic proof. Avoid copy that implies a sender, relay, or policy decision is verified beyond the available event data.
- Billing events may mention postage amount and currency, but the audit log should not expose account numbers, wallet secrets, payment QR codes, or withdrawal instructions.

## Contributor Checklist

- Keep new copy aligned with Hush Mail's safety, speed, and sender-control positioning.
- Add event kinds to `types.ts` before rendering them, and map each kind to exactly one category.
- Keep row summaries short enough to truncate cleanly in the current layout.
- Preserve keyboard access for the search input and action buttons.
- Keep category labels and empty-state copy understandable without relying on color alone.
- Do not introduce a new V1/V2 tool folder, background worker, or unrelated product surface for audit-log work.
- Link to existing local files when documenting behavior; avoid inventing architecture that is not present in the code.

## Lightweight QA Checklist

- Load the audit-log surface and confirm the default event list renders without console errors.
- Verify each category filter changes the visible rows and that `All` restores the full set.
- Search by event kind, sender display name, and message ID; confirm unmatched searches show the empty state.
- Use `Copy` after filtering and confirm the clipboard text contains only filtered event metadata.
- Use `Export` after filtering and confirm the downloaded JSON contains only filtered `AuditEvent` fields.
- Check that mock data remains fake and that no message body, secret, private key, payment account, or live customer mail is present.
- Run the most relevant local test, typecheck, or lint command when dependencies are available.
