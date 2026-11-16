import { ChartConfig, DataRow, Dataset } from "@/shared/types";
import { computeOutliers } from "@/shared/services/stats/outliers";
import { mean as meanOf, numericValues } from "@/shared/utils/numeric";
import { aggregationFlag, isIdName } from "@/shared/utils/columnRoles";
import { HIGH_CARDINALITY_SHARE } from "@/shared/services/dataQuality";
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
  /**
   * dimensionColumn is near-unique (an app name, an ID): the value names one row, not a group,
   * so it is shown as "Reviews (App: Facebook)", never "for App = Facebook".
   */
  rowLevel?: boolean;
  value: number;
  score: number;
  type: 'spike' | 'drop';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

type LabelParts = Pick<DetectedAnomaly, "columnName" | "dimensionColumn" | "dimensionKey" | "rowLevel">;

/**
 * "MonthlyIncome for Attrition = No" (a group), "Reviews (App: Facebook)" (a near-unique
 * column: one row), or "Rating in row 12" (no label column).
 */
export function anomalyLabel(a: LabelParts): string {
  if (a.dimensionColumn && a.rowLevel) return `${a.columnName} (${a.dimensionColumn}: ${a.dimensionKey})`;
  if (a.dimensionColumn) return `${a.columnName} for ${a.dimensionColumn} = ${a.dimensionKey}`;
  return a.dimensionKey ? `${a.columnName} in ${a.dimensionKey.replace(/^Row /, "row ")}` : a.columnName;
}

/** Chip text: "Reviews: 78,158,306 (App: Facebook)" or "MonthlyIncome for Attrition = No: 19,999". */
export function anomalyChipText(a: LabelParts & Pick<DetectedAnomaly, "value">): string {
  if (a.dimensionColumn && a.rowLevel) return `${a.columnName}: ${a.value.toLocaleString()} (${a.dimensionColumn}: ${a.dimensionKey})`;
  return `${anomalyLabel(a)}: ${a.value.toLocaleString()}`;
}

// toLocaleString with options builds a new Intl.NumberFormat on every call (~0.3 ms each);
// a dataset can have tens of thousands of outliers, so the formatters are made once.
const formatters = new Map<number, Intl.NumberFormat>();
function formatDigits(n: number, maximumFractionDigits: number): string {
  let f = formatters.get(maximumFractionDigits);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { maximumFractionDigits });
    formatters.set(maximumFractionDigits, f);
  }
  return f.format(n);
}

/** Up to 2 decimals for small numbers, none from 100 up: "4.69", "53,594". */
function formatAmount(n: number): string {
  return formatDigits(Math.abs(n), Math.abs(n) >= 100 ? 0 : 2);
}

/** "×175", "×2.4": one decimal under 10, none from 10 up. */
function formatRatio(r: number): string {
  return `×${formatDigits(r, r < 10 ? 1 : 0)}`;
}

/**
 * How far a value is from the average, in words a reader can use. A percentage only where it
 * means something (a positive average, at most 100% below, under 2× above):
 * - "×175 the average" from twice the average up (never "17497% above average");
 * - "54% above average" / "38% below average" otherwise;
 * - "−53,594 vs average 4.69" (the plain difference) when the value is below zero with a
 *   positive average (never "1143121% below average"), and for a zero or negative average,
 *   where a percentage of the average has no meaning.
 */
export function compareToAverage(value: number, mean: number): string {
  const diff = value - mean;
  if (!(mean > 0) || !Number.isFinite(value) || !Number.isFinite(mean) || value < 0) {
    const sign = diff < 0 ? "\u2212" : "+";
    return `${sign}${formatAmount(diff)} vs average ${mean < 0 ? "\u2212" : ""}${formatAmount(mean)}`;
  }
  if (value >= 2 * mean) return `${formatRatio(value / mean)} the average`;
  const pct = Math.round((Math.abs(diff) / mean) * 100);
  return `${pct}% ${diff >= 0 ? "above" : "below"} average`;
}

/** "Reviews: 78,158,306 (App: Facebook), ×175 the average." / "MonthlyIncome for Attrition = No: 19,999, ×3.1 the average." */
function describeAnomaly(parts: LabelParts, value: number, mean: number): string {
  const tail = `${compareToAverage(value, mean)}.`;
  if (parts.dimensionColumn && parts.rowLevel) {
    return `${parts.columnName}: ${value.toLocaleString()} (${parts.dimensionColumn}: ${parts.dimensionKey}), ${tail}`;
  }
  return `${anomalyLabel(parts)}: ${value.toLocaleString()}, ${tail}`;
}

/**
 * A column whose values name single rows rather than groups: an ID-like name, the
 * "identifier" role, or more than half of its non-blank values distinct (Play Store "App":
 * 9,660 distinct in 10,841 rows). Decided from the import metadata (all rows) when there is
 * one, so a filter that leaves few rows does not make an ordinary column look unique.
 */
export function isNearUniqueColumn(dataset: Dataset | null | undefined, column: string, rows: DataRow[]): boolean {
  if (isIdName(column)) return true;
  const meta = dataset?.metadata?.columns.find((c) => c.name === column);
  if (meta) {
    if (meta.role === "identifier") return true;
    const nonBlank = (dataset!.data.length || rows.length) - meta.missingValueCount;
    return nonBlank > 0 && meta.uniqueValueCount / nonBlank > HIGH_CARDINALITY_SHARE;
  }
  const seen = new Set<string>();
  let nonBlank = 0;
  for (const r of rows) {
    const v = r[column];
    if (v === null || v === undefined || v === "") continue;
    nonBlank++;
    seen.add(String(v));
  }
  return nonBlank > 0 && seen.size / nonBlank > HIGH_CARDINALITY_SHARE;
}

/**
 * One finding per value column and label: duplicate rows (Play Store lists Facebook twice,
 * with 78,158,306 and 78,128,208 reviews) would otherwise repeat the same app. Keeps the first,
 * so callers sort by importance first.
 */
export function dedupeAnomalies<T extends Pick<DetectedAnomaly, "widgetId" | "columnName" | "dimensionColumn" | "dimensionKey">>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = `${a.widgetId ?? ""}\u0000${a.columnName}\u0000${a.dimensionColumn ?? ""}\u0000${a.dimensionKey ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    const rowLevel = Boolean(dimCol && isNearUniqueColumn(dataset, dimCol, rows));
    const ranked = [...outlierResult.outliers].sort((a, b) => Math.abs(b.value - mean) - Math.abs(a.value - mean));

    return dedupeAnomalies(ranked.map((outlier, idx) => {
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
        ...(hasDim && rowLevel ? { rowLevel: true } : {}),
        value: outlier.value,
        score: outlier.score,
        type,
        severity,
        description: describeAnomaly(
          { columnName: valueCol, dimensionColumn: hasDim ? dimCol : undefined, dimensionKey, rowLevel: hasDim && rowLevel },
          outlier.value, mean
        ),
      };
    }));
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
    // A near-unique one (an app name) labels the row instead: "Reviews: 78,158,306 (App: Facebook)".
    const categoryCol = dataset.columns.find(c => getEffectiveColumnType(dataset, c) === 'categorical');
    const rowLevel = Boolean(categoryCol && isNearUniqueColumn(dataset, categoryCol, data));
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
      // Descriptions are written for the 3 kept per column only (formatting every outlier of a
      // 525k-row column blocked the main thread for seconds).
      const found: (Omit<DetectedAnomaly, "description"> & { mean: number })[] = [];
      ranked.forEach((outlier, idx) => {
        const row = data[outlier.index];
        const hasDim = Boolean(categoryCol && row[categoryCol] !== null && row[categoryCol] !== undefined && row[categoryCol] !== "");
        const dimVal = hasDim ? String(row[categoryCol!]) : `Row ${outlier.index + 1}`;
        const isSpike = outlier.value > mean;
        const type = isSpike ? 'spike' : 'drop';
        const diffPct = mean !== 0 ? Math.abs(((outlier.value - mean) / mean) * 100) : 0;
        const severity: 'high' | 'medium' | 'low' = diffPct > 100 ? 'high' : diffPct > 40 ? 'medium' : 'low';

        found.push({
          id: `ds-anomaly-${col}-${idx}`,
          columnName: col,
          dimensionKey: dimVal,
          dimensionColumn: hasDim ? categoryCol : undefined,
          ...(hasDim && rowLevel ? { rowLevel: true } : {}),
          value: outlier.value,
          score: outlier.score,
          type,
          severity,
          mean,
        });
      });
      for (const { mean: m, ...a } of dedupeAnomalies(found).slice(0, 3)) {
        anomalies.push({
          ...a,
          description: describeAnomaly(
            { columnName: a.columnName, dimensionColumn: a.dimensionColumn, dimensionKey: a.dimensionKey, rowLevel: Boolean(a.rowLevel) },
            a.value, m
          ),
        });
      }
    }

    return anomalies.sort((a, b) => b.score - a.score);
  }
};
