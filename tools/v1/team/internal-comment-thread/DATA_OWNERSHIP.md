# Internal Comment Thread - Data Ownership & Flow

This document describes the data structures, storage boundaries, state lifecycle, and mutation rules inside the Internal Comment Thread tool.

## 1. Domain entities and data model

The core structures are declared in `types/index.ts`:

    export type CommentTarget =
      | { kind: "message"; id: string }
      | { kind: "thread"; id: string };

    export interface InternalComment {
      id: string;
      target: CommentTarget;
      author: string;        // Hush address of team member
      body: string;
      createdAt: string;
      updatedAt?: string;
    }

    export interface CommentResult {
      comment: InternalComment;
    }

    export interface ListCommentsResult {
      comments: InternalComment[];
    }

## 2. Data lifecycle

- A team member opens a message (or thread) inside a shared inbox context.
- The `useInternalComments` hook requests existing comments for the target.
- The comment service returns the list filtered to the current team (enforced at storage layer).
- A new comment is created with author = current team member's Hush address, body, and timestamp.
- The hook stores the updated list in React state; the comment list re-renders.
- Edit and delete operations are restricted to the original author.

Validation checkpoint: every comment body is stored exactly as provided by the author; no transformation that would allow leakage to external paths is permitted. The `target` reference must resolve to a message or thread that the team is authorized to see.

## 3. Data storage boundaries

- Local in-memory state only (default): no database, blockchain sync, or cookie caching.
- Seed fixtures: sample comments come from deterministic mock data in `fixtures/`.
- No persistence: durable storage, if ever required, must be added through a new adapter layer in a follow-up issue.
- Team roster is provided at tool startup and used to gate all comment operations.

## 4. Mutability and mutation constraints

Immutable:

- Fixture vectors: the mock targets and comments in `fixtures/` are read-only at runtime.
- Comment `id` and `author`: once created, these fields never change.
- Target reference: the `target` of an existing comment cannot be altered.

Mutable:

- Comment body: only the original author may update the body (via `updateComment`).
- Result collection: adding or deleting a comment produces a new list; the previous list object is not mutated.
- Component visual state: local draft text in the composer.

## 5. Security and privacy safeguards

- Team-only visibility (firm rule): comment bodies are never included in any payload, header, log, or delivery mechanism that could reach an external sender address. This invariant is enforced in services, hooks, and any future storage adapters.
- Fake demo data only: all sample authors, targets, and comment bodies are fake, deterministic, and safe for public repository review.
- No real recipients or secrets: no real Hush addresses (outside the declared team roster), private keys, or live network calls are ever included in fixtures or default state.
- Safe authoring: the service rejects any attempt to create a comment for a target the current author is not authorized to see.
