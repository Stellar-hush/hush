# Operational Alerts and Operator Runbooks

This guide defines the authoritative alert definitions, investigation procedures, safe non-destructive mitigation workflows, rollback stop conditions, and recovery verification checklists for responding to beta failure modes across the Hush Mail platform.

For formal Service-Level Objectives (SLOs), mathematical SLI formulations, and error budget burn rate targets, see [Service-Level Objectives](SLO.md). For alert configuration rules, see [alerts.yaml](alerts.yaml).

---

## 1. Quick Reference: Beta Alert Matrix

| Alert Name                            | Severity   | Owner             | Primary Threshold                                                 | User Impact Statement                                                                    |
| :------------------------------------ | :--------- | :---------------- | :---------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **`StealthAuthAbuseSpike`**           | `critical` | `security-oncall` | $> 5\%$ auth error rate ($5\text{m}$)                             | Users experience login rejections, auth failures, or transient rate limits.              |
| **`StealthProvisioningFailureSpike`** | `critical` | `identity-oncall` | $> 1\%$ provisioning failure rate ($15\text{m}$)                  | New users cannot reserve handles, link Stellar wallets, or finish beta onboarding.       |
| **`StealthChainQueueAgeStalled`**     | `warning`  | `core-ops`        | Latency $> 5000\text{ms}$ or depth $> 250$ ($10\text{m}$)         | Settlements, delivery confirmations, and background transactions face high latency.      |
| **`StealthChainDeadLettersDetected`** | `critical` | `core-ops`        | $> 0$ dead letters ($10\text{m}$)                                 | Poison or failed operations exhaust retries and require operator manual triage.          |
| **`StealthStorageObjectErrorRate`**   | `critical` | `storage-oncall`  | $> 0.01\%$ 5xx storage error rate ($5\text{m}$)                   | Clients cannot fetch encrypted payloads, save attachments, or persist sync state.        |
| **`StealthIndexerGapsDetected`**      | `warning`  | `mailbox-oncall`  | Gaps $> 5/\text{s}$ or sync errors $> 1/\text{s}$ ($5\text{m}$)   | Mailboxes show missing incoming messages or out-of-order receipts until catch-up.        |
| **`StealthRpcFailuresSpike`**         | `critical` | `core-ops`        | $> 1\%$ RPC error rate or latency $> 3000\text{ms}$ ($5\text{m}$) | Contract invocations, wallet checks, and postage quotes fail or timeout.                 |
| **`StealthPolicyDriftDetected`**      | `warning`  | `policy-oncall`   | $> 0.5\%$ rule error or fallback rate ($5\text{m}$)               | Inbound mail admission rules fall back to conservative defaults instead of custom rules. |
| **`StealthRelaySendFailureSpike`**    | `critical` | `relay-oncall`    | $> 0.5\%$ relay delivery failure rate ($15\text{m}$)              | Outbound messages fail to dispatch to destination relays and enter retry queues.         |
| **`StealthSloBurnRateCritical`**      | `critical` | `sre-oncall`      | $1\text{h}$ burn $> 14.4\times$ or $6\text{h}$ burn $> 6.0\times$ | Critical user-facing availability degradation; rapid depletion of monthly error budget.  |

---

## 2. Privacy Safeguards & Diagnostic Standards

When triaging anomalies, operators must strictly avoid accessing, logging, or dumping sensitive user information.

### Prohibited Diagnostic Fields (DO NOT LOG, DUMP, OR EXPOSE)

- **Plaintext Message Content**: Never log, print, or store email subjects, message bodies, or unencrypted attachments.
- **Raw Ciphertext Envelopes**: Do not dump bulk raw ciphertext payloads or encryption keys into log collectors or tickets.
- **Stellar Private Keys / Seeds**: Never log, print, or transmit secret signing keys (`S...`), recovery seeds, or session secrets.
- **Account / Correspondent G-Addresses in Unbounded Metric Labels**: Prevent database bloat and correspondent enumeration by avoiding raw Stellar addresses in Prometheus metric labels.
- **Session Tokens / Bearer Credentials**: All tokens and cookies must be scrubbed (`[REDACTED_TOKEN]`).

### Safe Diagnostic Fields (USE FOR TRIAGE)

- **Support ID (`x-support-id` / `supportId`)**: Compact correlation identifier (e.g. `sup_4f8a12bc`) provided by users to index server traces without account disclosure.
- **Request Correlation ID (`x-request-id`)**: Distributed request tracking UUID.
- **W3C Trace Context (`traceparent` / `traceId` / `spanId`)**: Edge-to-worker distributed trace headers.
- **Error Codes & Taxonomy**: Standard taxonomy tags (`ERR_RPC_TIMEOUT`, `ERR_RATE_LIMITED`, `ERR_SIGNATURE_INVALID`).
- **HTTP Status Codes & Latency**: Aggregate response codes and execution duration in milliseconds.

---

## 3. Operator Runbooks by Failure Mode

---

### Runbook: Auth Abuse Spike

`StealthAuthAbuseSpike`

#### 1. Overview & Ownership

- **Alert Name**: `StealthAuthAbuseSpike`
- **Severity**: `critical`
- **Tier**: `api`
- **Owner**: `security-oncall`
- **User Impact**: Legitimate users may experience login failures, invalid signature rejections, or account lockout during active credential spraying or client signature drift.
- **Threshold**: Auth error rate (`401`, `403`, `409`, `429`, signature invalid, replay detected) $> 5\%$ of total auth requests over 5 minutes.
- **Deduplication**: Group by `tier="api"`, `alertname="StealthAuthAbuseSpike"`.
- **Silence Rule**: `alertname="StealthAuthAbuseSpike", environment="preview|test"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/auth-security/auth-metrics-and-abuse`

#### 2. PromQL Expression

```promql
(sum(rate(api_errors_total{status=~"401|403|409|429", path=~".*/auth.*"}[5m]))
/
sum(rate(api_requests_total{path=~".*/auth.*"}[5m]))) > 0.05
```

#### 3. Investigation Steps

1. Query auth error breakdown by structured error taxonomy:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (error_type, status) (rate(api_errors_total{path=~".*/auth.*"}[5m]))' | jq .
   ```
2. Verify if error spike is localized to a single client build or distributed across IPs:
   ```bash
   curl -s -H "Authorization: Bearer [REDACTED_CF_TOKEN]" \
     "https://api.cloudflare.com/client/v4/zones/[ZONE_ID]/security/events?limit=20" | jq '.result[] | {action, rule_id, client_as_number}'
   ```
3. Inspect NTP / Clock Skew on API edge workers and Stellar Horizon nodes:
   ```bash
   chronyc tracking
   ```

#### 4. Safe Non-Destructive Mitigation

- If caused by active credential spraying: Enable Cloudflare Managed Challenge or Managed IP Rate Limiting on `/api/v1/auth/*` routes.
- If caused by client signature canonicalization drift in a new web release: Trigger fast client rollback to previous pinned release.
- If caused by expired clock skew tolerance: Synchronize edge worker time anchors and verify `STEALTH_AUTH_CLOCK_SKEW_MS` configuration.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not block entire subnet IP ranges if legitimate users are collocated on major ISP ASNs.
- **Rollback Procedure**: Remove custom WAF rate limit overrides once auth error rate drops below 1%.

#### 6. Recovery Verification

```bash
# Verify health endpoint returns ready status and auth error rate is normal
curl -s -f "https://api.stealth.mail/api/v1/health?check=readiness" | jq .
```

---

### Runbook: Provisioning Failure Spike

`StealthProvisioningFailureSpike`

#### 1. Overview & Ownership

- **Alert Name**: `StealthProvisioningFailureSpike`
- **Severity**: `critical`
- **Tier**: `api`
- **Owner**: `identity-oncall`
- **User Impact**: New beta users are blocked from creating accounts, claiming usernames, or linking external wallets.
- **Threshold**: Provisioning error rate $> 1\%$ over 15 minutes.
- **Deduplication**: Group by `tier="api"`, `alertname="StealthProvisioningFailureSpike"`.
- **Silence Rule**: `alertname="StealthProvisioningFailureSpike", step="wallet_link_rejection"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/provisioning/account-provisioning-health`

#### 2. PromQL Expression

```promql
(sum(rate(api_errors_total{status=~"4..|5..", path=~".*/accounts.*|.*/onboarding.*|.*/users.*"}[15m]))
/
sum(rate(api_requests_total{path=~".*/accounts.*|.*/onboarding.*|.*/users.*"}[15m]))) > 0.01
```

#### 3. Investigation Steps

1. Identify failing provisioning steps (username reservation, wallet linking, key directory persistence):
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (path, error_type) (rate(api_errors_total{path=~".*/accounts.*|.*/onboarding.*|.*/users.*"}[5m]))' | jq .
   ```
2. Check if identity repository or KV namespace is rejecting writes or experiencing CAS concurrency conflicts:
   ```bash
   curl -s "https://api.stealth.mail/api/v1/health?check=readiness" | jq '.dependencies.storage'
   ```

#### 4. Safe Non-Destructive Mitigation

- If caused by duplicate handle claims: Verify canonical username sanitization and handle lock contention handling.
- If caused by unlinked or failed user bootstrap: Use the Admin Console (`/admin/users`) to review provisioning retry queues and trigger safe idempotent retries:
  ```bash
  curl -s -X POST "https://api.stealth.mail/api/v1/admin/users/USER_ID/provision/retry" \
    -H "Cookie: [ADMIN_SESSION]" \
    -H "Content-Type: application/json" \
    -d '{"reason":"Operator triage for failed provisioning step"}' | jq .
  ```

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Never force-overwrite username records or bypass CAS checks.
- **Rollback Procedure**: If a recent schema migration caused validation failure, follow [MIGRATIONS.md](MIGRATIONS.md) rollback steps.

#### 6. Recovery Verification

```bash
# Verify successful provisioning error rate drops below 1%
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(api_errors_total{path=~".*/accounts.*|.*/onboarding.*|.*/users.*"}[15m])) / sum(rate(api_requests_total{path=~".*/accounts.*|.*/onboarding.*|.*/users.*"}[15m])) < 0.01' | jq .
```

---

### Runbook: Chain Queue Age Stalled

`StealthChainQueueAgeStalled`

#### 1. Overview & Ownership

- **Alert Name**: `StealthChainQueueAgeStalled`
- **Severity**: `warning`
- **Tier**: `backend`
- **Owner**: `core-ops`
- **User Impact**: Asynchronous postage settlements, relay confirmations, and blockchain transactions experience high latency.
- **Threshold**: `chain_queue_latency > 5000ms` or `chain_queue_depth > 250` for 10 minutes.
- **Deduplication**: Group by `tier="backend"`, `queue_name`.
- **Silence Rule**: `alertname="StealthChainQueueAgeStalled", queue_name="non_critical_maintenance"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/chain-queues/soroban-and-job-queues`

#### 2. PromQL Expression

```promql
(chain_queue_latency > 5000) or (chain_queue_depth > 250)
```

#### 3. Investigation Steps

1. Inspect current queue depth and processing worker throughput across queue partitions:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=chain_queue_depth' | jq .
   ```
2. Check Soroban RPC fee market congestion and transaction submission latency:
   ```bash
   curl -s -X POST "https://soroban-testnet.stellar.org" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | jq .
   ```

#### 4. Safe Non-Destructive Mitigation

- Scale worker concurrency limit in worker configuration if memory and CPU bounds permit.
- If upstream Soroban network fee base has risen, adjust transaction fee bid multiplier within allowable policy envelope.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not increase worker concurrency beyond database/KV connection pool limits.
- **Rollback Procedure**: Revert concurrency overrides if storage latency spikes above 100ms.

#### 6. Recovery Verification

```bash
# Verify queue depth returns under 50 and latency drops under 1000ms
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=chain_queue_depth < 50' | jq .
```

---

### Runbook: Chain Dead Letters Detected

`StealthChainDeadLettersDetected`

#### 1. Overview & Ownership

- **Alert Name**: `StealthChainDeadLettersDetected`
- **Severity**: `critical`
- **Tier**: `backend`
- **Owner**: `core-ops`
- **User Impact**: Specific messages or postage settlement transactions failed permanently after exhausting retries and need operator inspection.
- **Threshold**: Dead letters recorded $> 0$ over a 10-minute window (`sum(rate(chain_dead_letters_total[10m])) > 0`).
- **Deduplication**: Group by `tier="backend"`, `job_type`, `error_code`.
- **Silence Rule**: `alertname="StealthChainDeadLettersDetected", job_type="test_mock"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/dlq/dead-letter-triage`

#### 2. PromQL Expression

```promql
sum(rate(chain_dead_letters_total[10m])) > 0
```

#### 3. Investigation Steps

1. Inspect dead letter jobs safely using Admin API or Admin Console without exposing raw payload bytes:
   ```bash
   # Query dead letters via authenticated admin endpoint (payloads masked under .data.deadLetters)
   curl -s "https://api.stealth.mail/api/v1/admin/dlq?limit=10" \
     -H "Cookie: [ADMIN_SESSION]" | jq '.data.deadLetters[] | {id, jobType, errorCode, attempts, createdAt}'
   ```
2. Aggregate error codes responsible for dead-lettering:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (job_type, error_code) (chain_dead_letters_total)' | jq .
   ```

#### 4. Safe Non-Destructive Mitigation

- If dead letters were caused by a temporary RPC outage that has now resolved: Retry the dead letter by its specific ID:

  ```bash
  # Retry individual DLQ entry by ID with mutation reason
  curl -s -X POST "https://api.stealth.mail/api/v1/admin/dlq/JOB_ID/retry" \
    -H "Cookie: [ADMIN_SESSION]" \
    -H "Content-Type: application/json" \
    -d '{"reason":"RPC network recovered, replaying dead letter"}' | jq .

  # Or batch retry entries matching a specific error code
  for id in $(curl -s "https://api.stealth.mail/api/v1/admin/dlq?limit=50" -H "Cookie: [ADMIN_SESSION]" | jq -r '.data.deadLetters[] | select(.errorCode=="ERR_RPC_TIMEOUT") | .id'); do
    curl -s -X POST "https://api.stealth.mail/api/v1/admin/dlq/$id/retry" \
      -H "Cookie: [ADMIN_SESSION]" \
      -H "Content-Type: application/json" \
      -d '{"reason":"Batch retry after RPC recovery"}'
  done
  ```

- If dead letters were caused by malformed/unsupported client payload format: Abandon individual poisoned items with audit log reason:
  ```bash
  curl -s -X POST "https://api.stealth.mail/api/v1/admin/dlq/JOB_ID/abandon" \
    -H "Cookie: [ADMIN_SESSION]" \
    -H "Content-Type: application/json" \
    -d '{"reason":"Irrecoverable schema violation in deprecated beta draft"}' | jq .
  ```

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Never bulk-retry dead letters without validating that the root cause (e.g., smart contract revert, invalid signature) is resolved.
- **Rollback Procedure**: Pause DLQ worker retry loop if retry error rate exceeds 20%.

#### 6. Recovery Verification

```bash
# Verify dead letter rate returns to 0
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(chain_dead_letters_total[10m])) == 0' | jq .
```

---

### Runbook: Storage Object Error Rate

`StealthStorageObjectErrorRate`

#### 1. Overview & Ownership

- **Alert Name**: `StealthStorageObjectErrorRate`
- **Severity**: `critical`
- **Tier**: `storage`
- **Owner**: `storage-oncall`
- **User Impact**: Users cannot read encrypted message payloads, download attachments, or persist mailbox sync records.
- **Threshold**: Storage 5xx error rate $> 0.01\%$ ($0.0001$ ratio) over 5 minutes.
- **Deduplication**: Group by `tier="storage"`, `backend`.
- **Silence Rule**: `alertname="StealthStorageObjectErrorRate", backend="memory"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/storage/r2-and-kv-storage-reliability`

#### 2. PromQL Expression

```promql
(sum(rate(api_errors_total{status=~"5..", path=~".*/storage.*|.*/envelopes.*|.*/blobs.*"}[5m]))
/
sum(rate(api_requests_total{path=~".*/storage.*|.*/envelopes.*|.*/blobs.*"}[5m]))) > 0.0001
```

#### 3. Investigation Steps

1. Identify failing storage routes and operations (`read`, `write`, `delete`, `head` on `r2` or `kv`):
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (path, error_type) (rate(api_errors_total{status=~"5..", path=~".*/storage.*|.*/envelopes.*"}[5m]))' | jq .
   ```
2. Check Cloudflare status page and KV / R2 incident feeds for regional degradation.
3. Validate storage binding readiness via repository diagnostic probe:
   ```bash
   curl -s "https://api.stealth.mail/api/v1/health?check=readiness" | jq '.dependencies.storage'
   ```

#### 4. Safe Non-Destructive Mitigation

- If primary R2 storage region is degraded: Activate secondary backup object store bucket fallback if configured.
- If KV write rate limits are exceeded: Enable local in-memory caching for frequently read immutable public keys and static configurations.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not attempt blind database or bucket deletion scripts.
- **Rollback Procedure**: Revert storage routing overrides once Cloudflare provider status returns to normal.

#### 6. Recovery Verification

```bash
# Verify readiness storage status is "ok" and error rate is <= 0.0001
curl -s -f "https://api.stealth.mail/api/v1/health?check=readiness" | jq '.dependencies.storage == "ok"'
```

---

### Runbook: Indexer Gaps Detected

`StealthIndexerGapsDetected`

#### 1. Overview & Ownership

- **Alert Name**: `StealthIndexerGapsDetected`
- **Severity**: `warning`
- **Tier**: `sync`
- **Owner**: `mailbox-oncall`
- **User Impact**: Mailbox clients may experience out-of-order delivery receipts or missing messages until sequence catch-up completes.
- **Threshold**: Sync sequence gaps $> 5/\text{s}$ or sync errors $> 1/\text{s}$ over 5 minutes.
- **Deduplication**: Group by `tier="sync"`, `stream_type`.
- **Silence Rule**: `alertname="StealthIndexerGapsDetected", stream_type="ephemeral_preview"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/sync/mailbox-indexing-and-sync`

#### 2. PromQL Expression

```promql
(sum(rate(sync_gaps_detected_total[5m])) > 5) or (sum(rate(sync_errors_total[5m])) > 1)
```

#### 3. Investigation Steps

1. Query gap count by sync stream:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (stream_type) (rate(sync_gaps_detected_total[5m]))' | jq .
   ```
2. Verify if receipt indexing coordinator is encountering checkpoint sequence out-of-order commits:
   ```bash
   curl -s "https://api.stealth.mail/api/v1/health?check=readiness" | jq '.dependencies.coordinator'
   ```

#### 4. Safe Non-Destructive Mitigation

- Trigger safe checkpoint rewind on affected sync streams within allowable bounds (`maxRewindLimit=100`).
- Re-index pending receipts from durable storage checkpoints.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Never rewind checkpoints past maximum retention limits or force-delete existing sync cursors.
- **Rollback Procedure**: Reset rewind parameters if indexer sync rate does not converge within 10 minutes.

#### 6. Recovery Verification

```bash
# Verify sync gaps rate drops to 0
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(sync_gaps_detected_total[5m])) == 0' | jq .
```

---

### Runbook: Soroban / Stellar RPC Failures Spike

`StealthRpcFailuresSpike`

#### 1. Overview & Ownership

- **Alert Name**: `StealthRpcFailuresSpike`
- **Severity**: `critical`
- **Tier**: `blockchain`
- **Owner**: `core-ops`
- **User Impact**: Wallet link verification, contract postage fee settlement, and transaction validations timeout or fail.
- **Threshold**: RPC error rate $> 1\%$ of total requests or latency $> 3000\text{ms}$ over 5 minutes.
- **Deduplication**: Group by `tier="blockchain"`, `endpoint`.
- **Silence Rule**: `alertname="StealthRpcFailuresSpike", network="futurenet"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/stellar/soroban-rpc-status`

#### 2. PromQL Expression

```promql
((sum(rate(api_errors_total{error_type=~"ERR_RPC_TIMEOUT|ERR_RPC_UNAVAILABLE|ERR_RPC_FAILED"}[5m]))
/
sum(rate(api_requests_total[5m]))) > 0.01)
or
(histogram_quantile(0.95, sum(rate(api_latency_bucket{path=~".*/postage.*|.*/rpc.*"}[5m])) by (le)) > 3000)
```

#### 3. Investigation Steps

1. Test primary Soroban RPC endpoint responsiveness:
   ```bash
   curl -s -X POST "https://soroban-testnet.stellar.org" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .
   ```
2. Test Horizon RPC endpoint responsiveness:
   ```bash
   curl -s -f "https://horizon-testnet.stellar.org/fee_stats" | jq .
   ```

#### 4. Safe Non-Destructive Mitigation

- Fail over to secondary fallback RPC endpoints configured in runtime environment (`STEALTH_SOROBAN_RPC_FALLBACK_URL`, `STEALTH_HORIZON_FALLBACK_URL`).
- Adjust RPC timeout window from $1000\text{ms}$ to $3000\text{ms}$ temporarily during Stellar network congestion events.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not route RPC traffic to untrusted public node endpoints without TLS validation.
- **Rollback Procedure**: Revert to primary SDF RPC endpoints once upstream latency returns below $500\text{ms}$.

#### 6. Recovery Verification

```bash
# Verify RPC errors drop below 0.1%
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(api_errors_total{error_type=~"ERR_RPC.*"}[5m])) == 0' | jq .
```

---

### Runbook: Policy Drift Detected

`StealthPolicyDriftDetected`

#### 1. Overview & Ownership

- **Alert Name**: `StealthPolicyDriftDetected`
- **Severity**: `warning`
- **Tier**: `api`
- **Owner**: `policy-oncall`
- **User Impact**: Inbound messages may be evaluated against fallback conservative rules rather than customized recipient sender policies.
- **Threshold**: Policy validation error (`422`) or admission fallback rate $> 0.5\%$ over 5 minutes.
- **Deduplication**: Group by `tier="api"`, `alertname="StealthPolicyDriftDetected"`.
- **Silence Rule**: `alertname="StealthPolicyDriftDetected", environment="test"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/policy/mailbox-policy-admission`

#### 2. PromQL Expression

```promql
(sum(rate(api_errors_total{status="422", path=~".*/policy.*"}[5m]))
/
sum(rate(api_requests_total{path=~".*/policy.*"}[5m]))) > 0.005
```

#### 3. Investigation Steps

1. Query policy admission rule error breakdown:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (error_type) (rate(api_errors_total{path=~".*/policy.*"}[5m]))' | jq .
   ```
2. Inspect schema version of active policy records against supported contract versions.

#### 4. Safe Non-Destructive Mitigation

- Deploy policy migration forward-fix for deprecated rule attributes using schema runner:
  ```bash
  npm run migrations:forward
  ```
- Ensure relay policy admission engine activates default fail-safe `VERIFY` challenge on unrecognized rules instead of dropping messages.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not disable policy admission checks; maintain default safe verification.
- **Rollback Procedure**: Revert policy ruleset if validation errors persist after forward migration.

#### 6. Recovery Verification

```bash
# Verify policy admission error rate drops below 0.1%
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(api_errors_total{path=~".*/policy.*"}[5m])) / sum(rate(api_requests_total{path=~".*/policy.*"}[5m])) < 0.001' | jq .
```

---

### Runbook: Relay Send Failure Spike

`StealthRelaySendFailureSpike`

#### 1. Overview & Ownership

- **Alert Name**: `StealthRelaySendFailureSpike`
- **Severity**: `critical`
- **Tier**: `relay`
- **Owner**: `relay-oncall`
- **User Impact**: Outbound encrypted messages fail to dispatch to recipient mail relays and accumulate in retry queues.
- **Threshold**: Outbound relay delivery failure rate $> 0.5\%$ over 15 minutes.
- **Deduplication**: Group by `tier="relay"`, `stage`.
- **Silence Rule**: `alertname="StealthRelaySendFailureSpike", stage="dry_run"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/relay/relay-delivery-pipeline`

#### 2. PromQL Expression

```promql
(sum(rate(api_errors_total{status=~"5..", path=~".*/relay.*|.*/send.*"}[15m]))
/
sum(rate(api_requests_total{path=~".*/relay.*|.*/send.*"}[15m]))) > 0.005
```

#### 3. Investigation Steps

1. Query relay error rate grouped by path and error taxonomy:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (path, error_type) (rate(api_errors_total{path=~".*/relay.*|.*/send.*"}[5m]))' | jq .
   ```
2. Verify relay node health and transport circuit breaker status:
   ```bash
   curl -s -f "https://relay-testnet.stealth.mail/health" | jq .
   ```

#### 4. Safe Non-Destructive Mitigation

- If primary relay node is unresponsive: Fail over to secondary relay endpoints in runtime configuration (`STEALTH_RELAY_URL=https://relay-backup.stealth.mail`).
- Background send coordinator automatically enqueues failed dispatches into `relay_retry_queue` with exponential backoff.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not drop unsent messages; ensure all non-deliverable envelopes remain safely persisted in the retry queue.
- **Rollback Procedure**: Revert relay endpoint overrides after primary relay cluster recovers.

#### 6. Recovery Verification

```bash
# Verify Relay Delivery SLI is met (>= 99.5%)
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(api_requests_total{path=~".*/relay.*", status=~"2.."}[15m])) / sum(rate(api_requests_total{path=~".*/relay.*"}[15m])) >= 0.995' | jq .
```

---

### Runbook: Multi-Window SLO Error Budget Burn Rate

`StealthSloBurnRateCritical`

#### 1. Overview & Ownership

- **Alert Name**: `StealthSloBurnRateCritical`
- **Severity**: `critical`
- **Tier**: `slo`
- **Owner**: `sre-oncall`
- **User Impact**: Severe user-visible API availability outage; rapidly exhausting monthly 99.9% reliability error budget.
- **Threshold**: 1-hour burn rate $> 14.4\times$ ($2\%$ budget consumed in 1 hr) OR 6-hour burn rate $> 6.0\times$ ($5\%$ budget consumed in 6 hrs).
- **Deduplication**: Group by `tier="slo"`, `sli_name`.
- **Silence Rule**: `alertname="StealthSloBurnRateCritical", environment="preview"`.
- **Safe Dashboard**: `https://grafana.stealth.mail/d/slo/error-budget-and-burn-rates`

#### 2. PromQL Expression

```promql
(sum(rate(api_errors_total{status=~"5..", path!~"/api/v1/health|/api/v1/openapi.json", synthetic!="true"}[1h])) / sum(rate(api_requests_total{path!~"/api/v1/health|/api/v1/openapi.json", synthetic!="true"}[1h])) > (14.4 * (1 - 0.999)))
or
(sum(rate(api_errors_total{status=~"5..", path!~"/api/v1/health|/api/v1/openapi.json", synthetic!="true"}[6h])) / sum(rate(api_requests_total{path!~"/api/v1/health|/api/v1/openapi.json", synthetic!="true"}[6h])) > (6.0 * (1 - 0.999)))
```

#### 3. Investigation Steps

1. Identify which SLIs are degraded across all core indicators:
   ```bash
   curl -s "https://api.stealth.mail/api/v1/health?check=readiness" | jq .
   ```
2. Trace 5xx error distribution across API routes:
   ```bash
   curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
     --data-urlencode 'query=sum by (path, status) (rate(api_errors_total{status=~"5..", path!~"/api/v1/health|/api/v1/openapi.json"}[15m]))' | jq .
   ```

#### 4. Safe Non-Destructive Mitigation

- Halt all in-flight deployments or feature flag rollouts immediately.
- If caused by a bad edge worker release: Execute immediate rollback to previous pinned release.
- If caused by downstream storage/RPC degradation: Engage respective service on-call teams and enable degraded-state banners on client apps.

#### 5. Stop Conditions & Rollback

- **Stop Condition**: Do not resume normal release pipelines until error budget consumption stabilizes and 1-hour burn rate drops below $1.0\times$.
- **Rollback Procedure**: Revert to the last known stable deployment tag.

#### 6. Recovery Verification

```bash
# Verify API Availability SLI is >= 99.9% and 1-hour burn rate is <= 1.0x
curl -s -G "http://prometheus.monitoring.svc:9090/api/v1/query" \
  --data-urlencode 'query=sum(rate(api_requests_total{status!~"5..", path!~"/api/v1/health|/api/v1/openapi.json"}[1h])) / sum(rate(api_requests_total{path!~"/api/v1/health|/api/v1/openapi.json"}[1h])) >= 0.999' | jq .
```

---

## 4. Synthetic Alert Simulation & Operator Testing

Operators can safely exercise and verify the complete alerting and recovery loop in staging or local environments using repeatable synthetic test probes.

### Automated Synthetic Probe Generator

Run the automated alert and health verification test suite:

```bash
# Execute automated alert test suite
npx vitest run tests/unit/api/alerts.test.ts
```

### Manual Synthetic Alert Injections (Redacted & Safe)

```bash
# 1. Trigger Synthetic Auth Abuse Spike
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "x-stealth-address: invalid-address-format" \
    https://api.stealth.mail/api/v1/auth/session
done

# 2. Trigger Synthetic Health Readiness Check
curl -s "https://api.stealth.mail/api/v1/health?check=readiness" | jq .

# 3. Simulate Metric Push to Prometheus Pushgateway
cat <<EOF | curl -s --data-binary @- http://pushgateway.monitoring.svc:9091/metrics/job/stealth_synthetic_test
api_errors_total{path="/api/v1/auth/session",status="401",error_type="ERR_UNAUTHORIZED"} 50
api_requests_total{path="/api/v1/auth/session",status="401"} 50
api_requests_total{path="/api/v1/auth/session",status="200"} 50
EOF
```
