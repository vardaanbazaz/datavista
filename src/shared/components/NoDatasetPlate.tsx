import type { ReactNode } from "react";
import { Upload } from "lucide-react";
import { Bookplate } from "@/shared/components/ornament";
import { Button } from "@/shared/components/ui/button";
import { useUiStore } from "@/store/uiStore";

/**
 * The empty state of every view that needs a dataset: an ex-libris bookplate naming the
 * view, what to do, and a button to the upload screen.
 */
export function NoDatasetPlate({ view, emblem, children }: { view: string; emblem: ReactNode; children: ReactNode }) {
  const setActiveView = useUiStore((s) => s.setActiveView);
  return (
    <Bookplate
      inscription={view}
      title="No dataset yet"
      level={3}
      emblem={emblem}
      data-testid="no-dataset"
      actions={
        <Button onClick={() => setActiveView("upload")} className="gap-2">
          <Upload className="h-4 w-4" aria-hidden />
          Upload data
        </Button>
      }
    >
      {children}
    </Bookplate>
  );
}
