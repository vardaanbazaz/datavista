import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Hint } from "@/shared/components/Hint";
import { cn } from "@/shared/lib/utils";
import { ChartConfig } from "@/shared/types";
import { ChartVisualization } from "./ChartVisualization";

/**
 * "Expand" control for a chart card: opens the chart in a near-full-viewport modal.
 * The modal mounts its own ChartVisualization with fitHeight, so the chart is redrawn at
 * the modal's size and keeps its click-to-filter/drill and hover titles. Radix Dialog
 * provides the focus trap, Esc / backdrop / close-button dismissal, and returns focus to
 * this button on close.
 */
export function ChartExpandButton({ chart, className }: { chart: ChartConfig; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Hint label="View full screen">
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 gap-1.5 px-2 text-xs", className)}
            data-testid="chart-expand-button"
          >
            <Maximize2 className="h-4 w-4" />
            {/* Visible on narrow (typically touch) screens, where there is no hover tooltip. */}
            <span className="sm:sr-only">Expand</span>
          </Button>
        </DialogTrigger>
      </Hint>
      <DialogContent
        className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-3 p-4 sm:p-6"
        data-testid="chart-expand-dialog"
        aria-describedby={undefined}
      >
        <DialogTitle className="pr-8 text-base font-semibold truncate">{chart.title}</DialogTitle>
        <div className="min-h-0 flex-1" data-testid="chart-expand-body">
          {isOpen && <ChartVisualization chart={chart} fitHeight />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
