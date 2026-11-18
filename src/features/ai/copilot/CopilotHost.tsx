/**
 * The copilot's frame, in the startup bundle (no AI code): the round button bottom-right,
 * Ctrl+J, and the panel shell. Large screens: an aside docked on the right of the workspace
 * row, so the main content shrinks; resizable 320-560 px, width remembered. Smaller screens:
 * a full-screen sheet (Radix dialog: focus trap, Esc). The contents (CopilotPanel and the AI
 * client) load on first open. Ctrl+J and the sidebar's Co-Pilot button open it with or
 * without a dataset (without one it shows "Load a dataset to start"); the round button only
 * shows while a dataset is loaded.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Sparkles } from "lucide-react";
import { useDatasetStore } from "@/store/datasetStore";
import { useUiStore } from "@/store/uiStore";
import { modKey, formatShortcut } from "@/shared/lib/platform";
import { COPILOT_MAX_WIDTH, COPILOT_MIN_WIDTH, useCopilotStore } from "./copilotStore";

const CopilotPanel = lazy(() => import("./CopilotPanel"));

const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

const Loading = () => <p className="p-4 text-sm text-frame-muted">Loading the copilot…</p>;

function ResizeHandle() {
  const width = useCopilotStore((s) => s.width);
  const setWidth = useCopilotStore((s) => s.setWidth);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setWidth(startW + (startX - ev.clientX));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  return (
    // A focusable separator with a value is the WAI-ARIA window-splitter widget (keyboard
    // resizable); jsx-a11y counts every separator as non-interactive.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize copilot panel"
      aria-valuemin={COPILOT_MIN_WIDTH}
      aria-valuemax={COPILOT_MAX_WIDTH}
      aria-valuenow={width}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable splitter (see above)
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") setWidth(width + step);
        else if (e.key === "ArrowRight") setWidth(width - step);
        else if (e.key === "Home") setWidth(COPILOT_MIN_WIDTH);
        else if (e.key === "End") setWidth(COPILOT_MAX_WIDTH);
        else return;
        e.preventDefault();
      }}
      className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-border hover:after:bg-primary focus-visible:outline-none focus-visible:after:w-0.5 focus-visible:after:bg-ring"
      data-testid="copilot-resize"
    />
  );
}

export function CopilotHost() {
  const hasDataset = useDatasetStore((s) => s.activeDataset !== null);
  const open = useCopilotStore((s) => s.open);
  const width = useCopilotStore((s) => s.width);
  const setOpen = useCopilotStore((s) => s.setOpen);
  const desktop = useIsDesktop();
  // The onboarding tour's step cards sit bottom-right / as a bottom sheet: keep the button out of their way.
  const tourRunning = useUiStore((s) => s.runTour);
  const fabRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  const asideRef = useRef<HTMLElement>(null);

  const close = useCallback(() => setOpen(false), [setOpen]);

  // Ctrl+J (Cmd+J on Mac) opens and closes it from anywhere in the app, dataset or not; the
  // browser's own Ctrl+J (downloads, Chrome) never runs while the app has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        useCopilotStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Esc closes the docked panel while focus is in it (the phone sheet's dialog handles its own).
  useEffect(() => {
    if (!open || !desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && asideRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, desktop, close]);

  // Toasts move up while the button shows (index.css html[data-copilot-fab]).
  const fabShown = hasDataset && !open && !tourRunning;
  useEffect(() => {
    const root = document.documentElement;
    if (fabShown) root.setAttribute("data-copilot-fab", "");
    else root.removeAttribute("data-copilot-fab");
    return () => root.removeAttribute("data-copilot-fab");
  }, [fabShown]);

  // Back to the button after closing.
  useEffect(() => {
    if (wasOpen.current && !open) requestAnimationFrame(() => fabRef.current?.focus());
    wasOpen.current = open;
  }, [open]);

  const shortcut = formatShortcut([modKey, "J"]);
  const title = (id: string) => (children: ReactNode) => (desktop ? <h2 id={id}>{children}</h2> : <DialogPrimitive.Title id={id}>{children}</DialogPrimitive.Title>);

  return (
    <>
      {fabShown && (
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Copilot (${shortcut})`}
          aria-keyshortcuts="Control+J Meta+J"
          title={`Ask the copilot (${shortcut})`}
          className="copilot-fab fixed bottom-6 right-6 z-[1000000000] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring motion-reduce:transition-none"
          data-testid="copilot-fab"
        >
          <Sparkles className="h-6 w-6" aria-hidden />
        </button>
      )}

      {open && desktop && (
        <aside
          aria-labelledby="copilot-title"
          className="surface-glass sticky top-0 z-20 flex h-screen shrink-0 flex-col rounded-none border-y-0 border-r-0"
          style={{ width }}
          ref={asideRef}
          data-testid="copilot-panel"
        >
          <ResizeHandle />
          <Suspense fallback={<Loading />}>
            <CopilotPanel onClose={close} title={title("copilot-title")} />
          </Suspense>
        </aside>
      )}

      {open && !desktop && (
        <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Content
              className="surface-glass fixed inset-0 z-50 flex flex-col rounded-none"
              aria-describedby={undefined}
              data-testid="copilot-panel"
            >
              <Suspense fallback={<Loading />}>
                <CopilotPanel onClose={close} title={title("copilot-title")} />
              </Suspense>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  );
}
