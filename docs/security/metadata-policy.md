# Metadata Privacy and Threat Model Policy

Encrypted communication protocols often secure content while exposing behavioral metadata. The timing, sizing, frequency, and social graphing of messages can still identify correspondents and expose interaction patterns.

This document defines the privacy policies, data protection rules, and retention boundaries for the Hush protocol across all execution layers.

---

## 1. Metadata Inventory

The table below catalogs all metadata processed by Hush, classified by visibility layer, and explicitly separates **Required** metadata (essential for system operation) from **Optional** metadata (used for telemetry, debugging, or enhanced user experience).

| Visibility Layer           | Metadata Field / Item                   | Class        | Purpose                                                                 | Privacy & Leakage Impact                                              |
| :------------------------- | :-------------------------------------- | :----------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Chain (Soroban Ledger)** | `sender` (`Address`)                    | **Required** | Authenticates receipt publishing and policy updates.                    | Exposes on-chain sender address; allows mapping of sending frequency. |
| **Chain (Soroban Ledger)** | `recipient` (`Address`)                 | **Required** | Restricts read-receipt authorization; checks destination policy.        | Exposes on-chain recipient address; maps recipient active periods.    |
| **Chain (Soroban Ledger)** | `message_id` (`BytesN<32>`)             | **Required** | Uniquely identifies a receipt or postage escrow to prevent duplication. | Links delivery receipts to postage transactions on-chain.             |
| **Chain (Soroban Ledger)** | `payload_hash` (`BytesN<32>`)           | **Required** | Commits to off-chain payload ciphertext, ensuring integrity.            | Confirms delivery without revealing ciphertext contents.              |
| **Chain (Soroban Ledger)** | `delivered_at` / `read_at` (`u64`)      | **Required** | Records time of delivery and read confirmation.                         | Exposes exact timing and response delays of correspondents.           |
| **Chain (Soroban Ledger)** | `escrowed_funds` (`i128`)               | **Required** | Deposits postage required by recipient policy.                          | Reveals postage payment values and funding source links.              |
| **Relay Layer**            | `Target Destination` (alias/domain)     | **Required** | Instructs the relay on where to route the encrypted payload.            | Reveals target mailbox domain.                                        |
| **Relay Layer**            | `Encrypted Payload` (ciphertext bundle) | **Required** | Encrypted message envelope routed to storage.                           | Size of ciphertext leaks approximate unencrypted message size.        |
| **Relay Layer**            | `IP Address (Ephemeral)`                | **Required** | Socket endpoint of the client connection.                               | Leaks client physical location and network provider.                  |
| **Relay Layer**            | `Connection Timestamps`                 | **Required** | ephemerally tracks timeout limits.                                      | Leaks active client times.                                            |
| **Relay Layer**            | `relayMetadata.status`                  | **Optional** | Debug status of relay node (e.g. pending/settled).                      | Internal status; low impact.                                          |
| **Relay Layer**            | `relayMetadata.nodeUri`                 | **Optional** | Identifies the physical node handling routing.                          | Infrastructure routing detail.                                        |
| **Storage Layer**          | `Encrypted Mailbox DB`                  | **Required** | Stores message envelopes, key attachments, index data.                  | Encrypted at rest; metadata leakage minimal unless compromised.       |
| **Storage Layer**          | `Folder / Label Metadata`               | **Optional** | Custom folder tags (e.g. Starred, Archive, custom tags).                | Encrypted locally/remotely; low leakage impact.                       |
| **Storage Layer**          | `Snooze Time`                           | **Optional** | Triggers local/server alarms to resurface threads.                      | Ephemeral duration; reveals when user plans to read mail.             |
| **Client Layer**           | `Public/Private Key Pairs`              | **Required** | Key pairs used to decrypt mail and sign ledger events.                  | Vital credential; must never leave client memory/secure storage.      |
| **Client Layer**           | `Sync Cursor`                           | **Required** | Tracks local database sync status.                                      | Identifies last checked message index.                                |
| **Client Layer**           | `Drafts`                                | **Optional** | Offline cache of unsent messages.                                       | Transient local data; low risk unless device is compromised.          |
| **Client Layer**           | `Onboarding Progress`                   | **Optional** | Offline cache of setup wizard state.                                    | Ephemeral; stored in browser localStorage.                            |
| **Analytics Layer**        | `Event Category`                        | **Optional** | Categorizes events (e.g., onboarding, policy, send_outcome).            | Reveals client operational events.                                    |
| **Analytics Layer**        | `Event Purpose`                         | **Optional** | Tracks telemetry rationale (e.g. reliability monitoring).               | Explanatory label.                                                    |
| **Analytics Layer**        | `Privacy Budget Cost`                   | **Optional** | Epsilon differential privacy budget consumed.                           | Privacy metrics detail.                                               |
| **Analytics Layer**        | `Event Payload`                         | **Optional** | Minimal metrics data (e.g., error codes, UI response times).            | Strictly audited to ensure zero identifiers are logged.               |

---

## 2. Data Protection Rules

To govern the lifecycle of metadata, Hush enforces strict rules across all components:

### A. Minimization Rules

- **Contract/Ledger**: Only cryptographic keys, hashes, and numeric quantities are processed on-chain. Human-readable texts, subjects, names, and content structures are completely omitted.
- **Relay**: Relays must act as pass-through structures. Relays do not index, search, or build profiles of sent messages. All transit headers are stripped immediately after payload handoff.
- **Analytics**: Telemetry is opt-in and restricted to strict functional categories. Every telemetry event is programmatically checked against a blocklist of forbidden keys (`"body"`, `"subject"`, `"key"`, `"correspondent"`, `"email"`, `"plaintext"`).

### B. Pseudonymization & Identity Obfuscation

- **Cryptographic Keys**: Users are identified globally by Stellar public keys (`Address` types) instead of email addresses.
- **Hush Addresses**: The client resolves human-readable federation handles (e.g., `user*domain.com`) entirely off-chain. This lookup is decoupled from message sending to ensure that the relationship between the human-readable handle and the on-chain destination public key is never published to the ledger.
- **Ephemeral Keys**: Senders are encouraged to use one-time Hush addresses to break correlation links between consecutive messages to the same recipient.

### C. Padding Rules

- **Traffic Analysis Defense**: Senders MUST pad all encrypted payloads (including body text, metadata objects, and attachments) to uniform block boundaries (e.g., multiples of 4096 bytes or to the nearest power of 2) prior to encryption.
- **Relay Enforcement**: Relays should reject payloads that do not conform to standardized padding size boundaries, preventing the leakage of exact message sizes to passive network observers.

### D. Retention Rules

- **Relay Payload Buffers**: Messages are cached in relay transit buffers for a maximum of **48 hours** to allow retries. Payloads are physically purged immediately upon successful delivery or expiration.
- **Telemetry Storage**: Analytics events are kept for a maximum of **30 days** before automatic eviction.
- **Local Client State**: Local drafts, unfinished onboarding progress, and ephemeral caches stored in browser `localStorage` are cleared immediately upon successful state transitions (e.g., message transmission, onboarding completion).

### E. Logging Rules

- **Scrubbing**: Operational system logs at the relay and gateway levels must automatically scrub IP addresses, user identifiers, and query targets.
- **Zero-Correlation Logs**: Logging systems are prohibited from joining connection logs (IP addresses) with protocol events (message hashes or postage transactions).

---

## 3. On-Chain Address Rule

> [!IMPORTANT] > **Plaintext addresses are never written on-chain.**
>
> Senders, recipients, and delegates are identified on the Stellar blockchain exclusively by cryptographically generated public keys or smart contract hashes (represented by the Soroban `Address` type). Human-readable names, email addresses, and federation handles (e.g. `alice*stealth.demo`) are strictly resolved off-chain prior to submitting any transaction.

### Resolution & Verification Flow

```
[User Types: alice*stealth.demo]
               │
               ▼ (Client-side Resolution)
[Fetch HTTPS Federation Endpoint: https://stealth.demo/.well-known/stellar.toml]
               │
               ▼ (Decoupled Key Retrieval)
[Stellar G-Address Resolved: GCLB7...RECP]
               │
               ▼ (On-Chain Submission)
[Call soroban contract: delivered(msg_id, hash, ver, sender_address, GCLB7...RECP)]
```

This architecture ensures that the correlation between human-readable identities and transaction profiles remains private to the correspondents and their trusted directory services.

---

## 4. Retention Enforcement Matrix

This matrix identifies the retention limits for data classes, their code-level enforcement paths, and the operational roles responsible for their lifecycle.

| Data Category               | Retention Limit               | Enforcement Owner (Code / Hook)                                   | Enforcement Mechanism                                                                                                                            |
| :-------------------------- | :---------------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client Telemetry Events** | 30 Days                       | `PrivacyAnalytics.enforceRetention` (`src/services/analytics.ts`) | Periodic filtering function matches the event's `timestamp` against the allowed `retentionDays` window and evicts expired records.               |
| **Relay Transit Payloads**  | 48 Hours                      | Relay Queue Worker Service (`relay-queue-worker`)                 | Scheduled daemon task scans the transit database and deletes payloads that exceed the maximum retry count or have been queued for over 48 hours. |
| **Relay Connection Logs**   | 1 Hour                        | System Administrator / syslog Daemon                              | Automated log rotation (`logrotate`) sweeps relay nodes hourly, scrubbing connection logs and wiping source IPs.                                 |
| **Client Onboarding State** | Resumable until wizard finish | Onboarding Hook (`useOnboarding.ts`)                              | Executes `localStorage.removeItem(STORAGE_KEY)` immediately upon successful configuration completion.                                            |
| **Client Draft Caches**     | Ephemeral: until sent         | Compose persistence (`localStorageAdapter.ts`)                    | Dispatches `clearDraft` to flush local cached structures immediately after successful message broadcast.                                         |
| **Off-chain Mail Storage**  | User-configured policy        | Mailbox Maintenance Job (`mailbox-janitor`)                       | Server background job evaluates messages against the user's customized mailbox retention policy (e.g. auto-delete after 90 days).                |

---

## 5. Product Claims & Residual Leakage

Hush ensures that all marketing and user-facing security claims are aligned with the technical reality of residual metadata leaks:

| User-Facing Claim                      | Technical Reality & Residual Leakage                                                                                                                                                                                                      | Mitigation Strategy                                                                                                                                                             |
| :------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **"Messages stay private."**           | **Residual Leakage**: Timing correlation and traffic profiling. A network observer monitoring connection times can infer who is talking to whom if message submission matches read-receipt publication. Payload size can leak file types. | **Mitigation**: Payloads are padded to standard 4KB blocks. Clients inject random delays (0-5 minutes) for non-urgent events like read receipts to prevent timing correlations. |
| **"Identity is pseudonymous."**        | **Residual Leakage**: Public key clustering. If a sender uses the same Stellar G-Address to mail multiple recipients, an observer can map the sender's social graph on the ledger.                                                        | **Mitigation**: Automated Hush Address generation creates unique, one-time target public keys for each inbound thread, preventing graph linking.                                |
| **"No plaintext addresses on-chain."** | **Residual Leakage**: Federation lookups. Querying the federation endpoint `alice*domain` over HTTP leaks searching behavior to DNS servers and directory hosts.                                                                          | **Mitigation**: The client caches federation records locally and batches lookup requests to prevent real-time search leakage during message drafting.                           |
| **"Spam is priced via postage."**      | **Residual Leakage**: Payment links. If a single funding account distributes Stellar assets to multiple postage escrows, those escrows become linked to the funder.                                                                       | **Mitigation**: Integration with privacy pools or relay-sponsored postage payments to break direct on-chain funding links.                                                      |

---

## 6. Threat Review

A threat modeling review was conducted to trace all identifiers used throughout the Hush protocol and confirm that no undocumented stable identifier links a user's communication graph.

### Identifier Audit

1. **Stellar Public Key / G-Address**:
   - _Status_: Stable, long-lived identifier.
   - _Threat_: If reused, it directly maps the user's communication graph on the public blockchain ledger.
   - _Documentation & Mitigation_: Fully documented. Mitigated by Hush Address (S-prefix) derivation, which generates one-time public keys for each recipient.
2. **Message ID**:
   - _Status_: Ephemeral random identifier (SHA-256 hash).
   - _Threat_: Could link delivery receipts to postage escrows.
   - _Documentation & Mitigation_: Fully documented. Only connects transactions belonging to the _same_ message event. Cannot link distinct threads or correspondents.
3. **Payload Hash**:
   - _Status_: Ephemeral cryptographic hash of ciphertext.
   - _Threat_: Re-sending identical payloads could leak identical hashes.
   - _Documentation & Mitigation_: Mitigated by client-side cryptographic salting (unique initialization vectors per encryption operation), ensuring identical message contents yield different ciphertext hashes.
4. **Analytics ID**:
   - _Status_: Ephemeral UUID.
   - _Threat_: Correlation of telemetry events over time.
   - _Documentation & Mitigation_: Ephemeral. Never mapped to public keys, email addresses, or transaction IDs. Purged automatically within 30 days.
5. **Relay Node URI**:
   - _Status_: Stable infrastructure identifier.
   - _Threat_: None to the end-user communication graph. Maps relay ownership.
   - _Documentation & Mitigation_: Publicly registered node names. No user-specific data is exposed.
6. **IP Address**:
   - _Status_: Ephemeral network identifier.
   - _Threat_: Exposes user location to relays and directory servers.
   - _Documentation & Mitigation_: Ephemeral. Handled out-of-band by relays and scrubbed from operational logs within 1 hour. Users can mask their IP using standard network layers (Tor/VPNs).

### Threat Review Conclusion

**The threat review confirms that no undocumented stable identifier exists in the Hush protocol that can link a user's communication graph.** All stable identifiers are either public infrastructure markers, opt-in local caches, or are mitigated through cryptographic blinding and stealth address derivation techniques.
