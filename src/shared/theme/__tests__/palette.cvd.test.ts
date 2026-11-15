import { describe, expect, it } from "vitest";
import { composite, relativeLuminance, validatePalette } from "../colorMath";
import { SOLID_ALPHA, THEMES } from "../themes";

/**
 * Colour-blind check of each theme's categorical chart palette on its own data surface
 * (the dataviz validator, ported in colorMath.ts): lightness band, chroma floor, adjacent-pair
 * separation under protan/deutan simulation including the wrap-around pair (d3's ordinal scale
 * cycles), normal-vision floor, and every mark ≥ 3:1 against the plot.
 */
describe.each(THEMES.map((t) => [t.id, t] as const))("%s chart palette", (_id, theme) => {
  const surface = composite(theme.tokens.card, SOLID_ALPHA, theme.tokens.background);
  const mode = relativeLuminance(surface) > 0.3 ? "light" : "dark";
  const report = validatePalette(theme.tokens.chart, { mode, surface });

  it("stays inside the lightness band with enough chroma", () => {
    expect(report.offBand).toEqual([]);
    expect(report.lowChroma).toEqual([]);
  });
  it("keeps neighbours apart for protan and deutan vision (ΔE ≥ 8)", () => {
    expect(report.cvd.state, `${report.cvd.pair.join(" / ")} ΔE ${report.cvd.worst.toFixed(1)} (${report.cvd.kind})`).toBe("pass");
  });
  it("keeps neighbours apart for full colour vision (ΔE ≥ 15)", () => {
    expect(report.normal.state).toBe("pass");
  });
  it("draws every mark at ≥ 3:1 on the plot", () => {
    expect(report.lowContrast).toEqual([]);
  });
});
