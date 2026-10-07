/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { RouteGate } from "@/features/identity/RouteGate";
import { ONBOARDING_ROUTE, SIGN_IN_ROUTE } from "@/features/identity/route-guard";

const mock = vi.hoisted(() => {
  let branch: string = "active";
  let data: unknown = null;
  return {
    get branch() {
      return branch;
    },
    get data() {
      return data;
    },
    setBranch(value: string) {
      branch = value;
    },
    setData(value: unknown) {
      data = value;
    },
  };
});

vi.mock("@/features/identity/useBootstrap", () => ({
  useBootstrap: () => ({
    branch: mock.branch,
    data: mock.data,
    isLoading: false,
    error: null,
    retry: async () => undefined,
    isRetrying: false,
  }),
}));

const rootRoute = createRootRoute({
  component: () => (
    <RouteGate>
      <Outlet />
    </RouteGate>
  ),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/sign-in",
  validateSearch: z.object({ next: z.string().optional() }),
  component: () => <div>Sign In Page</div>,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: () => <div>Onboarding Page</div>,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <div>Protected App Page</div>,
});

const routeTree = (
  rootRoute as unknown as {
    addChildren: (children: unknown[]) => typeof rootRoute;
  }
).addChildren([signInRoute, onboardingRoute, indexRoute]);

function makeRouter(initialUrl: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    defaultPreloadStaleTime: 0,
  });
}

async function renderAt(initialUrl: string) {
  const router = makeRouter(initialUrl);
  render(<RouterProvider router={router} />);
  return router;
}

describe("RouteGate — component-level navigation coverage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renders the public homepage for an anonymous visitor", async () => {
    vi.stubEnv("DEV", false);
    mock.setBranch("unauthorized");
    mock.setData(null);
    const router = await renderAt("/");

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("Protected App Page")).toBeTruthy();
  });

  it("lets an anonymous visitor stay on the public sign-in page (no redirect loop)", async () => {
    mock.setBranch("unauthorized");
    mock.setData(null);
    const router = await renderAt("/auth/sign-in");

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(SIGN_IN_ROUTE));
    expect((router.state.location.search as { next?: string }).next).toBeUndefined();
    expect(await screen.findByText("Sign In Page")).toBeTruthy();
  });

  it("redirects an onboarding visitor to the onboarding wizard", async () => {
    mock.setBranch("onboarding");
    mock.setData(null);
    const router = await renderAt("/");

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(ONBOARDING_ROUTE));
    expect(await screen.findByText("Onboarding Page")).toBeTruthy();
  });

  it("redirects incomplete provisioning to the onboarding wizard", async () => {
    mock.setBranch("active");
    mock.setData({
      provisioning: { status: "pending", currentStep: "wallet" },
    } as never);
    const router = await renderAt("/");

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(ONBOARDING_ROUTE));
    expect(await screen.findByText("Onboarding Page")).toBeTruthy();
  });

  it("shows the distinct suspended state view instead of the app or sign-in", async () => {
    mock.setBranch("suspended");
    mock.setData({ user: { userId: "user_blocked" } } as never);
    const router = await renderAt("/inbox");

    await vi.waitFor(() =>
      expect(screen.getByRole("heading", { name: "Account suspended" })).toBeTruthy(),
    );
    expect(router.state.location.pathname).toBe("/inbox");
    expect(router.state.location.pathname).not.toBe(SIGN_IN_ROUTE);
  });

  it("admits an active authenticated visitor into the protected app", async () => {
    mock.setBranch("active");
    mock.setData(null);
    const router = await renderAt("/");

    await vi.waitFor(() => expect(screen.getByText("Protected App Page")).toBeTruthy());
    expect(router.state.location.pathname).toBe("/");
  });

  it("sends an authenticated visitor away from the sign-in page back home", async () => {
    vi.stubEnv("DEV", false);
    mock.setBranch("active");
    mock.setData(null);
    const router = await renderAt("/auth/sign-in");

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("Protected App Page")).toBeTruthy();
  });

  it("is repeat-safe: a duplicated bootstrap resolution settles instead of thrashing", async () => {
    mock.setBranch("unauthorized");
    mock.setData(null);
    const router = await renderAt("/mail/7");

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(SIGN_IN_ROUTE));
    const settledUrl = router.state.location.href;

    // A second bootstrap repoll resolving to the same state must not re-navigate.
    await act(async () => {
      router.invalidate();
    });
    await vi.waitFor(() => expect(router.state.location.href).toBe(settledUrl));
    expect(router.state.location.pathname).toBe(SIGN_IN_ROUTE);
  });

  it("moves a suspended visitor to the state view even when they open the sign-in page", async () => {
    vi.stubEnv("DEV", false);
    mock.setBranch("suspended");
    mock.setData({ user: { userId: "user_blocked" } } as never);
    await renderAt("/auth/sign-in");

    await vi.waitFor(() =>
      expect(screen.getByRole("heading", { name: "Account suspended" })).toBeTruthy(),
    );
  });
});
