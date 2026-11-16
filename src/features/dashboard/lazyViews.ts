import { lazy } from "react";
import type { ViewType } from "@/store/uiStore";

/*
 * The views whose code is split into their own chunks. Dashboard renders them through
 * React.lazy; the tour (OnboardingTour) calls preloadView for the next step before moving,
 * so the chunk is already in the module cache and Suspense never falls back. Calling a loader
 * twice is free: import() returns the cached module.
 */
const loadPivot = () => import("@/features/pivot/components/PivotExplorer").then((m) => ({ default: m.PivotExplorer }));
const loadStats = () => import("@/features/stats/components/StatsExplorer").then((m) => ({ default: m.StatsExplorer }));
const loadWindow = () => import("@/features/window/components/WindowExplorer").then((m) => ({ default: m.WindowExplorer }));

const loaders: Partial<Record<ViewType, () => Promise<unknown>>> = {
  pivot: loadPivot,
  stats: loadStats,
  "window-builder": loadWindow,
};

export const PivotExplorer = lazy(loadPivot);
export const StatsExplorer = lazy(loadStats);
export const WindowExplorer = lazy(loadWindow);

/** Starts loading a view's code (no-op for views in the main bundle). Never throws. */
export function preloadView(view: ViewType | undefined): void {
  const load = view ? loaders[view] : undefined;
  load?.().catch(() => {
    /* a failed prefetch is retried by React.lazy when the view renders */
  });
}
