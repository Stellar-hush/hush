# OTP Module Contributor Handoff

This module detects one-time passkeys and verification codes inside the mail reader and renders a focused copy surface above the message body. It is an existing app feature, not a new tool folder. Changes here are security-sensitive: contributors should preserve sender-control positioning and avoid treating heuristic detection as cryptographic proof.

## Local Files

- [`detectOtp.ts`](./detectOtp.ts) owns the body-text heuristic that returns a digit string or `null`.
- [`components/OTPCard.tsx`](./components/OTPCard.tsx) owns the reader-facing card, digit layout, clipboard copy action, and entrance animation.
- [`styles.css`](./styles.css) owns OTP-specific scene, card, digit, and copy-button styling imported by `OTPCard`.
- [`index.ts`](./index.ts) exports `detectOtp` and `OTPCard` for the rest of the app.

The current integration point is [`src/components/mail/EmailView.tsx`](../../components/mail/EmailView.tsx), which calls `detectOtp(email.body)` while rendering a message and shows `OTPCard` only when a code is found. Keep future OTP work inside this folder unless a small shared helper is already used by multiple existing surfaces.

## Data Contract

### `detectOtp(body: string): string | null`

Input is the full plaintext message body already loaded in the reader. Output is either:

- a normalized digit string containing **4–8 digits**, with spaces and hyphens stripped from keyword matches, or
- `null` when no qualifying code is found.

Detection rules implemented today:

1. **Keyword path** — looks for terms such as `otp`, `one-time password`, `passkey`, `pass code`, `verification code`, `security code`, `code`, or `pin`, followed within 40 characters by a 4–8 digit sequence (spaces/hyphens allowed between digits).
2. **Standalone path** — accepts a 6-digit number on its own line when the keyword path does not match.

**Example matches:**

```
"Your verification code is: 123456"  → "123456"
"OTP: 1234"                          → "1234"
"Security code 12345678"             → "12345678"
"\n  654321\n"                       → "654321"
"Your code is 123-456"               → "123456"
```

**Non-matches:**

- Codes with fewer than 4 or more than 8 digits (9-digit input truncates to 8)
- Numeric strings without security-related keywords (unless standalone 6-digit on its own line)
- Keyword and digits separated by more than 40 characters

The helper does **not** parse expiry timestamps, sender identity, relay trust, or message headers. It also does not persist codes, log them to the network, or validate that the sender is authorized to issue the code.

### `OTPCard({ code }: { code: string })`

- `code`: the digit string returned by `detectOtp`. The card splits it into per-digit boxes for display.
- Clipboard copy writes the raw `code` string via `navigator.clipboard.writeText`.
- Copy failures are swallowed locally; there is no toast or error banner today.

Expiry language may appear in the surrounding email body (see demo fixtures in [`src/components/mail/data.ts`](../../components/mail/data.ts)), but `OTPCard` does not currently render a separate expiry countdown or deadline. Do not document or add countdown behavior unless it is implemented in this module.

## User-Facing States

- **No detection (`null`)** — the reader shows the normal message body only. No OTP chrome is rendered.
- **Detected code** — `OTPCard` appears above `ReaderBody` with the heading “Your verification code”, per-digit boxes, and a “Copy code” action.
- **Copy default** — button label “Copy code” with copy icon.
- **Copy success** — button briefly shows “Copied” with a check icon for ~1.6 seconds, then returns to default.
- **Copy failure** — silent fallback; the button stays on “Copy code”. Clipboard permissions or browser blocks are not surfaced to the user today.
- **Motion** — the card uses a short entrance animation via `framer-motion`. Respect existing reduced-motion patterns elsewhere in the app when changing animation.

The card copy states that the code was “auto-detected from message body”. Keep that wording honest: detection is a convenience helper for the currently open message, not proof that Hush Mail verified the sender or relay.

## Safety And Privacy Notes

### What this module does

- Scans plain-text email bodies for OTP patterns locally in the browser.
- Displays detected codes in a visually distinct card with explicit user-initiated copy.
- Relies on heuristic pattern matching tuned for recall over precision.

### What this module does not do

- Send codes to external services or store them in browser storage or a database.
- Auto-fill codes into external forms or auto-copy on detection.
- Validate code expiry, sender trust, or relay attestation.
- Parse HTML email bodies (callers must provide plain text).

### Privacy and trust assumptions

- Demo OTP messages in [`src/components/mail/data.ts`](../../components/mail/data.ts) use fake codes such as `482 015` and `371 400`. Do not replace fixtures with real user mail, live OTPs, private keys, wallet secrets, or production auth codes.
- `detectOtp` runs **locally on the message body already in memory** for the open email. Do not add network calls, telemetry uploads, or server-side logging of detected codes from this module.
- Clipboard copy is trust-sensitive. Copying moves the code into the system clipboard where other apps may read it. Avoid auto-copy on detection and avoid copying more than the digit string.
- Clipboard access requires HTTPS or localhost, a user gesture (click), and browser-managed permission.
- Heuristic detection can false-positive or false-negative. The unit suite in [`tests/unit/otp/detectOtp.test.ts`](../../../tests/unit/otp/detectOtp.test.ts) documents expected success and guard cases; treat those tests as the contract when tuning regex behavior.
- Do not imply the sender, relay, or code is verified unless a separate feature provides that guarantee. OTP UI is a reader affordance, not sender attestation.
- Do not add real phone numbers, account recovery secrets, seed phrases, or live customer mail to examples, screenshots, or docs in this folder.
- Detection relies on English keywords today. Non-English OTPs may not match unless they use the standalone 6-digit line format.
- Expiry reminders belong in honest, bounded copy. If you add expiry UI later, derive it only from structured data you can trust—do not invent deadlines from free-form body text without an explicit parser and tests.

## Contributor Checklist

- Keep copy aligned with Hush Mail's safety, speed, and sender-control positioning.
- Update [`detectOtp.ts`](./detectOtp.ts) and [`tests/unit/otp/detectOtp.test.ts`](../../../tests/unit/otp/detectOtp.test.ts) together when changing detection rules.
- Keep `OTPCard` presentational: it should receive a `code` string from the caller, not fetch mailbox data or inspect private keys on its own.
- Preserve keyboard and pointer access for the copy action; avoid color-only success states.
- Import OTP styles through [`styles.css`](./styles.css) rather than duplicating token values in feature code.
- Verify `OTPCard` only renders when `detectOtp()` returns non-null and does not interfere with sibling reader features.
- Link to existing files and tests in docs; do not invent new architecture, background workers, or V1/V2 tool folders for OTP work.

## Lightweight QA Checklist

- Open a demo message with an OTP fixture (for example the “relay verification code” row in [`data.ts`](../../components/mail/data.ts)) and confirm `OTPCard` renders above the body.
- Open a message without a detectable code and confirm no OTP card appears.
- Click **Copy code** and confirm the clipboard receives only the digit string (no subject line or body text).
- Confirm the button returns from **Copied** to **Copy code** after the brief success state.
- Verify digit boxes match the detected length for 4-, 6-, and 8-digit demo cases covered by unit tests.
- Confirm codes with spaces or hyphens normalize correctly (for example `123-456` → `123456`).
- Confirm very long bodies and empty bodies do not break detection or layout.
- Check responsive behavior and copy-button hover/active states at narrow widths.
- Search docs, fixtures, and screenshots for real OTPs, secrets, private keys, or live customer mail before opening a PR.
- Run the focused unit tests when dependencies are available:

```bash
bun run test -- tests/unit/otp
bun x tsc --noEmit
bun run lint
```

## Future Considerations

Out of scope for this module unless proposed as a separate reviewed issue:

- Multi-language keyword support
- OTP expiry countdown timers
- Auto-fill into external forms
- Storing OTP history
- Integration with password managers
- Backend OTP validation

## Related Files

- Integration: [`src/components/mail/EmailView.tsx`](../../components/mail/EmailView.tsx)
- Demo fixtures: [`src/components/mail/data.ts`](../../components/mail/data.ts)
- Unit tests: [`tests/unit/otp/detectOtp.test.ts`](../../../tests/unit/otp/detectOtp.test.ts)
