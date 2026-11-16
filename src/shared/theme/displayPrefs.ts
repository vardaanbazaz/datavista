import { applyAttributes, resolveThemeId, type Appearance, type ThemeSetting } from "./boot";
import { THEME_BY_ID, isThemeId, type ThemeId } from "./themes";

const media = (q: string) => typeof window !== "undefined" && Boolean(window.matchMedia?.(q).matches);

export const systemPrefersDark = () => media("(prefers-color-scheme: dark)");
export const prefersReducedMotion = () => media("(prefers-reduced-motion: reduce)");
export const prefersReducedTransparency = () => media("(prefers-reduced-transparency: reduce)");
export const supportsBackdropFilter = () =>
  typeof CSS !== "undefined" &&
  (CSS.supports?.("backdrop-filter", "blur(1px)") || CSS.supports?.("-webkit-backdrop-filter", "blur(1px)"));

/** Whether animations should be cut, after the person's choice and the device setting. */
export function motionIsReduced(appearance: Pick<Appearance, "motion">): boolean {
  if (appearance.motion === "reduce") return true;
  if (appearance.motion === "full") return false;
  return prefersReducedMotion();
}

/** Why glass is off although the person left Transparency on, or null when it is on. */
export function transparencyBlockedReason(appearance: Appearance): string | null {
  if (appearance.highContrast) return "Off while High contrast is on.";
  if (prefersReducedTransparency()) return "Off: your device asks for reduced transparency.";
  if (!supportsBackdropFilter()) return "Off: this browser can't blur behind panels.";
  return null;
}

export function resolveTheme(setting: ThemeSetting, now: Date = new Date()): ThemeId {
  const id = resolveThemeId(setting, systemPrefersDark(), now.getHours() * 60 + now.getMinutes());
  return isThemeId(id) ? id : "light";
}

/**
 * Puts the resolved theme and the Appearance attributes on <html> (same function as the
 * pre-paint script in index.html, see boot.ts). Returns the theme it applied.
 */
export function applyDisplayPrefs(setting: ThemeSetting, appearance: Appearance, root: HTMLElement = document.documentElement): ThemeId {
  const id = resolveTheme(setting);
  applyAttributes(root, id, THEME_BY_ID[id].scheme === "dark", appearance);
  return id;
}

/** Milliseconds until the schedule's next switch (day or night start), from `now`. */
export function msUntilNextSwitch(setting: ThemeSetting, now: Date = new Date()): number {
  const toMin = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = [toMin(setting.dayStart), toMin(setting.nightStart)]
    .filter((m) => Number.isFinite(m))
    .map((m) => (m > nowMin ? m - nowMin : m + 1440 - nowMin))
    .sort((a, b) => a - b)[0] ?? 1440;
  return next * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}
