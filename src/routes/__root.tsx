import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { MailQuestion } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ActionButton, EmptyState, Surface } from "@/features/design-system";
import { BootstrapProvider, RouteGate } from "@/features/identity";
import { PreferencesProvider } from "@/features/preferences/PreferencesProvider";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="ambient-bg flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <Surface variant="modal" padding="lg" className="w-full max-w-xl">
        <EmptyState
          eyebrow="Delivery failed"
          icon={<MailQuestion className="size-6" />}
          title="This route has no recipient"
          description="The page may have moved, expired, or never existed. Return to your private inbox to continue."
          action={
            <ActionButton asChild size="lg">
              <Link to="/">Return to inbox</Link>
            </ActionButton>
          }
        />
      </Surface>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hush — Private Mail on Stellar" },
      {
        name: "description",
        content: "Cryptographic mail identities, postage, and delivery proofs on Stellar.",
      },
      { name: "author", content: "Hush" },
      { property: "og:title", content: "Hush — Private Mail on Stellar" },
      {
        property: "og:description",
        content: "Cryptographic mail identities, postage, and delivery proofs on Stellar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/brand/hush-mark.svg" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const queryClient = new QueryClient();

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <BootstrapProvider>
          <RouteGate>
            <Outlet />
          </RouteGate>
        </BootstrapProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
