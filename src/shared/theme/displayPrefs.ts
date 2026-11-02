import type { ReadingComfort } from "@/store/uiStore";

export type ThemeChoice = "light" | "dark" | "system";

const systemDark = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Whether animations should be cut, after the person's choice and the device setting. */
export function motionIsReduced(comfort: ReadingComfort): boolean {
  if (comfort.motion === "reduce") return true;
  if (comfort.motion === "full") return false;
  return prefersReducedMotion();
}

/**
 * Puts the theme class and the Reading comfort attributes on <html>. Called synchronously
 * in src/main.tsx before the first render (so Extra large text or high contrast never
 * flashes in at the default first) and again on every change of the stored prefs.
 * index.css reads: .dark, data-contrast, data-text-size, data-motion, data-frames.
 */
export function applyDisplayPrefs(theme: ThemeChoice, comfort: ReadingComfort, root: HTMLElement = document.documentElement) {
  const resolved = theme === "system" ? (systemDark() ? "dark" : "light") : theme;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.dataset.textSize = comfort.textSize;
  root.dataset.motion = comfort.motion;
  root.dataset.frames = comfort.simpleFrames ? "simple" : "ornate";
  if (comfort.highContrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
}
