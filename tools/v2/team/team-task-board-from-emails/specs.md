# Team Task Board from Emails Specs

## Purpose

Create a team task board model from action-oriented emails while keeping the
tool isolated from the main Hush Mail application.

## Release Scope

- Release tier: V2 later-release tool
- Audience: team
- Folder ownership: `tools/v2/team/team-task-board-from-emails/`
- Integration status: isolated mini-product workspace

## In-Scope Behavior

- Represent email-derived tasks as board cards.
- Preserve each card's source email metadata for reviewer traceability.
- Capture extraction confidence and review notes for ambiguous fields.
- Define fixtures that cover each board state.
- Provide a folder-local validation path for OSS reviewers.

## Out-of-Scope Behavior

- Main app routing or dashboard registration
- Inbox ingestion or mail rendering engine changes
- Authentication, wallet, Stellar, or database changes
- Shared design system changes
- Notification delivery or collaboration side effects

## Task Card Contract

Each expected board card should include:

- `id`: stable fixture-local task identifier
- `title`: short action label
- `owner`: assigned team member or `unassigned`
- `dueDate`: ISO date string or `null`
- `priority`: one of `low`, `medium`, `high`
- `status`: one of `new`, `triage`, `blocked`, `done`
- `sourceEmailId`: source email identifier
- `reviewRequired`: true when extraction needs human confirmation

## Required Issue Categories

- Architecture
- Feature
- UI and accessibility
- Security and performance
- Testing and documentation

## Contributor Boundary

Contributors should keep all changes for this issue in this folder. If the tool
needs a future connection to shared inbox data, routing, or production UI, open a
follow-up issue instead of adding integration here.
