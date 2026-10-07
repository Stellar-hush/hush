# Organization Mailboxes and Role-Based Access

## Purpose

This specification defines how Hush supports organization mailboxes: shared addresses a team can operate without sharing private keys or creating ambiguous attribution. It covers organization ownership, member roles, policy administration, message access, delegation, offboarding, recovery, and audit history.

The goal is that a small team can operate one mailbox with clear accountability for every action, while keeping each member's personal identity separate from the organization identity.

## Guiding principles

- Roles follow least privilege: members get the minimum access needed for their work.
- Personal and organization identities stay distinct; acting for an organization is always explicit and attributable.
- Removing a member revokes their future access immediately, without rotating the organization's keys.
- High-risk changes require multi-party approval rather than a single actor.
- Every privileged action is recorded in an append-only audit history.

## Organization model

### Ownership

- An organization is a distinct identity that owns one or more addresses, separate from any individual member.
- Organization signing material is held by the organization, not by individuals. Members are authorized to act for the organization; they never personally hold the organization's root private key.
- At least one `Owner` is required at all times. The system blocks removal or downgrade of the last `Owner`.

### Identity separation

- Each user has a personal identity and may additionally hold one or more organization memberships.
- When a member acts as the organization, the action is attributed as `<member> on behalf of <organization>`, preserving both identities.
- Personal mail and organization mail remain in distinct contexts; switching context is explicit in the UI and in metadata.

## Roles and permissions

Roles are designed around least privilege. The baseline roles are:

- `Owner` — full control, including billing, role administration, policy changes, recovery, and deletion. Can perform high-risk actions, subject to multi-party approval below.
- `Admin` — manages members and policies, but cannot delete the organization or remove an `Owner`.
- `Member` — reads and sends organization mail within granted mailboxes/labels; cannot manage members or policy.
- `Viewer` — read-only access to granted mailboxes; cannot send or change anything.

### Permission rules

- A member's effective permissions are the intersection of their role and any per-mailbox or per-label grants; least privilege wins.
- No role implicitly grants billing or recovery except `Owner`.
- Defaults start closed: capabilities a member does not need are not granted.

## Policy administration

- `Owner` and `Admin` manage organization policies: who can be invited, default roles, allowed delegation, retention, and approval thresholds.
- Policy changes are versioned, attributed, and logged in the audit history.
- High-risk policy changes require multi-party approval before they take effect.

## Message access and delegation

### Access

- Mailbox access is granted per role plus optional per-mailbox/label scoping.
- Reading, sending, and managing are separate capabilities, so a member can read without being able to send.

### Delegation

- A member may be delegated specific capabilities (for example, send-on-behalf for one mailbox) for a bounded scope with an optional expiry.
- Delegation never escalates privilege beyond the delegator's own permissions.
- Delegated actions stay attributed to the acting member and note the delegation source in the audit history.

## High-risk changes and multi-party approval

The following are high-risk and require approval from at least two authorized parties (for example, two `Owner`s, or an `Owner` plus an `Admin`):

- Removing or downgrading an `Owner`.
- Changing recovery configuration or recovery contacts.
- Bulk export or bulk deletion of organization mail.
- Changing approval thresholds or disabling audit logging.
- Transferring organization ownership.

Rules:

- The requester cannot be the sole approver; a distinct second party must approve.
- Pending high-risk changes are visible to all `Owner`s and recorded while pending, approved, or rejected.

## Offboarding

- Removing a member revokes all of their organization access immediately; in-flight sessions and tokens for the organization are invalidated.
- Removal does not require rotating the organization's root keys, because members never held them personally.
- Any delegations granted to the removed member are revoked automatically.
- The removal, and the access it revoked, are recorded in the audit history.

## Recovery

- The organization supports recovery of `Owner` access that does not depend on a single person.
- Recovery uses a configured set of recovery parties; recovering `Owner` access is itself a high-risk action requiring multi-party approval.
- Recovery events are fully logged, including who initiated and who approved them.

## Audit history

- Every privileged action is recorded in an append-only audit log: role changes, policy changes, access grants and revocations, delegations, sends-on-behalf, high-risk approvals, offboarding, and recovery.
- Each entry records the actor, the organization context, the target, the action, a timestamp, and any approvers.
- Audit history is readable by `Owner` and `Admin`, cannot be edited or deleted, and disabling it is a high-risk change.

## Acceptance criteria mapping

- **Roles follow least privilege** — see Roles and permissions (intersection rule, closed defaults, separate read/send/manage capabilities).
- **Member removal revokes future access** — see Offboarding (immediate revocation, session/token invalidation, delegation cleanup).
- **High-risk changes support multi-party approval** — see High-risk changes and multi-party approval (two-party requirement, no self-approval).
- **Personal and organization identities remain distinct** — see Identity separation (separate identities, on-behalf-of attribution, explicit context switching).

## Success signal

A five-person team operates one shared mailbox: each member acts under their own identity on behalf of the organization, no one shares credentials or private keys, removing a member instantly cuts their access, and sensitive actions require a second approver — all visible in the audit history.
