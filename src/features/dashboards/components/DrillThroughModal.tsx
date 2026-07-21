import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { DataTable } from "@/features/datasets/components/DataTable";
import { useDrillStore } from "@/features/dashboards/store/drillStore";
import { useDatasetStore } from "@/store/datasetStore";
import { queryEngine } from "@/shared/services/queryEngine";
import { Badge } from "@/shared/components/ui/badge";
import { Database } from "lucide-react";

export function DrillThroughModal() {
  const isOpen = useDrillStore((state) => state.isDrillThroughOpen);
  const close = useDrillStore((state) => state.closeDrillThrough);
  const datasetId = useDrillStore((state) => state.drillThroughDatasetId);
  const query = useDrillStore((state) => state.drillThroughQuery);
  const title = useDrillStore((state) => state.drillThroughTitle);

  const datasets = useDatasetStore((state) => state.datasets);
  const dataset = useMemo(() => {
    if (!datasetId) return null;
    return datasets.find((d) => d.id === datasetId) || null;
  }, [datasets, datasetId]);

  // Execute raw query using queryEngine
  const drillThroughData = useMemo(() => {
    if (!dataset || !query) return [];
    const result = queryEngine.execute(dataset, query);
    return result.rows;
  }, [dataset, query]);

  const customDataset = useMemo(() => {
    if (!dataset) return null;
    return {
      ...dataset,
      data: drillThroughData,
    };
  }, [dataset, drillThroughData]);

  if (!isOpen || !dataset || !customDataset) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-6xl w-11/12 max-h-[90vh] flex flex-col p-6 overflow-hidden border-border bg-background shadow-2xl glass">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Database className="h-5 w-5 text-primary animate-pulse" />
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            Showing up to <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{drillThroughData.length}</Badge> raw records matching the selected data point.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto mt-4">
          <DataTable
            customDataset={customDataset}
            customData={drillThroughData}
            hideCalculatedFields={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
