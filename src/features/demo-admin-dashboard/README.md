# Demo Admin Dashboard

This folder contains the isolated demo-admin dashboard slice for maintainers who need to populate and review fake demo UI data. It intentionally avoids production mail flows, live network calls, real user records, and route/app-shell integration.

Contributors working on demo-admin issues should keep new dashboard code, local state helpers, fixtures, validators, UI components, test utilities, and documentation inside:

`src/features/demo-admin-dashboard/`

The rest of the app should only import stable entry points from this folder once the feature is ready to connect to the demo inbox. Avoid changing existing inbox, mail reader, calendar, sender-conversion, or protocol modules unless an issue explicitly asks for a minimal integration shim.

Primary goals:

- Create a safe admin surface for loading demo inbox data.
- Keep demo data editing separate from production mail flows.
- Make every demo data mutation previewable, reversible, and auditable.
- Provide fixtures and validation that keep the demo UI realistic and stable.

## Safety and contributor handoff

The demo admin dashboard is the source of truth for safe demo-data operations. Contributors should treat it as an isolated maintainer surface for editing deterministic fixtures, validating campaign snapshots, previewing generated mail data, and reviewing audit-style demo events. It must not become a path for production mailbox writes or live protocol actions.

Important local files and folders:

- `DemoAdminDashboard.tsx` owns the tabbed admin shell, section routing, campaign editor surface, validation panels, and review affordances.
- `components/` contains dashboard-only controls such as panels, editors, cards, and validation displays.
- `fixtures/`, `fixtures.ts`, `validationFixtures.ts`, and `scenarioRegistry.ts` provide deterministic fake records and demo scenarios.
- `types.ts`, `validation-types.ts`, and nested `types/` files define the dashboard data contracts.
- `validation.ts` summarizes, sorts, groups, navigates, and validates demo campaign issues.
- `templates/` maps safe message templates into draft data without mutating production mail.
- `snooze/` provides deterministic reminder metadata for demo messages.
- `persistence/`, `reducers/`, `selectors/`, `helpers/`, and `utils/` hold local state, normalization, and review helpers.
- `docs/`, `AdminSearchBar.md`, `ValidationResultsPanel.md`, and `CONTRIBUTING.md` document existing local behavior and review conventions.
- `__tests__/` and sibling `*.test.ts` files cover fixture determinism, validation, migrations, message generation, and dashboard helpers.

Key data contracts a reviewer should understand:

- Demo people and sender identities must use reserved domains such as `example.com`, `example.org`, or `*.stealth.demo`.
- Campaign drafts can contain body text for fake messages, but they must never use real customer mail, secrets, private keys, auth tokens, payment accounts, or live addresses.
- Preset accounts, mail, attachments, events, audit events, personas, and campaign snapshots are local fixtures. They are review data, not live state.
- Validation results are advisory dashboard metadata with `error`, `warning`, and `info` severity. They should guide maintainers before data is exported or connected to another demo surface.
- Audit and proof-related rows may show hashes, mock signatures, demo contract addresses, or postage-like fields only when those values are fake and deterministic.

User-facing states to preserve:

- Overview and data tabs should make fake dataset status, record counts, and current preset/campaign context easy to scan.
- Editors should support preview-before-apply behavior and keep destructive changes reversible or locally scoped.
- Validation panels should distinguish blocking errors from warnings and info without relying on color alone.
- Empty or placeholder sections should explain what is missing and where the maintainer should go next.
- Import, export, snapshot, and quick-fix flows should be explicit about whether they touch local demo data only.
- Loading and transition states should not imply that live mail, live payments, or production protocol data has been fetched.

Safety and privacy notes:

- Do not add real user data, live customer mail, production logs, private keys, auth tokens, payment account numbers, payment QR codes, or real wallet secrets to fixtures, docs, tests, or screenshots.
- Keep demo data deterministic so tests, snapshots, and maintainer reviews do not depend on the current date, network state, or external services.
- Keep network access out of this feature unless a later issue defines a narrow demo-only integration.
- Do not write to the production inbox, mail reader, calendar, sender-conversion, or protocol modules from this folder.
- Keep copy aligned with Hush Mail's safety, speed, and sender-control positioning; avoid claims that demo trust badges, hashes, signatures, or proofs are live verification.
- Prefer adding links to existing local files and tests over describing an architecture that is not implemented.

Lightweight QA checklist:

- Confirm changed files stay inside `src/features/demo-admin-dashboard/` unless the issue explicitly requests a small integration shim.
- Review any new fixture, template, persona, sender, recipient, proof, and payment-like value for fake-domain and fake-data safety.
- Run the targeted demo-admin tests when dependencies are available: `npx vitest run src/features/demo-admin-dashboard/__tests__/`.
- Run validation-focused tests when changing validators, quick fixes, migrations, or snapshot helpers.
- Check tablet, laptop, and desktop dashboard layouts after UI changes.
- Verify keyboard focus, visible labels, and screen-reader text for changed controls and validation panels.
- Confirm import/export, snapshot, quick-fix, and editor flows are previewable, locally scoped, and reversible.
- Search changed files for secrets, private keys, payment details, personal accounts, and live mail content before opening a PR.

## Responsive Width Notes

| Width         | Breakpoint | Layout rule                                           | Review expectation                                               |
| ------------- | ---------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| 768px–1023px  | Tablet     | One-column data cards with controls stacked first     | No horizontal scrolling; touch controls remain above data cards. |
| 1024px–1439px | Laptop     | Two-column data cards plus a compact review rail      | Cards balance across two columns and width notes stay visible.   |
| 1440px+       | Desktop    | Three-column data cards plus an expanded review panel | Maintainers can scan data areas and layout checks side by side.  |

## Layout Checks

- Controls precede data cards on tablet widths.
- Laptop widths use a two-up card grid without requiring unrelated app-shell changes.
- Desktop widths keep responsive review notes visible next to the card grid.

## Validation

Run the unit tests:

```bash
npm run test
```

The fixture data in `fixtures/demoData.ts` and `fixtures/campaignSnapshotFixtures.ts` is deterministic, fake, and safe for public repository review.

To run only the demo-admin tests:

```bash
npx vitest run src/features/demo-admin-dashboard/__tests__/
```

---

## Integration

The `DemoAdminDashboard` component is exported from `./index.ts`. It is a self-contained shell that manages its own tab state and renders deterministic fake data.

### Usage

```tsx
import { DemoAdminDashboard } from "@/features/demo-admin-dashboard";

// Mount it anywhere a full-height admin surface is needed:
<DemoAdminDashboard className="h-screen" />;
```

### Props

| Prop        | Type     | Default | Description                          |
| ----------- | -------- | ------- | ------------------------------------ |
| `className` | `string` | `""`    | CSS class forwarded to the root node |

### Sections

The dashboard exposes these tabbed sections:

| Section     | Description                                                    | Data source                     | Status      |
| ----------- | -------------------------------------------------------------- | ------------------------------- | ----------- |
| Overview    | Summary stats cards, protocol scenario preset selector         | `presets.ts`, `demoData.ts`     | Implemented |
| Accounts    | Table of demo Stellar accounts and relay nodes                 | `presets.ts`                    | Implemented |
| Mail        | Table of demo inbox/request/spam mail fixtures                 | `presets.ts`                    | Implemented |
| Attachments | Table of file attachment fixtures linked to mail items         | `presets.ts`                    | Implemented |
| Events      | Table of calendar and protocol events                          | `presets.ts`                    | Implemented |
| Templates   | Pick a message template and insert it into the active drafts   | `templates/messageTemplates.ts` | Implemented |
| Campaigns   | Save/restore draft dataset snapshots and manage campaigns      | `campaignSnapshotFixtures.ts`   | Placeholder |
| Audit       | Timeline of demo protocol events (sessions, policies, postage) | `presets.ts`                    | Implemented |
| Analytics   | Privacy-preserving aggregate product analytics (future)        | TBD                             | Placeholder |

### Payload descriptor catalog

The demo dataset now includes a local registry of safe sample payload descriptors for
`pdf`, `image`, `text`, `key`, and `encrypted` content types. The catalog is defined in
`fixtures/payloadDescriptorCatalog.ts`, exported from the feature root, and covered by a
unit test that checks determinism and safety rules without relying on any external assets.

---

## Message templates (`./templates`)

The **Templates** section renders `TemplatePicker`: an admin surface for choosing a
pre-written message template and inserting it into the draft dataset that will populate
the demo inbox.

- `templates/messageTemplates.ts` — deterministic, fake template fixtures. Recipients use
  the reserved `*stealth.demo` handle or `example.com`/`example.org` domains so nothing
  references real people or live addresses (a test enforces this).
- `templates/templateSearch.ts` — `searchTemplates(templates, query)` is a ranked,
  case-insensitive substring search (name/subject hits outrank tag/description hits).
- `docs/CAMPAIGN_COPY_RULES.md` — campaign copy rules for demo messages and internal
  notes, with examples and a review checklist.
- `templates/templateToDraft.ts` — pure, non-mutating helpers that map a template onto the
  existing `Draft` shape (`./types/draft`) and `insertTemplate` / `removeDraft` the dataset,
  with duplicate-insert validation.
- `templates/TemplatePicker.tsx` — searchable list, detail preview (subject, recipients,
  body, tags), an **Insert draft** action that disables once a template is in the dataset,
  and the running draft dataset with per-row remove.

`TemplatePicker` accepts an optional `onDatasetChange(dataset: Draft[])` callback so a
parent can observe drafts as they accumulate.

### Follow-up integration (out of scope here)

This issue keeps everything inside the feature folder. Connecting the produced `Draft[]` to
the live demo inbox (e.g. dispatching `loadDraft` into the shared `draftReducer`, or seeding
`src/components/mail/data.ts`) is a deliberate follow-up so that no files outside
`src/features/demo-admin-dashboard/` change here.

---

## Snooze metadata (`./snooze`)

Admin controls for the reminder metadata on demo messages that appear in the snoozed
folder. `SnoozeMetadataEditor` lets a maintainer pick a preset or a custom date/time and
preview when each message returns.

- `snooze/referenceNow.ts` — a fixed demo clock (`2026-06-16T09:00`, local) so presets,
  previews, and tests are deterministic regardless of the real date.
- `snooze/snoozePresets.ts` — `SNOOZE_PRESETS` (later today / tomorrow / this weekend / next
  week) with pure `resolve(now)` functions.
- `snooze/snoozeValidation.ts` — custom date/time validation (rejects missing, malformed, and
  past-or-now values), relative-day labels, a `formatRemindAt` summary, and
  `metadataFromPreset` / `metadataFromCustom` builders. Reminder times are stored as local
  `yyyy-MM-ddTHH:mm` stamps so they round-trip without timezone drift.
- `snooze/snoozeFixtures.ts` — deterministic, fake snoozed messages (senders restricted to
  `*stealth.demo`); a test enforces address safety and that every `remindAt` is a valid,
  future, round-tripping stamp.
- `snooze/SnoozeMetadataEditor.tsx` — message list + preset buttons + custom date/time inputs,
  a live preview / validation panel, and an **Apply reminder** action. Accepts an optional
  `onChange(messageId, message)` callback.

### Follow-up integration (out of scope here)

`SnoozeMetadataEditor` and the snooze API are exported from `./index.ts` but not yet mounted
in the dashboard shell. Surfacing a **Snoozed** section (add a `DashboardSection` member plus
a nav/icon/content branch in `DemoAdminDashboard.tsx`, mirroring the Templates section) and
feeding the edited metadata into the demo inbox are deliberate follow-ups, kept separate so
this issue stays small and conflict-free against the actively evolving shell.
