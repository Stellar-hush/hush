import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  runLoadTest,
  generateRandomAddress,
  generateRandomHash,
  type LoadTestResult,
} from "./harness";
import { evaluateBudget } from "./budget";

const API_URL = process.env.API_URL || "http://localhost:5173";
const SCALE = Math.max(1, Number(process.env.LOAD_SCENARIO_SCALE ?? 1));
console.log(`\n🚀 Starting Load Test Suite targeting ${API_URL}`);

const evidence: Array<{
  name: string;
  result: LoadTestResult;
}> = [];

function record(name: string, result: LoadTestResult) {
  evidence.push({ name, result });
}

function redactedApiOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid-url";
  }
}

function registrationBody(index: number) {
  const suffix = `${Date.now()}-${index}`;
  return {
    displayName: `Load User ${index}`,
    email: `load-${suffix}@stealth.mail`,
    username: `load_${suffix.replace(/[^a-z0-9]/g, "").slice(-20)}`,
    password: "LoadTestPassword2026",
    passwordConfirmation: "LoadTestPassword2026",
    termsVersion: "2026-01",
    privacyPolicyVersion: "2026-01",
  };
}

async function scenarioBurstReads() {
  const result = await runLoadTest(
    "Burst Reads (Health)",
    () => ({
      url: `${API_URL}/api/v1/health`,
      method: "GET",
    }),
    15,
    100,
  );

  evaluateBudget("Burst Reads (Health)", result, {
    minSuccesses: 1,
    enforceFailureRate: true,
  });
  return result;
}

async function scenarioRateLimits() {
  const result = await runLoadTest(
    "Burst Login (Rate Limits)",
    () => ({
      url: `${API_URL}/api/v1/auth/login`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: {
        identifier: "load-test@stealth.mail",
        password: "wrong-password",
      },
    }),
    15,
    100,
  );

  evaluateBudget("Burst Login (Rate Limits)", result, {
    minSuccesses: 0,
    enforceFailureRate: false,
    requireRateLimit: true,
  });
  return result;
}

async function scenarioRegistrationBurst() {
  const result = await runLoadTest(
    "Registration Burst",
    (index) => ({
      url: `${API_URL}/api/v1/auth/register`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `198.51.100.${(index % 10) + 1}`,
        "user-agent": "Hush-Beta-083-Load",
      },
      body: registrationBody(index),
    }),
    Math.min(10, 5 * SCALE),
    5 * SCALE,
  );

  evaluateBudget("Registration Burst", result, {
    allowedStatuses: [201, 429],
  });
  return result;
}

async function scenarioMailboxPolling() {
  const result = await runLoadTest(
    "Mailbox Polling (Unauthenticated Denial)",
    (index) => ({
      url: `${API_URL}/api/v1/mailbox/sync?limit=${Math.min(50, index + 1)}`,
      method: "GET",
    }),
    10,
    25 * SCALE,
  );

  evaluateBudget("Mailbox Polling (Unauthenticated Denial)", result, {
    minSuccesses: 0,
    enforceFailureRate: false,
    allowedStatuses: [401],
  });
  return result;
}

async function scenarioMessageSubmission() {
  const result = await runLoadTest(
    "Encrypted Message Submission (Malformed Denial)",
    () => ({
      url: `${API_URL}/api/v1/relay/messages`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {},
    }),
    10,
    25 * SCALE,
  );

  evaluateBudget("Encrypted Message Submission (Malformed Denial)", result, {
    minSuccesses: 0,
    enforceFailureRate: false,
    allowedStatuses: [400, 422, 503],
  });
  return result;
}

async function scenarioAttachments() {
  const result = await runLoadTest(
    "Attachment Upload (Unauthenticated Denial)",
    () => ({
      url: `${API_URL}/api/v1/attachments/initiate`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        message_id: generateRandomHash(),
        attachments: [
          {
            filename: "load.bin",
            content_type: "application/octet-stream",
            size_bytes: 32,
            content_hash: generateRandomHash(),
            total_chunks: 1,
          },
        ],
      },
    }),
    10,
    25 * SCALE,
  );

  evaluateBudget("Attachment Upload (Unauthenticated Denial)", result, {
    minSuccesses: 0,
    enforceFailureRate: false,
    allowedStatuses: [401],
  });
  return result;
}

async function scenarioConcurrentTransitions() {
  const owner = generateRandomAddress();
  const sender = generateRandomAddress();
  const messageId = generateRandomHash();
  const paymentHash = generateRandomHash();

  console.log(`\n▶ Preparing Concurrent Transitions: Creating pending postage...`);
  const requestHeaders = {
    "x-stealth-address": sender,
    "x-forwarded-for": "192.0.2.1",
    "user-agent": "Hush-Beta-083-Load",
    "Content-Type": "application/json",
  };
  const quoteRes = await fetch(`${API_URL}/api/v1/postage/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient: owner, sender, messageId }),
  });
  if (quoteRes.status !== 200) {
    throw new Error(`Concurrent Settlement setup quote failed with HTTP ${quoteRes.status}`);
  }
  const quoteBody = (await quoteRes.json()) as {
    data?: {
      amount: string;
      asset: string;
      policyVersion: number;
      network: string;
      issuedAt: string;
      expiresAt: string;
      digest: string;
    };
  };
  if (!quoteBody.data) throw new Error("Concurrent Settlement setup quote returned no data");

  const createRes = await fetch(`${API_URL}/api/v1/postage/`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({
      messageId,
      paymentHash,
      sender,
      recipient: owner,
      amount: quoteBody.data.amount,
      asset: quoteBody.data.asset,
      policyVersion: quoteBody.data.policyVersion,
      network: quoteBody.data.network,
      issuedAt: quoteBody.data.issuedAt,
      expiresAt: quoteBody.data.expiresAt,
      quoteDigest: quoteBody.data.digest,
    }),
  });
  if (createRes.status !== 201) {
    throw new Error(`Concurrent Settlement setup submission failed with HTTP ${createRes.status}`);
  }

  // Concurrent settlement race condition test
  // We blast 20 concurrent settle requests for the *same* messageId.
  // We assert that exactly 1 should succeed (200 OK) while all others fail (409 Conflict),
  // ensuring no duplicate terminal transitions occur.
  const result = await runLoadTest(
    "Concurrent Settlement (Race Condition)",
    () => ({
      url: `${API_URL}/api/v1/postage/${messageId}/settle`,
      method: "POST",
      headers: {
        "x-stealth-address": owner,
        "x-forwarded-for": `${Math.floor(Math.random() * 255)}.${Math.floor(
          Math.random() * 255,
        )}.0.1`,
        "user-agent": `LoadTester-${Math.random()}`,
      },
    }),
    20, // Blast them all at once
    20,
  );

  const successfulSettlements = result.statusCodes[200] ?? 0;
  const conflictSettlements = result.statusCodes[409] ?? 0;
  if (successfulSettlements !== 1 || conflictSettlements !== 19) {
    throw new Error(
      `Concurrent Settlement expected exactly 1 success and 19 conflicts, got ${successfulSettlements} successes and ${conflictSettlements} conflicts`,
    );
  }
  console.log(
    "\n✅ PASSED: Exactly one settlement succeeded and all concurrent replays conflicted.",
  );

  evaluateBudget("Concurrent Settlement (Race Condition)", result, {
    minSuccesses: 1,
    enforceFailureRate: false,
    allowedStatuses: [200, 409],
  });
  return result;
}

async function scenarioAuth() {
  const invalidAddress = "invalid-address";

  // Test rejection of rapid unauthorized/invalid requests
  const result = await runLoadTest(
    "Authentication Failures",
    () => ({
      url: `${API_URL}/api/v1/policies/evaluate`,
      method: "POST",
      headers: {
        "x-stealth-address": invalidAddress,
        "Content-Type": "application/json",
      },
      body: { sender: invalidAddress, recipient: generateRandomAddress() },
    }),
    10,
    100,
  );

  evaluateBudget("Authentication Failures", result, {
    minSuccesses: 0,
    enforceFailureRate: false,
  });
  return result;
}

async function main() {
  try {
    record("Burst Reads (Health)", await scenarioBurstReads());
    record("Burst Login (Rate Limits)", await scenarioRateLimits());
    record("Registration Burst", await scenarioRegistrationBurst());
    record("Mailbox Polling (Unauthenticated Denial)", await scenarioMailboxPolling());
    record("Encrypted Message Submission (Malformed Denial)", await scenarioMessageSubmission());
    record("Attachment Upload (Unauthenticated Denial)", await scenarioAttachments());
    record("Authentication Failures", await scenarioAuth());
    record("Concurrent Settlement (Race Condition)", await scenarioConcurrentTransitions());

    const report = {
      issue: "BETA-083",
      apiOrigin: redactedApiOrigin(API_URL),
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      bunVersion: process.env.BUN_VERSION ?? "unknown",
      scenarios: evidence,
    };
    const reportPath = process.env.LOAD_REPORT_PATH;
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(`\nEvidence report written to ${reportPath}`);
    }

    console.log("\n🎉 All load test scenarios completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Load test suite failed:", err);
    process.exit(1);
  }
}

main();
