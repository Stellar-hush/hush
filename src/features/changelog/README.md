# Changelog Panel Feature Handoff

This directory owns the user-facing Changelog Panel (`src/features/changelog/`) displayed within the Hush Mail Settings modal (`What's new` tab). It provides plain-language release summaries grouped by version and category (UI, API, protocol, security), along with persistent read/unread state tracking.

## Files & Components

- **[ChangelogPanel.tsx](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/features/changelog/ChangelogPanel.tsx)**: Main React component. Renders grouped release sections, unread status indicators, entry cards, category badges, and empty state fallbacks. Uses `Intl.DateTimeFormat` date formatting cached module-wide to optimize rendering.
- **[useChangelog.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/features/changelog/useChangelog.ts)**: Custom React hook. Manages read/unread state tracking against `localStorage`, provides `markAllSeen()` and `isEntryUnread()` helpers, and returns entry data.
- **[data.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/features/changelog/data.ts)**: Static release dataset (`CHANGELOG_ENTRIES`) ordered newest-first, and exports `LATEST_VERSION`.
- **[helpers.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/features/changelog/helpers.ts)**: Pure domain helper functions (`groupEntriesByRelease`, `isEntryUnread`, `hasUnreadEntries`, `getSeenVersion`, `setSeenVersion`, `CATEGORY_CONFIG`, `getCategoryLabel`).
- **[types.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/features/changelog/types.ts)**: TypeScript type definitions for `ChangelogEntry` and `ChangelogCategory`.
- **[index.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/features/changelog/index.ts)**: Feature barrel file exporting public component, hook, and type interfaces.

Related integration & test files:

- **[SettingsModal.tsx](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/src/components/mail/SettingsModal.tsx)**: Hosts the Changelog Panel tab in the Settings UI.
- **[changelog-helpers.test.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/tests/unit/changelog/changelog-helpers.test.ts)**: Unit test suite for domain logic, data integrity, grouping, category lookup, and `localStorage` error handling.
- **[changelog.spec.ts](file:///c:/Users/LENOVO/Documents/drips-waves/stealth/tests/e2e/changelog.spec.ts)**: E2E Playwright test validating panel opening and release note display in the app UI.

---

## Data Contracts

### `ChangelogEntry`

```typescript
export interface ChangelogEntry {
  id: string; // Unique entry identifier (e.g. "v0.4.0-security-1")
  version: string; // Semver string (e.g. "0.4.0")
  date: string; // ISO 8601 YYYY-MM-DD date string (e.g. "2026-06-17")
  category: ChangelogCategory; // "ui" | "api" | "protocol" | "security"
  title: string; // Concise summary title
  description: string; // Plain-language description of changes
  link?: {
    label: string; // Human-readable link label (e.g. "View audit log")
    href: string; // Anchor (#settings/audit) or external URL
  };
}
```

### Categories & Badge Configuration

- `ui`: Sky theme (`"UI"`)
- `api`: Violet theme (`"API"`)
- `protocol`: Amber theme (`"Protocol"`)
- `security`: Rose theme (`"Security"`)

---

## User-Facing States

1. **First Visit / Unread**: When `seenVersion` is `null` or older than `LATEST_VERSION`:
   - Green dot indicator appears on release group headers containing unread updates.
   - Unread cards render with a highlighted border (`border-white/15`) and background (`bg-white/[0.06]`).
   - Screen reader label `(Unread)` is announced.
2. **All Read**: When all entries have been acknowledged (`seenVersion === LATEST_VERSION`):
   - Emerald `"All read"` status badge displays in the header.
   - Opening the panel triggers `markAllSeen()`, persisting `LATEST_VERSION` into `localStorage`.
3. **Empty State**: When `CHANGELOG_ENTRIES` is empty:
   - Renders a helpful `"No releases yet"` fallback box.
4. **External / Deep Links**:
   - Renders `ExternalLink` icon button, opening links securely with `target="_blank"` and `rel="noopener noreferrer"`.
   - Includes `(opens in a new tab)` screen reader text for accessibility.

---

## Safety & Privacy Boundaries

- **Demo Data Integrity**: Release entries in `data.ts` are static, fake demonstration notes representing release progress. Do NOT commit real user data, private keys, live wallet secrets, or customer email content.
- **LocalStorage Resilience**: `getSeenVersion` and `setSeenVersion` catch and silently swallow `localStorage` access errors (e.g., when running inside restricted sandboxes or private browsing mode where quota storage throws `DOMException`).
- **Privacy Assumptions**: The feature operates 100% client-side. No telemetry, user reading habits, or tracking identifiers are transmitted to external servers when reading release notes.
- **Security Positioning**: Security-related release notes (category: `security`) highlight platform safety enhancements (audit logs, identity checks, 2FA) in plain language, supporting Hush Mail's core positioning of privacy, speed, and sender control.

---

## Contributor QA Checklist

- [ ] **Tab Access**: Open Settings modal -> click "What's new". Verify panel renders cleanly.
- [ ] **Grouping**: Confirm entries are grouped by release version and date, sorted newest-first.
- [ ] **Category Badges**: Verify `UI`, `API`, `Protocol`, and `Security` badges render with distinct color accents.
- [ ] **Unread Persistence**: Verify opening the panel marks releases as read and persists `stealth:changelog:seen-version` in `localStorage`.
- [ ] **Keyboard & A11y**: Tab through entries. Confirm focus rings appear (`focus-within:ring-1`), headings use proper hierarchy (`h3`, `h4`, `h5`), and external links have `sr-only` descriptions.
- [ ] **Unit Tests**: Run `npm run test -- tests/unit/changelog/changelog-helpers.test.ts`.
- [ ] **Type Check**: Run `npx tsc --noEmit`.
