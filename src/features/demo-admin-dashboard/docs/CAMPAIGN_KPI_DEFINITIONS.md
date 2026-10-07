# Campaign KPI Definitions

**Issue:** #262  
**Folder:** `src/features/demo-admin-dashboard/`

---

## Overview

`CampaignKpiDefinition` is a typed, demo-safe model representing a single performance metric for a campaign. All values are fake and deterministic — safe for public repository review.

---

## Type Schema

```typescript
interface CampaignKpiDefinition {
  id: string; // Stable kebab-case identifier
  campaignId: string; // Parent campaign identifier
  metric: KpiMetricKind;
  label: string; // Human-readable metric name
  description: string; // What this metric tracks in the Hush demo context
  unit: KpiUnit; // "count" | "percent" | "rate"
  target: number; // Goal value (must be > 0)
  currentValue: number; // Current demo value (must be >= 0)
  status: KpiStatus; // "on-track" | "at-risk" | "met" | "missed"
  trend: KpiTrend; // "up" | "down" | "stable"
  windowLabel: string; // Time window description, e.g. "campaign total", "last 7 days"
}
```

---

## Metric Kinds

| `KpiMetricKind`     | What it measures in the Hush demo context                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| `opens`             | Recipients who opened the campaign message at least once                             |
| `approvals`         | Recipients who approved the sender identity in their Hush policy                  |
| `replies`           | Recipients who replied to the campaign message thread                                |
| `refunds`           | Postage refund requests submitted against the campaign's sends                       |
| `proof_inspections` | Times a recipient opened the cryptographic proof inspector for a campaign message    |
| `conversions`       | Recipients who completed a target action (onboarding flow, feature activation, etc.) |

Note: `proof_inspections` uses an underscore (not a hyphen) so it is a valid TypeScript identifier literal.

---

## Status Values

| `KpiStatus` | Meaning                                           |
| ----------- | ------------------------------------------------- |
| `on-track`  | Progress is within acceptable range of the target |
| `at-risk`   | Progress is lagging; needs attention              |
| `met`       | `currentValue >= target`                          |
| `missed`    | Campaign window closed without hitting target     |

---

## Fixture Data

`CAMPAIGN_KPI_DEFINITIONS` contains 12 entries: 2 demo campaigns × 6 metrics each.

| Campaign ID                    | Window         |
| ------------------------------ | -------------- |
| `campaign-onboarding-2026`     | campaign total |
| `campaign-stellar-launch-2026` | last 7 days    |

All `currentValue` fields are deterministic integers. The fixture data tells a plausible demo story:

- Opens are the highest count (widest top-of-funnel).
- Approvals and conversions follow at moderate levels.
- Replies are lower (engagement friction).
- Proof inspections reflect privacy-conscious users exploring the protocol.
- Refunds are lowest (healthy postage flow, but one campaign has a "missed" status to illustrate the failure case).

Temporal anchor: consistent with `DEMO_REFERENCE_NOW = "2026-06-16T09:00"` used across timeline fixtures.

---

## Helpers

All helpers are pure functions in `utils/campaignKpiHelpers.ts`.

| Function                               | Description                                                   |
| -------------------------------------- | ------------------------------------------------------------- |
| `getKpiById(kpis, id)`                 | Look up a single KPI by id                                    |
| `getKpisForCampaign(kpis, campaignId)` | Filter KPIs for one campaign                                  |
| `computeKpiProgress(kpi)`              | Progress ratio in [0, 1] (`currentValue / target`, clamped)   |
| `isKpiMet(kpi)`                        | `currentValue >= target`                                      |
| `sortKpisByMetric(kpis)`               | Stable sort by canonical `KpiMetricKind` order (non-mutating) |
| `validateCampaignKpiDefinition(kpi)`   | Returns `ValidationIssue[]`; empty means valid                |

---

## Display Tokens

`KPI_METRIC_TOKENS` and `KPI_STATUS_TOKENS` in `constants/displayTokens.ts` expose Tailwind-safe `bg`, `text`, `border`, and `label` values for each metric kind and status. Use `getKpiMetricToken(metric)` and `getKpiStatusToken(status)` for safe lookup.

---

## Follow-ups (out of scope for this issue)

- **Wire to `CampaignTimelinePanel`**: surface KPI progress alongside phase/milestone data.
- **Wire campaign IDs to `campaignSnapshotFixtures.ts`**: once IDs are aligned, add a `getKpisForSnapshot(snapshot, allKpis)` helper.
- **Add a `CampaignKpiPanel` component**: render metric cards with progress bars from `KPI_METRIC_TOKENS`.
