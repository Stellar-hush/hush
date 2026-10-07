# Policy Editor Contributor Handoff

This document covers the existing mailbox **policy editing** surface — the rules
that decide **who can reach a user's inbox**. It is scoped to existing app code
and intentionally does not propose new product scope. Because these controls
govern deliverability and sender admission, treat changes here as
security-sensitive and review them carefully before merging.

There are **two** editing surfaces plus one shared data contract:

1. The standalone **Policy Editor route** at `/policy-editor`.
2. The **Inbox control** tab inside the Settings modal.
3. The shared **mailbox policy template** contract both lean on.

## Local File Map

- [`route.tsx`](./route.tsx) — the standalone `/policy-editor` page. Local React
  state only (`allowUnknown`, `requireVerified`, `minimumPostage`), a live
  **sender simulator**, a JSON **API payload preview**, and a Save action that
  `POST`s to `/api/v1/policy`.
- [`../../features/settings/mailbox-policy-templates.ts`](../../features/settings/mailbox-policy-templates.ts)
  — the shared, pure data contract: the `MailboxPolicyTemplate` /
  `SavedMailboxPolicyTemplate` types, the `MAILBOX_POLICY_TEMPLATES` presets, and
  the pure conversion helpers (`templateToPreferences`,
  `buildCustomMailboxPolicyTemplate`, `savedCustomTemplateToPreferences`,
  `mailboxPolicyTemplateMatchesPreferences`, `findMailboxPolicyTemplate`).
- [`../../components/mail/SettingsModal.tsx`](../../components/mail/SettingsModal.tsx)
  — the `InboxSettings` component (the "Inbox control" tab) renders the template
  cards, the manual unknown-sender policy options, and the preview/apply flow. It
  edits the persisted `UiPreferences` (`unknownSenders`, `minimumPostage`).
- Tests: [`tests/unit/settings/mailbox-policy-templates.test.ts`](../../../tests/unit/settings/mailbox-policy-templates.test.ts),
  [`tests/e2e/policy-editing.spec.ts`](../../../tests/e2e/policy-editing.spec.ts),
  and [`tests/unit/api/policy-service.test.ts`](../../../tests/unit/api/policy-service.test.ts).

## Data Contracts

- **Unknown-sender policy** — `UnknownSenderPolicy` (`"request" | "verified" |
"block"`) from [`@/features/preferences`](../../features/preferences). With
  `minimumPostage` (a **string**, in XLM) it forms the policy both surfaces edit.
- **Templates** — each `MailboxPolicyTemplate` carries display copy (`label`,
  `summary`, `tradeoff`, `senderExperience`) plus `policy.{unknownSenders,
minimumPostage}`. The five presets are `private`, `public-paid-inbox`,
  `investor-inbox`, `recruiting-inbox`, and `allowlist-only`. A
  `SavedMailboxPolicyTemplate` (`id: "custom"`) is the user's local draft and
  records the `sourceTemplateId` it diverged from.
- **Conversion is pure and centralized** — templates map to preferences only
  through the helpers in `mailbox-policy-templates.ts`. Keep that mapping there;
  don't inline `unknownSenders`/`minimumPostage` translation in components.
- **⚠️ The two surfaces use different policy shapes.** The Settings tab speaks
  the `unknownSenders` enum + `minimumPostage`. The standalone route instead uses
  three local booleans/number (`allowUnknown`, `requireVerified`, a `0–1` XLM
  `minimumPostage` slider) and POSTs `{ allowUnknown, requireVerified,
minimumPostage }` to `/api/v1/policy`. They are **not** the same model — if you
  unify them, do it deliberately and update both call sites and the API.

## User-Facing States

### Standalone route (`/policy-editor`)

- **Allow Unknown Senders** toggle — when off, "Require Verification" and the
  postage slider are **disabled** (`opacity-50 cursor-not-allowed`) because they
  only apply to unknown senders.
- **Require Verification** toggle and **Minimum Postage** slider (`0–1` XLM) —
  disabled while unknown senders are off.
- **Live Simulator** — renders allow/deny + reason for `trusted`, `blocked`,
  `verified`, and `unverified` senders, recomputed from the current controls via
  `simulateSender`.
- **API Payload** — shows the exact JSON that Save will POST.
- **Save** — shows `Saving…` and is disabled while in flight; success fires a
  success toast; failure sets the inline `apiError` banner **and** a danger toast.

### Settings "Inbox control" tab (`InboxSettings`)

- On open, the previewed template hydrates from the persisted preferences via
  `findMailboxPolicyTemplate(...)`, falling back to `custom`.
- **Selecting a template only previews it** — it does not change preferences
  until **Apply**. The panel shows whether applying will replace the current
  policy (`applyingWillReplaceCurrent`).
- **Manual policy options** (Request approval / Verified only / Trusted contacts
  only) **apply immediately** to preferences and switch the preview to `custom`.
- **Save as custom** stores the current draft as a reusable local custom
  template; **Apply** writes the previewed template's policy into preferences.

## Safety, Privacy, And Security Boundaries

- **These controls decide who can reach the user.** Changing `unknownSenders` to
  `block`, or turning Allow Unknown Senders off, can stop legitimate mail from
  arriving. Review copy and defaults with that blast radius in mind, and keep
  language aligned with Hush Mail's safety / sender-control positioning.
- **The UI previews; the backend enforces.** The standalone route's
  `simulateSender` is an **illustrative local approximation**, not the real
  admission engine — the authoritative decision is server-side via
  `/api/v1/policy` (see `tests/unit/api/policy-service.test.ts`). Don't treat the
  simulator or the Settings preview as the source of truth for delivery.
- **Preview-before-apply is a safety feature, not incidental.** In the Settings
  tab, choosing a template must not silently change who can reach the user;
  preserve the explicit Apply/Save step. Only manual edits are intended to apply
  immediately (and they flip the preview to `custom` so the user can see the
  change is uncommitted relative to a named template).
- **All data here is fake/demo and deterministic.** Account identities, postage
  values, and simulator outcomes are synthetic. Do not introduce real user
  addresses, wallet secrets, private keys, live mailbox identifiers, or real XLM
  settlement into this surface, its fixtures, tests, or docs.
- **Postage is value-bearing semantics.** `minimumPostage` is denominated in XLM;
  keep it a string and avoid float drift. In the demo it never settles real
  funds, but copy should not imply guaranteed payment or delivery.

## QA Checklist

- **Route — control gating:** toggle Allow Unknown Senders off and confirm
  Require Verification and the postage slider both disable and visually dim.
- **Route — simulator:** flip toggles / move the slider and confirm the four
  sender rows (trusted/blocked/verified/unverified) update their allow/deny and
  reason text, and that the API Payload preview matches the controls.
- **Route — save paths:** Save shows `Saving…` + disables; a successful POST
  fires the success toast; a failing POST shows the inline `apiError` banner and
  the danger toast (no silent failure).
- **Settings — hydration:** open Inbox control and confirm the previewed template
  reflects the current saved policy (or `custom` when nothing matches).
- **Settings — preview vs apply:** selecting a template only previews (preferences
  unchanged until Apply); Apply writes it; Save as custom stores a local draft;
  Cancel restores prior settings.
- **Settings — manual edits:** changing an unknown-sender option applies
  immediately and switches the preview to `custom`.
- **Tests:** run `tests/unit/settings/mailbox-policy-templates.test.ts` and
  `tests/e2e/policy-editing.spec.ts` (and `tests/unit/api/policy-service.test.ts`
  for the backing API) when touching this area, then `bunx tsc --noEmit` and
  `bun run lint`.
