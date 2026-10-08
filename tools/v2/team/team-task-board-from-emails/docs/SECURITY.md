# Security and Performance Hardening — Team Task Board from Emails

Tool: `tools/v2/team/team-task-board-from-emails/`
Issue: [#707](https://github.com/Stellar-hush/hush/issues/707) — Security and
performance hardening (V2 team tool).

This document records the threat assumptions, unsafe inputs, and performance
constraints for the Team Task Board from Emails tool. All hardening lives in
`security.ts` (additive — the existing `services/taskBoardService.ts` is
unchanged; callers opt into the hardened path).

## Trust boundaries

- The tool turns **emails** into **task cards** via regex/NLP heuristics. Email
  fields (subject, body, from, to) are fully **untrusted** free text from a
  shared mailbox, and the derived card fields (title, owner, notes) inherit that
  untrustworthiness. Counts (emails processed) are also untrusted.
- The tool has no network, no secrets, and no main-app linkage. Hardening is
  about input bounds, enum validity, and work amplification — not auth/crypto.

## Threat assumptions

| #   | Threat                                                                                                                                         | Assumption                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| T1  | **Oversized / hostile text** — huge subject/body exhaust memory or break rendering.                                                            | Text bounded (subject 500, body 20k, title 500, owner 100, notes 2k) and control bytes stripped. |
| T2  | **CPU amplification** — `extractTaskFromEmail` runs several regexes over each body; a 10 MB body per email over a huge history amplifies cost. | `body` is hard-capped at 20k; batches capped at 2k emails.                                       |
| T3  | **Bad enums** — unknown priority/status bypasses column/UI logic.                                                                              | `priority` ∈ {low,medium,high}; `status` ∈ {new,triage,blocked,done}.                            |
| T4  | **Bad dates** — malformed `dueDate` / `receivedAt` breaks Date.parse / date math.                                                              | `dueDate` must be `YYYY-MM-DD` or null; `receivedAt` must be valid ISO.                          |
| T5  | **Oversized recipient list** — huge `to[]` blows up iteration.                                                                                 | `to` capped at 50 recipients.                                                                    |
| T6  | **Unbounded batch** — processing an enormous email history amplifies the per-email extraction loop.                                            | `enforceBatchBounds` caps emails at 2k before processing.                                        |

## Unsafe inputs and handling

| Input                      | Unsafe shape               | Handling in `security.ts`                         |
| -------------------------- | -------------------------- | ------------------------------------------------- |
| `email.subject`            | >500 chars, control bytes  | `sanitizeEmail` strips + clamps                   |
| `email.body`               | >20k chars, control bytes  | `sanitizeEmail` strips + clamps (caps regex cost) |
| `email.from` / `to[]`      | >256 chars, >50 recipients | `sanitizeEmail` strips + clamps                   |
| `email.receivedAt`         | invalid ISO                | `isValidISODateTime` rejects                      |
| `email.to` count           | >50                        | sliced                                            |
| `card.title` / `owner`     | >500 / >100 chars          | `sanitizeTaskCard` strips + clamps                |
| `card.priority` / `status` | not in enum                | rejected                                          |
| `card.dueDate`             | not `YYYY-MM-DD`           | `isValidDueDate` rejects                          |
| `card.notes`               | >2k chars                  | clamped                                           |
| `emails` count             | >2k                        | `enforceBatchBounds` caps                         |

## Hardened API

- `sanitizeEmail(email)` / `sanitizeTaskCard(card)` → `{ value, issues }`.
- `validateEmailBatch(emails)` → blocking `SecurityIssue[]`.
- `enforceBatchBounds(emails)` → capped slice (perf guard).
- `isValidDueDate(value)` / `isValidISODateTime(value)` → boolean.

## Performance notes (large datasets)

- `extractTaskFromEmail` runs ~6 regex passes over the body per email. An
  unbounded body or an unbounded email count makes this O(n·bodySize). Hard caps
  (body 20k, emails 2k) bound the worst case; callers should run
  `enforceBatchBounds` before `getTasks`/`getBoard`.
- Sanitization is a single linear pass per field; cost is O(input length),
  bounded by the field caps above.
- No main-app, database, or auth code is modified; all changes are confined to
  `tools/v2/team/team-task-board-from-emails/`.

## Acceptance criteria

- [x] Explicit handling for malformed / hostile input (`sanitize*`, `validateEmailBatch`)
- [x] Avoids unnecessary work on large datasets (`enforceBatchBounds`)
- [x] No existing security-sensitive app code modified
- [x] Files changed limited to `tools/v2/team/team-task-board-from-emails/`
- [x] Self-contained, reviewable mini-product change
