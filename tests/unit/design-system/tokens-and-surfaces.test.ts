import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const designSystemStylesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/features/design-system/styles",
);

function readStyle(name: string): string {
  return readFileSync(join(designSystemStylesDir, name), "utf8");
}

describe("design-system CSS tokens", () => {
  const tokens = readStyle("tokens.css");

  it("defines core semantic color tokens used across app surfaces (success path)", () => {
    expect(tokens).toContain("--background:");
    expect(tokens).toContain("--foreground:");
    expect(tokens).toContain("--primary:");
    expect(tokens).toContain("--muted-foreground:");
    expect(tokens).toContain("--glass:");
    expect(tokens).toContain("--glass-strong:");
  });

  it("supports light theme overrides without breaking base token names", () => {
    expect(tokens).toContain(':root[data-theme="light"]');
    expect(tokens).toMatch(/:root\[data-theme="light"\][\s\S]*--background:/);
  });

  it("defines density presets for mail list spacing", () => {
    expect(tokens).toContain(':root[data-density="compact"]');
    expect(tokens).toContain("--mail-list-gap:");
    expect(tokens).toContain(':root[data-density="comfortable"]');
  });

  it("does not embed live customer mail or secrets in token definitions (safety guard)", () => {
    expect(tokens).not.toMatch(/@[a-z0-9.-]+\.(com|org|net)/i);
    expect(tokens).not.toMatch(/(?:api[_-]?key|secret|password|private[_-]?key)/i);
  });
});

describe("design-system surface utilities", () => {
  const surfaces = readStyle("surfaces.css");

  it("declares glass surface utilities consumed by Surface and panels (success path)", () => {
    expect(surfaces).toContain(".glass {");
    expect(surfaces).toContain(".glass-strong {");
    expect(surfaces).toContain("background: var(--glass);");
    expect(surfaces).toContain("background: var(--glass-strong);");
  });

  it("keeps ambient and brand gradient text helpers available", () => {
    expect(surfaces).toContain(".ambient-bg");
    expect(surfaces).toContain(".brand-gradient-text");
  });

  it("does not reference undefined custom properties for glass backgrounds (edge case)", () => {
    expect(surfaces).not.toContain("var(--missing-glass)");
  });
});

describe("design-system interaction utilities", () => {
  const interactions = readStyle("interactions.css");

  it("defines keyboard-visible focus rings via glow-ring (success path)", () => {
    expect(interactions).toContain(".glow-ring:focus-visible");
    expect(interactions).toContain("box-shadow:");
  });

  it("respects prefers-reduced-motion for animated utilities (a11y contract)", () => {
    expect(interactions).toContain("@media (prefers-reduced-motion: reduce)");
    expect(interactions).toMatch(/animation-duration:\s*0\.01ms/);
  });
});

describe("styles.css composition", () => {
  const stylesEntry = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../src/styles.css"),
    "utf8",
  );

  it("imports design-system styles once at the app entry point", () => {
    expect(stylesEntry).toContain('@import "./features/design-system/styles/fonts.css";');
    expect(stylesEntry).toContain('@import "./features/design-system/styles/tokens.css";');
    expect(stylesEntry).toContain('@import "./features/design-system/styles/surfaces.css";');
    expect(stylesEntry).toContain('@import "./features/design-system/styles/interactions.css";');
  });
});
