# Hush & Stellar Federation Protocol (BETA-026)

## 1. Overview

Hush recipient resolution provides a deterministic, single-service resolution mechanism for addressing recipients across multiple address formats:

- **Hush Email Handles**: `alice@stealth.me`, `alice@stealth.xyz`, `alice@stealth.mail`
- **Hush Federation Handles**: `alice*stealth.me`, `alice*stealth.xyz`
- **External Stellar Federation**: `alice*stellar.org`, `bob*lobstr.co` (SEP-0002)
- **Direct Stellar Addresses**: `GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA` (G-address)
- **Direct Hush Addresses**: `SBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA` (S-address)

---

## 2. Resolution Response Envelope

All resolution endpoints return a strongly-typed resolution record:

```json
{
  "identifier": "alice@stealth.me",
  "canonicalAddress": "alice@stealth.me",
  "account": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
  "resolved": true,
  "status": "active",
  "publicKey": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
  "encryptionKeyVersion": 1,
  "policyEndpoint": "/api/v1/policies/GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA",
  "policy": {
    "allowUnknown": true,
    "requireVerified": false,
    "minimumPostage": "0"
  },
  "profile": {
    "userId": "usr_12345",
    "username": "alice",
    "displayName": "Alice Smith",
    "avatarUrl": null,
    "bio": null
  },
  "freshness": {
    "resolvedAt": "2026-08-17T02:00:00.000Z",
    "cached": false,
    "ttlMs": 300000,
    "source": "stealth_local",
    "expiresAt": "2026-08-17T02:05:00.000Z"
  }
}
```

---

## 3. Security, Caching & Revocation Guarantees

1. **Deterministic Normalization**: All input identifiers undergo Unicode NFKC normalization, whitespace trimming, zero-width character stripping, and lowercase canonicalization.
2. **Account Status Enforcement**: Disabled, suspended, deactivated, or unverified accounts (`status !== "active"`) are never returned as active or verified recipients.
3. **Bounded Dual-Tier Caching**:
   - **Positive Cache**: 5-minute TTL (`300,000ms`) for active records.
   - **Negative Cache**: 30-second TTL (`30,000ms`) for not-found or invalid records to protect against lookup storms.
4. **Revocation-Aware Invalidation**: `invalidate(identifier)` and `invalidateAccount(address)` immediately purge cached entries upon account state changes, suspensions, or key rotations.
5. **Enumeration Safety**: Unresolved or non-existent identifiers return standardized error responses without leaking internal storage IDs, stack traces, or timing differences.
