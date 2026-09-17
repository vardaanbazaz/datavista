import React, { useMemo } from "react";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { usePivotStore } from "@/store/pivotStore";
import { pivotEngine, PivotConfig } from "@/shared/services/pivot";
import { PivotBuilder } from "./PivotBuilder";
import { PivotTable } from "./PivotTable";
import { AlertCircle, Grid3X3, RefreshCw } from "lucide-react";
import { Dataset } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";

export const PivotExplorer: React.FC = () => {
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const filteredData = useFilterStore((state) => state.filteredData);
  const pivotConfig = usePivotStore((state) => state.pivotConfig);
  const setPivotConfig = usePivotStore((state) => state.setPivotConfig);
  const setPivotResult = usePivotStore((state) => state.setPivotResult);

  // Default pivot configuration if none exists
  const resolvedConfig = useMemo((): PivotConfig | null => {
    if (pivotConfig) return pivotConfig;
    if (!activeDataset) return null;

    const columnNames = activeDataset.metadata
      ? activeDataset.metadata.columns.map(c => c.name)
      : activeDataset.columns;

    const effectiveTypeOf = (name: string) => getEffectiveColumnType(activeDataset, name);

    // Pick first categorical column as default row, numeric as default value
    const defaultRow = columnNames.find(name => {
      const t = effectiveTypeOf(name);
      return t === 'categorical' || t === 'date';
    });
    const defaultVal = columnNames.find(name => effectiveTypeOf(name) === 'numeric');

    if (defaultRow && defaultVal) {
      return {
        rowDimensions: [defaultRow],
        columnDimensions: [],
        valueFields: [
          {
            column: defaultVal,
            operator: 'sum',
            displayName: `SUM of ${defaultVal}`
          }
        ],
        displayOptions: {
          showRowTotals: true,
          showColumnTotals: true,
          showGrandTotals: true
        }
      };
    }

    return null;
  }, [activeDataset, pivotConfig]);

  // Sync back resolved default config to store
  React.useEffect(() => {
    if (resolvedConfig && !pivotConfig) {
      setPivotConfig(resolvedConfig);
    }
  }, [resolvedConfig, pivotConfig, setPivotConfig]);

  // Compute Pivot Result
  const { pivotResult, pivotError } = useMemo(() => {
    if (!activeDataset || !resolvedConfig || resolvedConfig.valueFields.length === 0) {
      return { pivotResult: null, pivotError: null };
    }

    try {
      // Build a synthetic dataset with the filtered rows to pivot over active filters
      const syntheticDataset: Dataset = {
        ...activeDataset,
        data: filteredData
      };
      return { pivotResult: pivotEngine.execute(syntheticDataset, resolvedConfig), pivotError: null };
    } catch (e) {
      console.error("Pivot execution failed:", e);
      return {
        pivotResult: null,
        pivotError: e instanceof Error ? e.message : String(e)
      };
    }
  }, [activeDataset, filteredData, resolvedConfig]);

  // Sync pivotResult with usePivotStore
  React.useEffect(() => {
    setPivotResult(pivotResult);
    return () => {
      setPivotResult(null);
    };
  }, [pivotResult, setPivotResult]);

  if (!activeDataset) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Active Dataset</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Please upload or select a dataset first to begin multidimensional pivot analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
      {/* Configuration Sidebar */}
      <PivotBuilder dataset={activeDataset} />

      {/* Main Viewport */}
      <div className="flex-1 w-full lg:min-w-0">
        {pivotResult ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">
                  Pivot Grid Visualization
                </span>
              </div>
              {filteredData.length !== activeDataset.data.length && (
                <div className="flex items-center gap-1.5 text-xs text-secondary font-medium bg-secondary/10 px-2.5 py-1 rounded-full border border-secondary/20">
                  <RefreshCw className="w-3 h-3 animate-spin-slow" />
                  <span>Filtered View Active ({filteredData.length} / {activeDataset.data.length} rows)</span>
                </div>
              )}
            </div>
            
            <PivotTable result={pivotResult} />
          </div>
        ) : pivotError ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center h-[50vh] border border-destructive/40 rounded-xl bg-destructive/5 text-center select-none"
          >
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <h4 className="text-sm font-semibold mb-1 text-destructive">Pivot Table Failed to Render</h4>
            <p className="text-xs text-muted-foreground max-w-xs px-4">
              This pivot configuration hit an error while computing results. Try adjusting the value fields or dimensions.
            </p>
            <p className="text-[11px] text-destructive/70 max-w-sm px-4 mt-2 font-mono break-words">
              {pivotError}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[50vh] border border-dashed border-border rounded-xl bg-muted/5 text-center select-none">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
              <Grid3X3 className="w-6 h-6 text-accent" />
            </div>
            <h4 className="text-sm font-semibold mb-1">Pivot Table Unconfigured</h4>
            <p className="text-xs text-muted-foreground max-w-xs px-4">
              Select at least one value metric and row/column dimension in the settings panel to generate your pivot grid.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
export default PivotExplorer;
