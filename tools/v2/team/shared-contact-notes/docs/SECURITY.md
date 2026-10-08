# Security and Performance Hardening — Shared Contact Notes

Tool: `tools/v2/team/shared-contact-notes/`
Issue: [#657](https://github.com/Stellar-hush/hush/issues/657) — Security and
performance hardening (V2 team tool).

This document records the threat assumptions, unsafe inputs, and performance
constraints for the Shared Contact Notes tool. All hardening lives in
`security.ts` (additive — the existing `validation.ts` / `service.ts` are
unchanged; callers opt into the hardened path).

## Trust boundaries

- The tool stores free-text notes keyed by `contactId` / `authorId`. Notes are
  later rendered in a team UI, so stored text is an **untrusted input** that must
  not be able to break storage, lookup, or rendering.
- The tool has no network, no secrets, and no main-app linkage. Hardening is
  about input bounds and work amplification, not about auth/crypto.

## Threat assumptions

| #   | Threat                                                                                                                                    | Assumption                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| T1  | **Oversized content** — a note of millions of characters exhausts memory or hangs rendering.                                              | Content is bounded to `MAX_NOTE_CONTENT_CHARS` (10,000).                                   |
| T2  | **Control-character smuggling** — NUL / DEL / other C0 bytes break parsers, terminals, or downstream storage.                             | `stripControlChars` removes all C0 bytes except TAB/LF/CR and collapses whitespace.        |
| T3  | **Oversized identifiers** — a multi-megabyte `contactId`/`authorId` abuses map keys / lookup.                                             | Identifiers are clamped to `MAX_IDENTIFIER_CHARS` (256).                                   |
| T4  | **Unbounded history** — `getByContact` returns the entire note set; a contact with a huge history forces an O(n) scan + unbounded render. | `boundedNotes` caps returned notes (`MAX_NOTES_PER_CONTACT` = 1,000) and sorts by recency. |

## Unsafe inputs and handling

| Input       | Unsafe shape                            | Handling in `security.ts`                                                            |
| ----------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `content`   | empty / >10k chars / control bytes      | `hardenCreateNote` / `hardenUpdateNote` sanitize + bound; blocking `issues` returned |
| `contactId` | non-string / >256 chars / control bytes | sanitized + clamped; required check                                                  |
| `authorId`  | non-string / >256 chars / control bytes | sanitized + clamped; required check                                                  |
| result set  | >1,000 notes for one contact            | `boundedNotes` caps and orders by recency                                            |

## Hardened API

- `hardenCreateNote(input)` → `{ value, issues }` — sanitize all fields; refuse
  persistence when `issues.length > 0`.
- `hardenUpdateNote(input)` → `{ value, issues }` — same, for the mutable
  `content` only.
- `boundedNotes(notes, limit?)` → most-recently-updated ≤ `limit` notes.

## Performance notes (large datasets)

- `boundedNotes` turns an unbounded `getByContact` result into a fixed bound, so
  render and transfer cost is independent of total history size.
- Sanitization is a single linear pass with no backtracking; cost is O(n) in
  input length, bounded by `MAX_NOTE_CONTENT_CHARS`.
- No main-app, database, or auth code is modified; all changes are confined to
  `tools/v2/team/shared-contact-notes/`.

## Acceptance criteria

- [x] Explicit handling for malformed / hostile input (`hardenCreateNote`, `hardenUpdateNote`)
- [x] Avoids unnecessary work on large datasets (`boundedNotes`)
- [x] No existing security-sensitive app code modified
- [x] Files changed limited to `tools/v2/team/shared-contact-notes/`
- [x] Self-contained, reviewable mini-product change
