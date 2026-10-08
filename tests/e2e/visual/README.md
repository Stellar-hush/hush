# Visual & Cross-Browser Regression Tests

BETA-087 (Issue #1994) — web beta browser compatibility and visual regression
coverage. The web beta is browser-only, so the critical journeys must render
consistently across Chromium, Firefox, WebKit, Android-sized, and iOS-sized
screens.

## What is covered

Each test drives a critical journey and captures a screenshot with Playwright's
`toHaveScreenshot`:

| Surface                   | Journey                                             |
| ------------------------- | --------------------------------------------------- |
| inbox                     | Default mailbox shell                               |
| reader                    | A selected conversation (desktop reader pane)       |
| compose                   | New-message composer                                |
| requests                  | Sender request triage board (desktop sidebar)       |
| proof-inspector           | Cryptographic proof inspector dialog                |
| proof-inspector-not-found | Proof inspector error state                         |
| settings                  | Settings modal                                      |
| policy-inbox-control      | Inbox control policy tab (includes minimum postage) |
| auth-sign-in              | Sign-in modal                                       |

The suite runs under a dedicated Playwright config
(`playwright.visual.config.ts`) that defines five projects:

- `chromium-desktop`, `firefox-desktop`, `webkit-desktop`
- `chromium-mobile` (Pixel 5), `webkit-mobile` (iPhone 13)

It is deliberately separate from `playwright.config.ts` (the functional E2E
suite) so cross-browser/mobile projects do not multiply the runtime of the
existing functional suite or break its desktop-only assertions.

## Commands

```bash
bun run test:visual          # run the suite and compare against baselines
bun run test:visual:update   # regenerate baselines after an intentional change
```

## Baselines

Baselines are stored under `tests/e2e/visual/__screenshots__/<project>/` and are
keyed by `{projectName}` only — the CI platform (Linux) is the canonical
baseline source. Cross-browser diffs are detected per project; cross-platform
diffs are intentionally out of scope.

Baselines are committed so CI can detect regressions, and any difference is
reviewed (never blindly updated):

1. Run `bun run test:visual` to see the diff.
2. Inspect the HTML report (`playwright-report/`) to confirm the change is
   intended and not a regression.
3. For canonical Linux screenshots, run the repository's **Refresh Visual
   Snapshots** workflow from GitHub Actions, download the `linux-visual-snapshots`
   artifact, and copy only the reviewed image changes into this directory. The
   workflow is manual and does not update the branch itself.
4. Commit only the reviewed baselines. Do not commit screenshots generated on
   another OS as Linux baselines.

`bun run test:visual:update` remains available for local iteration, but the
resulting captures are not canonical unless generated on the same Linux image
and pinned Playwright version used by CI.

The local-font and Compose-button refresh uses 24 reviewed Linux captures from
[CI run 37190528807](https://github.com/Stellar-hush/hush/actions/runs/37190528807)
at source commit `2d997b37`. The differences cover the original Inter, Space
Grotesk and Newsreader families now loading under the app's CSP, the new Compose
launcher, and the previously added custom icons. Other baselines and the strict
CI comparison threshold are unchanged. The fonts are bundled with the app;
check that the intended faces load before accepting future typography baselines.

## CI

The `visual-e2e` job in `.github/workflows/ci.yml` installs all three browser
engines, runs `bun run test:visual`, and uploads the report, diffs, screenshots,
videos, and traces for any failure so regressions are reviewable in the PR.

## Stability notes

- The demo mailbox bootstrap pins `showAvatars: false` and reduced motion so
  screenshots do not depend on the external avatar service or animation timing.
- `toHaveScreenshot` disables CSS animations and hides the caret.
- Snapshots tolerate a 2% pixel diff (`maxDiffPixelRatio`) to absorb sub-pixel
  antialiasing noise across runs.
