import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MailApp } from "@/features/mail";

const root = resolve(process.cwd());

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const mockCatalogImport = /\{[^}]*\bemails\b[^}]*\}\s*from\s*["']@\/components\/mail\/data["']/;

describe("mail shell production path (BETA-053)", () => {
  it("exports the composed MailApp from the mail feature", () => {
    expect(typeof MailApp).toBe("function");
  });
  it("serves the public Hush showcase and composes the authenticated mail app", () => {
    const route = read("src/routes/index.tsx");
    expect(route).toContain('createFileRoute("/")');
    expect(route).toContain("useBootstrap");
    expect(route).toContain('import { HushShowcase } from "@/components/landing/HushShowcase"');
    expect(route).toContain('branch === "active"');
    expect(route).toContain("<MailApp />");
    expect(route).toContain("<HushShowcase />");
    expect(route).not.toContain("useState");
    expect(route).not.toContain("useMailbox");
    expect(route.split("\n").length).toBeLessThan(45);
  });

  it("does not statically import the mock email catalog into the production shell", () => {
    const app = read("src/features/mail/shell/MailApp.tsx");
    const source = read("src/features/mail/useMailSource.ts");
    const overlays = read("src/features/mail/shell/MailOverlayStack.tsx");

    for (const text of [app, source, overlays]) {
      expect(text).not.toMatch(mockCatalogImport);
    }

    expect(app).not.toContain("getDemoEmails");
    expect(overlays).not.toContain("getDemoEmails");
    expect(source).toContain("useMailboxSync");
    expect(source).toContain("useTombstoneMessage");
    expect(source).toContain("useConnectivity");
    expect(app).toContain("useThreadRead");
    expect(app).toContain("threadRead.thread");
    expect(app).toContain("DegradedStateBanner");
    expect(app).toContain("offlineAppFailure");
    expect(source).toContain("import.meta.env.DEV");
    expect(source).toContain('import("@/features/mail/demo/demo-data")');
  });

  it("does not re-export demo fixtures from the mail feature barrel", () => {
    const mailIndex = read("src/features/mail/index.ts");
    expect(mailIndex).not.toContain("demo-data");
    expect(read("src/features/mail/demo/demo-data.ts")).toContain("getDemoEmails");
  });

  it("gates the triage QA failure toggle behind the DEV build (BETA-073)", () => {
    const board = read("src/features/requests/RequestsTriageBoard.tsx");
    expect(board).toContain("import.meta.env?.DEV === true");
    expect(board).not.toMatch(/import\s+.*SimulateNetworkFailure/);
    expect(board).toContain("simulateFailure");
  });
});
