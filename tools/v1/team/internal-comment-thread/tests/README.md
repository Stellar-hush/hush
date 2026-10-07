# Test Plan

Folder-local test strategy for the Internal Comment Thread tool.

> Tests will be written as `.test.ts` files alongside the source implementation. This document defines the plan and coverage expectations.

---

## Test Strategy

| Layer           | Scope                                                            | Framework        |
| --------------- | ---------------------------------------------------------------- | ---------------- |
| **Unit**        | Services, storage adapters, and utility functions in isolation   | Vitest           |
| **Integration** | Multi-step comment workflows using the in-memory storage adapter | Vitest           |
| **Manual**      | UI behavior, visual regression, accessibility, end-to-end flows  | Review checklist |

---

## Unit Test Scenarios

### Comment creation

- Valid team member can add a comment on a valid target.
- Comment is stored with correct author, body, createdAt, and target reference.
- Adding a comment with empty body is rejected.
- Adding a comment for a target the author is not authorized to see is rejected.

### Listing comments

- `listComments` returns only comments for the requested target.
- Comments from different targets are never mixed.
- Deleted comments are excluded from the list (or clearly marked).

### Ownership and mutation

- Author can update their own comment body.
- Update by a different author is rejected.
- Author can delete their own comment.
- Delete by a different author is rejected.
- Non-existent comment id returns appropriate error.

### Target handling (supports both models until decided)

- Comments can be created and listed using a `message` target.
- Comments can be created and listed using a `thread` target.
- Same author can have comments on both a message and its containing thread without collision.

### Storage adapter

- Round-trip: create a comment, retrieve it by target.
- Get for unknown target returns empty list.
- Delete removes the entry; subsequent list no longer contains it.
- Fresh store returns empty list for any target.

### Team-only visibility enforcement (firm rule)

- No serialization path includes comment body in any structure intended for external delivery.
- Attempting to construct an external-facing payload containing a comment body fails the test.

---

## Integration Test Scenarios

### Add-and-list workflow

1. Alice (authorized team member) adds a comment on message M1.
2. Bob (authorized) lists comments for M1.
3. Verify: both see Alice's comment; comment contains correct author and body.
4. Verify: the comment body never appears in any simulated external reply payload.

### Multi-author thread

1. Alice adds comment C1 on thread T1.
2. Bob adds comment C2 on the same thread T1.
3. Carol lists comments for T1.
4. Verify: list contains both C1 and C2 in creation order; each has correct author.

### Update and delete

1. Alice adds a comment.
2. Alice updates the body.
3. Verify: list shows the updated body and updatedAt timestamp.
4. Alice deletes the comment.
5. Verify: list no longer contains the comment.

### Cross-target isolation

1. Alice comments on message M1.
2. Alice comments on thread T1 (that contains M1).
3. List for M1 returns only the message-level comment.
4. List for T1 returns only the thread-level comment.

### Unauthorized access

1. Eve (not in team roster) attempts to add a comment.
2. Verify: operation is rejected at service level.
3. Verify: no comment record is created.

---

## Manual Review Checklist

### Comment list

- [ ] Comments appear in chronological order (or reverse, per spec).
- [ ] Each comment displays author (Hush address or display name), body, and timestamp.
- [ ] Only the current user's comments show edit/delete controls.

### Composer

- [ ] Composer accepts multi-line input.
- [ ] Submit (Enter / button) creates the comment and clears the input.
- [ ] Empty body is rejected with clear feedback.
- [ ] Comment appears immediately in the list after submit.

### Ownership

- [ ] Editing own comment updates the list in place.
- [ ] Deleting own comment removes it from the list (or marks as deleted).
- [ ] Attempting to edit/delete another user's comment is not possible in UI.

### Target scope (flexible for open question)

- [ ] UI can render comments for a message target.
- [ ] UI can render comments for a thread target.
- [ ] Switching targets shows the correct isolated comment set.

### Team-only visibility (firm rule — must pass)

- [ ] No comment body text is rendered, logged, or exported in any simulated external-sender view.
- [ ] Review of any generated payload or log for external paths shows zero comment content.
- [ ] All fixtures and test data remain strictly internal.

### Accessibility

- [ ] Comment list is keyboard navigable.
- [ ] Composer has proper labels and ARIA attributes.
- [ ] Delete actions have confirmation and are not the only way to understand state.

---

## Validation Steps for OSS Contributors

Before opening a pull request:

1. **`bun test`** — all tests pass.
2. **`bun run tsc --noEmit`** — zero type errors.
3. **`bun run lint`** — zero warnings.
4. **All new files under `tools/v1/team/internal-comment-thread/`** — verify with `git diff --name-only`.
5. **Test plan updated** — new features add or update scenarios in this file.
6. **Firm rule validation** — manual inspection confirms no comment body can reach an external sender path in any new code.
