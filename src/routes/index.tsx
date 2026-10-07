import { createFileRoute } from "@tanstack/react-router";

import { useBootstrap } from "@/features/identity";
import { MailApp } from "@/features/mail";
import { HushShowcase } from "@/components/landing/HushShowcase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hush" },
      {
        name: "description",
        content:
          "Private programmable mail with encrypted messages and verifiable delivery on Stellar.",
      },
      { property: "og:title", content: "Hush" },
      {
        property: "og:description",
        content: "Cryptographic mail identities, postage, and delivery proofs on Stellar.",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const { branch } = useBootstrap();
  if (branch === "active") return <MailApp />;
  return <HushShowcase />;
}
