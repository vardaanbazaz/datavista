/**
 * Colour maths for the theme tests and the token generator: WCAG contrast, alpha compositing,
 * hex <-> HSL, OKLab/OKLCH, and the categorical chart palette validator.
 *
 * `validatePalette` is a TypeScript port of the dataviz skill's `scripts/validate_palette.js`
 * (checks 2-5: lightness band, chroma floor, CVD separation under Machado-Oliveira-Fernandes
 * 2009 protan/deutan simulation, normal-vision floor, contrast vs surface). Batch 6 ran that
 * script from outside the repo; it now lives here so CI runs it on every theme's palette.
 * Thresholds and the simulation matrices are copied unchanged: the CVD thresholds are
 * calibrated to that simulation model.
 *
 * No imports, so the Vite config, Node scripts and Vitest can all load it.
 */

export type Hex = `#${string}`;

const hex2srgb = (h: string): [number, number, number] => {
  const v = h.trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
};
const s2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (h: string) => hex2srgb(h).map(s2lin) as [number, number, number];

export const relativeLuminance = (h: string) => {
  const [r, g, b] = lin(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2 contrast ratio. */
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const toHex = (rgb: number[]) =>
  ("#" + rgb.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()) as Hex;

/** `top` at `alpha` over an opaque `bottom`, blended in sRGB like the browser does. */
export function composite(top: string, alpha: number, bottom: string): Hex {
  const t = hex2srgb(top);
  const b = hex2srgb(bottom);
  return toHex(t.map((c, i) => c * alpha + b[i] * (1 - alpha)));
}

/** Mix two colours in sRGB (amount of `b`). */
export const mix = (a: string, b: string, amount: number) => composite(b, amount, a);

/** "H S% L%" triplet for Tailwind's `hsl(var(--x) / alpha)`. Four decimals so it round-trips to the hex. */
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = hex2srgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${h.toFixed(4)} ${(s * 100).toFixed(4)}% ${(l * 100).toFixed(4)}%`;
}

export function hslTripletToHex(triplet: string): Hex {
  const [h, s, l] = triplet.split(" ").map((p) => parseFloat(p));
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return toHex([f(0), f(8), f(4)]);
}

// -- OKLab ---------------------------------------------------------------------------
function oklabFromLin([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export const oklch = (h: string): [number, number] => {
  const [L, a, b] = oklabFromLin(lin(h));
  return [L, Math.hypot(a, b)];
};

// -- palette validator (port of validate_palette.js) ---------------------------------
const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] } as const;
const CHROMA_FLOOR = 0.1;
const CVD_TARGET = 8.0;
const CVD_FLOOR = 6.0;
const NORMAL_FLOOR = 15.0;
const CONTRAST_MIN = 3.0;

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;
type CvdKind = keyof typeof MACHADO;

function simulate(h: string, kind: CvdKind) {
  const [r, g, b] = lin(h);
  const M = MACHADO[kind];
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  return [0, 1, 2].map((i) => clamp(M[i][0] * r + M[i][1] * g + M[i][2] * b));
}

/** OKLab ΔE ×100 between two colours, optionally under a simulated colour-vision deficiency. */
export function deltaE(h1: string, h2: string, kind?: CvdKind) {
  const a = oklabFromLin(kind ? simulate(h1, kind) : lin(h1));
  const b = oklabFromLin(kind ? simulate(h2, kind) : lin(h2));
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export interface PaletteReport {
  ok: boolean;
  mode: "light" | "dark";
  offBand: { color: string; L: number }[];
  lowChroma: { color: string; C: number }[];
  /** Worst protan/deutan ΔE on the pair list, and whether it meets the target (8) or only the floor (6, legal with legends). */
  cvd: { worst: number; kind: string; pair: [string, string]; state: "pass" | "floor" | "fail"; tritan: number };
  normal: { worst: number; pair: [string, string]; state: "pass" | "fail" };
  /** Marks below 3:1 against the surface ("relief": legal only with labels or a table view). */
  lowContrast: { color: string; ratio: number }[];
  minContrast: number;
}

/**
 * Checks a categorical palette against its chart surface. `pairs: "adjacent"` checks each slot
 * against the next; `wrap` adds last→first, which matters because d3's ordinal scale cycles.
 */
export function validatePalette(
  palette: string[],
  { mode, surface, pairs = "adjacent", wrap = true }: { mode: "light" | "dark"; surface: string; pairs?: "adjacent" | "all"; wrap?: boolean }
): PaletteReport {
  const [lo, hi] = BAND[mode];
  const n = palette.length;
  const offBand = palette.map((c) => ({ color: c, L: oklch(c)[0] })).filter(({ L }) => L < lo || L > hi);
  const lowChroma = palette.map((c) => ({ color: c, C: oklch(c)[1] })).filter(({ C }) => C < CHROMA_FLOOR);
  const pairList: [number, number][] =
    pairs === "all"
      ? Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + 1 + k] as [number, number])).flat()
      : Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number]);
  if (pairs === "adjacent" && wrap && n > 2) pairList.push([n - 1, 0]);

  let worst = { worst: Infinity, kind: "", pair: ["", ""] as [string, string] };
  for (const kind of ["protan", "deutan"] as const) {
    for (const [i, j] of pairList) {
      const d = deltaE(palette[i], palette[j], kind);
      if (d < worst.worst) worst = { worst: d, kind, pair: [palette[i], palette[j]] };
    }
  }
  const tritan = Math.min(...pairList.map(([i, j]) => deltaE(palette[i], palette[j], "tritan")));
  const cvdState = worst.worst >= CVD_TARGET ? "pass" : worst.worst >= CVD_FLOOR ? "floor" : "fail";

  let normal = { worst: Infinity, pair: ["", ""] as [string, string] };
  for (const [i, j] of pairList) {
    const d = deltaE(palette[i], palette[j]);
    if (d < normal.worst) normal = { worst: d, pair: [palette[i], palette[j]] };
  }
  const normalState = normal.worst >= NORMAL_FLOOR ? "pass" : "fail";

  const ratios = palette.map((c) => ({ color: c, ratio: contrast(c, surface) }));
  const lowContrast = ratios.filter((r) => r.ratio < CONTRAST_MIN);

  return {
    ok: !offBand.length && !lowChroma.length && cvdState !== "fail" && normalState === "pass",
    mode,
    offBand,
    lowChroma,
    cvd: { ...worst, state: cvdState, tritan },
    normal: { ...normal, state: normalState },
    lowContrast,
    minContrast: Math.min(...ratios.map((r) => r.ratio)),
  };
}
