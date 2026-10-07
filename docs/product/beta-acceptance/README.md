# BETA-098 — Beta usability and accessibility acceptance

Issue **#2005** · Structured first-time-user sessions on phone and desktop before launch.

## Session protocol

1. **Consent** — Participants use synthetic test accounts only; diagnostic consent is recorded before the session (`informedConsent: true` on feedback payloads).
2. **Personas** — First-time beta user (no prior Hush exposure); facilitator observes without coaching unless blocked >3 minutes.
3. **Devices** — Run the same task list on desktop (1280×720) and mobile (390×844).
4. **Tasks** — Signup/onboarding, address sharing, send, requests triage, proof inspection, recovery, in-app feedback.
5. **Metrics** — Task completion, errors, confusion notes, elapsed time, accessibility barriers, support requests.

## Release-blocking criteria

| Signal                          | Target                    | Owner                        |
| ------------------------------- | ------------------------- | ---------------------------- |
| Critical journey completion     | ≥ 80% per task            | `product/ux`                 |
| Critical/serious axe violations | 0 on journey surfaces     | `platform/client` (BETA-073) |
| Comprehension blockers          | 0 unresolved P0           | `product/ux`                 |
| Informed consent on feedback    | 100% of submitted reports | `platform/client`            |

## Evidence artifacts

| Artifact                   | Path                                                     |
| -------------------------- | -------------------------------------------------------- |
| Automated journey spec     | `tests/e2e/beta-acceptance/acceptance-journeys.spec.ts`  |
| Manual facilitator scripts | `tests/e2e/beta-acceptance/usability-session-scripts.md` |
| Redacted run report        | `tests/e2e/beta-acceptance/run-report.json`              |
| Operator gate evidence     | `gate-result-beta-098-acceptance.json`                   |
| CI gate result             | `gate-result-beta-acceptance.json`                       |

## Operator command

```bash
bun run beta-acceptance:session
```

See also `tests/e2e/beta-acceptance/README.md` for the full DoD checklist and CI wiring.
