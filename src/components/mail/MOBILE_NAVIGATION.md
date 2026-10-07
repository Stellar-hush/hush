# Mobile Navigation Contributor Handoff

This document covers the existing mobile and small-screen navigation path for the
mailbox: the fixed bottom tab bar, the sidebar collapse behavior, the topbar
action cluster, and the responsive switch that drives all three. It is scoped to
the current app surface and intentionally does **not** describe a separate mobile
app, a new navigation framework, or any tool folder. Keep changes aligned with
the Hush Mail positioning around safety, speed, and sender control.

Read this alongside [`README.md`](./README.md) (the mail list handoff), since the
bottom bar and sidebar select folders that the list then renders.

## Local File Map

- [`BottomNavigation.tsx`](./BottomNavigation.tsx) renders the fixed mobile tab
  bar (`md:hidden`). It exposes six actions — Compose, Search, Inbox, Calendar,
  Proofs, Settings — and uses a `framer-motion` `layoutId="bottom-nav-active"`
  pill to animate the active indicator. Only Inbox (`inbox`) and Proofs
  (`pending`) map to folders and can be visually "active"; the others are
  one-shot triggers.
- [`Sidebar.tsx`](./Sidebar.tsx) renders the desktop/expandable navigation rail
  (`hidden md:flex`). It animates between `264px` (expanded) and `76px`
  (collapsed) widths, groups folders into Mail / Protocol / Delivery / Storage
  sections, hosts the Compose and optional Sender Journey buttons, and manages
  local-only custom "Folders" creation.
- [`Topbar.tsx`](./Topbar.tsx) renders the 14-unit-tall header: command-palette
  search input, responsive quick-action chips (`xl:flex`), and an action cluster
  (Filter, Notifications, Import, Help, Proof Inspector, Settings, Account). Each
  dropdown is rendered through `createPortal` into `document.body` with a
  manually positioned anchor rect, so it survives the header's `overflow-hidden`.
- [`../../hooks/use-mobile.tsx`](../../hooks/use-mobile.tsx) exports a
  `useIsMobile()` hook with a `768px` breakpoint (mobile is `< 768`). **Note:**
  this hook is consumed only by the shadcn primitive
  [`../ui/sidebar.tsx`](../ui/sidebar.tsx), not by the mailbox. See "Breakpoints
  and the two `useIsMobile` hooks" below before changing it.
- [`../../lib/use-media-query.ts`](../../lib/use-media-query.ts) exports the
  `useIsMobile()` hook the inbox actually uses (`max-width: 768px`). The mailbox
  route imports `useIsMobile` from here.
- [`../../routes/index.tsx`](../../routes/index.tsx) is the responsive layout
  owner. It calls `useIsMobile()`, conditionally swaps the resizable desktop
  shell for a single full-width mobile panel, renders the `BottomNavigation`, and
  wires every nav callback to folder / dialog state.

## Data Contracts

- **Folder identity** — All three components speak the `MailFolder` union from
  [`data.ts`](./data.ts). The bottom bar and sidebar select folders through
  `onSelectFolder` / `onSelect`; the topbar quick actions also set folders
  (`proofs → pending`, `later → snoozed`, `files → all` + attachment filter).
  Do not introduce folder strings outside the `MailFolder` union.
- **Active state** — `BottomNavigation` receives `active: MailFolder` and only
  compares against `inbox` and `pending`. `Sidebar` receives the same `active`
  plus `counts: Partial<Record<MailFolder, number>>` for unread-style badges.
  Counts are display hints, not live mailbox state.
- **Filters** — Topbar reads/writes `MailFilters` (`unreadOnly`,
  `hasAttachments`, `dateRange`) and resets through `defaultMailFilters`. Keep
  this shape; the list filtering described in `README.md` depends on it.
- **Layout state** — The sidebar's `collapsed` boolean and width come from the
  route's persisted `layout` store (`sidebarCollapsed`, `sidebarWidth`), toggled
  via `onToggle`. The route guards layout persistence with `if (isMobile) return`
  so resize callbacks never overwrite desktop widths while on mobile.
- **Callbacks only** — Every navigation surface routes user intent upward through
  props (`onCompose`, `onOpenPalette`, `onOpenCalendar`, `onOpenSettings`,
  `onQuickAction`, `onViewNotifications`, `onSignOut`, etc.). None of them fetch,
  mutate, send, or persist mail on their own.

## Responsive Behavior

The single source of truth for "is this a small screen" is `isMobile` in
[`index.tsx`](../../routes/index.tsx). It drives three coordinated changes:

1. **Sidebar** — On desktop the sidebar is wrapped in a collapsible
   `ResizablePanel`; on mobile it is rendered directly (no resize handle, no
   Sender Journey button) and is hidden by its own `hidden md:flex` class.
2. **Content panel** — `defaultSize` becomes `100` and the inner list/reader
   split stops persisting widths on mobile.
3. **Bottom bar** — `BottomNavigation` is always mounted but only visible under
   `md` (`md:hidden`). The content column reserves space for it with
   `pb-[72px] md:pb-0`, and the bar respects the safe area via the
   `safe-area-inset-bottom` utility (iOS home indicator).

### Breakpoints and the two `useIsMobile` hooks

There are **two** hooks named `useIsMobile`, and they are not identical:

| Hook                                                     | Query                                | Consumed by                          |
| -------------------------------------------------------- | ------------------------------------ | ------------------------------------ |
| [`lib/use-media-query.ts`](../../lib/use-media-query.ts) | `max-width: 768px` (≤ 768 is mobile) | the mailbox route / this nav surface |
| [`hooks/use-mobile.tsx`](../../hooks/use-mobile.tsx)     | `max-width: 767px` (< 768 is mobile) | only `components/ui/sidebar.tsx`     |

Tailwind's `md:` prefix is `min-width: 768px`, so CSS treats `768px` as
**desktop** while the route's JS hook treats `768px` as **mobile**. There is a
1px window at exactly `768px` where the JS layout has switched to mobile but the
`md:hidden` / `md:flex` CSS has not. This is the existing behavior — if you touch
breakpoints, change the hook and the CSS together, and prefer consolidating on
one hook rather than adding a third.

## User-Facing States

- **Bottom bar** — Six evenly spaced tabs with icon + 10px label. The active tab
  (Inbox or Proofs) shows a sliding translucent pill and brighter icon/label.
  Compose, Search, Calendar, and Settings never appear active; they open their
  respective surfaces and return the user to the current folder.
- **Sidebar collapsed vs expanded** — Collapsed (`76px`) hides all labels, the
  brand wordmark, section titles, custom folders, the add-folder input, and the
  account email; only icons and the active highlight remain. Expanded shows
  labels, the `Ctrl+N` compose hint, per-folder counts, and the account row.
- **Custom folders** — The "Folders" add affordance (expanded only) appends to
  **local component state** and is not persisted or shared. Selecting an active
  custom folder again toggles it off (`null`).
- **Topbar responsiveness** — Quick-action chips appear at `xl`; their text
  labels appear at `2xl`; icon-button keyboard hints appear at `lg`; the account
  name appears at `xl`. Dropdowns (Filter, Help, Account, Notifications) open as
  portaled glass panels with a full-screen dim/blur backdrop that closes on
  outside click, and reposition on scroll/resize.
- **Account menu** — Switch account flips a local `personal`/`protocol` label and
  fires a toast; Sign out fires a toast and calls `onSignOut`. Neither performs
  real authentication.

## Safety And Privacy Boundaries

- **All identities and counts in these surfaces are fake demo data.**
  Specifically: the sidebar account row (`Uthaimin` / `kryputh@stealth.me`), the
  topbar account identities (`Eve Navarro` / `eve*stealth.xyz`,
  `Hush Protocol` / `team*stealth.network`), the default custom folders
  (Clients / Investors / Personal), and the quick-action numbers (`2` / `5` /
  `9`) are all hardcoded placeholders. Do not replace them with real users, real
  addresses, real unread counts, wallet secrets, private keys, access tokens, or
  live mailbox identifiers — in code, fixtures, screenshots, tests, or docs.
- **Navigation never touches mail or keys.** These surfaces select folders, open
  dialogs, toggle filters, and emit toasts. They must not decrypt payloads, sign
  transactions, settle postage, send/archive mail, or authenticate. Sign-out and
  account-switch are presentational stubs (`onSignOut`, local label + toast); if
  you wire them to real session/identity logic, route it through the existing
  auth/identity modules rather than adding logic to the navigation components.
- **Trust-adjacent copy is security-sensitive.** The Proof Inspector, Proofs tab,
  Notifications pulse dot, and Verified-style affordances must not imply
  guaranteed identity, delivery, or payment beyond what the backing data proves.
  Keep labels like `Verified`, `Pending Proof`, `Request`, and `Receipt`
  consistent with the folder/badge model described in `README.md`.
- **No tracking-introducing assets.** Do not add remote images, fonts, or
  customer assets to these surfaces; the app inlines its assets and a CSP applies.

## QA Checklist

- Resize across the `768px` boundary and confirm the desktop resizable shell and
  the mobile single-panel + bottom bar swap cleanly, keeping the known 1px
  hook/CSS boundary above in mind.
- Confirm `BottomNavigation` is hidden at `md` and up, and that content is not
  clipped behind it on mobile (`pb-[72px]`) including on a device with a home
  indicator (`safe-area-inset-bottom`).
- Verify the active pill animates only for Inbox and Proofs, and that Compose,
  Search, Calendar, and Settings open the correct surface and return to the prior
  folder.
- Toggle the sidebar collapsed/expanded and confirm labels, counts, custom
  folders, the add-folder input, and the account row hide/show correctly and the
  width animation is smooth.
- Add and re-select a custom folder; confirm it is local-only (gone after reload)
  and that re-selecting an active one clears it.
- Open each Topbar dropdown (Filter, Notifications, Help, Account); confirm the
  portal panel anchors correctly, repositions on scroll/resize, and closes on
  backdrop click. Confirm quick-action chips, labels, and hints appear/disappear
  at the `lg` / `xl` / `2xl` breakpoints.
- Confirm Switch account and Sign out only fire toasts / the `onSignOut` callback
  and perform no real auth.
- Check accessible labels (`aria-label`) on bottom-bar buttons and topbar icon
  buttons, and verify touch target sizing on the bottom bar.
- Run the project typecheck and lint when the local environment supports the
  dependency install (`bunx tsc --noEmit`, `bun run lint`), plus the relevant
  unit/e2e suites for the touched area.
