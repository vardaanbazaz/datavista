import { ReactNode, useEffect, useRef } from "react";
import { ChevronRight, Palette, Search } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { LoadingProgress } from "@/shared/components/LoadingSpinner";
import { Button } from "@/shared/components/ui/button";
import { Hint } from "@/shared/components/Hint";
import { modKey, formatShortcut } from "@/shared/lib/platform";
import { VIEW_LABELS } from "@/store/viewTypes";

interface MainContentProps {
  children: ReactNode;
  onOpenSearch?: () => void;
}

/**
 * The main column: a sticky glass header (large screens; on phones the sidebar's compact row is
 * the header) with where you are, global search and Appearance, then the active view.
 */
export function MainContent({ children, onOpenSearch }: MainContentProps) {
  const activeView = useUiStore((state) => state.activeView);
  const openAppearance = useUiStore((state) => state.setIsAppearanceOpen);
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  // A dataset left on disk at startup is being read after being selected (datasetStore.loadRows).
  const rowsLoading = useDatasetStore((state) => state.rowsLoading);
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  // Start every newly selected view at its top, whichever control switched it (sidebar,
  // command palette, shortcut). Skip the initial mount so a restored session keeps the
  // browser's own scroll restoration.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [activeView]);

  return (
    <div className="relative z-10 flex min-h-screen min-w-0 flex-1 flex-col">
      <header className="surface-float sticky top-0 z-30 hidden h-14 items-center gap-3 rounded-none border-x-0 border-t-0 px-6 lg:flex" data-testid="top-header">
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <span className="truncate text-frame-muted" data-testid="header-dataset">
            {activeDataset ? activeDataset.name : "No dataset"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-frame-muted" aria-hidden />
          <span className="truncate font-medium text-foreground" aria-current="page">
            {VIEW_LABELS[activeView]}
          </span>
        </nav>
        {/* The name starts with the visible text (WCAG 2.5.3). The shortcut badge is CSS generated
            content, so it isn't part of the label; the tooltip and name still give it. */}
        <Hint label="Global search: charts, datasets and views" shortcut={[modKey, "K"]}>
          <Button variant="outline" data-tour="global-search" className="h-9 w-64 justify-between px-3 text-frame-muted hover:text-foreground" onClick={() => onOpenSearch?.()}>
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span>Global search</span>
            </span>
            <kbd
              aria-hidden="true"
              data-keys={formatShortcut([modKey, "K"])}
              className="inline-block rounded border border-border px-1.5 py-0.5 font-mono text-xs text-frame-muted after:content-[attr(data-keys)]"
            />
          </Button>
        </Hint>
        <Hint label="Appearance: theme, transparency, animation, text size, contrast">
          <Button variant="outline" className="h-9 gap-2 px-3" onClick={() => openAppearance(true)} data-tour="appearance" data-testid="open-appearance">
            <Palette className="h-4 w-4 text-primary-ink" />
            Appearance
          </Button>
        </Hint>
      </header>
      <main ref={mainRef} id="main-content" className="flex-1 overflow-auto p-4 sm:p-8">
        {rowsLoading ? (
          <LoadingProgress
            title={`Loading “${rowsLoading.name}”`}
            step="Reading its rows from this browser's storage"
            loaded={rowsLoading.loadedRows}
            total={rowsLoading.totalRows}
          />
        ) : (
          children
        )}
      </main>
    </div>
  );
}
