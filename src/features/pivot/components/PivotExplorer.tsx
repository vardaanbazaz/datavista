import React, { useMemo } from "react";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { usePivotStore } from "@/store/pivotStore";
import { pivotEngine, PivotConfig } from "@/shared/services/pivot";
import { PivotBuilder } from "./PivotBuilder";
import { PivotTable } from "./PivotTable";
import { AlertCircle, Filter, Grid3X3 } from "lucide-react";
import { Dataset } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { NoDatasetPlate } from "@/shared/components/NoDatasetPlate";
import { aggregationFlag } from "@/shared/utils/columnRoles";
import { columnValueCounts } from "@/shared/utils/valueCounts";

const DEFAULT_ROW_MAX_GROUPS = 50;

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

    // Default row: the first categorical/date column with a readable number of groups (2 to
    // DEFAULT_ROW_MAX_GROUPS distinct values), else the one with the fewest. The first column is
    // often a name or ID ("App": ~9,700 groups), which made a huge first pivot.
    const distinct = (name: string) =>
      activeDataset.metadata?.columns.find(c => c.name === name)?.uniqueValueCount ??
      columnValueCounts(activeDataset.data, name).length;
    const groupable = columnNames.filter(name => {
      const t = effectiveTypeOf(name);
      return t === 'categorical' || t === 'date';
    });
    const defaultRow =
      groupable.find(name => { const n = distinct(name); return n >= 2 && n <= DEFAULT_ROW_MAX_GROUPS; }) ??
      [...groupable].sort((a, b) => distinct(a) - distinct(b))[0];
    // Prefer a numeric column whose sum means something; a year/ID-like one is counted.
    const numericCols = columnNames.filter(name => effectiveTypeOf(name) === 'numeric');
    const defaultVal = numericCols.find(name => !aggregationFlag(activeDataset, name)) ?? numericCols[0];
    const defaultOp = defaultVal && aggregationFlag(activeDataset, defaultVal) ? 'count' : 'sum';

    if (defaultRow && defaultVal) {
      return {
        rowDimensions: [defaultRow],
        columnDimensions: [],
        valueFields: [
          {
            column: defaultVal,
            operator: defaultOp,
            displayName: `${defaultOp.toUpperCase()} of ${defaultVal}`
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
      <NoDatasetPlate view="Pivot Table" emblem={<Grid3X3 aria-hidden />}>
        Upload or pick a dataset to start a pivot analysis.
      </NoDatasetPlate>
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
                <Grid3X3 className="w-5 h-5 text-primary-ink" />
                <span className="text-sm font-medium text-muted-foreground">
                  Pivot Grid Visualization
                </span>
              </div>
              {filteredData.length !== activeDataset.data.length && (
                <div className="flex items-center gap-1.5 text-xs text-primary-ink font-medium bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                  <Filter className="w-3 h-3" aria-hidden />
                  <span>Filtered View Active ({filteredData.length} / {activeDataset.data.length} rows)</span>
                </div>
              )}
            </div>
            
            <PivotTable result={pivotResult} />
          </div>
        ) : pivotError ? (
          <div
            role="alert"
            className="surface-glass flex flex-col items-center justify-center h-[50vh] rounded-xl border-destructive/60 text-center select-none"
          >
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <h4 className="text-sm font-semibold mb-1 text-destructive">Pivot Table Failed to Render</h4>
            <p className="text-xs text-muted-foreground max-w-xs px-4">
              This pivot configuration hit an error while computing results. Try adjusting the value fields or dimensions.
            </p>
            <p className="text-xs text-destructive max-w-sm px-4 mt-2 font-mono break-words">
              {pivotError}
            </p>
          </div>
        ) : (
          <div className="surface-glass flex flex-col items-center justify-center h-[50vh] rounded-xl text-center select-none" data-testid="pivot-unconfigured">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Grid3X3 className="w-6 h-6 text-primary-ink" />
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
