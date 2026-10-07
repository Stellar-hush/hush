# Service-Level Objectives (SLOs) and Service-Level Indicators (SLIs)

This document defines the Service-Level Indicators (SLIs), Service-Level Objectives (SLO targets), measurement windows, traffic exclusion policies, error budget management, RED/USE metrics taxonomy, and privacy-safe observability implementation for the Hush API.

---

## Overview & Reliability Targets

The Hush API enforces high-reliability targets tied directly to user-visible outcomes (mailbox policies, postage quotes/settlements, relay delivery receipts, account provisioning, storage, sync, and authentication).

### Primary Target Summary

| Indicator                        | SLO Target                    | Primary Window    | Error Budget         | Metric Calculation Source         |
| :------------------------------- | :---------------------------- | :---------------- | :------------------- | :-------------------------------- |
| **API Availability**             | **99.9%**                     | 30 days (rolling) | 0.1% (~43.2 min/mo)  | `computeAvailabilitySLI()`        |
| **API Latency**                  | **99.0% $\le 250\text{ ms}$** | 30 days (rolling) | 1.0%                 | `computeLatencySLI(250)`          |
| **Authentication Availability**  | **99.95%**                    | 30 days (rolling) | 0.05% (~21.6 min/mo) | `computeAuthAvailabilitySLI()`    |
| **Critical Postage Transitions** | **99.9%**                     | 30 days (rolling) | 0.1% (~43.2 min/mo)  | `computePostageTransitionSLI()`   |
| **Relay Delivery Availability**  | **99.5%**                     | 30 days (rolling) | 0.5% (~216 min/mo)   | `computeRelayDeliverySLI()`       |
| **Chain Queue Reliability**      | **99.9%**                     | 30 days (rolling) | 0.1% (~43.2 min/mo)  | `computeChainQueueSLI()`          |
| **Storage Availability**         | **99.99%**                    | 30 days (rolling) | 0.01% (~4.32 min/mo) | `computeStorageAvailabilitySLI()` |
| **Account Provisioning**         | **99.0%**                     | 30 days (rolling) | 1.0%                 | `computeProvisioningSLI()`        |
| **Mailbox & Message Sync**       | **99.9%**                     | 30 days (rolling) | 0.1% (~43.2 min/mo)  | `computeSyncAvailabilitySLI()`    |

---

## Detailed Service-Level Indicators (SLIs)

### 1. API Availability SLI

Measures overall uptime and successful HTTP request processing across user-facing API routes.

- **Exact Numerator**: Count of processed API HTTP requests returning non-5xx status codes (`status!~"5.."`).
- **Exact Denominator**: Total count of processed API HTTP requests.
- **Target**: **99.9%** availability over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(api_requests_total{status!~"5..", path!~"/api/v1/health|/api/v1/openapi.json"}[30d]))
  /
  sum(rate(api_requests_total{path!~"/api/v1/health|/api/v1/openapi.json"}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeAvailabilitySLI()` in `src/server/api/metrics.ts`.

---

### 2. API Latency SLI (Response Time)

Measures request responsiveness to guarantee sub-second interaction speed for mail clients and relay nodes.

- **Exact Numerator**: Count of non-5xx HTTP requests completed within $\le 250\text{ ms}$ duration.
- **Exact Denominator**: Total count of non-5xx HTTP requests processed.
- **Target**: **99.0%** of valid requests completed in $\le 250\text{ ms}$ over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(api_latency_bucket{le="250", status!~"5..", path!~"/api/v1/health|/api/v1/openapi.json"}[30d]))
  /
  sum(rate(api_latency_count{status!~"5..", path!~"/api/v1/health|/api/v1/openapi.json"}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeLatencySLI(250)` in `src/server/api/metrics.ts`.

---

### 3. Authentication & Authorization Availability SLI

Measures reliability of SEP-10 Web Auth, actor header validation, and delegated authorization evaluation.

- **Exact Numerator**: Count of authentication and delegation checks returning success (`2xx`) or valid client credentials/scope rejections (`401`/`403` due to invalid signature or expired delegation) without server infrastructure errors (`5xx`).
- **Exact Denominator**: Total count of authentication and delegation checks processed.
- **Target**: **99.95%** availability over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(api_requests_total{path=~".*/auth.*", status!~"5.."}[30d]))
  /
  sum(rate(api_requests_total{path=~".*/auth.*"}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeAuthAvailabilitySLI()` in `src/server/api/metrics.ts`.

---

### 4. Critical Postage Transitions SLI

Measures accuracy and processing availability for trust-sensitive postage workflows (`quote`, `submit`, `settle`, `refund`).

- **Exact Numerator**: Count of postage requests returning successful completion (`200`, `201`), handled idempotency replay (`409`), or structured input validation errors (`422`) without unhandled database lock failures (`500` or transient storage timeout).
- **Exact Denominator**: Total count of postage requests processed (`path=~"/api/v1/postage.*"`).
- **Target**: **99.9%** success rate over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(api_requests_total{path=~"/api/v1/postage.*", status=~"2..|409|422"}[30d]))
  /
  sum(rate(api_requests_total{path=~"/api/v1/postage.*"}[30d]))
  ```
- **Programmatic Computation**: Executed via `computePostageTransitionSLI()` in `src/server/api/metrics.ts`.

---

### 5. Relay Delivery Availability SLI

Measures successful submission and delivery of encrypted envelopes through the relay network.

- **Exact Numerator**: Count of relay submissions resulting in successful delivery, acknowledgment (`ACKNOWLEDGED`), or handled deduplication (`DEDUPLICATED`) without 5xx errors.
- **Exact Denominator**: Total count of relay submission attempts.
- **Target**: **99.5%** delivery availability over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(relay_requests_total{delivery_state=~"ACKNOWLEDGED|DEDUPLICATED|DELIVERED", status!~"5.."}[30d]))
  /
  sum(rate(relay_requests_total{}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeRelayDeliverySLI()` in `src/server/api/metrics.ts`.

---

### 6. Chain Queue Reliability SLI

Measures durable background execution and Soroban contract invocation completion without terminal dead-lettering.

- **Exact Numerator**: Count of successfully processed durable background jobs.
- **Exact Denominator**: Total count of completed jobs plus terminal dead-letter records.
- **Target**: **99.9%** execution success rate over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(chain_queue_operations_total{outcome="success"}[30d]))
  /
  (sum(rate(chain_queue_operations_total{}[30d])) + sum(rate(chain_dead_letters_total{}[30d])))
  ```
- **Programmatic Computation**: Executed via `computeChainQueueSLI()` in `src/server/api/metrics.ts`.

---

### 7. Storage Availability SLI

Measures durability and read/write availability across Cloudflare R2, KV, and durable storage backends.

- **Exact Numerator**: Count of successful storage read, write, and delete operations returning non-5xx status.
- **Exact Denominator**: Total count of storage read, write, and delete operations.
- **Target**: **99.99%** availability over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(storage_operations_total{status!~"5..|error"}[30d]))
  /
  sum(rate(storage_operations_total{}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeStorageAvailabilitySLI()` in `src/server/api/metrics.ts`.

---

### 8. Account Provisioning SLI

Measures end-to-end user registration, username reservation, wallet linking, and profile initialization success.

- **Exact Numerator**: Count of successful provisioning step executions.
- **Exact Denominator**: Total count of provisioning step attempts.
- **Target**: **99.0%** success rate over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(provisioning_operations_total{outcome="success", status!~"5.."}[30d]))
  /
  sum(rate(provisioning_operations_total{}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeProvisioningSLI()` in `src/server/api/metrics.ts`.

---

### 9. Mailbox & Message Sync Availability SLI

Measures envelope polling, checkpoint advancing, and receipt indexing availability for active web mail clients.

- **Exact Numerator**: Count of sync requests processed without 5xx errors.
- **Exact Denominator**: Total count of sync requests processed.
- **Target**: **99.9%** availability over a 30-day rolling window.
- **PromQL Definition**:
  ```promql
  sum(rate(sync_operations_total{status!~"5.."}[30d]))
  /
  sum(rate(sync_operations_total{}[30d]))
  ```
- **Programmatic Computation**: Executed via `computeSyncAvailabilitySLI()` in `src/server/api/metrics.ts`.

---

## RED / USE Metrics Taxonomy & Trace Boundaries

To guarantee complete observability across all workflow stages, Hush implements the **RED** (Rate, Errors, Duration) and **USE** (Utilization, Saturation, Errors) frameworks with strict privacy constraints:

### 1. Stage Definitions & Trace Boundaries

| Stage          | Boundary Scope                                                     | Primary RED Metrics                                                                  | Primary USE Metrics                             |
| :------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------------------------- | :---------------------------------------------- |
| `auth`         | SEP-10 challenge, token issuance, session verification             | `auth_requests_total`, `auth_latency`, `auth_errors_total`                           | `auth_active_sessions`                          |
| `provisioning` | Username reservation, wallet linkage, key registration             | `provisioning_operations_total`, `provisioning_latency`, `provisioning_errors_total` | —                                               |
| `relay`        | Encrypted envelope submission, delivery transport, deduplication   | `relay_requests_total`, `relay_latency`, `relay_errors_total`                        | `relay_retry_count`                             |
| `storage`      | Cloudflare R2 / KV payload storage, metadata indexing              | `storage_operations_total`, `storage_latency`, `storage_errors_total`                | `storage_utilization_ratio`                     |
| `sync`         | Delta pull, cursor advancing, sequence checkpoint indexing         | `sync_operations_total`, `sync_latency`, `sync_errors_total`                         | `sync_gaps_detected_total`                      |
| `chain_queue`  | Durable job queue, Soroban contract calls, tx settlement           | `chain_queue_operations_total`, `chain_queue_latency`, `chain_queue_errors_total`    | `chain_queue_depth`, `chain_dead_letters_total` |
| `delivery`     | Send coordination: quote -> escrow -> relay -> anchor -> reconcile | `delivery_operations_total`, `delivery_latency`, `delivery_errors_total`             | `delivery_stage_transitions_total`              |

---

## Cardinality Budgets & Anti-Enumeration Privacy Protections

### 1. Strict Label Allowlists

All metric descriptors defined in `src/server/api/metrics.ts` enforce strict label allowlists. Any unapproved label key is rejected in development/testing and dropped in production.

### 2. Forbidden Label Patterns (Zero Tolerance)

- **Correspondent Addresses & Pairs**: User G-addresses, recipient addresses, and correspondent pairs MUST NEVER appear as metric labels. This prevents attackers from enumerating communication graphs or estimating user activity.
- **Plaintext & Ciphertext**: Message bodies, subject lines, snippet text, and ciphertext tokens are strictly prohibited.
- **Keys & Secrets**: Stellar S-seeds, recovery phrases, session cookies, and authorization headers are strictly prohibited.

### 3. Bounded Label Cardinality

Allowed labels are strictly bounded enums:

- `status`: HTTP status code strings (`200`, `401`, `409`, `422`, `429`, `500`, etc.).
- `stage`: Bounded stage identifiers (`auth`, `provisioning`, `relay`, `storage`, `sync`, `chain_queue`, `delivery`, `api`).
- `operation`: Bounded verb strings (`quote`, `submit`, `settle`, `refund`, `reserve`, `link`, `checkpoint`, etc.).
- `error_type` / `error_code`: Standard error taxonomy codes (`ERR_RPC_TIMEOUT`, `ERR_RATE_LIMITED`, `ERR_UNAUTHORIZED`, etc.).
- `backend`: Bounded storage targets (`r2`, `kv`, `memory`).

---

## Excluded Traffic Documentation

To prevent operational noise and metrics distortion, the following traffic categories are explicitly excluded from SLI numerators and denominators:

1. **Health Check Probes (`GET /api/v1/health`)**:
   - Automated Kubernetes/Cloudflare health checks running every 5 seconds.
   - Excluded via `path!~"/api/v1/health"`.
2. **Static OpenAPI Schema Documentation (`GET /api/v1/openapi.json`)**:
   - High-volume automated CI schema validation traffic.
   - Excluded via `path!~"/api/v1/openapi.json"`.
3. **Synthetic Load & E2E Testing Traffic**:
   - Load test runs and integration pipelines passing `x-stealth-synthetic: true` or metric label `synthetic="true"`.
   - Excluded by `options.excludeSynthetic` in `src/server/api/metrics.ts`.
4. **Cloudflare Edge WAF Blocks**:
   - Requests dropped or challenged at the Cloudflare edge layer prior to reaching the API origin Worker.

---

## Measurement Windows & Error Budget Management

### Rolling Windows

- **Primary SLO Window**: 30 days (720 hours) rolling window used for formal reliability tracking and reporting.
- **Short-Term Operational Window**: 5-minute and 1-hour sliding windows used for real-time alerting and error budget burn rate calculation.

### Error Budget Burn Rate Alerting

| Alert Severity       | Window  | Error Budget Consumed  | Burn Rate Multiplier | Action                                                     |
| :------------------- | :------ | :--------------------- | :------------------- | :--------------------------------------------------------- |
| **Page (Critical)**  | 1 hour  | 2.0% of 30-day budget  | **24.0x**            | Immediate incident escalation to primary engineer on call. |
| **Ticket (Warning)** | 6 hours | 5.0% of 30-day budget  | **6.0x**             | Create high-priority bug ticket for investigation.         |
| **Notice (Info)**    | 3 days  | 10.0% of 30-day budget | **1.0x**             | Review during weekly service reliability retrospective.    |

---

## Metrics Implementation & Programmatic Access

The in-memory metrics engine in `src/server/api/metrics.ts` exposes helper functions to compute SLIs programmatically from accumulated metrics snapshots:

```typescript
import {
  computeAvailabilitySLI,
  computeLatencySLI,
  computeAuthAvailabilitySLI,
  computePostageTransitionSLI,
  computeRelayDeliverySLI,
  computeChainQueueSLI,
  computeStorageAvailabilitySLI,
  computeProvisioningSLI,
  computeSyncAvailabilitySLI,
  computeSLOSummary,
} from "@/server/api/metrics";

// Calculate individual SLIs
const availability = computeAvailabilitySLI();
const relay = computeRelayDeliverySLI();
const chainQueue = computeChainQueueSLI();

// Calculate comprehensive summary across all stages
const summary = computeSLOSummary({ excludeSynthetic: true });
if (!summary.allMet) {
  console.warn("One or more SLO targets are breached:", summary);
}
```

---

## Related Runbooks & Documentation

- [Operational Alerts and Runbooks](ALERTS.md) - Diagnostic steps for auth spikes, relay failures, chain dead-letters, and storage alerts.
- [Prometheus Alert Rules](alerts.yaml) - Alert rule configurations.
- [Release Gates Checklist](RELEASE_GATES.md) - Pre-release validation rules.

## BETA-083 Capacity Guidance

Run the repeatable local gate with `LOAD_REPORT_PATH` set to a redacted JSON
artifact path:

```bash
LOAD_REPORT_PATH=test-results/beta-083-load.json bun run test:load
```

The harness exercises health reads, registration bursts, login abuse,
mailbox polling, malformed encrypted submissions, attachment authorization,
and concurrent settlement idempotency. The report contains only status codes,
latency percentiles, process memory deltas, CPU time, runtime versions, and
the configured API URL; it never records request bodies, credentials, tokens,
message content, or keys.

The checked-in CI budget is the beta starting ceiling: 10% maximum failure
rate, 1,200 ms p90, and 2,500 ms p99. Treat a breach as a release blocker.
Before increasing traffic, repeat the same suite against a production-like
stack and attach the report with user, message, and attachment volumes,
queue age/depth, storage operation rate, and RPC pressure from the platform
metrics. The next scaling trigger is any sustained budget breach, queue age
above the operator SLO, or resource saturation that leaves less than 30% headroom.
