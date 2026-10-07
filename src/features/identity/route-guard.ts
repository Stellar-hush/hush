// ---------------------------------------------------------------------------
// BETA-012 — authenticated route guards.
//
// The server bootstrap endpoint resolves a definite per-visitor state; this
// module turns that state into a guard decision for the protected app shell.
// The decision function is pure so every state transition is unit testable
// and repeat calls are idempotent (no double redirects / session thrashing).
// ---------------------------------------------------------------------------

import type { BootstrapBranch, BootstrapData } from "./bootstrap";
import { validateReturnTo } from "./returnTo";

/**
 * Normalized authentication gates. `verified` covers an account whose email
 * is verified but whose account provisioning is not yet complete; it is the
 * "verified-but-incomplete-onboarding" state.
 */
export type GateState =
  | "loading"
  | "anonymous"
  | "onboarding"
  | "verified"
  | "suspended"
  | "outage"
  | "active";

export const SIGN_IN_ROUTE = "/auth/sign-in";
export const ONBOARDING_ROUTE = "/onboarding";
export const DEMO_ROUTE = "/demo";
export const HOME_ROUTE = "/";

const AUTH_PUBLIC_PREFIX = "/auth/";

export function isPublicAuthPath(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith(AUTH_PUBLIC_PREFIX);
}

/** Maps the server-resolved bootstrap state to a definite gate state. */
export function deriveGateState(branch: BootstrapBranch, data: BootstrapData | null): GateState {
  switch (branch) {
    case "loading":
      return "loading";
    case "unauthorized":
      return "anonymous";
    case "suspended":
      return "suspended";
    case "outage":
    case "maintenance":
      return "outage";
    case "onboarding":
      return "onboarding";
    case "active": {
      const provisioning = data?.provisioning;
      // BETA-013: accounts that still need profile-first onboarding are
      // funneled to /onboarding alongside pending-provisioning accounts.
      const onboarding = data?.onboarding;
      const onboardingPending = !!onboarding && onboarding.status !== "completed";
      if ((provisioning && provisioning.status !== "active") || onboardingPending) {
        return "verified";
      }
      return "active";
    }
  }
}

export type GuardDecision =
  | { kind: "render" }
  | { kind: "loading-view" }
  | { kind: "state-view"; view: "suspended" | "outage" }
  | { kind: "redirect"; to: "/auth/sign-in"; search?: { next: string } }
  | { kind: "redirect"; to: "/onboarding" | "/"; search?: { next: string } };

export interface RouteGuardInput {
  state: GateState;
  pathname: string;
  /** Raw query string (without `?`) carried on the current location. */
  search?: string;
  /** Statically false in production builds; explicit demo gate. */
  isDev?: boolean;
  /** True when running under end-to-end automation (VITE_E2E or a WebDriver session). */
  isE2E?: boolean;
  /** Explicit development-only demo flag (`STEALTH_DEMO_BYPASS_FETCH`). */
  demoFlag?: boolean;
}

/**
 * Pure guard decision for a single navigation. The same input always
 * produces the same decision; destinations are chosen so that re-running the
 * guard on the target never produces a redirect back to the source.
 */
export function resolveRouteGuard(input: RouteGuardInput): GuardDecision {
  const { state, pathname } = input;
  const search = input.search ?? "";
  const isDev = input.isDev ?? false;
  const demoFlag = input.demoFlag ?? false;

  if (isDev && isPublicAuthPath(pathname)) return { kind: "render" };
  // Local UI development opens the mailbox while bootstrap resolves or when
  // no session is present. Authenticated onboarding still uses the real gate.
  if (
    isDev &&
    !input.isE2E &&
    pathname === HOME_ROUTE &&
    (state === "loading" || state === "anonymous" || state === "outage")
  ) {
    return { kind: "render" };
  }

  switch (state) {
    case "loading":
      return { kind: "loading-view" };

    case "anonymous": {
      if (isPublicAuthPath(pathname)) return { kind: "render" };
      // The public homepage is the product showcase. Account creation and
      // sign-in remain explicit links from that page.
      if (pathname === HOME_ROUTE) return { kind: "render" };
      // Demo mode is reachable only on its isolated route, only when the
      // explicit demo flag is present. The demo flag forces the bootstrap
      // response to resolve as `active`, so this branch is only reached for
      // the bare `/demo` entry when the flag is absent (e.g. production).
      if (isDev && demoFlag && pathname === DEMO_ROUTE) return { kind: "render" };
      const next = validateReturnTo(pathname + (search.length ? `?${search}` : ""));
      return next
        ? { kind: "redirect", to: SIGN_IN_ROUTE, search: { next } }
        : { kind: "redirect", to: SIGN_IN_ROUTE };
    }

    case "onboarding":
    case "verified": {
      if (pathname === ONBOARDING_ROUTE) {
        return { kind: "render" };
      }
      return { kind: "redirect", to: ONBOARDING_ROUTE };
    }

    case "suspended":
      return { kind: "state-view", view: "suspended" };

    case "outage":
      return { kind: "state-view", view: "outage" };

    case "active": {
      if (isPublicAuthPath(pathname) || pathname === ONBOARDING_ROUTE) {
        return { kind: "redirect", to: HOME_ROUTE };
      }
      return { kind: "render" };
    }
  }
}
