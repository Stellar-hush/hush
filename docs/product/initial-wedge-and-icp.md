# Initial Wedge and Ideal Customer Profile

## Why this matters

Building for every email user produces an unfocused product and a diluted
security story. Hush is strongest where a single spoofed or unpriced message
can cause real, immediate loss, and where senders already carry a cryptographic
identity. This document selects one painful, frequent workflow as the launch
wedge, names the ideal customer profile (ICP), and records the assumptions we
must test before widening scope.

---

## 1. The chosen wedge

**Wedge:** Inbound-sender verification and access control for **crypto-native
teams**.

These teams coordinate money movements, contract addresses, signer approvals,
and partner deals over channels where impersonation is trivial and expensive.
Hush's core promise - access is earned, not assumed, backed by verifiable
Stellar identity, priced access for unknown senders, and tamper-evident
delivery proof - maps directly onto their most feared failure mode: a single
convincing spoof that drains a treasury or misleads the community.

We start here because this segment already holds wallets and understands
cryptographic identity, so the biggest adoption cost (key management) is low.

---

## 2. Ideal Customer Profile (one page)

### Firmographic qualifiers

- **Organization type:** crypto-native protocol teams, DAOs, funds, exchanges,
  and wallet or infrastructure companies.
- **Team size:** 5 to 150 people.
- **Geography:** global, remote-first.
- **Identity posture:** members already custody wallets; Stellar or multi-chain
  presence is a plus.
- **Economic exposure:** messages routinely carry payment instructions,
  addresses, or signer coordination.
- **Budget owner:** founder, head of security, operations lead, or chief of
  staff.
- **Trigger context:** recent phishing incident, treasury scare, or
  high-profile impersonation of the brand.

### Behavioral qualifiers

- **High-stakes messaging:** a single spoofed message can move funds or damage
  reputation.
- **Fragmented channels:** coordinates over email plus Telegram or Discord,
  where impersonation is rife.
- **Security-conscious:** uses hardware wallets, multisig, and 2FA as a matter
  of habit.
- **Tool-adoptive:** comfortable installing new tools, holding keys, and paying
  in crypto.
- **Gatekeeping pain:** leaders and treasuries receive heavy, risky,
  unsolicited inbound.

---

## 3. Buyer vs. user distinction

- **Buyer / champion:** founder, head of security or operations, or chief of
  staff. Owns the "never again" mandate after an incident and controls tooling
  budget.
- **Primary users:** internal team members who send and receive high-stakes
  messages, plus the external counterparties (investors, auditors, partners)
  they invite to verify identity.
- **Note:** initial value lands even if only the internal team adopts, because
  inbound gating and identity verification protect them regardless of whether
  the whole ecosystem has migrated.

---

## 4. Top three jobs to be done

Ranked by combined urgency and frequency.

1. **Verify unknown senders (urgency: high, frequency: high / daily inbound).**
   "When an unknown sender contacts us, prove who they really are before I trust
   a payment instruction or a link."
2. **Stop brand impersonation (urgency: high, frequency: medium / ongoing).**
   "When we publish a handle or address, stop attackers from impersonating us to
   our community."
3. **Prove delivery (urgency: medium, frequency: medium).** "When money or
   sensitive files move over a message, give me tamper-evident proof of
   delivery."

---

## 5. Adoption trigger

The dominant trigger is a **phishing or impersonation incident, or a near
miss**, that touches the treasury or leadership - the "never again" moment.

A secondary trigger is **onboarding a new high-value counterparty** (an
investor, auditor, or partner) who must be verified before sensitive
coordination begins.

---

## 6. Five falsifiable assumptions with tests

- **A1 - Risk ranking.** Assumption: crypto-native teams rank
  impersonation/phishing as a top-three operational risk. Test: structured
  interviews with 10 qualified teams. Keep signal: at least 7 of 10 place it in
  their top three.
- **A2 - Key management.** Assumption: members will manage encryption keys
  without dropping off. Test: guided onboarding with 5 teams, observing unaided
  key setup. Keep signal: at least 60% complete key setup without live support.
- **A3 - Willingness to pay.** Assumption: teams will pay to gate unknown
  senders (subscription or postage). Test: pricing interviews and letters of
  intent for a paid pilot. Keep signal: at least 3 teams verbally commit to a
  paid pilot.
- **A4 - Identity trust.** Assumption: verifiable Stellar identity is trusted
  more than email or domain for high-value asks. Test: blind message-ranking
  test comparing an identity badge against domain-only. Keep signal: the
  identity badge measurably raises the trust rating.
- **A5 - Counterparty acceptance.** Assumption: external counterparties will
  accept an invite to receive or verify a Hush message. Test: outbound invite
  test to real counterparties. Keep signal: at least 40% of invited
  counterparties complete verification.

---

## 7. Explicit non-goals

- Not a general consumer email replacement at launch.
- Not targeting non-crypto enterprises or regulated legacy inboxes first.
- No full SMTP interoperability parity inside the wedge (bridging comes later).
- No native mobile app requirement for the initial pilot.
- Not optimizing for high-volume newsletter or marketing senders.

---

## 8. Deferred segments

- **Executive inboxes / assistant gatekeeping.** Why deferred: broad, less
  crypto-native, with slower identity adoption. Revisit when: identity and
  postage flows are proven with the wedge.
- **Security-sensitive orgs (legal, press, health).** Why deferred: compliance
  and retention requirements add scope. Revisit when: we can meet baseline
  compliance needs.
- **Paid expert / creator inbox monetization.** Why deferred: depends on mature
  postage and settlement rails. Revisit when: postage economics are validated in
  production.
- **Mainstream privacy-conscious consumers.** Why deferred: needs legacy
  interoperability and a mobile-first experience. Revisit when: the legacy bridge
  and mobile client exist.

---

## 9. Success signal

At least **five design partners** from the chosen ICP agree to test the same
core workflow (inbound-sender verification and access control) within 30 days.
