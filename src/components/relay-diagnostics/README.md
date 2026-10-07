# Relay Diagnostics Contributor Handoff

This folder owns the existing relay diagnostics dashboard UI. The matching API route and service live in the server layer, so contributors should treat this surface as a read-only operator view for demo health signals, not as a relay control plane or a new standalone tool.

## Local Files

- `RelayDiagnosticsDashboard.tsx` fetches `/relays/:relayId/diagnostics`, handles loading/error states, renders status cards, and exposes the diagnostic bundle action.
- `StatusCard.tsx` renders the compact health metrics used by the dashboard header.
- `DiagnosticsTable.tsx` renders tabular diagnostic entries when callers provide them.
- `CopyDiagnosticBundle.tsx` serializes bounded diagnostic metadata for clipboard handoff.
- `index.ts` exports the public UI entry points.
- `src/server/routes/relayDiagnostics.ts` owns the Express route, relay owner lookup, forbidden/not-found behavior, and 500 fallback.
- `src/server/api/relay-diagnostics-service.ts` reads repository metrics and maps them to `healthy`, `degraded`, or `failing` status.

Keep future edits inside these paths unless an issue explicitly calls for a small shared helper or test fixture.

## Data Contract

`RelayDiagnosticsResponse` is metadata-only:

- `relayId`: the relay identifier being inspected.
- `queueDepth`: pending message count for the relay.
- `retryCount`: retry count used to detect retry storms.
- `lastSuccessAt`: ISO timestamp for the most recent successful delivery, or `null`.
- `lastFailureAt`: ISO timestamp for the most recent failed delivery, or `null`.
- `deadLetterCount`: messages that could not be delivered after retry handling.
- `status`: `healthy`, `degraded`, or `failing`.
- `signals`: booleans for `isDelayed`, `isRetryStorm`, and `isDegraded`.

The contract must not include message bodies, recipient lists, attachment content, private keys, auth tokens, payment details, or live customer mail.

## User-Facing States

- Loading: four skeleton cards reserve the status-card layout while the request is in flight.
- Error: a rose warning card tells operators that diagnostics are unavailable without exposing internal error details.
- Empty healthy relay: a relay with zero queue depth, zero retries, zero dead letters, and no delivery timestamps is displayed as `empty` in the UI.
- Healthy/degraded/failing relay: status cards use the mapped service status and should remain readable without color alone.
- Stale delivery timestamp: invalid timestamps fall back to the raw value rather than crashing the dashboard.
- Copy diagnostics: clipboard export is limited to the current diagnostic metadata bundle.

## Safety And Privacy Notes

- `relayDiagnosticsHandler` checks `getRelayOwner(relayId)` before returning diagnostics. Keep `404` for unknown relays and `403` for relays owned by another user.
- `relay-diagnostics-service.ts` should remain read-only. It may aggregate repository counters, but it should not mutate queue, retry, delivery, or dead-letter state.
- Clipboard bundles are trust-sensitive because operators may paste them into support threads. Keep exported fields bounded to `RelayDiagnosticsResponse` and avoid adding opaque payloads.
- Do not add real queue payloads, live mail content, secrets, private keys, auth tokens, payment account numbers, or production logs to examples, tests, or docs.
- Status thresholds are product copy as much as logic. Avoid claiming a relay is safe, verified, or recovered unless the service data proves that state.
- Keep copy aligned with Hush Mail's safety, speed, and sender-control positioning.

## Contributor Checklist

- Update UI, route, service, and tests together when changing the diagnostics contract.
- Preserve the owner check in `src/server/routes/relayDiagnostics.ts`.
- Preserve the read-only repository access pattern in `src/server/api/relay-diagnostics-service.ts`.
- Keep loading, error, empty, healthy, degraded, failing, and copy states understandable for keyboard and screen-reader users.
- Avoid adding a new V1/V2 tool folder or unrelated product surface for relay diagnostics work.
- Link to existing local files and tests instead of documenting architecture that is not implemented.

## Lightweight QA Checklist

- Render the dashboard with a loading request and confirm skeleton cards do not shift the layout.
- Return `404`, `403`, `500`, and `200` route outcomes and confirm the UI/error behavior is bounded.
- Verify healthy, empty, degraded, and failing status mappings from queue depth, retry count, and dead-letter count.
- Verify invalid or missing delivery timestamps do not crash `formatLastDelivery`.
- Copy a diagnostic bundle and confirm it contains only relay metadata, not message payloads or secrets.
- Check keyboard focus and visible labels for status cards, table rows, and copy controls.
- Run the most relevant local test, typecheck, or lint command when dependencies are available.
- Search changed files for secrets, private keys, payment details, personal accounts, and live mail content before opening a PR.
