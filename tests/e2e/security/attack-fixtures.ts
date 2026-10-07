/**
 * Stable fixture factory for the Hush security regression suite.
 *
 * All actors use deterministic fake Stellar public-key-shaped addresses so that
 * fixtures are stable across CI runs and no live credentials are required.
 *
 * Security contract:
 *   - No real private keys, seeds, passwords, or production credentials.
 *   - All addresses are syntactically valid G-addresses but are NOT funded on
 *     any live Stellar network.
 *   - Live-mode tests that require real accounts must supply secrets via
 *     environment variables and MUST NOT commit them to this file.
 *
 * BETA-084 / #1991
 */

// ---------------------------------------------------------------------------
// Actor addresses
// ---------------------------------------------------------------------------

/** Alice — the legitimate owner. She is the resource owner in every test. */
export const ALICE = `G${"A".repeat(55)}`;

/** Bob — the attacker. He attempts to read or mutate Alice's resources. */
export const BOB = `G${"B".repeat(55)}`;

/** Carol — a third party. Used for relay queue isolation tests. */
export const CAROL = `G${"C".repeat(55)}`;

/** Dave — used for delegation / privilege-escalation vectors. */
export const DAVE = `G${"D".repeat(55)}`;

// ---------------------------------------------------------------------------
// Alternate-form attack inputs (canonicalization tests)
// ---------------------------------------------------------------------------

/** Alice's address with leading whitespace — padding attack variant. */
export const ALICE_PADDED = ` ${ALICE}`;

/** Alice's address lowercased — case-bypass attack variant. */
export const ALICE_LOWERCASE = ALICE.toLowerCase();

/** Alice's address with a trailing newline — whitespace-suffix attack. */
export const ALICE_TRAILING_NL = `${ALICE}\n`;

// ---------------------------------------------------------------------------
// Resource identifiers
// ---------------------------------------------------------------------------

/** Deterministic draft ID belonging to Alice. */
export const ALICE_DRAFT_ID = "draft_alice_001";

/** Deterministic contact ID belonging to Alice. */
export const ALICE_CONTACT_ID = "contact_alice_001";

/** Deterministic message ID used in envelope and receipt tests. */
export const MESSAGE_ID = "a".repeat(64);

/** Deterministic request ID for sender-request tests. */
export const REQUEST_ID = "00000000-0000-4000-8000-000000000001";

// ---------------------------------------------------------------------------
// Fake envelope / attachment stubs
// ---------------------------------------------------------------------------

/** Minimal sealed-envelope payload shape for IDOR tests (no real crypto). */
export interface FakeEnvelopePayload {
  version: "v1";
  sender: string;
  recipient: string;
  ciphertext: string;
  content_commitment: string;
}

/**
 * Build a fake envelope stub addressed to {@link recipient}.
 * The ciphertext and commitment are deterministic hex strings — not real crypto.
 */
export function makeFakeEnvelope(sender: string, recipient: string): FakeEnvelopePayload {
  return {
    version: "v1",
    sender,
    recipient,
    ciphertext: "f".repeat(128),
    content_commitment: `v1:sha256:hex:${"0".repeat(64)}`,
  };
}

// ---------------------------------------------------------------------------
// Policy body stub
// ---------------------------------------------------------------------------

/** Minimal policy body for PUT /api/v1/policies/:owner tests. */
export const POLICY_BODY = {
  allowUnknown: true,
  minimumPostage: "500",
  requireVerified: false,
};

// ---------------------------------------------------------------------------
// Helper: build a Request to an API route with optional actor header
// ---------------------------------------------------------------------------

/** Standard actor header name (mirrors src/server/api/actor.ts). */
export const ACTOR_HEADER_NAME = "x-stealth-address";

/**
 * Build a fetch Request for API route testing.
 *
 * @param path  Pathname, e.g. "/api/v1/policies/GAAA..."
 * @param method HTTP method.
 * @param actor  If provided, sets the x-stealth-address header.
 * @param body   If provided, JSON-serialized as the request body.
 */
export function makeRequest(path: string, method: string, actor?: string, body?: unknown): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (actor !== undefined) {
    headers[ACTOR_HEADER_NAME] = actor;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`https://stealth.test${path}`, init);
}
