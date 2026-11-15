import { composite, contrast, mix } from "./colorMath";
import { OVERLAY_ALPHA, SOLID_ALPHA, THEMES, highContrastTokens, type ThemeDef, type ThemeTokens } from "./themes";

/**
 * Every contrast pair of a theme, measured on the colour actually drawn: translucent surfaces
 * are composited over each colour that can sit behind them, and the worst one counts.
 *
 * Backdrops (unblurred colour stops: blur only averages them, so this is a lower bound):
 * - frame: the page background and each ribbon stop at its peak opacity over it;
 * - floating (sticky header, popovers, menus, dialogs): the frame backdrops plus the large areas
 *   that can scroll or open under them: the data surface, filled buttons, chart marks (text is
 *   left out: thin strokes blur into the surface they sit on); dialogs also get the overlay.
 *
 * Controls never sit straight on the frame (page-header actions and hero buttons are on a glass
 * toolbar or card), so control boundaries are checked on glass and data only; the focus ring
 * is checked on the frame too.
 *
 * Text needs 4.5:1 (WCAG 1.4.3); control boundaries, focus ring and chart marks 3:1 (1.4.11).
 */

export type Check = { surface: string; pair: string; ratio: number; min: number };

const unique = (xs: string[]) => [...new Set(xs.map((x) => x.toUpperCase()))];

export function surfaces(t: ThemeTokens) {
  // Ribbon: each stop, and the gradient between neighbours (an sRGB mix can be darker than both ends).
  const ribbon = t.ribbon.flatMap((c, i) => {
    const next = t.ribbon[(i + 1) % t.ribbon.length];
    return [c, mix(c, next, 0.25), mix(c, next, 0.5), mix(c, next, 0.75)];
  });
  const frame = unique([t.background, ...ribbon.map((c) => composite(c, t.ribbonOpacity, t.background))]);
  const solid = unique(frame.map((b) => composite(t.card, SOLID_ALPHA, b)));
  // Text is left out: its strokes are thin, so under the blur they average to the surface they sit on.
  const behindFloating = unique([...frame, ...solid, t.primary, ...t.chart]);
  const glassFrame = unique(frame.map((b) => composite(t.glass, t.glassAlpha, b)));
  const glassFloat = unique([
    ...behindFloating.map((b) => composite(t.glass, t.floatAlpha, b)),
    ...behindFloating.map((b) => composite(t.glass, t.floatAlpha, composite("#000000", OVERLAY_ALPHA, b))),
  ]);
  // Selected options and chips: the accent at 10% over glass (bg-primary/10).
  const tint = unique([...glassFrame, ...glassFloat].map((b) => composite(t.primary, 0.1, b)));
  return { frame, solid, glassFrame, glassFloat, muted: [t.muted], accent: [t.accent], tint };
}

function worst(fg: string, backs: string[]) {
  return Math.min(...backs.map((b) => contrast(fg, b)));
}

export function auditTokens(t: ThemeTokens): Check[] {
  const s = surfaces(t);
  const out: Check[] = [];
  const text = (surface: keyof typeof s, name: string, color: string) =>
    out.push({ surface, pair: `text ${name}`, ratio: worst(color, s[surface]), min: 4.5 });
  const ui = (surface: keyof typeof s, name: string, color: string) =>
    out.push({ surface, pair: `UI ${name}`, ratio: worst(color, s[surface]), min: 3 });

  // Frame: page header and empty-state hero sit straight on the background + ribbon.
  for (const [n, c] of [["foreground", t.foreground], ["frameMuted", t.frameMuted]] as const) {
    text("frame", n, c);
    text("glassFrame", n, c);
    text("glassFloat", n, c);
  }
  // Dialogs and menus reuse data components, so muted data text must also hold on floating glass.
  text("glassFloat", "mutedForeground", t.mutedForeground);
  // Status text inside dialogs and toasts (AI settings, import summary).
  for (const [n, c] of [["destructive", t.destructive], ["success", t.success], ["warning", t.warning]] as const) text("glassFloat", n, c);
  text("glassFrame", "primaryInk", t.primaryInk);
  text("glassFloat", "primaryInk", t.primaryInk);
  // Forms and short info cards are glass too (upload panel, builders, setup, empty states), so
  // status text and icons must hold on frame glass. Inside glass, `text-muted-foreground` is
  // remapped to frameMuted (index.css), which is what the frameMuted checks above cover.
  for (const [n, c] of [["destructive", t.destructive], ["success", t.success], ["warning", t.warning]] as const) text("glassFrame", n, c);
  // Selected options (bg-primary/10): label text, and the check mark as an icon (3:1).
  for (const [n, c] of [["foreground", t.foreground], ["frameMuted", t.frameMuted]] as const) text("tint", n, c);
  ui("tint", "primaryInk (check icon)", t.primaryInk);

  // Data.
  for (const [n, c] of [
    ["foreground", t.foreground],
    ["mutedForeground", t.mutedForeground],
    ["primaryInk", t.primaryInk],
    ["destructive", t.destructive],
    ["success", t.success],
    ["warning", t.warning],
  ] as const) {
    text("solid", n, c);
  }
  text("muted", "foreground", t.foreground);
  text("muted", "mutedForeground", t.mutedForeground);
  // bg-muted chips and header rows inside glass carry the remapped (frameMuted) text.
  text("muted", "frameMuted", t.frameMuted);
  // Selected / hovered rows and the active nav item (accent fill, on glass or data).
  for (const [n, c] of [["foreground", t.foreground], ["frameMuted", t.frameMuted], ["mutedForeground", t.mutedForeground], ["primaryInk", t.primaryInk]] as const) {
    text("accent", n, c);
  }
  out.push({ surface: "primary", pair: "text primaryForeground", ratio: contrast(t.primaryForeground, t.primary), min: 4.5 });
  out.push({ surface: "destructive", pair: "text destructiveForeground", ratio: contrast(t.destructiveForeground, t.destructive), min: 4.5 });

  // Borderless controls (nav items, icon buttons): the icon is ≥3:1 on glass (frameMuted, text
  // checks above); hover/selected draw the accent fill plus an inset borderStrong edge, so that
  // edge must hold on the accent; the selected nav item's bar is primaryInk.
  ui("accent", "borderStrong", t.borderStrong);
  ui("accent", "primaryInk (selected bar)", t.primaryInk);
  ui("glassFrame", "primaryInk (selected bar)", t.primaryInk);

  // Control boundaries, focus ring and filled buttons, wherever a control can sit.
  ui("frame", "ring", t.ring);
  for (const surf of ["glassFrame", "glassFloat", "solid"] as const) {
    ui(surf, "borderStrong", t.borderStrong);
    ui(surf, "ring", t.ring);
    ui(surf, "primary", t.primary);
  }
  t.chart.forEach((c, i) => ui("solid", `chart-${i + 1}`, c));
  return out;
}

export type ThemeAudit = { theme: ThemeDef; highContrast: boolean; checks: Check[] };

export function auditAll(): ThemeAudit[] {
  return THEMES.flatMap((theme) => [
    { theme, highContrast: false, checks: auditTokens(theme.tokens) },
    { theme, highContrast: true, checks: auditTokens(highContrastTokens(theme.tokens)) },
  ]);
}
