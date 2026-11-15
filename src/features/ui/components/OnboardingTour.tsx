/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import { Joyride, ACTIONS, EVENTS, STATUS, type EventData, type FloatingOptions, type Step } from "react-joyride";

type Middleware = NonNullable<FloatingOptions["middleware"]>[number];
import { useShallow } from "zustand/react/shallow";
import { useUiStore, type ViewType } from "@/store/uiStore";

/*
 * The product tour (batch 7 phase B): one short step per section, in the sidebar's order, then
 * Appearance. Each step's `before` hook switches to its view and waits until the view's page
 * header (data-tour="view-<id>") is on screen, laid out and fully faded in. Steps never show a
 * beacon; closing, Esc or Skip ends the tour (Joyride unmounts, so nothing is left on the page).
 * Restart from the "?" button or Appearance (uiStore.resetTour).
 *
 * Placement, so the popover never hides what it explains (fix-ups after batch 7 phase B):
 * - 1024 px and wider (the sidebar is shown): the step highlights the view's sidebar item and the
 *   popover sits to its right, flipping if there is no room; the page itself stays visible under
 *   a light dim. Appearance: below the header button.
 * - Narrower (the sidebar is folded into the Menu button): the view header is highlighted and the
 *   popover is a bottom sheet pinned to the bottom of the screen.
 * The mode is fixed when the tour starts.
 */

/** Same breakpoint as the sidebar (Sidebar.tsx: `lg:flex`). */
export const TOUR_SIDEBAR_QUERY = "(min-width: 1024px)";

interface TourStop {
  view: ViewType;
  title: string;
  content: string;
}

/** In sidebar order (Sidebar.tsx navItems); tour.spec.ts checks the order against the sidebar. */
export const TOUR_STOPS: TourStop[] = [
  { view: "overview", title: "Overview", content: "A summary of the active dataset: key numbers, column types and quick insights." },
  { view: "upload", title: "Upload Data", content: "Add a CSV, TSV or Excel file; it is read and kept in this browser." },
  { view: "filters", title: "Filters", content: "Narrow the rows that every other view works with." },
  { view: "charts", title: "Charts", content: "Build bar, line, pie, scatter and other charts from any columns." },
  { view: "data", title: "Data Explorer", content: "Browse, sort and search the rows, and fix data problems DataVista finds." },
  { view: "pivot", title: "Pivot Table", content: "Group rows by one or more columns and summarise them." },
  { view: "stats", title: "Statistics", content: "Averages, spread, distributions and correlations for each column." },
  { view: "window-builder", title: "Window Functions", content: "Running totals, ranks and moving averages over ordered rows." },
  { view: "export", title: "Export", content: "Download the filtered rows as CSV, charts as images, or a PDF report." },
];

const APPEARANCE_TEXT =
  "Themes (or Automatic day and night), transparency, background animation, text size and high contrast. Turn the effects off if things feel slow. On a phone it is in the menu.";

const visible = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el.getClientRects().length > 0) ?? null;

/** The visible Appearance control: the header button on large screens; on phones it is inside the menu, so the menu button. */
function appearanceTarget(): HTMLElement | null {
  return visible('[data-tour="appearance"]') ?? visible('[data-testid="mobile-menu-toggle"]');
}

/** Resolves once `find()` returns an element that is laid out, fully opaque and has not moved for 3 frames (or after `timeout`). */
export function waitForSteady(find: () => HTMLElement | null, timeout = 8000): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let last = "";
    let same = 0;
    const tick = () => {
      const el = find();
      if (el?.isConnected) {
        const r = el.getBoundingClientRect();
        let opacity = 1;
        for (let n: HTMLElement | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
        const key = `${r.top.toFixed(1)}|${r.left.toFixed(1)}|${r.width.toFixed(1)}|${r.height.toFixed(1)}`;
        same = key === last ? same + 1 : 0;
        last = key;
        if (r.width > 0 && r.height > 0 && opacity >= 0.999 && same >= 3) return resolve();
      }
      if (performance.now() - start > timeout) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Pins the popover to the bottom of the viewport, centred (runs after Joyride's own middleware). */
const bottomSheet: Middleware = {
  name: "bottomSheet",
  fn: ({ rects }) => ({
    x: Math.max(0, (window.innerWidth - rects.floating.width) / 2),
    y: Math.max(0, window.innerHeight - rects.floating.height - 8),
  }),
};

const SHEET: Partial<Step> = {
  isFixed: true,
  floatingOptions: { strategy: "fixed", hideArrow: true, middleware: [bottomSheet] },
  width: "min(32rem, calc(100vw - 16px))",
  styles: { tooltip: { borderRadius: "16px 16px 12px 12px", maxHeight: "45vh", overflowY: "auto" } },
};

/**
 * Beside the sidebar item, but never over the view's header (its title and actions): the
 * popover moves down until it clears the header, as far as the viewport allows. The arrow is
 * hidden on these steps (the spotlight marks the item), since it could no longer point at it.
 */
const belowHeader = (header: string): Middleware => ({
  name: "belowHeader",
  fn: ({ y, rects }) => {
    const h = document.querySelector<HTMLElement>(header)?.getBoundingClientRect();
    if (!h) return {};
    const maxY = window.innerHeight - rects.floating.height - 8;
    return { y: Math.max(8, Math.min(Math.max(y, h.bottom + 12), maxY)) };
  },
});

const besideSidebar = (header: string): Partial<Step> => ({
  placement: "right",
  isFixed: true,
  floatingOptions: { strategy: "fixed", hideArrow: true, middleware: [belowHeader(header)] },
  overlayColor: SIDE_DIM,
  spotlightPadding: 4,
});

const SIDE_DIM = "rgba(0, 0, 0, 0.25)";

export function OnboardingTour() {
  const { runTour, setRunTour, setHasSeenTour } = useUiStore(
    useShallow((s) => ({ runTour: s.runTour, setRunTour: s.setRunTour, setHasSeenTour: s.setHasSeenTour }))
  );

  // Decided once per run (runTour flips to true), so resizing mid-tour doesn't swap the steps.
  const withSidebar = useMemo(
    () => (runTour && typeof window !== "undefined" ? window.matchMedia(TOUR_SIDEBAR_QUERY).matches : true),
    [runTour]
  );

  const steps = useMemo<Step[]>(() => {
    const go = (view: ViewType, find: () => HTMLElement | null) => async () => {
      const ui = useUiStore.getState();
      if (ui.activeView !== view) ui.setActiveView(view);
      // The header, not the sidebar item: the item never moves, so it would resolve before the view is in.
      await waitForSteady(find);
    };
    const viewSteps: Step[] = TOUR_STOPS.map((s) => {
      const header = `[data-tour="view-${s.view}"]`;
      const find = () => document.querySelector<HTMLElement>(header);
      const common = { id: s.view, title: s.title, content: s.content, before: go(s.view, find), data: { view: s.view } };
      return withSidebar
        ? { ...common, ...besideSidebar(header), target: `[data-testid="sidebar-nav-${s.view}"]` }
        : { ...common, ...SHEET, target: header, placement: "bottom" };
    });
    const appearance: Step = {
      id: "appearance",
      target: () => appearanceTarget() ?? document.body,
      title: "Appearance",
      content: APPEARANCE_TEXT,
      before: async () => {
        await waitForSteady(() => appearanceTarget() ?? document.body, 3000);
      },
      data: { view: "appearance" },
      ...(withSidebar ? { placement: "bottom-end", overlayColor: SIDE_DIM } : { ...SHEET, placement: "bottom" }),
    };
    return [...viewSteps, appearance];
  }, [withSidebar]);

  const end = () => {
    setRunTour(false);
    setHasSeenTour(true);
  };

  const onEvent = (data: EventData) => {
    const finished = data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED;
    if (finished || data.type === EVENTS.TOUR_END || data.action === ACTIONS.CLOSE || data.action === ACTIONS.SKIP) end();
  };

  if (!runTour) return null;

  return (
    <Joyride
      steps={steps}
      run={runTour}
      continuous
      onEvent={onEvent}
      options={{
        skipBeacon: true,
        closeButtonAction: "skip",
        dismissKeyAction: "close",
        overlayClickAction: false,
        targetWaitTimeout: 8000,
        beforeTimeout: 10000,
        primaryColor: "hsl(var(--primary))",
        textColor: "hsl(var(--foreground))",
        backgroundColor: "hsl(var(--glass))",
        arrowColor: "hsl(var(--glass))",
        overlayColor: "rgba(0, 0, 0, 0.45)",
        zIndex: 10000,
        showProgress: true,
        spotlightRadius: 14,
        spotlightPadding: 8,
        buttons: ["back", "close", "primary", "skip"],
      }}
      styles={{
        tooltip: {
          borderRadius: "16px",
          padding: "1rem",
          border: "1px solid hsl(var(--border-strong))",
          fontFamily: "inherit",
          fontSize: "0.9375rem",
          boxShadow: "0 24px 48px -16px rgb(0 0 0 / 0.4)",
        },
        tooltipTitle: { fontSize: "1.0625rem", fontWeight: 600, textAlign: "left", margin: 0 },
        tooltipContent: { textAlign: "left", padding: "0.5rem 0 0" },
        buttonPrimary: {
          borderRadius: "8px",
          fontSize: "0.875rem",
          fontWeight: 600,
          padding: "0.5rem 1rem",
          color: "hsl(var(--primary-foreground))",
        },
        buttonBack: { marginRight: "0.5rem", fontSize: "0.875rem", color: "hsl(var(--foreground))" },
        buttonSkip: { fontSize: "0.875rem", color: "hsl(var(--frame-muted))" },
        buttonClose: { color: "hsl(var(--frame-muted))" },
      }}
    />
  );
}

export default OnboardingTour;
