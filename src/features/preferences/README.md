# Preferences Handoff

This module owns local UI and layout preference persistence for the existing
Hush Mail app shell. Keep changes scoped to the files in this directory
unless a future issue explicitly widens the integration surface.

## Files To Review

- `types.ts` defines `UiPreferences`, receipt policy values, sender policy
  values, and `defaultPreferences`.
- `layout-types.ts` defines `LayoutPreferences` and
  `defaultLayoutPreferences`.
- `usePreferences.ts` hydrates UI preferences from local storage, migrates the
  legacy `stealth-preferences` key, applies document-level theme/density/glass
  attributes, and persists updates.
- `useLayoutPreferences.ts` hydrates layout preferences from local storage,
  clamps panel widths, prevents no-op object churn, and persists updates.
- `index.ts` is the public export surface for hooks, defaults, and types.

Related app surfaces:

- `src/components/mail/SettingsModal.tsx` edits user-visible preferences.
- `src/routes/index.tsx` wires preferences into the app shell and settings
  restoration flow.
- `tests/e2e/fixtures.ts` seeds demo UI and layout preferences for browser
  tests.

## Data Contracts

`UiPreferences` controls user-visible behavior such as theme, density, glass
intensity, reader typography, reduced motion, avatar visibility, notification
toggles, unknown-sender handling, minimum postage, onboarding completion, and
receipt preferences.

`LayoutPreferences` controls shell geometry and collapsed states:
`sidebarWidth`, `sidebarCollapsed`, `listWidth`, `readerWidth`, `compactMode`,
and `rightPanelCollapsed`.

Stored keys:

- `stealth-ui-preferences`
- `stealth-layout-preferences`
- legacy migration source: `stealth-preferences`

## User-Facing States

- Before hydration, hooks return defaults and `hydrated: false`.
- After successful hydration, stored values are merged with defaults.
- Corrupt stored JSON is removed and defaults continue to render.
- `theme: "system"` follows `prefers-color-scheme`.
- Layout widths are clamped before storage so restored panels stay usable.
- Reduced motion is represented by `document.documentElement.dataset.motion`
  and should remain aligned with the app's broader motion safety guidance.

## Safety And Privacy Notes

- Preferences are local browser state, not server policy or verified identity.
- Do not store real customer mail, private keys, wallet secrets, auth tokens, or
  payment credentials in preference records.
- Demo fixtures must keep using synthetic addresses and synthetic preference
  values.
- Unknown-sender, minimum-postage, and receipt preferences affect trust-related
  UI copy. Treat changes to those fields as security-sensitive because they can
  alter sender-control expectations.
- Local storage hydration must tolerate missing, partial, legacy, or corrupt
  values without blocking the mailbox.
- Do not add cross-device sync, remote persistence, or external analytics from
  this module without a separate product and privacy review.

## Contributor Checklist

- Keep defaults in `types.ts` and `layout-types.ts` backward compatible with
  stored partial records.
- Add migration notes when renaming fields or storage keys.
- Preserve the corrupt-JSON fallback behavior in both hooks.
- Confirm document dataset attributes still update after preference changes.
- Confirm panel widths remain within the clamp bounds after hydration and
  manual resize.
- Confirm `SettingsModal` copy remains aligned with safety, speed, and
  sender-control positioning.
- Update `tests/e2e/fixtures.ts` if required defaults change.

## QA Checklist

- Open the app with no stored preferences and verify defaults render.
- Seed `stealth-ui-preferences` and `stealth-layout-preferences`, reload, and
  verify the selected theme, density, motion, and panel layout are restored.
- Seed invalid JSON for each storage key and verify the app recovers.
- Toggle theme, density, lower motion, avatar visibility, unknown-sender
  policy, minimum postage, and receipt settings in `SettingsModal`.
- Resize or reset the shell layout and verify stored widths remain clamped.
- Run the relevant local checks when dependencies are available:
  - `bun x tsc --noEmit`
  - `bun run lint`
  - `bun run test`
  - targeted browser coverage that uses `tests/e2e/fixtures.ts`
