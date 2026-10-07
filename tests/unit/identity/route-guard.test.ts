import { describe, expect, it } from "vitest";

import type { BootstrapBranch, BootstrapData } from "@/features/identity/bootstrap";
import {
  deriveGateState,
  ONBOARDING_ROUTE,
  resolveRouteGuard,
  SIGN_IN_ROUTE,
  type GateState,
  type GuardDecision,
} from "@/features/identity/route-guard";
import { validateReturnTo } from "@/features/identity/returnTo";

function makeBootstrapData(overrides: Partial<BootstrapData> = {}): BootstrapData {
  return {
    user: {
      userId: "user_guard_1",
      username: "guarduser",
      displayName: "Guard User",
      email: "guard@stealth.mail",
      accountStatus: "active",
      createdAt: new Date().toISOString(),
    },
    session: {
      sessionId: "sess_guard_1",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    address: "user_guard_1",
    provisioning: null,
    policy: null,
    wallet: {
      connected: true,
      address: "user_guard_1",
      signerType: "managed",
      capabilities: ["sign"],
      network: "testnet",
      balanceXlm: "100.0000000",
    },
    health: {
      ready: true,
      status: "ok",
      dependencies: { bindings: "ok" },
    },
    syncCursor: "sync_1",
    featureFlags: {},
    branch: "active",
    ...overrides,
  };
}

describe("deriveGateState (server bootstrap -> definite gate state)", () => {
  const cases: Array<{
    branch: BootstrapBranch;
    data?: BootstrapData | null;
    expected: GateState;
  }> = [
    { branch: "loading", expected: "loading" },
    { branch: "unauthorized", expected: "anonymous" },
    { branch: "suspended", expected: "suspended" },
    { branch: "outage", expected: "outage" },
    { branch: "maintenance", expected: "outage" },
    { branch: "onboarding", expected: "onboarding" },
    { branch: "active", data: null, expected: "active" },
    { branch: "active", data: makeBootstrapData(), expected: "active" },
    {
      branch: "active",
      data: makeBootstrapData({ provisioning: { status: "active", currentStep: "done" } }),
      expected: "active",
    },
    {
      branch: "active",
      data: makeBootstrapData({ provisioning: { status: "pending", currentStep: "wallet" } }),
      expected: "verified",
    },
    {
      branch: "active",
      data: makeBootstrapData({ provisioning: { status: "retryable", currentStep: "funding" } }),
      expected: "verified",
    },
    {
      branch: "active",
      data: makeBootstrapData({
        provisioning: { status: "active", currentStep: "done" },
        onboarding: {
          status: "in_progress",
          step: "postage",
          displayName: "Ada",
          recoveryAcknowledged: true,
          unknownSenderRule: "request",
          minimumPostage: "0",
          receiptOnDelivery: false,
          updatedAt: new Date().toISOString(),
          completedAt: null,
        },
      }),
      expected: "verified",
    },
    {
      branch: "active",
      data: makeBootstrapData({
        onboarding: {
          status: "not_started",
          step: null,
          displayName: "",
          recoveryAcknowledged: false,
          unknownSenderRule: "",
          minimumPostage: "",
          receiptOnDelivery: false,
          updatedAt: null,
          completedAt: null,
        },
      }),
      expected: "verified",
    },
    {
      branch: "active",
      data: makeBootstrapData({
        onboarding: {
          status: "completed",
          step: "review",
          displayName: "Ada",
          recoveryAcknowledged: true,
          unknownSenderRule: "request",
          minimumPostage: "0",
          receiptOnDelivery: false,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      }),
      expected: "active",
    },
    {
      branch: "active",
      data: makeBootstrapData({
        provisioning: { status: "pending", currentStep: "wallet" },
        onboarding: {
          status: "completed",
          step: "review",
          displayName: "Ada",
          recoveryAcknowledged: true,
          unknownSenderRule: "request",
          minimumPostage: "0",
          receiptOnDelivery: false,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      }),
      expected: "verified",
    },
  ];

  it.each(cases)(
    "branch=$branch provisioning=$data?.provisioning?.status",
    ({ branch, data, expected }) => {
      expect(deriveGateState(branch, data ?? null)).toBe(expected);
    },
  );
});

describe("resolveRouteGuard — five required states", () => {
  describe("anonymous visitors", () => {
    it("are redirected to sign-in with a validated return-to from the requested path", () => {
      const decision = resolveRouteGuard({
        state: "anonymous",
        pathname: "/mail/123",
        search: "tab=preview",
      });
      expect(decision).toEqual({
        kind: "redirect",
        to: SIGN_IN_ROUTE,
        search: { next: "/mail/123?tab=preview" },
      });
    });

    it("are redirected to sign-in with a sanitized return-to for hostile paths", () => {
      const decision = resolveRouteGuard({ state: "anonymous", pathname: "/mail/123", search: "" });
      expect(decision).toEqual({
        kind: "redirect",
        to: SIGN_IN_ROUTE,
        search: { next: "/mail/123" },
      });

      // A hostile pathname must never propagate raw: the emitted return-to
      // always passes open-redirect validation (here it is sanitized to "/").
      const hostile = resolveRouteGuard({ state: "anonymous", pathname: "/\n", search: "" });
      expect(hostile.kind).toBe("redirect");
      if (hostile.kind === "redirect") {
        expect(validateReturnTo(hostile.search?.next ?? null)).not.toBeNull();
      }
    });

    it("are allowed through on public auth routes (sign-in page itself)", () => {
      expect(resolveRouteGuard({ state: "anonymous", pathname: "/auth/sign-in" })).toEqual({
        kind: "render",
      });
      expect(resolveRouteGuard({ state: "anonymous", pathname: "/auth/sign-up" })).toEqual({
        kind: "render",
      });
      expect(resolveRouteGuard({ state: "anonymous", pathname: "/auth/verify" })).toEqual({
        kind: "render",
      });
    });
  });

  describe("the public root serves the product showcase", () => {
    it("renders the root for anonymous visitors in production", () => {
      const decision = resolveRouteGuard({
        state: "anonymous",
        pathname: "/",
        isDev: false,
        demoFlag: false,
      });
      expect(decision).toEqual({ kind: "render" });
    });

    it("renders the public homepage in development", () => {
      const decision = resolveRouteGuard({
        state: "anonymous",
        pathname: "/",
        isDev: true,
        demoFlag: false,
      });
      expect(decision).toEqual({ kind: "render" });
    });

    it("keeps protected routes gated during end-to-end automation", () => {
      expect(
        resolveRouteGuard({ state: "anonymous", pathname: "/", isDev: true, isE2E: true }),
      ).toEqual({ kind: "render" });
      expect(
        resolveRouteGuard({ state: "outage", pathname: "/", isDev: true, isE2E: true }),
      ).toEqual({ kind: "state-view", view: "outage" });
    });
  });

  describe("anonymous visitors are always gated regardless of environment", () => {
    it("redirects the demo route in development when the demo flag is absent", () => {
      expect(
        resolveRouteGuard({ state: "anonymous", pathname: "/demo", isDev: true, demoFlag: false }),
      ).toEqual({ kind: "redirect", to: SIGN_IN_ROUTE, search: { next: "/demo" } });
    });

    it("denies /demo in production even with the flag", () => {
      expect(
        resolveRouteGuard({ state: "anonymous", pathname: "/demo", isDev: false, demoFlag: true }),
      ).toEqual({ kind: "redirect", to: SIGN_IN_ROUTE, search: { next: "/demo" } });
    });

    it("redirects other protected routes in development without the explicit flag", () => {
      expect(
        resolveRouteGuard({ state: "anonymous", pathname: "/inbox", isDev: true, demoFlag: false }),
      ).toEqual({ kind: "redirect", to: SIGN_IN_ROUTE, search: { next: "/inbox" } });
    });

    it("keeps the route protected even with the demo flag set in development", () => {
      expect(
        resolveRouteGuard({ state: "anonymous", pathname: "/inbox", isDev: true, demoFlag: true }),
      ).toEqual({ kind: "redirect", to: SIGN_IN_ROUTE, search: { next: "/inbox" } });
      expect(
        resolveRouteGuard({ state: "anonymous", pathname: "/inbox", isDev: false, demoFlag: true }),
      ).toEqual({ kind: "redirect", to: SIGN_IN_ROUTE, search: { next: "/inbox" } });
    });
  });

  describe("onboarding state (profile setup pending)", () => {
    it("redirects to the onboarding route", () => {
      expect(resolveRouteGuard({ state: "onboarding", pathname: "/" })).toEqual({
        kind: "redirect",
        to: ONBOARDING_ROUTE,
      });
      expect(resolveRouteGuard({ state: "onboarding", pathname: "/mail/1" })).toEqual({
        kind: "redirect",
        to: ONBOARDING_ROUTE,
      });
    });

    it("allows the onboarding route and redirects the retired verification page", () => {
      expect(resolveRouteGuard({ state: "onboarding", pathname: ONBOARDING_ROUTE })).toEqual({
        kind: "render",
      });
      expect(resolveRouteGuard({ state: "onboarding", pathname: "/auth/verify" })).toEqual({
        kind: "redirect",
        to: ONBOARDING_ROUTE,
      });
    });
  });

  describe("verified-but-incomplete-onboarding state", () => {
    it("redirects to the onboarding route, never into the protected app", () => {
      expect(resolveRouteGuard({ state: "verified", pathname: "/" })).toEqual({
        kind: "redirect",
        to: ONBOARDING_ROUTE,
      });
      expect(resolveRouteGuard({ state: "verified", pathname: "/inbox" })).toEqual({
        kind: "redirect",
        to: ONBOARDING_ROUTE,
      });
    });

    it("allows the onboarding route", () => {
      expect(resolveRouteGuard({ state: "verified", pathname: ONBOARDING_ROUTE })).toEqual({
        kind: "render",
      });
    });
  });

  describe("suspended accounts", () => {
    it("are handled distinctly: never routed into the app or sign-in", () => {
      expect(resolveRouteGuard({ state: "suspended", pathname: "/" })).toEqual({
        kind: "state-view",
        view: "suspended",
      });
      expect(resolveRouteGuard({ state: "suspended", pathname: "/inbox" })).toEqual({
        kind: "state-view",
        view: "suspended",
      });
      expect(resolveRouteGuard({ state: "suspended", pathname: "/auth/sign-in" })).toEqual({
        kind: "state-view",
        view: "suspended",
      });
      expect(resolveRouteGuard({ state: "suspended", pathname: ONBOARDING_ROUTE })).toEqual({
        kind: "state-view",
        view: "suspended",
      });
    });
  });

  describe("active authenticated users", () => {
    it("enter the protected app", () => {
      expect(resolveRouteGuard({ state: "active", pathname: "/" })).toEqual({ kind: "render" });
      expect(resolveRouteGuard({ state: "active", pathname: "/inbox" })).toEqual({
        kind: "render",
      });
    });

    it("are sent home instead of the auth pages (no sign-in loop)", () => {
      expect(resolveRouteGuard({ state: "active", pathname: "/auth/sign-in" })).toEqual({
        kind: "redirect",
        to: "/",
      });
      expect(resolveRouteGuard({ state: "active", pathname: "/auth/sign-up" })).toEqual({
        kind: "redirect",
        to: "/",
      });
      expect(resolveRouteGuard({ state: "active", pathname: ONBOARDING_ROUTE })).toEqual({
        kind: "redirect",
        to: "/",
      });
    });
  });

  describe("loading and outage states", () => {
    it("shows the loading view while unresolved", () => {
      expect(resolveRouteGuard({ state: "loading", pathname: "/" })).toEqual({
        kind: "loading-view",
      });
    });

    it("shows the outage view", () => {
      expect(resolveRouteGuard({ state: "outage", pathname: "/" })).toEqual({
        kind: "state-view",
        view: "outage",
      });
    });
  });
});

describe("resolveRouteGuard — duplicate/retry safety", () => {
  it("is idempotent: repeated evaluation returns the same decision", () => {
    const inputs = [
      { state: "anonymous" as GateState, pathname: "/mail/123", search: "tab=x" },
      { state: "onboarding" as GateState, pathname: "/" },
      { state: "verified" as GateState, pathname: "/inbox" },
      { state: "suspended" as GateState, pathname: "/" },
      { state: "active" as GateState, pathname: "/auth/sign-in" },
      { state: "loading" as GateState, pathname: "/" },
    ];
    for (const input of inputs) {
      const first = resolveRouteGuard(input);
      const again = resolveRouteGuard(input);
      expect(again).toEqual(first);
    }
  });

  it("never produces a redirect ping-pong: landing on any redirect target resolves to render or a state view", () => {
    const states: GateState[] = [
      "loading",
      "anonymous",
      "onboarding",
      "verified",
      "suspended",
      "outage",
      "active",
    ];
    const paths = ["/", "/inbox", "/auth/sign-in", "/auth/verify", "/onboarding", "/demo"];
    for (const state of states) {
      for (const path of paths) {
        const decision = resolveRouteGuard({ state, pathname: path });
        if (decision.kind !== "redirect") continue;
        const targetPath = decision.to;
        // Re-resolve the guard as if the redirect had completed (same state,
        // target path now current). It must settle — never redirect again.
        const settled = resolveRouteGuard({ state, pathname: targetPath });
        expect(
          settled.kind === "render" ||
            settled.kind === "state-view" ||
            settled.kind === "loading-view",
          `${state} @ ${path} -> ${targetPath} must settle, got ${settled.kind}`,
        ).toBe(true);
      }
    }
  });

  it("only ever emits return-to values that pass open-redirect validation", () => {
    const hostilePaths = [
      "/",
      "/mail/123?tab=preview",
      "//evil.example",
      "/\\evil.example",
      "/%2f%2fevil.example",
      "/\n",
    ];
    for (const path of hostilePaths) {
      const decision = resolveRouteGuard({ state: "anonymous", pathname: path }) as Extract<
        GuardDecision,
        { kind: "redirect" }
      >;
      expect(decision.kind).toBe("redirect");
      if (decision.search?.next !== undefined) {
        expect(validateReturnTo(decision.search.next)).toBe(decision.search.next);
      }
    }
  });
});
