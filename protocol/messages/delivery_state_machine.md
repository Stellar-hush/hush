# Off-Chain Message Delivery State Machine Specification

## 1. Overview

The Hush protocol specifies a single normative off-chain message delivery state machine to unify message status representation across relay nodes, client UI, outbox storage, and receipt APIs.

Every message managed by the off-chain network moves through explicit, deterministic state transitions. Status representation is strictly governed by this state machine; client applications or services must not invent ad-hoc statuses.

---

## 2. Delivery States

The state machine defines 7 discrete message delivery states:

| State       | Description                                                   | Category   | Terminal | Retryable |
| :---------- | :------------------------------------------------------------ | :--------- | :------: | :-------: |
| `queued`    | Enqueued locally or in relay buffer awaiting submission.      | In-Flight  |    No    |    Yes    |
| `accepted`  | Accepted by relay node or federation peer.                    | In-Flight  |    No    |    Yes    |
| `anchored`  | Proof/settlement anchored on-chain (Stellar ledger/contract). | In-Flight  |    No    |    Yes    |
| `delivered` | Delivered to recipient mailbox queue or device.               | Finalizing |    No    |    No     |
| `read`      | Recipient marked message as read/acknowledged.                | Terminal   | **Yes**  |  **No**   |
| `failed`    | Permanent submission or processing failure.                   | Terminal   | **Yes**  |  **No**   |
| `expired`   | Delivery window or message TTL expired before completion.     | Terminal   | **Yes**  |  **No**   |

---

## 3. State Transition Matrix & Rules

### 3.1 Allowed Transitions

| Source State (`fromState`) | Permitted Target States (`toState`)          |
| :------------------------- | :------------------------------------------- |
| `null` (Initial)           | `queued`, `accepted`                         |
| `queued`                   | `accepted`, `failed`, `expired`              |
| `accepted`                 | `anchored`, `delivered`, `failed`, `expired` |
| `anchored`                 | `delivered`, `failed`, `expired`             |
| `delivered`                | `read`, `failed`, `expired`                  |
| `read`                     | _None_ (Terminal State)                      |
| `failed`                   | _None_ (Terminal State)                      |
| `expired`                  | _None_ (Terminal State)                      |

### 3.2 Transition Enforcement Principles

1. **Terminal Rules**: Once a message enters `read`, `failed`, or `expired`, no further state transitions are allowed under any circumstance.
2. **Deterministic Rejection**: Any attempt to perform an illegal transition, backward transition (e.g. `anchored` -> `accepted`), or duplicate transition (e.g. `queued` -> `queued`) MUST be rejected deterministically with an error.
3. **Audit Trail**: Every state transition persists:
   - `fromState`: Previous state (or `null` if initial).
   - `toState`: Target state.
   - `timestamp`: ISO 8601 UTC observed time.
   - `actor`: Principal identifier or Stellar G-address initiating the transition.
   - `reason`: Descriptive explanation for the transition.
   - `chainReference`: Optional chain transaction hash, ledger index, or contract reference (e.g., when entering `anchored`).

---

## 4. Public State Exposure & Retryability

The state machine exposes a stable public representation that decouples external state reporting from internal storage mechanics.

```json
{
  "messageId": "5b40cf39e4a86e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae29202",
  "state": "anchored",
  "isTerminal": false,
  "isRetryable": true,
  "observedAt": "2026-08-17T20:00:00.000Z",
  "actor": "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "reason": "Anchored settlement on Stellar ledger #543210",
  "chainReference": "0x86355651ecbc6e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae29202",
  "history": [
    {
      "fromState": null,
      "toState": "queued",
      "timestamp": "2026-08-17T19:58:00.000Z",
      "actor": "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      "reason": "Message enqueued by sender"
    },
    {
      "fromState": "queued",
      "toState": "accepted",
      "timestamp": "2026-08-17T19:59:00.000Z",
      "actor": "relay:node-1.stealth.network",
      "reason": "Envelope validated and accepted by relay"
    },
    {
      "fromState": "accepted",
      "toState": "anchored",
      "timestamp": "2026-08-17T20:00:00.000Z",
      "actor": "relay:node-1.stealth.network",
      "reason": "Anchored settlement on Stellar ledger #543210",
      "chainReference": "0x86355651ecbc6e969d27038e8e78e86cf0f4e1f7a0756e0766a5cfbfcae29202"
    }
  ]
}
```
