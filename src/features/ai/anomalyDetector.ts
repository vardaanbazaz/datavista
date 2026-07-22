import { ChartConfig, DataRow, Dataset } from "@/shared/types";
import { computeOutliers } from "@/shared/services/stats/outliers";

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
   * Detects statistical outliers in a single chart's aggregated data
   */
  detectChartAnomalies(chart: ChartConfig): DetectedAnomaly[] {
    if (!chart.data || chart.data.length < 3) return [];

    const valueCol = chart.yAxis || Object.keys(chart.data[0] || {}).find(
      (k) => k !== chart.xAxis && typeof chart.data[0][k] === "number"
    );
    if (!valueCol) return [];

    const dimCol = chart.xAxis || chart.groupBy;
    const rawValues = chart.data.map((r) => r[valueCol]);
    const outlierResult = computeOutliers(rawValues, 'iqr', { threshold: 1.5 });

    if (outlierResult.count === 0) return [];

    const sum = rawValues.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
    const mean = sum / (rawValues.length || 1);

    return outlierResult.outliers.map((outlier, idx) => {
      const row = chart.data[outlier.index];
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
   * Detects anomalies across all active charts in a dashboard
   */
  detectDashboardAnomalies(charts: ChartConfig[]): DetectedAnomaly[] {
    const allAnomalies: DetectedAnomaly[] = [];
    for (const chart of charts) {
      const chartAnomalies = this.detectChartAnomalies(chart);
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

      const sum = rawValues.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
      const mean = sum / (rawValues.length || 1);

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
