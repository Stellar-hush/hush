# Receipts API Contributor Handoff

This folder owns the existing read-receipt API surface for Hush Mail. It is a narrow API module, not a new tool surface, and changes here should keep receipt state metadata-only, participant-scoped, and easy to validate alongside the provenance UI.

## Local Files

- `index.ts` handles `POST /api/v1/receipts/` for creating a delivery receipt after validating `messageId`, `recipient`, and `sender`.
- `$messageId.ts` handles `GET /api/v1/receipts/$messageId` for reading a receipt by message hash.
- `$messageId/read.ts` handles `POST /api/v1/receipts/$messageId/read` for publishing a read receipt.
- `-authorization.ts` defines the sender-only delivery and recipient-only read publication roles. Its `-` prefix keeps the helper out of the generated route tree.
- `src/server/api/receipt-service.ts` owns duplicate prevention, not-found handling, participant authorization, and read-state mutation.
- `src/server/api/domain.ts` defines `receiptSchema`, `hash32Schema`, and `stellarAddressSchema`.
- `src/server/api/repository.ts` and `src/server/api/memory-repository.ts` provide the current repository contract and in-memory demo implementation.
- `src/components/mail/ProvenancePanel.tsx` renders receipt and provenance details in the mail UI, including copy/inspect actions and postage dispute context.

Keep future edits inside these existing paths unless an issue explicitly asks for a small shared helper or test fixture.

## Data Contract

A receipt record contains only:

- `messageId`: a 32-byte lowercase hexadecimal message hash.
- `sender`: a Stellar G-address for the sender.
- `recipient`: a Stellar G-address for the recipient.
- `deliveredAt`: an ISO timestamp set when the receipt is created.
- `readAt`: an ISO timestamp after the message is marked read, or `null` before that happens.

The contract intentionally excludes message bodies, attachments, mailbox snapshots, private keys, auth tokens, payment account numbers, payment QR codes, and live customer mail.

## User-Facing States

- Create receipt: `POST /api/v1/receipts/` returns `201` with the receipt when the request actor matches the sender.
- Duplicate receipt: retrying the same delivery receipt for the same `messageId`, `sender`, and
  `recipient` replays the stored receipt.
- Read receipt: `GET /api/v1/receipts/$messageId` returns the receipt only when the request actor is the sender or recipient.
- Missing receipt: unknown `messageId` returns a not-found error.
- Forbidden receipt: non-participants receive a forbidden error rather than receipt metadata.
- Provenance UI: `ProvenancePanel` shows receipt status, copyable identifiers, timeline state, and inspection details without exposing raw message content.

## Authorization

Receipt access is scoped to the two participants of a message: its `sender` and its `recipient`. Every request must identify its actor with the `x-stealth-address` header, and a missing or invalid header returns `401 unauthorized` before any receipt is read or written. Beyond that, the two endpoints enforce different actor rules.

### Actor rules by endpoint

**`POST /api/v1/receipts/`** — create a delivery receipt.

- The resolved principal must equal the `sender` in the request body, enforced by `assertCanPublishDeliveryReceipt`. Only a sender can record delivery for their own address.
- An actor that does not match `sender` returns `403 forbidden`, so a recipient or third party cannot mint a sender-owned receipt.
- A missing or invalid actor header returns `401 unauthorized`.
- An identical duplicate for a `messageId` that already exists returns a `201` receipt
  response. The first persisted `deliveredAt` timestamp wins, so later retry timestamps never
  rewrite delivery metadata or trigger a second receipt write.
- A duplicate for the same `messageId` with different participants returns `409 conflict`.

**`GET /api/v1/receipts/:messageId`** — read a receipt.

- The actor must be the receipt's `sender` or `recipient`, enforced by `assertReceiptParticipant(receipt, actor)`. Any other actor returns `403 forbidden` instead of receipt metadata.
- The participant check runs after the receipt is loaded, so an unknown `messageId` returns `404 not_found`.
- A missing or invalid actor header returns `401 unauthorized`.

**`POST /api/v1/receipts/:messageId/read`** — publish a read receipt.

- The actor must equal the existing receipt's `recipient`, enforced by `assertCanPublishReadReceipt`. The sender and unrelated actors receive `403 forbidden`.
- Authorization runs before `markReceiptRead`, so a forbidden attempt cannot set `readAt`.
- A missing or invalid actor header returns `401 unauthorized`.
- Repeating an authorized read transition replays the stored `200` receipt response. The first
  persisted `readAt` timestamp wins, so later retry timestamps never rewrite read metadata or
  trigger a second receipt write.

### Delegation

Receipt publication delegation is not supported. A delivery publisher must exactly match `sender`, and a read publisher must exactly match `recipient`. Team membership, mailbox access, and participation in the message do not grant publication authority. Any future delegation model must be introduced by a separate security-reviewed change that scopes the delegate to a receipt type and message and provides revocation and audit behavior.

### Authorization failures

All failures use the standard error envelope from `src/server/api/response.ts`, so callers can branch on `error.code`.

| Scenario                                                                          | HTTP status | `error.code`       |
| --------------------------------------------------------------------------------- | ----------- | ------------------ |
| Missing or invalid `x-stealth-address` header                                     | 401         | `unauthorized`     |
| Creating a receipt where the actor is not the `sender`                            | 403         | `forbidden`        |
| Marking a receipt read where the actor is not the `recipient`                     | 403         | `forbidden`        |
| Reading a receipt as a non-participant                                            | 403         | `forbidden`        |
| Reading a receipt that does not exist                                             | 404         | `not_found`        |
| Creating a duplicate receipt for the same `messageId` with different participants | 409         | `conflict`         |
| `messageId`, `sender`, or `recipient` fails schema validation                     | 422         | `validation_error` |

Non-participant read (`403 forbidden`):

    {
      "error": {
        "code": "forbidden",
        "message": "Only message participants can read this receipt"
      },
      "meta": { "requestId": "7b2e...", "timestamp": "2026-07-17T23:00:00.000Z" }
    }

Conflicting duplicate create (`409 conflict`):

    {
      "error": {
        "code": "conflict",
        "message": "A delivery receipt already exists for this message with different participants"
      },
      "meta": { "requestId": "3f9a...", "timestamp": "2026-07-17T23:00:00.000Z" }
    }

### Duplicate timestamp precedence

Receipt publication is idempotent for matching participants. The first successful delivery
publication owns `deliveredAt`, and the first successful read publication owns `readAt`. Later
identical retries return the stored receipt without applying the retry's later request time. This
keeps client timeout retries deterministic and limits receipt publication to one domain write per
transition.

### Receipt examples

A freshly created delivery receipt has `deliveredAt` set and `readAt` still `null`:

    {
      "data": {
        "messageId": "3b1f0c9d5e2a4b8c7d6e1f0a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c",
        "sender": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        "recipient": "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6",
        "deliveredAt": "2026-07-17T23:00:00.000Z",
        "readAt": null
      },
      "meta": { "requestId": "9c4d...", "timestamp": "2026-07-17T23:00:00.000Z" }
    }

After the message is marked read, the same record carries a `readAt` timestamp:

    {
      "data": {
        "messageId": "3b1f0c9d5e2a4b8c7d6e1f0a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c",
        "sender": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        "recipient": "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6",
        "deliveredAt": "2026-07-17T23:00:00.000Z",
        "readAt": "2026-07-17T23:15:00.000Z"
      },
      "meta": { "requestId": "e1a7...", "timestamp": "2026-07-17T23:15:00.000Z" }
    }

## Safety And Privacy Notes

- `assertCanPublishDeliveryReceipt` protects receipt creation so callers cannot create sender-owned receipts for another account.
- `assertCanPublishReadReceipt` protects read publication so the sender or an unrelated caller cannot claim the recipient read a message.
- `assertReceiptParticipant(receipt, actor)` protects reads so only the sender or recipient can inspect receipt metadata.
- Receipt timestamps are metadata and should not be used as proof of message body access unless the calling feature documents that guarantee.
- Hashes, contract IDs, postage records, and receipt identifiers in the provenance UI are trust-sensitive. Avoid copy that implies live verification beyond the data available to the component.
- Clipboard and inspector actions can move metadata outside the app. Keep them bounded to receipt/provenance fields and avoid adding opaque blobs.
- Demo or fixture receipts must use fake deterministic data. Do not add real user addresses, live payment records, production logs, secrets, private keys, or live mail content.
- API error responses should preserve the standard envelope shape from `src/server/api/response.ts` and avoid leaking whether unrelated actors are involved.

## Contributor Checklist

- Keep route schemas aligned with `receiptSchema` in `src/server/api/domain.ts`.
- Add or update service tests when changing duplicate, not-found, forbidden, or read-state behavior.
- Keep repository changes compatible with both the interface in `repository.ts` and the in-memory implementation.
- Keep UI copy aligned with Hush Mail's safety, speed, and sender-control positioning.
- Avoid creating a new V1/V2 tool folder or unrelated product surface for receipt work.
- Link docs to existing local files and tests instead of describing architecture that does not exist.

## Lightweight QA Checklist

- Create a receipt with a valid sender actor and confirm `deliveredAt` is set and `readAt` is `null`.
- Attempt duplicate creation for the same `messageId`, `sender`, and `recipient` and confirm the
  stored receipt is replayed.
- Attempt duplicate creation for the same `messageId` with different participants and confirm a
  conflict response.
- Read a receipt as the sender and as the recipient.
- Attempt to read the same receipt as a different actor and confirm a forbidden response.
- Request an unknown receipt and confirm a not-found response.
- Check that `ProvenancePanel` still renders empty, pending, verified, copied, and inspector states without showing message bodies.
- Run the most relevant local test, typecheck, or lint command when dependencies are available.
- Search changed files for secrets, private keys, payment details, personal accounts, and live mail content before opening a PR.
