import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG contrast of the design tokens in src/index.css, in all four sets (light, dark and
 * their high-contrast versions). axe-core only checks rendered text; this covers the pairs
 * axe cannot see: focus ring, input borders, chart marks against the card. Text pairs need
 * 4.5:1 (AA, normal text); UI pairs (WCAG 1.4.11 non-text) need 3:1.
 */

const css = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

const SETS = {
  light: ":root {",
  dark: ".dark {",
  "light high contrast": ':root[data-contrast="high"] {',
  "dark high contrast": 'html.dark[data-contrast="high"] {',
} as const;

type Tokens = Record<string, { hsl: string; hex: string }>;

function block(selector: string): Tokens {
  const start = css.indexOf(`  ${selector}\n`);
  expect(start, `token block ${selector}`).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf("\n  }", start));
  const tokens: Tokens = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([\d.]+ [\d.]+% [\d.]+%);\s*\/\*\s*(#[0-9A-Fa-f]{6})\s*\*\//g)) {
    tokens[m[1]] = { hsl: m[2], hex: m[3].toUpperCase() };
  }
  return tokens;
}

function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.split(" ").map((p) => parseFloat(p));
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "muted"],
  ["foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["text-tertiary", "card"],
  ["text-tertiary", "background"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["tertiary-foreground", "tertiary"],
  ["destructive-foreground", "destructive"],
  ["tertiary", "card"],
  ["primary-ink", "card"],
  ["primary-ink", "background"],
  ["primary-ink", "muted"],
  ["tertiary", "background"],
  ["destructive", "card"],
  ["success", "card"],
  ["sidebar-foreground", "sidebar-background"],
];

const UI: [string, string][] = [
  ["ring", "background"],
  ["ring", "card"],
  ["border-strong", "card"],
  ["input", "card"],
  ["ornament", "card"],
  ["chart-1", "card"],
  ["chart-2", "card"],
  ["chart-3", "card"],
  ["chart-4", "card"],
  ["chart-5", "card"],
  // Chart plots are drawn on the page background (ChartVisualization's bg-background).
  ["chart-1", "background"],
  ["chart-2", "background"],
  ["chart-3", "background"],
  ["chart-4", "background"],
  ["chart-5", "background"],
];

describe.each(Object.entries(SETS))("%s tokens", (_name, selector) => {
  const tokens = block(selector);

  it("has every token, and each HSL value is its hex comment", () => {
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(40);
    for (const [name, { hsl, hex }] of Object.entries(tokens)) {
      expect(hslToHex(hsl), `--${name}`).toBe(hex);
    }
  });

  it.each(TEXT)("text %s on %s ≥ 4.5:1", (fg, bg) => {
    expect(contrast(tokens[fg].hex, tokens[bg].hex)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI)("UI %s on %s ≥ 3:1", (fg, bg) => {
    expect(contrast(tokens[fg].hex, tokens[bg].hex)).toBeGreaterThanOrEqual(3);
  });
});
