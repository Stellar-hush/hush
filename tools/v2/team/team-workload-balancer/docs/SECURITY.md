# Security and Performance Hardening — Team Workload Balancer

Tool: `tools/v2/team/team-workload-balancer/`
Issue: [#712](https://github.com/Stellar-hush/hush/issues/712) — Security and
performance hardening (V2 team tool).

This document records the threat assumptions, unsafe inputs, and performance
constraints for the Team Workload Balancer. All hardening lives in `security.ts`
(additive — the existing `services/workload-service.ts` is unchanged; callers opt
into the hardened path).

## Trust boundaries

- The tool takes workload items + team members and proposes assignments. Item
  titles/descriptions, member names, tags, roles, and skills come from users/UI
  and are **untrusted** free text. Counts (items, members) and numeric fields
  (capacity, effort, load) are also untrusted.
- The tool has no network, no secrets, and no main-app linkage. Hardening is
  about input bounds and work amplification, not auth/crypto.

## Threat assumptions

| #   | Threat                                                                                                   | Assumption                                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T1  | **Oversized / hostile text** — huge titles/descriptions/member names exhaust memory or break rendering.  | Text fields bounded (title 500, description 2k, name 200) and control bytes stripped. |
| T2  | **Bad enum** — an unknown priority/strategy bypasses logic.                                              | `priority` ∈ {low,medium,high,urgent}; `strategy` ∈ known set.                        |
| T3  | **Bad numbers** — negative/non-finite capacity/effort/load cause NaN propagation.                        | Numeric fields must be finite and ≥ 0 (effort ≤ 1e9).                                 |
| T4  | **Bad date** — a malformed `dueAt` breaks `Date.parse` / overdue logic.                                  | `dueAt` must be a valid ISO date or null.                                             |
| T5  | **Oversized arrays** — huge tags/roles/skills blow up iteration.                                         | Arrays capped (tags 20, roles 20, skills 50).                                         |
| T6  | **Work amplification** — `balanceWorkload` is O(n·m) per item; a 50k-item / 5k-member dataset amplifies. | `enforceWorkloadBounds` caps items (5k) / members (500) before balancing.             |

## Unsafe inputs and handling

| Input                             | Unsafe shape                    | Handling in `security.ts`              |
| --------------------------------- | ------------------------------- | -------------------------------------- |
| `item.title` / `item.description` | >500 / >2k chars, control bytes | `sanitizeWorkloadItem` strips + clamps |
| `item.priority`                   | not in enum                     | rejected                               |
| `item.estimatedEffort`            | <0 / NaN / ∞ / >1e9             | rejected                               |
| `item.dueAt`                      | invalid date                    | `isValidISODate` rejects               |
| `item.tags`                       | >20 entries                     | sliced                                 |
| `member.name`                     | >200 chars, control bytes       | `sanitizeTeamMember` strips + clamps   |
| `member.capacity` / `currentLoad` | <0 / NaN                        | rejected                               |
| `member.roles` / `skills`         | >20 / >50                       | sliced                                 |
| `config.strategy`                 | unknown                         | `validateBalanceInput` rejects         |
| `items` / `members` counts        | >5k / >500                      | `enforceWorkloadBounds` caps           |

## Hardened API

- `sanitizeWorkloadItem(item)` / `sanitizeTeamMember(member)` → `{ value, issues }`.
- `validateBalanceInput(items, members, config)` → blocking `SecurityIssue[]`.
- `enforceWorkloadBounds(items, members)` → capped slices (perf guard).
- `isValidISODate(value)` → boolean.

## Performance notes (large datasets)

- `balanceWorkload` re-sorts members (O(m log m)) for each of n items and pushes
  to a growing `workingItems` array, so cost is roughly O(n·m·log m) plus array
  growth. `enforceWorkloadBounds` caps n and m so this stays bounded; callers
  should run it before `balanceWorkload`.
- Sanitization is a single linear pass per entity; cost is O(input length),
  bounded by the field caps above.
- No main-app, database, or auth code is modified; all changes are confined to
  `tools/v2/team/team-workload-balancer/`.

## Acceptance criteria

- [x] Explicit handling for malformed / hostile input (`sanitize*`, `validateBalanceInput`)
- [x] Avoids unnecessary work on large datasets (`enforceWorkloadBounds`)
- [x] No existing security-sensitive app code modified
- [x] Files changed limited to `tools/v2/team/team-workload-balancer/`
- [x] Self-contained, reviewable mini-product change
