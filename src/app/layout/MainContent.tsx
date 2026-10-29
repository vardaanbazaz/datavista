import { ReactNode, useEffect, useRef } from "react";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { LoadingProgress } from "@/shared/components/LoadingSpinner";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  const activeView = useUiStore((state) => state.activeView);
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
    <div className="flex-1 flex flex-col min-h-screen">
      <main ref={mainRef} id="main-content" className="flex-1 p-8 overflow-auto">
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
