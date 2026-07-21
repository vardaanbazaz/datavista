import { Dataset, DatasetMetadata, ChartConfig } from "@/shared/types";

export interface ColumnTypeChange {
  columnName: string;
  oldType: "numeric" | "categorical" | "date";
  newType: "numeric" | "categorical" | "date";
}

export interface AffectedChartInfo {
  chartId: string;
  chartTitle: string;
  reason: string;
}

export interface SchemaDiffReport {
  addedColumns: string[];
  removedColumns: string[];
  typeChanges: ColumnTypeChange[];
  isBreaking: boolean;
  affectedCharts: AffectedChartInfo[];
}

export function generateSchemaDiff(
  oldDataset: Dataset,
  newDatasetInfo: {
    columns: string[];
    columnTypes: Record<string, "numeric" | "categorical" | "date">;
    metadata?: DatasetMetadata;
  },
  charts: ChartConfig[] = []
): SchemaDiffReport {
  const oldCols = oldDataset.columns || [];
  const newCols = newDatasetInfo.columns || [];

  const addedColumns = newCols.filter((col) => !oldCols.includes(col));
  const removedColumns = oldCols.filter((col) => !newCols.includes(col));

  const typeChanges: ColumnTypeChange[] = [];
  oldCols.forEach((col) => {
    if (newCols.includes(col)) {
      const oldType = oldDataset.columnTypes?.[col];
      const newType = newDatasetInfo.columnTypes?.[col];
      if (oldType && newType && oldType !== newType) {
        typeChanges.push({
          columnName: col,
          oldType,
          newType,
        });
      }
    }
  });

  const isBreaking = removedColumns.length > 0 || typeChanges.length > 0;

  const datasetCharts = charts.filter((c) => c.datasetId === oldDataset.id);
  const affectedCharts: AffectedChartInfo[] = [];

  datasetCharts.forEach((chart) => {
    const usedColumns = [
      chart.xAxis,
      chart.yAxis,
      chart.groupBy,
      chart.sizeBy,
      ...(chart.drillPath || []),
    ].filter((c): c is string => Boolean(c));

    const missingUsed = usedColumns.filter((col) => removedColumns.includes(col));
    const changedTypeUsed = usedColumns.filter((col) =>
      typeChanges.some((tc) => tc.columnName === col)
    );

    if (missingUsed.length > 0) {
      affectedCharts.push({
        chartId: chart.id,
        chartTitle: chart.title,
        reason: `Uses removed column(s): ${missingUsed.join(", ")}`,
      });
    } else if (changedTypeUsed.length > 0) {
      const tcDetails = changedTypeUsed
        .map((col) => {
          const tc = typeChanges.find((t) => t.columnName === col);
          return `${col} (${tc?.oldType} -> ${tc?.newType})`;
        })
        .join(", ");

      affectedCharts.push({
        chartId: chart.id,
        chartTitle: chart.title,
        reason: `Uses modified data type column(s): ${tcDetails}`,
      });
    }
  });

  return {
    addedColumns,
    removedColumns,
    typeChanges,
    isBreaking,
    affectedCharts,
  };
}
