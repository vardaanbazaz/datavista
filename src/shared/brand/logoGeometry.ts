/**
 * The DataVista mark, from one geometry: drawn by the React <Logo> (app), `logoSvg` (favicon,
 * og image, design sheets) and exportUtils (PDF, as jsPDF polygons).
 *
 * The final mark (chosen after batch 7 phase B): option 1 of docs/design/batch7-b/logo-options.png,
 * a faceted prism with rising bars (logoVariants.ts `facet-bars`). Options 2 and 3 stay in
 * logoVariants.ts only for the options sheet (scripts/brand/logo-options.ts). The mark is flat
 * polygons on a 32x32 grid with a "full" (24px and up) and a "small" (16-23px: prism + 2 wide
 * bands) level of detail.
 *
 * No imports except logoVariants (also import-free): Node scripts load it too.
 */
import { LOGO_VARIANTS, MONO_DARK_BG, MONO_LIGHT_BG, SPECTRUM, variantSvg, type Detail, type Pt, type Shape } from "./logoVariants";

export type { Pt, Shape, Detail };
export { MONO_LIGHT_BG, MONO_DARK_BG, SPECTRUM };

/** The mark in use (index into LOGO_VARIANTS). */
export const ACTIVE_LOGO = LOGO_VARIANTS[0];

export const detailFor = (size: number): Detail => (size < 24 ? "small" : "full");

/** The active mark's polygons, painted back to front. */
export function logoShapes(detail: Detail = "full"): Shape[] {
  return ACTIVE_LOGO.shapes(detail);
}

/**
 * Standalone SVG markup of the active mark. `mono` draws one colour (shape opacity steps);
 * `color: "auto"` switches the mono colour with prefers-color-scheme (favicon).
 */
export function logoSvg(opts: { size?: number; mono?: boolean; color?: string | "auto"; detail?: Detail } = {}): string {
  return variantSvg(ACTIVE_LOGO, opts);
}
