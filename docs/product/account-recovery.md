# Account Recovery Without Silent Identity Takeover

## Purpose

This specification defines how a Hush account can be recovered when a device
is lost or compromised, **without allowing an attacker to silently inherit the
user's identity or message history**. Recovery must be explainable: any
independent reviewer must be able to state exactly _who_ can recover _what_, and
_under which conditions_.

The core tension is that recovery grants power over an identity, and that same
power is exactly what an attacker wants. The design below separates **proving
you are the owner** from **taking over future control**, and it keeps
**past-message confidentiality** independent of both.

## Guiding principles

- **No silent takeover.** Any recovery that changes who controls an identity, or
  rotates keys, is a visible, attributable, delayed event. There is no path that
  grants an attacker control without the legitimate owner (or their quorum) and
  the user's contacts observing it.
- **Recovery factors are not equal.** A lost factor and a _compromised_ factor
  require different responses. Losing a device is inconvenient; a compromised
  device means the attacker may already hold keys and must be treated as an
  active threat.
- **Past access ≠ future control.** The ability to read historical messages is a
  distinct capability from the ability to send, receive, or rotate identity
  going forward. They are granted and revoked independently.
- **Contacts detect change.** Correspondents must be able to tell that an
  identity's recovery/rotation happened, so they are not tricked into trusting a
  replaced key.
- **Everything is auditable.** Every recovery attempt, approval, delay, rotation,
  and revocation is recorded in an append-only, queryable audit log.

## Recovery factor model

An account is protected by a set of **recovery factors**, each belonging to one
of these classes:

| Factor class    | Example                      | Trust assumption                                  |
| --------------- | ---------------------------- | ------------------------------------------------- |
| `device`        | Primary phone / hardware key | Possession of a live, unlocked device.            |
| `social`        | Trusted contacts (M-of-N)    | Honest majority of N designated contacts.         |
| `institutional` | Org admin / custody provider | A separate, slower authority with its own policy. |
| `shamir`        | Secret-share fragments       | k-of-m fragments reconstruct a recovery key.      |

No single factor alone performs an _identity rotation_. A rotation requires a
quorum across **at least two distinct factor classes** (e.g., social M-of-N
**plus** institutional approval), so the compromise of one class cannot alone
take over the identity.

## Threat model

### T1 — Lost device (honest user)

The user loses a device holding their keys. The device may be found by a
stranger but is not known to be compromised. Goal: restore access for the user
without exposing historical plaintext to the finder.

### T2 — Compromised device (active attacker)

An attacker holds the user's device and **live keys**. They may attempt to
rotate the identity, read past messages, or impersonate the user to contacts.
Goal: detect, contain, and make every attacker action visible and reversible
where possible.

### T3 — Rogue recovery factor

A designated social contact, or an institutional custodian, attempts to abuse
their recovery power to seize the account. Goal: require cross-class quorum so
no single factor class suffices, and make the attempt auditable.

### T4 — Silent key replacement

An attacker rotates the identity key and the user's contacts keep trusting the
old key fingerprint, enabling impersonation. Goal: contacts must observe and
verify the new key via an out-of-band anchored signal.

### T5 — Historical decryption without future control

An attacker (or a recovering user) should not gain _future_ sending control
merely by being able to decrypt _past_ messages. Goal: separate the decryption
capability from the signing/control capability.

## Recovery flows

### Lost device (T1)

1. User initiates recovery with a _surviving_ factor (e.g., a second device or a
   social contact). Because the lost device may still be honest, this is treated
   as **low suspicion**.
2. A recovery quorum (social M-of-N, or shamir k-of-m) authorizes issuing a
   **new device key** scoped to _receive/decrypt future_ mail. The old device
   key is **revoked for future use** but its historical decryption capability is
   preserved (see §"Past-message access").
3. A **recovery delay** (default 24h, configurable per policy) applies before the
   new key gains sending authority, giving the legitimate owner time to cancel if
   this was unauthorized.
4. Contacts are notified of the new device key fingerprint (T4 defense).

### Compromised device (T2)

1. Treated as **high suspicion**. The user (or their quorum) declares the device
   compromised.
2. The compromised key is **frozen** for both future control _and_ (optionally)
   historical decryption, pending investigation.
3. Recovery proceeds only through a **cross-class quorum** (social **and**
   institutional), with the recovery delay extended and notifications escalated
   to all contacts.
4. Any messages the attacker already decrypted cannot be un-read, but **future**
   control is fully transferred to the new key; the attacker's key is revoked and
   its future signing authority is void.

## Identity rotation and contact detection (T4)

- Rotating the identity (or adding/revoking a device key) produces a signed
  **`key_rotation` event** anchored to the user's identity ledger.
- The event binds: old key fingerprint, new key fingerprint, reason
  (`lost` / `compromised` / `routine`), quorum signatures, and a timestamp.
- Contacts verify the new key against this anchored event rather than trusting
  the key presented in a message. A key not present in a valid, quorum-signed
  rotation event is rejected for future trust.
- This makes silent replacement impossible: a replaced key has no valid rotation
  anchor, so correspondents' clients flag it.

## Past-message access separated from future control (T5)

Hush encrypts messages so that **decryption keys** (for reading history) and
**signing/control keys** (for sending, receiving-forward, rotating) are
cryptographically distinct:

- A _recovery_ that grants **historical decryption** issues a key scoped only to
  decrypt ciphertext already in the user's store. It cannot sign new messages or
  rotate the identity.
- A _recovery_ that grants **future control** issues a signing key and requires
  the cross-class quorum + delay.
- Revoking future control (e.g., on compromise) does **not** automatically
  revoke historical decryption unless the user explicitly chooses "revoke
  history," which is itself an audited, delayed event. This preserves the user's
  own access to their past while stopping an attacker's future control.

## Auditability

Every recovery-relevant action is appended to an immutable, queryable audit log:

```
{ event, actor, factorClass, quorum, oldKeyFP, newKeyFP, reason, timestamp, signature }
```

Events include: `recovery_initiated`, `recovery_approved`, `recovery_delayed`,
`key_issued`, `key_revoked`, `identity_rotated`, `history_revoked`. The log lets
an independent reviewer answer:

- Who approved this recovery, and via which factor classes?
- Was the recovery delay respected?
- Which key fingerprints changed, and was the change quorum-signed?
- Was history access granted or revoked, and by whom?

## Acceptance criteria mapping

| Criterion                                                     | Where satisfied                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Threat model covers lost **and** compromised recovery factors | §"Threat model" (T1 lost, T2 compromised, plus T3–T5)                                      |
| Contacts can detect identity changes                          | §"Identity rotation and contact detection" (anchored `key_rotation` events)                |
| Past-message access separated from future control             | §"Past-message access separated from future control" (distinct decryption vs signing keys) |
| Recovery events are auditable                                 | §"Auditability" (append-only, queryable log)                                               |

**Success signal:** an independent reviewer can read this document and state, for
any recovery path, exactly who can recover what (decryption vs control), which
factor-class quorum is required, what delay applies, and how contacts detect the
change — with no path that grants silent identity takeover.
