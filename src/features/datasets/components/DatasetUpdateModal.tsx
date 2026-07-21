import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Layers } from "lucide-react";
import { Dataset, DataRow, DatasetMetadata } from "@/shared/types";
import { generateSchemaDiff } from "@/shared/services/dataset/schemaDiff";
import { useChartStore } from "@/store/chartStore";

interface DatasetUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDataset: Dataset | null;
  newParsedData: {
    data: DataRow[];
    columns: string[];
    columnTypes: Record<string, "numeric" | "categorical" | "date">;
    metadata?: DatasetMetadata;
  } | null;
  onConfirm: () => void;
}

export function DatasetUpdateModal({
  isOpen,
  onClose,
  existingDataset,
  newParsedData,
  onConfirm,
}: DatasetUpdateModalProps) {
  const charts = useChartStore((state) => state.charts);

  const diffReport = useMemo(() => {
    if (!existingDataset || !newParsedData) return null;
    return generateSchemaDiff(existingDataset, newParsedData, charts);
  }, [existingDataset, newParsedData, charts]);

  if (!existingDataset || !newParsedData || !diffReport) return null;

  const currentVersion = existingDataset.version || 1;
  const nextVersion = currentVersion + 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col glass border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <RefreshCw className="h-5 w-5 text-primary" />
            Dataset Schema Diffing & Version Upgrade
          </DialogTitle>
          <DialogDescription>
            Updating <span className="font-semibold text-foreground">"{existingDataset.name}"</span> from v{currentVersion} to v{nextVersion} ({newParsedData.data.length.toLocaleString()} rows).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[450px] pr-2 space-y-4">
          {/* Status Alert Banner */}
          {!diffReport.isBreaking ? (
            <div className="p-3.5 rounded-lg border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Safe to Update</h4>
                <p className="text-xs opacity-90">
                  No columns were removed and no column data types were modified. All existing charts and calculated fields remain compatible.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Breaking Changes Detected</h4>
                <p className="text-xs opacity-90">
                  The new file contains missing columns or modified column data types. Dashboard widgets relying on missing schema elements may require reconfiguration.
                </p>
              </div>
            </div>
          )}

          {/* Schema Diff Grid */}
          <div className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-3 mt-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Schema Comparison Breakdown
            </h4>

            {/* Removed Columns */}
            {diffReport.removedColumns.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-destructive">
                  Removed Columns ({diffReport.removedColumns.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {diffReport.removedColumns.map((col) => (
                    <Badge key={col} variant="destructive" className="text-xs">
                      -{col}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Type Changes */}
            {diffReport.typeChanges.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Modified Data Types ({diffReport.typeChanges.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {diffReport.typeChanges.map((tc) => (
                    <Badge key={tc.columnName} variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-300">
                      {tc.columnName}: {tc.oldType} &rarr; {tc.newType}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Added Columns */}
            {diffReport.addedColumns.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  New Columns Added ({diffReport.addedColumns.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {diffReport.addedColumns.map((col) => (
                    <Badge key={col} variant="secondary" className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30">
                      +{col}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {diffReport.removedColumns.length === 0 &&
              diffReport.typeChanges.length === 0 &&
              diffReport.addedColumns.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Identical schema detected (no column additions, deletions, or data type changes).
                </p>
              )}
          </div>

          {/* Affected Charts Section */}
          {diffReport.affectedCharts.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Affected Dashboard Charts ({diffReport.affectedCharts.length})
              </h4>
              <div className="space-y-2">
                {diffReport.affectedCharts.map((item) => (
                  <div
                    key={item.chartId}
                    className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 text-xs flex items-center justify-between gap-3"
                  >
                    <span className="font-semibold">{item.chartTitle}</span>
                    <span className="text-muted-foreground">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={diffReport.isBreaking ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            {diffReport.isBreaking ? "Confirm & Risk Update" : "Confirm Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
