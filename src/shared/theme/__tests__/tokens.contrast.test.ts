import { describe, expect, it } from "vitest";
import { auditAll } from "../contrastAudit";
import { THEMES, THEME_IDS } from "../themes";
import { hexToHslTriplet, hslTripletToHex } from "../colorMath";

/**
 * WCAG contrast of every theme's tokens, normal and high contrast, measured on the colour
 * actually drawn (see contrastAudit.ts): glass over the worst ribbon point and over whatever
 * can sit behind floating glass, data surfaces composited at their opacity. axe-core only sees
 * rendered text; this covers every theme, the focus ring, control boundaries and chart marks.
 */

describe("theme registry", () => {
  it("has one entry per id, in order", () => {
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
  });
  it("every colour round-trips through its HSL triplet", () => {
    for (const t of THEMES) {
      for (const [k, v] of Object.entries(t.tokens)) {
        const values = Array.isArray(v) ? v : [v];
        for (const c of values) if (typeof c === "string") expect(hslTripletToHex(hexToHslTriplet(c)), `${t.id}.${k}`).toBe(c.toUpperCase());
      }
    }
  });
});

describe.each(auditAll().map((a) => [`${a.theme.id}${a.highContrast ? " high contrast" : ""}`, a] as const))("%s", (_name, audit) => {
  it.each(audit.checks.map((c) => [`${c.pair} on ${c.surface}`, c] as const))("%s", (_label, c) => {
    expect(c.ratio, `${c.pair} on ${c.surface}: ${c.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(c.min);
  });
});
