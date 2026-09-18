import { Dataset } from "@/shared/types";
import { PivotResultModel } from "@/shared/services/pivot";
import { StatsResultModel } from "./resultModel";
import { computeDescriptive } from "./descriptive";
import { computeCorrelationMatrix } from "./correlation";
import { computeOutliers } from "./outliers";
import { DescriptiveStats, OutlierInfo } from "./types";

export const statsEngine = {
  /**
   * Computes descriptive statistics, correlation matrix, and outliers for all numeric columns in a dataset.
   */
  calculateDatasetStats(
    dataset: Dataset,
    options?: { outlierMethod?: 'iqr' | 'zscore'; outlierThreshold?: number; isFullDataset?: boolean }
  ): StatsResultModel {
    const descriptive: Record<string, DescriptiveStats> = {};
    const outliers: Record<string, OutlierInfo> = {};

    // 1. Resolve numeric columns (imported and calculated)
    const numericCols = dataset.metadata
      ? dataset.metadata.columns.filter(c => c.inferredDataType === 'numeric').map(c => c.name)
      : dataset.columns.filter(col => dataset.columnTypes[col] === "numeric");

    // 2. Extract column values and run summary calculations
    for (const col of numericCols) {
      const rawValues = dataset.data.map(row => row[col]);
      const colMeta = dataset.metadata?.columns.find(c => c.name === col);

      descriptive[col] = computeDescriptive(rawValues, colMeta, options?.isFullDataset);
      outliers[col] = computeOutliers(rawValues, options?.outlierMethod ?? 'iqr', {
        threshold: options?.outlierThreshold
      });
    }

    // 3. Compute Pearson correlation matrix
    const correlationMatrix = computeCorrelationMatrix(dataset.data, numericCols);

    return new StatsResultModel(descriptive, outliers, correlationMatrix);
  },

  /**
   * Computes descriptive statistics for a row or column slice of a pivot result.
   */
  calculatePivotStats(
    pivotResult: PivotResultModel,
    options: {
      rowPath?: string[];
      colPath?: string[];
      valueFieldAlias: string;
    }
  ): DescriptiveStats | null {
    const { rowPath, colPath, valueFieldAlias } = options;
    const values: number[] = [];

    if (rowPath !== undefined && colPath === undefined) {
      // Analyze values of a specific row path across all leaf columns
      const leafCols = pivotResult.columns.filter(c => !c.isTotal && c.level !== -1);
      for (const col of leafCols) {
        const val = pivotResult.getCell(rowPath, col.path, valueFieldAlias);
        if (val !== null && val !== undefined && typeof val === "number") {
          values.push(val);
        }
      }
    } else if (colPath !== undefined && rowPath === undefined) {
      // Analyze values of a specific column path across all leaf rows
      const leafRows = pivotResult.rows.filter(r => r.children.length === 0 && r.level !== -1);
      for (const row of leafRows) {
        const val = pivotResult.getCell(row.path, colPath, valueFieldAlias);
        if (val !== null && val !== undefined && typeof val === "number") {
          values.push(val);
        }
      }
    } else {
      return null;
    }

    return computeDescriptive(values);
  }
};
export default statsEngine;
