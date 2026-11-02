import { ChartConfig, DataRow, Dataset } from "@/shared/types";
import { computeOutliers } from "@/shared/services/stats/outliers";
import { mean as meanOf, numericValues } from "@/shared/utils/numeric";
import { aggregationFlag } from "@/shared/utils/columnRoles";
import { chartReduction } from "@/features/charts/lib/chartAggregation";
import { columnsOfType, getEffectiveColumnType } from "@/shared/utils/columnType";

export interface DetectedAnomaly {
  id: string;
  widgetId?: string;
  widgetTitle?: string;
  columnName: string;
  dimensionKey?: string; // e.g. "Tuesday" or "North"
  /** The column dimensionKey is a value of, e.g. "Attrition"; absent when the key is a row number. */
  dimensionColumn?: string;
  value: number;
  score: number;
  type: 'spike' | 'drop';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/** "MonthlyIncome for Attrition = No: 19,999, 207% above average." (or "in row 12" without a grouping column). */
export function anomalyLabel(a: Pick<DetectedAnomaly, "columnName" | "dimensionColumn" | "dimensionKey">): string {
  if (a.dimensionColumn) return `${a.columnName} for ${a.dimensionColumn} = ${a.dimensionKey}`;
  return a.dimensionKey ? `${a.columnName} in ${a.dimensionKey.replace(/^Row /, "row ")}` : a.columnName;
}

function describeAnomaly(column: string, dimColumn: string | undefined, dimKey: string, value: number, diffPct: number, isSpike: boolean): string {
  const label = anomalyLabel({ columnName: column, dimensionColumn: dimColumn, dimensionKey: dimKey });
  return `${label}: ${value.toLocaleString()}, ${Math.round(diffPct)}% ${isSpike ? "above" : "below"} average.`;
}

export const anomalyDetector = {
  /**
   * Detects statistical outliers in the rows a chart plots. Charts keep no row copy, so the
   * caller passes them: ChartVisualization its live query rows, the executive summary the
   * active dataset's filtered rows.
   *
   * With `dataset`, a sum or count (the chart default is sum) of a year- or ID-like column
   * (utils/columnRoles.ts) reports nothing: "outlier" years or IDs are just old titles or
   * high numbers, not anomalies.
   */
  detectChartAnomalies(chart: ChartConfig, rows: DataRow[], dataset?: Dataset | null): DetectedAnomaly[] {
    if (!rows || rows.length < 3) return [];

    const valueCol = chart.yAxis || Object.keys(rows[0] || {}).find(
      (k) => k !== chart.xAxis && typeof rows[0][k] === "number"
    );
    if (!valueCol) return [];
    const reduction = chartReduction(chart.aggregation);
    if (
      aggregationFlag(dataset, valueCol) &&
      (reduction === "sum" || reduction === "count" || reduction === "count_rows" || reduction === "count_distinct")
    ) {
      return [];
    }

    const dimCol = chart.xAxis || chart.groupBy;
    const rawValues = rows.map((r) => r[valueCol]);
    const outlierResult = computeOutliers(rawValues, 'iqr', { threshold: 1.5 });

    if (outlierResult.count === 0) return [];

    const mean = meanOf(numericValues(rawValues));

    return outlierResult.outliers.map((outlier, idx) => {
      const row = rows[outlier.index];
      const hasDim = Boolean(dimCol && row[dimCol] !== undefined);
      const dimensionKey = hasDim ? String(row[dimCol!]) : `Row ${outlier.index + 1}`;
      const isSpike = outlier.value > mean;
      const type = isSpike ? 'spike' : 'drop';

      const diffPct = mean !== 0 ? Math.abs(((outlier.value - mean) / mean) * 100) : 0;
      const severity: 'high' | 'medium' | 'low' = diffPct > 100 ? 'high' : diffPct > 40 ? 'medium' : 'low';

      return {
        id: `anomaly-${chart.id}-${valueCol}-${idx}`,
        widgetId: chart.id,
        widgetTitle: chart.title,
        columnName: valueCol,
        dimensionKey,
        dimensionColumn: hasDim ? dimCol : undefined,
        value: outlier.value,
        score: outlier.score,
        type,
        severity,
        description: describeAnomaly(valueCol, hasDim ? dimCol : undefined, dimensionKey, outlier.value, diffPct, isSpike),
      };
    });
  },

  /**
   * Detects anomalies across all active charts in a dashboard, over the same rows
   */
  detectDashboardAnomalies(charts: ChartConfig[], rows: DataRow[], dataset?: Dataset | null): DetectedAnomaly[] {
    const allAnomalies: DetectedAnomaly[] = [];
    for (const chart of charts) {
      const chartAnomalies = this.detectChartAnomalies(chart, rows, dataset);
      allAnomalies.push(...chartAnomalies);
    }
    return allAnomalies;
  },

  /**
   * Fallback: Detects anomalies directly on numeric columns of dataset rows
   */
  detectDatasetAnomalies(dataset: Dataset, dataRows?: DataRow[]): DetectedAnomaly[] {
    const data = dataRows || dataset.data;
    if (!data || data.length < 3) return [];

    // Outliers in ID/year columns or a constant column mean nothing (columnProfile roles).
    const numericCols = columnsOfType(dataset, "numeric").filter((c) => !aggregationFlag(dataset, c));

    // Name each outlier by the first categorical column, e.g. "for Attrition = No".
    const categoryCol = dataset.columns.find(c => getEffectiveColumnType(dataset, c) === 'categorical');
    const anomalies: DetectedAnomaly[] = [];

    for (const col of numericCols) {
      const rawValues = data.map((r) => r[col]);
      const numbers = numericValues(rawValues);
      if (numbers.length < 3 || numbers.every((n) => n === numbers[0])) continue;
      const res = computeOutliers(rawValues, 'iqr', { threshold: 1.5 });
      if (res.count === 0) continue;

      const mean = meanOf(numbers);

      // Largest deviation first, so the summary names the most unusual value.
      const ranked = [...res.outliers].sort((a, b) => Math.abs(b.value - mean) - Math.abs(a.value - mean));
      ranked.slice(0, 3).forEach((outlier, idx) => {
        const row = data[outlier.index];
        const hasDim = Boolean(categoryCol && row[categoryCol] !== null && row[categoryCol] !== undefined && row[categoryCol] !== "");
        const dimVal = hasDim ? String(row[categoryCol!]) : `Row ${outlier.index + 1}`;
        const isSpike = outlier.value > mean;
        const type = isSpike ? 'spike' : 'drop';
        const diffPct = mean !== 0 ? Math.abs(((outlier.value - mean) / mean) * 100) : 0;
        const severity: 'high' | 'medium' | 'low' = diffPct > 100 ? 'high' : diffPct > 40 ? 'medium' : 'low';

        anomalies.push({
          id: `ds-anomaly-${col}-${idx}`,
          columnName: col,
          dimensionKey: dimVal,
          dimensionColumn: hasDim ? categoryCol : undefined,
          value: outlier.value,
          score: outlier.score,
          type,
          severity,
          description: describeAnomaly(col, hasDim ? categoryCol : undefined, dimVal, outlier.value, diffPct, isSpike),
        });
      });
    }

    return anomalies.sort((a, b) => b.score - a.score);
  }
};
