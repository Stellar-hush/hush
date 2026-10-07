import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/features/design-system/styles/tokens.css"), "utf8");
const palette = new Map<string, string>();
postcss.parse(source).walkRules(':root[data-theme="light"]', (rule) => {
  rule.walkDecls((decl) => {
    palette.set(decl.prop, decl.value);
  });
});

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = Number.parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Hush light palette", () => {
  it("uses the cool surface-depth token for translucent dialog backdrops", () => {
    expect(palette.get("--overlay")).toBe("var(--surface-depth)");
    expect(palette.get("--surface-depth")).toBe("#dbe3f5");
  });

  it("uses the Hush pale-periwinkle base surface", () => {
    expect(palette.get("--background")).toBe("#f5f7ff");
  });

  it("keeps content surfaces neutral or cool-toned", () => {
    for (const token of [
      "--background",
      "--card",
      "--popover",
      "--surface-panel",
      "--preview-background",
    ]) {
      const value = palette.get(token)!;
      expect(value, token).toMatch(/^#[\da-f]{6}$/i);
      const [red, green, blue] = value
        .slice(1)
        .match(/../g)!
        .map((channel) => parseInt(channel, 16));
      if (value !== "#ffffff") {
        expect(blue, token).toBeGreaterThanOrEqual(red);
        expect(blue, token).toBeGreaterThanOrEqual(green);
      }
    }
  });

  it("keeps normal, muted, and status text at WCAG AA contrast on all card states", () => {
    const surfaces = ["--background", "--card", "--popover", "--preview-active", "--preview-hover"];
    const ink = [
      "--foreground",
      "--muted-foreground",
      "--status-success",
      "--status-warning",
      "--status-danger",
      "--status-info",
      "--status-special",
      "--status-neutral",
    ];
    for (const surface of surfaces) {
      for (const token of ink) {
        expect(
          contrast(palette.get(token)!, palette.get(surface)!),
          `${token} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(
      contrast(palette.get("--primary")!, palette.get("--primary-foreground")!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the blue-indigo Hush ink and icon colors", () => {
    for (const token of ["--foreground", "--primary"]) {
      const [red, green, blue] = palette
        .get(token)!
        .slice(1)
        .match(/../g)!
        .map((channel) => parseInt(channel, 16));
      expect(blue, token).toBeGreaterThan(green);
      expect(green, token).toBeGreaterThan(red);
    }
    for (const token of ["--muted-foreground", "--icon-foreground"]) {
      const [red, green, blue] = palette
        .get(token)!
        .slice(1)
        .match(/../g)!
        .map((channel) => parseInt(channel, 16));
      expect(blue, token).toBeGreaterThanOrEqual(green);
      expect(green, token).toBeGreaterThan(red);
    }
    for (const surface of ["--background", "--card", "--preview-active"]) {
      expect(
        contrast(palette.get("--icon-foreground")!, palette.get(surface)!),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps both glass layers translucent at every light-theme intensity", () => {
    postcss.parse(source).walkRules((rule) => {
      if (!rule.selector.startsWith(':root[data-theme="light"]')) return;
      rule.walkDecls((decl) => {
        if (!["--glass", "--glass-strong"].includes(decl.prop)) return;
        const alpha = decl.value.match(/\/\s*(\d+)%/);
        expect(alpha, `${rule.selector}: ${decl.prop}`).not.toBeNull();
        expect(Number(alpha![1])).toBeGreaterThanOrEqual(38);
        expect(Number(alpha![1])).toBeLessThanOrEqual(94);
      });
    });
  });

  it("overrides glass intensity without bringing pure-white or dark backgrounds back", () => {
    for (const intensity of ["subtle", "strong"]) {
      let found = false;
      postcss
        .parse(source)
        .walkRules(`:root[data-theme="light"][data-glass="${intensity}"]`, (rule) => {
          found = true;
          expect(rule.toString()).not.toMatch(/oklch\(1 0 0|#fff\b|#ffffff\b/);
          expect(rule.toString()).toContain("--glass-strong:");
        });
      expect(found).toBe(true);
    }
  });
});
