import { ReactNode, useEffect, useRef } from "react";
import { useUiStore } from "@/store/uiStore";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  const activeView = useUiStore((state) => state.activeView);
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
        {children}
      </main>
    </div>
  );
}
