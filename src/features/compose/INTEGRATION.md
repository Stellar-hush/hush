# Recipient Resolution Integration Guide

## Quick Start

### 1. Basic Usage (No Custom Resolution)

```typescript
import { Compose } from "@/components/mail/Compose";

export function MailUI() {
  return <Compose open={true} onClose={() => {}} blockedRecipients={["blocked@example.com"]} />;
}
```

- Shows "resolving" state while typing
- Marks invalid addresses automatically
- Prevents send if recipients unresolved or blocked

### 2. With Contact/Federation Resolution

```typescript
import { Compose } from "@/components/mail/Compose";
import type { RecipientResolutionContext } from "@/features/compose/recipientResolver";

const context: RecipientResolutionContext = {
  // Resolve from local contact database
  resolveContact: async (input: string) => {
    const contact = await contactDB.query(input);
    return contact
      ? {
          id: contact.id,
          name: contact.name,
          address: contact.address,
          publicKey: contact.encryptionKey,
          trusted: contact.isTrusted,
        }
      : null;
  },

  // Resolve federation addresses (alice*stellar.org)
  resolveFederation: async (address: string) => {
    const result = await stellarFederation.resolve(address);
    return result
      ? {
          publicKey: result.accountId,
          domain: result.domain,
        }
      : null;
  },

  // Check if recipient is blocked
  isBlockedRecipient: async (address: string) => {
    return await policy.isBlocked(address);
  },
};

export function MailUI() {
  return (
    <Compose
      open={true}
      onClose={() => {}}
      resolutionContext={context}
      blockedRecipients={blockedList}
    />
  );
}
```

## Resolution States

| State       | Icon | Color   | Meaning                                         |
| ----------- | ---- | ------- | ----------------------------------------------- |
| `verified`  | ✓    | Emerald | Address resolved and cryptographically verified |
| `unknown`   | ⚠️   | Amber   | Valid format but identity unverified            |
| `invalid`   | ✗    | Red     | Malformed address that doesn't match any format |
| `blocked`   | 🚫   | Red     | Address explicitly blocked by policy            |
| `resolving` | ⟳    | Blue    | Resolution in progress (animated)               |

## Validation Prevents Send If:

1. ❌ No recipients entered
2. ❌ Any recipient has state: `resolving` or `invalid`
3. ❌ Any recipient has state: `blocked`
4. ❌ Any recipient lacks postage (postage = "required")
5. ❌ No subject line
6. ❌ No message body

## Supported Address Formats

✅ **Valid inputs:**

- Hush addresses: `SBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA`
- Stellar G-addresses: `GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJGU7XYBNBNQ2LMCAKLKZ6DXA`
- Federation: `alice*stellar.org`, `bob*example.com`
- Contact aliases: `alice_smith`, `bob-jones`, `charlie.brown`

❌ **Invalid inputs:**

- Email addresses: `alice@example.com` (use federation format instead)
- Short aliases: `ab` (minimum 3 chars)
- Special characters: `alice@#$%`, `bob with spaces`

## Default Behavior

**Without custom `resolutionContext`:**

- Format validation runs synchronously
- Invalid addresses marked immediately
- Valid addresses marked as `unknown` (not resolved)
- Contacts must be blocked via `blockedRecipients` prop

**With custom `resolutionContext`:**

- Initial sync validation + "resolving" state
- Async resolution triggered with 300ms debounce
- Contact matches show as `verified`
- Federation addresses resolve with domain info
- Policy checks run asynchronously

## Error Handling

- **Contact DB failure**: Address falls back to `unknown` state
- **Federation failure**: Address falls back to `unknown` state
- **Network timeout**: Address remains in `resolving` state (user can try again)
- **Invalid policy data**: Conservatively treats as `unknown` rather than blocking send

## Performance

- **Debounce delay**: 300ms (user stops typing → resolution begins)
- **Batch resolution**: All recipients resolved in parallel (not sequential)
- **Cancellation**: Old in-flight requests cancelled when recipient list changes
- **Caching**: Context functions should cache contact DB results themselves

## Testing

```typescript
import { resolveRecipients } from "@/features/compose/recipientResolver";

const resolved = await resolveRecipients(
  ["alice*stellar.org", "bob_smith", "GBRPYHIL..."],
  ["blocked@example.com"],
  {
    resolveContact: async (input) => mockContact,
    resolveFederation: async (addr) => mockFederation,
  },
);

expect(resolved[0].state).toBe("verified");
expect(resolved[1].state).toBe("unknown");
expect(resolved[2].state).toBe("verified");
```

## Next Steps

1. **Connect contact database**: Pass actual `resolveContact` in context
2. **Integrate Stellar federation**: Implement federation resolver
3. **Add policy engine**: Populate `isBlockedRecipient` from preferences
4. **UI phase 2**: Allow "unknown" with confirmation checkbox
5. **Encryption**: Store and display encryption key fingerprints
