# Manual usability session scripts — BETA-098 (Issue #2005)

Facilitator-run sessions with representative first-time users on **test data only**.
Record informed consent before starting. Capture redacted notes in
`gate-result-beta-098-acceptance.json` via `bun run beta-acceptance:session`.

Environment: `/demo` route with `npm run dev` → `http://localhost:5173/demo`.

## Consent script

> "This is a beta test using synthetic mail data. We may collect task timing and
> accessibility notes. No real messages or wallet secrets are recorded. Do you
> consent to diagnostic observation?"

Mark `informedConsent: true` on feedback payloads only after verbal yes.

## Desktop tasks (1280×720)

| #   | Task                                               | Success signal                             | Block if                    |
| --- | -------------------------------------------------- | ------------------------------------------ | --------------------------- |
| 1   | Find your Hush address and explain how to share it | Copies or describes G-address within 2 min | Cannot locate address       |
| 2   | Send a message to a new recipient                  | Compose opens, pipeline visible            | Cannot open compose         |
| 3   | Approve an unknown sender                          | Request moves to inbox                     | Cannot find Requests        |
| 4   | Inspect a proof for a message                      | Proof sections visible                     | Cannot open Proof Inspector |
| 5   | Recover after sign-out                             | Returns to sign-in with return path        | Lost with no recovery path  |
| 6   | Submit session feedback                            | Rating + category submitted                | Consent not recorded        |

## Mobile tasks (390×844)

Repeat tasks 1, 2, 5, 6. Note any reflow or touch-target barriers.

## Observation rubric

| Metric       | Record                                     |
| ------------ | ------------------------------------------ |
| Completion   | pass / fail / blocked                      |
| Errors       | count of mis-clicks or validation failures |
| Confusion    | verbatim quote (redact secrets)            |
| Time         | seconds to complete                        |
| A11y barrier | keyboard, screen reader, contrast, motion  |

## Release-blocking triage

Only **P0 comprehension** or **critical accessibility** findings block launch.
File each blocker with owner, journey id, and reproduction steps in the session evidence JSON.
