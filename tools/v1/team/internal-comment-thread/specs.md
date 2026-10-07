# Internal Comment Thread — Specification

Team-only internal annotations for shared inbox messages. Comments are never visible to or delivered to the external sender.

## Scope

- Accept a reference to a message (or thread) in a shared inbox.
- Allow an authorized team member to attach a text comment that is stored with author identity, timestamp, and visibility flag.
- Surface all comments on that reference exclusively to other members of the same team.
- Enforce at every layer that comment content cannot leak into any reply, forward, notification, or external delivery path.
- Support basic CRUD for comments owned by the current team member (create, read own, update own, delete own).
- Persist state via a swappable storage adapter (in-memory reference implementation).

## Non-goals

- Exposing comments to external senders under any code path.
- Attaching comments to external messages or non-shared inboxes.
- Rich formatting, attachments, or embeds inside comments.
- @mentions or push notifications inside the team (future).
- Role-based permissions beyond flat team membership.
- Search or full-text indexing over comment history.
- Editing or deleting other members' comments.

## Architecture Overview

The tool follows a layered pattern: UI components call hooks that delegate to services, which use a storage adapter (interface-based, swappable). The storage layer defaults to in-memory. The tool depends on the Hush protocol for team identity and message reference but does not depend on the main application's routing, mail rendering engine, wallet core, or design system.

**Firm rule (non-negotiable):** No code path may ever include comment body text in any payload, header, log, or delivery that could reach an external sender address.

## Ownership Boundary

All source code, tests, documentation, fixtures, and configuration live under:

```
tools/v1/team/internal-comment-thread/
```

Do not import from `src/`, `tools/v2/`, or sibling tool folders. Do not modify the main application's router, mail engine, or design system. Do not add dependencies to the root `package.json` — use a local `package.json` if needed.

## Required Issue Categories

- Architecture
- Feature
- UI and accessibility
- Security and performance
- Testing and documentation

## Core Contracts (to be implemented)

```ts
// Message or thread reference (exact shape undecided — see Open Questions)
type CommentTarget = { kind: "message"; id: string } | { kind: "thread"; id: string };

interface InternalComment {
  id: string;
  target: CommentTarget;
  author: string; // Hush address of team member
  body: string;
  createdAt: string;
  updatedAt?: string;
  // visibility is implicitly team-only; never serialized for external delivery
}

interface CommentService {
  addComment(target: CommentTarget, body: string, author: string): InternalComment;
  listComments(target: CommentTarget): InternalComment[];
  updateComment(id: string, newBody: string, author: string): InternalComment;
  deleteComment(id: string, author: string): void;
}
```

## Open Questions

- **Attachment scope**: Should a comment attach to a single message or to an entire thread? The architecture must not preclude either model.
- **Reply structure**: Should comments support nested replies (tree) or remain a flat list per target? The data model and UI contracts should remain flexible until this is decided.

## Out of Scope (until future integration issues)

- Wiring into the main mail app shell or shared inbox UI.
- Persisting comments to a durable team store (current default is in-memory only).
- Any delivery or rendering path that could make comment text visible outside the team boundary.
