# Compose Flow Contributor Handoff

This feature covers the existing compose journey from recipient entry through
send progress. Keep changes focused on the current draft, validation, postage,
encryption, schedule, and send-progress surfaces rather than adding a new mail
tool or unrelated delivery architecture.

## Local File Map

- `src/components/mail/Compose.tsx` owns the modal shell, To/Subject/Body fields,
  attachment chips, emoji picker, AI suggestion insertion, encryption/receipt
  toggles, postage input, schedule/send buttons, toast copy, and the bridge into
  recipient resolution, policy quotes, relay diagnostics, and staged sending.
- `src/components/mail/composeValidation.ts` defines compose draft/submission
  types, recipient parsing, initial recipient readiness, blocked-recipient
  handling, policy-aware postage validation, and basic required-field errors.
- `src/features/compose/recipientResolver.ts` resolves Hush, Stellar, and
  federation-style recipient inputs into readiness states.
- `src/features/compose/usePostageQuote.ts` and
  `src/features/compose/RecipientPolicyBanner.tsx` surface sender policy,
  trusted-sender, blocked-sender, and minimum-postage state.
- `src/features/compose/sendPipeline.ts` stages immediate sends through encrypt,
  sign, postage, persist, submit, and reconcile steps.
- `src/features/compose/SendProgress.tsx` renders staged progress, failures, and
  retry affordances from `StageState[]`.
- `tests/unit/compose/usePostageQuote.test.ts`,
  `tests/unit/compose/recipientResolver.test.ts`, and `tests/e2e/compose.spec.ts`
  cover the highest-risk validation and user-flow behavior.

## Data Contracts

`Compose` accepts controlled opening state plus optional initial draft fields,
blocked recipients, and a resolver context. It emits `ComposeSubmission` only
after local validation, recipient readiness checks, policy/postage checks, and
the immediate send pipeline when the user sends now. Scheduled sends preserve
the same submission shape with `scheduled: true` and `mode: "schedule"`.

Recipients are comma- or semicolon-separated by `parseRecipients`. A
`RecipientReadiness` entry includes the entered address, resolver state,
postage readiness, status message, optional resolved account, policy type, and
encryption key hint. Initial readiness is synchronous and marked `resolving`;
the async resolver replaces it after the debounce window.

`validateComposeDraft` is intentionally conservative. It blocks empty
recipients, empty bodies, blocked recipients, invalid or still-resolving
resolved recipients, sender-policy blocks, and postage below the recipient's
quoted minimum unless the policy quote marks the sender as trusted.

`SendPipeline` creates or reuses a message id and reports `StageState[]` for
the fixed order: `encrypt`, `sign`, `postage`, `persist`, `submit`,
`reconcile`. Wallet rejection and wallet unavailability fail before persistence
or relay submission; relay failures are reconciled into outbox status instead of
being hidden.

## User-Facing States

- Empty recipient/body/subject states show short toast messages and keep the
  draft open.
- Recipient chips show resolving, verified, unknown, invalid, and blocked
  states with trust badge styling and explanatory tooltips.
- The policy banner communicates trusted sender, blocked sender, minimum
  postage, and quote-loading states before send.
- Delivery estimator state is informational and should not override validation.
- The send CTA changes between `Send`, `Send free`, `Send + {postage} XLM`,
  `Blocked`, and `Sending...` based on policy, postage, and progress.
- `SendProgress` shows each pipeline stage with pending, active, done, or error
  status plus retry when a failure is recoverable.
- Wallet rejection copy must reassure the user that the draft is safe; wallet
  unavailable copy should ask the user to unlock or connect a wallet before
  retrying.

## Safety And Privacy Boundaries

Do not add real customer mail, private keys, access tokens, wallet seeds, live
recipient lists, payment account details, or production relay payloads to docs,
fixtures, tests, or screenshots. Existing sample compose copy is demo-only and
must stay synthetic.

The compose UI must not silently send, schedule, decrypt, sign, reserve postage,
or submit to a relay without an explicit user action. The staged pipeline is the
only immediate-send path; scheduled sends should stay a clear user-selected
mode. Keep wallet signing user-mediated and keep plaintext out of logs,
diagnostics, progress messages, and persistent outbox metadata.

Recipient and policy states are trust-sensitive. Avoid copy that guarantees a
person's identity, wallet ownership, message delivery, or payment settlement
unless the backing resolver, policy quote, wallet signature, or relay response
already proves it. Prefer precise states such as `verified`, `unknown`,
`blocked`, `trusted`, `minimum postage`, and `delivery failed`.

Postage is shown as XLM for user clarity but comparisons use stroops from the
policy quote. Avoid floating-point conversions outside display and current UI
entry handling unless the validation contract is updated with tests.

## QA Checklist

- Verify recipient parsing accepts comma and semicolon separated inputs and
  keeps invalid, blocked, resolving, unknown, and verified recipients visually
  distinct.
- Confirm send is blocked for no recipient, invalid/resolving/blocked
  recipients, policy-level blocks, postage below minimum, missing subject, and
  missing body.
- Confirm trusted-sender quotes allow `Send free` while non-trusted quotes still
  require minimum postage.
- Exercise wallet rejected, wallet unavailable, relay failure, and successful
  delivery paths in `SendPipeline` or the nearest available tests.
- Check `SendProgress` renders pending, active, done, error, detail text, and
  retry without exposing plaintext message contents.
- Confirm schedule mode preserves draft fields and emits a scheduled submission
  without running the immediate relay pipeline.
- Run `tests/unit/compose/usePostageQuote.test.ts`,
  `tests/unit/compose/recipientResolver.test.ts`, and `tests/e2e/compose.spec.ts`
  when changing this area, then run typecheck and lint when dependencies are
  available.
