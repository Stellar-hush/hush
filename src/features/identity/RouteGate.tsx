// ---------------------------------------------------------------------------
// BETA-012 — authenticated route guard component.
//
// Mounted in the root route shell, this component resolves the server-backed
// bootstrap state into a definite guard decision before rendering the app
// outlet. Redirects use `replace` so repeated guard evaluations can never
// accumulate history entries (double-redirect / back-button thrash safety).
// ---------------------------------------------------------------------------

import { Navigate, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { BootstrapStateView } from "./BootstrapStateView";
import { deriveGateState, resolveRouteGuard } from "./route-guard";
import { useBootstrap } from "./useBootstrap";

export function RouteGate({ children }: { children: ReactNode }) {
  const { branch, data } = useBootstrap();
  const location = useLocation();

  // The home route doubles as Hush's public product page until a mailbox
  // session is active. Keep that showcase visible while bootstrap resolves
  // or when the API is unavailable; the index route switches to MailApp only
  // for an active session.
  if (
    location.pathname === "/" &&
    (branch === "loading" ||
      branch === "unauthorized" ||
      branch === "outage" ||
      branch === "maintenance")
  ) {
    return children;
  }

  const isTest = typeof window !== "undefined" && !!window.navigator.webdriver;
  const decision = resolveRouteGuard({
    state: deriveGateState(branch, data),
    pathname: location.pathname,
    search: location.searchStr.includes("?") ? location.searchStr.slice(1) : location.searchStr,
    isDev: import.meta.env.DEV,
    isE2E: import.meta.env.VITE_E2E === "true" || isTest,
    demoFlag:
      typeof window !== "undefined"
        ? window.localStorage?.getItem("STEALTH_DEMO_BYPASS_FETCH") === "true"
        : false,
  });

  switch (decision.kind) {
    case "render":
      return children;
    case "loading-view":
    case "state-view":
      return <BootstrapStateView />;
    case "redirect":
      return <Navigate to={decision.to} search={decision.search} replace />;
  }
}
