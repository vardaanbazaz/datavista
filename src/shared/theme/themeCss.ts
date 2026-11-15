import { contrast, hexToHslTriplet, mix } from "./colorMath";
import { SOLID_ALPHA, THEMES, highContrastTokens, type ThemeDef, type ThemeTokens } from "./themes";

/**
 * Renders the theme registry (themes.ts) as CSS custom properties. Output is checked in as
 * themes.generated.css (`npm run theme:css`); tokens.generated.test.ts fails when it is stale.
 * Colours are HSL triplets so Tailwind's `hsl(var(--x) / <alpha>)` modifiers keep working;
 * the hex is kept in a comment for review.
 */

const onColor = (bg: string) => (contrast("#000000", bg) >= contrast("#FFFFFF", bg) ? "#000000" : "#FFFFFF");

function vars(t: ThemeTokens): [string, string | number][] {
  const c: [string, string | number][] = [
    ["background", t.background],
    ["foreground", t.foreground],
    ["frame-muted", t.frameMuted],
    ["glass", t.glass],
    ["glass-alpha", t.glassAlpha],
    ["float-alpha", t.floatAlpha],
    ["glass-border", t.glassBorder],
    ["solid-alpha", SOLID_ALPHA],
    ["card", t.card],
    ["card-foreground", t.foreground],
    ["popover", t.glass],
    ["popover-foreground", t.foreground],
    ["primary", t.primary],
    ["primary-foreground", t.primaryForeground],
    ["primary-glow", mix(t.primary, t.primaryForeground, 0.12)],
    ["primary-ink", t.primaryInk],
    ["secondary", t.muted],
    ["secondary-foreground", t.foreground],
    ["accent", t.accent],
    ["accent-foreground", t.foreground],
    ["muted", t.muted],
    ["muted-foreground", t.mutedForeground],
    ["data-muted-foreground", t.mutedForeground],
    ["text-tertiary", t.mutedForeground],
    ["tertiary", t.warning],
    ["tertiary-foreground", onColor(t.warning)],
    ["warning", t.warning],
    ["destructive", t.destructive],
    ["destructive-foreground", t.destructiveForeground],
    ["success", t.success],
    ["border", t.border],
    ["border-strong", t.borderStrong],
    ["input", t.borderStrong],
    ["ring", t.ring],
    ...t.chart.map((v, i) => [`chart-${i + 1}`, v] as [string, string]),
    ["sidebar-background", t.glass],
    ["sidebar-foreground", t.foreground],
    ["sidebar-primary", t.primary],
    ["sidebar-primary-foreground", t.primaryForeground],
    ["sidebar-accent", t.accent],
    ["sidebar-accent-foreground", t.foreground],
    ["sidebar-border", t.border],
    ["sidebar-ring", t.ring],
    ...t.ribbon.map((v, i) => [`ribbon-${i + 1}`, v] as [string, string]),
    ["ribbon-opacity", t.ribbonOpacity],
  ];
  return c;
}

function block(selector: string, t: ThemeTokens, scheme?: string): string {
  const lines = vars(t).map(([name, v]) =>
    typeof v === "number" ? `  --${name}: ${v};` : `  --${name}: ${hexToHslTriplet(v)}; /* ${v.toUpperCase()} */`
  );
  if (scheme) lines.push(`  color-scheme: ${scheme};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

export function renderThemeCss(themes: ThemeDef[] = THEMES): string {
  const parts = [
    "/* Generated from src/shared/theme/themes.ts by `npm run theme:css`. Do not edit by hand. */",
  ];
  for (const theme of themes) {
    const sel = theme.id === "light" ? `:root,\n:root[data-theme="light"]` : `:root[data-theme="${theme.id}"]`;
    parts.push(block(sel, theme.tokens, theme.scheme));
    parts.push(block(`:root[data-theme="${theme.id}"][data-contrast="high"]`, highContrastTokens(theme.tokens)));
  }
  return parts.join("\n\n") + "\n";
}
