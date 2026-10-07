# Mail List Contributor Handoff

This module owns the existing mailbox list surface: thread rows, unread state,
avatar treatment, timestamps, selection, and folder-specific rendering. Keep
changes aligned with the current mailbox model and the Hush Mail positioning
around safety, speed, and sender control.

For the bottom tab bar, sidebar collapse, topbar actions, and the responsive
small-screen switch that drives them, see
[`MOBILE_NAVIGATION.md`](./MOBILE_NAVIGATION.md).

## Local File Map

- `EmailList.tsx` renders the desktop list, filter tabs, empty state, bulk
  selection row, range selection, keyboard shortcuts, request-folder sender
  review affordance, and move-folder picker.
- `MobileMailCard.tsx` renders the touch-first row card, mobile action bar,
  trust badges, attachment count, snooze metadata, and protocol folder badges.
- `data.ts` defines the `Email`, folder, filter, proof, snooze, receipt, sender
  policy, and encrypted payload contracts used by the list and reader surfaces.
- `EmailTrustBadges.tsx`, `trust-state.ts`, and `ProvenancePanel.tsx` provide
  the trust and verification labels surfaced inside list rows.
- `BulkActionBar.tsx`, `BulkConfirmDialog.tsx`, `bulk-actions.ts`, and
  `useDragDrop.ts` define the bulk operation states and folder move guardrails
  that the list must respect.

## Data Contracts

The list accepts already-loaded `Email[]` data and never fetches real mail on its
own. `Email.folder` drives folder membership, while the virtual `all`, `inbox`,
and `starred` views are derived by `getEmailsForFolder`. `Email.labels`,
`unread`, `starred`, `attachments`, `receiptState`, `senderPolicy`,
`verifiedSender`, `postageAmount`, `snooze`, and `encryptedPayload` are optional
row annotations and must be treated as display hints, not proof of live account
state.

`MailFilters` is intentionally small: unread, attachment presence, and date
range. Preserve this filtering shape unless the broader app state is updated at
the same time. Custom folders match labels case-insensitively, so contributors
should avoid introducing label copy that conflicts with built-in folder labels.

Selection is controlled by `selectedId`, `selectedIds`, `onSelect`, and
`onSelectionChange`. Bulk actions pass a `BulkActionRequest` upward instead of
mutating message data locally. Folder moves use `MailLocation` targets and
`getDropRejectionReason` so protocol, storage, and delivery rules remain
centralized.

## User-Facing States

- Empty folders show `No conversations in {folder} yet.` and should stay calm
  and non-alarming.
- Filter tabs expose all, unread, and flagged views without changing the
  underlying mailbox.
- The sticky selection row reports visible conversation count, selected count,
  and select-all/clear-all actions for the current filtered view.
- Desktop rows show sender, first trust badge, subject, timestamp, unread dot,
  and optional avatar.
- Mobile rows add preview text, protocol/folder/label badges, attachment count,
  snooze copy, and Star/Snooze/Archive actions.
- Request-folder rows can surface `Review sender` through
  `ConvertSenderButton`; do not reuse that CTA for non-request folders without
  checking sender-conversion behavior.
- The move picker is keyboard reachable with `M`, closes with `Esc`, and must
  continue to explain disabled targets through the existing rejection reason.

## Safety And Privacy Boundaries

All rows in `data.ts` are fake demo messages. Do not add real inbox content,
customer names, wallet secrets, private keys, access tokens, payment account
details, or live mailbox identifiers to fixtures, screenshots, tests, or docs.

The list must not decrypt payloads, sign wallet transactions, settle postage,
send mail, archive mail, or write to a mailbox directly. It can display
metadata, route user intent upward through callbacks, and show trust or receipt
signals that other modules computed. Keep encrypted payload body access gated by
the reader/decryption flow; list rows may show status and diagnostic copy only.

Trust badges, verified labels, paid-request hints, and receipt states are
security-sensitive UI. Avoid copy that guarantees identity, delivery, or payment
unless the backing data contract already proves it. Prefer language such as
`Verified`, `Pending Proof`, `Request`, or `Receipt` that matches the current
folder and badge model.

External avatar images are generated from the sender display name through
DiceBear. Do not replace that with uploaded user avatars or remote customer
assets unless a privacy review covers caching, tracking, and fallback behavior.

## QA Checklist

- Confirm `EmailList.tsx` still renders all, inbox, protocol, delivery, storage,
  and custom label views through existing `getEmailsForFolder` and label
  filtering.
- Verify unread, starred, attachment, snooze, receipt, verified sender, request,
  and encrypted payload rows remain visually distinct on desktop and mobile.
- Check select all, individual selection, shift range selection, `Ctrl/Cmd+A`,
  `Esc`, and `M` keyboard behavior in the list.
- Confirm bulk action progress and failure states still render through
  `BulkActionBar` without mutating local fixture data.
- Validate the move picker disables invalid folder targets using
  `getDropRejectionReason`.
- Review mobile Star, Snooze, and Archive buttons for touch target size,
  accessible labels, and event propagation.
- Run targeted tests around `src/components/mail/trust-state.test.ts` when
  changing trust or verification display, then run the project typecheck and
  lint commands when the local environment supports them.
