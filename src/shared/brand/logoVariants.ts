/**
 * Batch 7 phase B logo options (docs/design/batch7-b/logo-options.png). Option 1 (`facet-bars`)
 * is the final mark (logoGeometry.ts ACTIVE_LOGO); options 2 and 3 were not chosen and are kept
 * only so the options sheet can be redrawn. Each variant is a list
 * of flat polygons on a 32x32 grid, in two levels of detail: "full" (24px and up) and "small"
 * (16-23px: the prism and 2-3 wide colour bands). Polygons only, so the same shapes draw in
 * React, in a standalone SVG (favicon, og image) and in jsPDF (`pdf.lines`).
 *
 * The spectrum leaves the prism as data (rising bars or a fanned chart), not as a beam of
 * light: no incoming beam, no flat equilateral triangle, no horizontal rainbow fan.
 *
 * `mono` is the shape's opacity in the single-colour version (favicon, high contrast, PDF).
 * No imports: Node scripts load it too.
 */

export type Pt = [number, number];
export interface Shape {
  pts: Pt[];
  fill: string;
  mono: number;
}
export type Detail = "full" | "small";
export interface LogoVariant {
  id: string;
  name: string;
  summary: string;
  shapes: (detail: Detail) => Shape[];
}

/** Brand spectrum (fixed in every theme). */
export const SPECTRUM = {
  coral: "#F4664A",
  amber: "#F59E0B",
  teal: "#14B8A6",
  blue: "#3B82F6",
  violet: "#7C5CFF",
} as const;
/** Prism facets: lit, mid, shade. */
export const FACET = ["#9A80FF", "#6D5BF0", "#4338CA"] as const;
/** Single-colour version on light and on dark backgrounds. */
export const MONO_LIGHT_BG = "#3730A3";
export const MONO_DARK_BG = "#C7D2FE";

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A bar with a slanted top (rises to the right by `lift`). */
const slantBar = (x0: number, x1: number, top: number, base: number, lift: number): Pt[] => [
  [x0, top + lift],
  [x1, top],
  [x1, base],
  [x0, base],
];

/** Polygon approximation of a polygon with rounded corners (radius r, n points per corner). */
function rounded(poly: Pt[], r: number, n = 5): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const a = poly[(i - 1 + poly.length) % poly.length];
    const b = poly[(i + 1) % poly.length];
    const ua = norm([a[0] - p[0], a[1] - p[1]]);
    const ub = norm([b[0] - p[0], b[1] - p[1]]);
    const start: Pt = [p[0] + ua[0] * r, p[1] + ua[1] * r];
    const end: Pt = [p[0] + ub[0] * r, p[1] + ub[1] * r];
    // Quadratic Bezier with the corner as control point.
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * p[0] + t * t * end[0];
      const y = (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * p[1] + t * t * end[1];
      out.push([x, y]);
    }
  }
  return out;
}
function norm([x, y]: Pt): Pt {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
const rotate = (pts: Pt[], deg: number, [cx, cy]: Pt): Pt[] => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
};
/** Annular sector from angle a0 to a1 (degrees, 0 = right, negative = up), radii r0..r1. */
function sector([cx, cy]: Pt, r0: number, r1: number, a0: number, a1: number, steps = 8): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = ((a0 + ((a1 - a0) * k) / steps) * Math.PI) / 180;
    pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]);
  }
  for (let k = steps; k >= 0; k--) {
    const a = ((a0 + ((a1 - a0) * k) / steps) * Math.PI) / 180;
    pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]);
  }
  return pts;
}

/**
 * 1. Faceted prism, rising bars. A triangular prism seen from the front right (a lit front
 * face and a shaded side face), with three bars stepping up beside it, cool to warm.
 */
const facetBars: LogoVariant = {
  id: "facet-bars",
  name: "1 · Faceted prism, rising bars",
  summary: "Triangular prism at an angle (front + side facet); three bars rise to the right.",
  shapes: (detail) => {
    const front: Pt[] = [[8.5, 4], [1.5, 27], [13.5, 27]];
    const side: Pt[] = [[8.5, 4], [12, 3], [17.5, 25.5], [13.5, 27]];
    const prism: Shape[] = [
      { pts: side, fill: FACET[2], mono: 0.62 },
      { pts: front, fill: FACET[0], mono: 1 },
    ];
    if (detail === "small") {
      return [
        ...prism,
        { pts: rect(19.5, 15, 24.5, 27), fill: SPECTRUM.teal, mono: 0.75 },
        { pts: rect(26.5, 5, 31.5, 27), fill: SPECTRUM.coral, mono: 1 },
      ];
    }
    return [
      ...prism,
      { pts: rect(19.5, 18, 23, 27), fill: SPECTRUM.teal, mono: 0.6 },
      { pts: rect(24, 12, 27.5, 27), fill: SPECTRUM.amber, mono: 0.8 },
      { pts: rect(28.5, 5, 32, 27), fill: SPECTRUM.coral, mono: 1 },
    ];
  },
};

/**
 * 2. Rounded prism, fanned chart. A soft, slightly tilted prism; the spectrum opens upward from
 * its right corner as a fan of chart wedges of growing radius (a small rose chart).
 */
const roundedFan: LogoVariant = {
  id: "rounded-fan",
  name: "2 · Rounded prism, fan chart",
  summary: "Tilted prism with rounded corners; three chart wedges of growing radius fan upward.",
  shapes: (detail) => {
    const tri = rotate(rounded([[10, 5], [1.5, 27.5], [18.5, 27.5]], 3.2), -8, [10, 18]);
    const pivot: Pt = [16.5, 28.5];
    const prism: Shape = { pts: tri, fill: FACET[1], mono: 1 };
    if (detail === "small") {
      return [
        { pts: sector(pivot, 3, 15.5, -62, -34), fill: SPECTRUM.teal, mono: 0.7 },
        { pts: sector(pivot, 3, 15.5, -30, -2), fill: SPECTRUM.coral, mono: 0.9 },
        prism,
      ];
    }
    return [
      { pts: sector(pivot, 3, 11.5, -80, -60), fill: SPECTRUM.blue, mono: 0.5 },
      { pts: sector(pivot, 3, 13.5, -56, -38), fill: SPECTRUM.teal, mono: 0.65 },
      { pts: sector(pivot, 3, 15.5, -34, -17), fill: SPECTRUM.amber, mono: 0.8 },
      { pts: sector(pivot, 3, 16, -13, 2), fill: SPECTRUM.coral, mono: 0.95 },
      prism,
    ];
  },
};

/**
 * 3. Crystal column, stepped bars. A tall hexagonal crystal (three facets) with four bars whose
 * tops share the crystal's slant, stepping up like a bar chart.
 */
const crystalSteps: LogoVariant = {
  id: "crystal-steps",
  name: "3 · Crystal, stepped bars",
  summary: "Hexagonal crystal (three facets); four bars with slanted tops step up beside it.",
  shapes: (detail) => {
    const crystal: Shape[] = [
      { pts: [[2, 9], [7.5, 4], [7.5, 23], [2, 27]], fill: FACET[0], mono: 1 },
      { pts: [[7.5, 4], [13, 7.5], [13, 25.5], [7.5, 23]], fill: FACET[1], mono: 0.75 },
      { pts: [[2, 27], [7.5, 23], [13, 25.5], [8, 29.5]], fill: FACET[2], mono: 0.55 },
    ];
    if (detail === "small") {
      return [
        ...crystal,
        { pts: slantBar(16, 22.5, 15, 29, 2), fill: SPECTRUM.teal, mono: 0.75 },
        { pts: slantBar(24.5, 31, 4, 29, 2), fill: SPECTRUM.coral, mono: 1 },
      ];
    }
    return [
      ...crystal,
      { pts: slantBar(15.5, 18.5, 20, 29.5, 1.2), fill: SPECTRUM.blue, mono: 0.5 },
      { pts: slantBar(19.75, 22.75, 15, 29.5, 1.2), fill: SPECTRUM.teal, mono: 0.65 },
      { pts: slantBar(24, 27, 9.5, 29.5, 1.2), fill: SPECTRUM.amber, mono: 0.8 },
      { pts: slantBar(28.25, 31.25, 3.5, 29.5, 1.2), fill: SPECTRUM.coral, mono: 1 },
    ];
  },
};

export const LOGO_VARIANTS: LogoVariant[] = [facetBars, roundedFan, crystalSteps];

const fmt = (p: Pt[]) => p.map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(" ");

/** Standalone SVG for a variant. `mono` draws one colour (shape opacity steps); "auto" follows prefers-color-scheme. */
export function variantSvg(
  v: LogoVariant,
  { size = 32, mono = false, color = MONO_LIGHT_BG, detail }: { size?: number; mono?: boolean; color?: string | "auto"; detail?: Detail } = {}
): string {
  const shapes = v.shapes(detail ?? (size < 24 ? "small" : "full"));
  const fillMono = color === "auto" ? "currentColor" : color;
  const style =
    mono && color === "auto"
      ? `<style>svg{color:${MONO_LIGHT_BG}}@media (prefers-color-scheme: dark){svg{color:${MONO_DARK_BG}}}</style>`
      : "";
  const body = shapes
    .map((s) => (mono ? `<polygon points="${fmt(s.pts)}" fill="${fillMono}" fill-opacity="${s.mono}"/>` : `<polygon points="${fmt(s.pts)}" fill="${s.fill}"/>`))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${style}${body}</svg>`;
}
