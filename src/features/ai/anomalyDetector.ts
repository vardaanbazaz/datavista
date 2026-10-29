import { ChartConfig, DataRow, Dataset } from "@/shared/types";
import { computeOutliers } from "@/shared/services/stats/outliers";
import { mean as meanOf, numericValues } from "@/shared/utils/numeric";
import { aggregationFlag } from "@/shared/utils/columnRoles";
import { chartReduction } from "@/features/charts/lib/chartAggregation";

export interface DetectedAnomaly {
  id: string;
  widgetId?: string;
  widgetTitle?: string;
  columnName: string;
  dimensionKey?: string; // e.g. "Tuesday" or "North"
  value: number;
  score: number;
  type: 'spike' | 'drop';
  severity: 'high' | 'medium' | 'low';
  description: string;
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
      const dimensionKey = dimCol && row[dimCol] !== undefined ? String(row[dimCol]) : `Row ${outlier.index + 1}`;
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
        value: outlier.value,
        score: outlier.score,
        type,
        severity,
        description: `${valueCol} ${type === 'spike' ? 'spiked to' : 'dropped to'} ${outlier.value.toLocaleString()} on ${dimensionKey} (${Math.round(diffPct)}% deviation from average).`
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

    const numericCols = dataset.metadata
      ? dataset.metadata.columns.filter((c) => c.inferredDataType === "numeric").map((c) => c.name)
      : dataset.columns.filter((col) => dataset.columnTypes[col] === "numeric");

    const categoryCol = dataset.columns.find(c => dataset.columnTypes[c] === 'categorical' || dataset.columnTypes[c] === 'date');
    const anomalies: DetectedAnomaly[] = [];

    for (const col of numericCols) {
      const rawValues = data.map((r) => r[col]);
      const res = computeOutliers(rawValues, 'iqr', { threshold: 1.5 });
      if (res.count === 0) continue;

      const mean = meanOf(numericValues(rawValues));

      res.outliers.slice(0, 3).forEach((outlier, idx) => {
        const row = data[outlier.index];
        const dimVal = categoryCol && row[categoryCol] ? String(row[categoryCol]) : `Row ${outlier.index + 1}`;
        const isSpike = outlier.value > mean;
        const type = isSpike ? 'spike' : 'drop';
        const diffPct = mean !== 0 ? Math.abs(((outlier.value - mean) / mean) * 100) : 0;
        const severity: 'high' | 'medium' | 'low' = diffPct > 100 ? 'high' : diffPct > 40 ? 'medium' : 'low';

        anomalies.push({
          id: `ds-anomaly-${col}-${idx}`,
          columnName: col,
          dimensionKey: dimVal,
          value: outlier.value,
          score: outlier.score,
          type,
          severity,
          description: `${col} ${type === 'spike' ? 'spiked to' : 'dropped to'} ${outlier.value.toLocaleString()} at ${dimVal} (${Math.round(diffPct)}% deviation).`
        });
      });
    }

    return anomalies;
  }
};
