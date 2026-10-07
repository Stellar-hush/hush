# Shared Team Inbox — Specification

Collaborative triage and response tool for team mailboxes.

## Scope

- Ingest messages addressed to a shared Hush identity and display them in a collaborative feed.
- Claim/assign messages to individual team members with visible ownership state.
- Add internal annotation threads (team-visible, sender-invisible) on any message.
- Reply to external senders using the shared inbox identity.
- Track status: unassigned → claimed → in-progress → awaiting-reply → resolved.
- Persist state via a swappable storage adapter (in-memory reference implementation).

## Non-goals

- Multi-inbox management.
- SLA engine (escalation, timeout, reassignment).
- Analytics or reporting.
- External integrations (webhooks, Zapier, CRM).
- Attachment processing.
- Read receipts.
- Bulk operations.
- Role-based access control (flat team membership only).

## Architecture Overview

The tool follows a layered pattern: UI components call hooks that delegate to services, which use a storage adapter (interface-based, swappable). The storage layer defaults to in-memory. The tool depends on the Hush protocol for identity resolution and message delivery proofs but does not depend on the main application's routing, mail rendering engine, wallet core, or design system.

## Ownership Boundary

All source code, tests, documentation, fixtures, and configuration live under:

```
tools/v1/team/shared-team-inbox/
```

Do not import from `src/`, `tools/v2/`, or sibling tool folders. Do not modify the main application's router, mail engine, or design system. Do not add dependencies to the root `package.json` — use a local `package.json` if needed.

## Required Issue Categories

- Architecture
- Feature
- UI and accessibility
- Security and performance
- Testing and documentation
