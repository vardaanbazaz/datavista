import * as d3 from "d3";
import { AggregationOperator, ChartConfig, DataRow } from "@/shared/types";

export type AxisValueType = "numeric" | "categorical" | "date";

/**
 * The reduction a chart actually applies for a configured aggregation. 'sum_if' /
 * 'count_if' / 'weighted_average' / 'percentile' need context (a condition expression, a
 * weight column, a percentile) the chart config doesn't carry, so they fall back to 'sum'
 * rather than silently miscomputing — and are labelled as the sum they really are.
 */
export type ChartReduction = "sum" | "avg" | "min" | "max" | "count" | "count_distinct" | "median" | "stddev";

export function chartReduction(aggregation?: AggregationOperator): ChartReduction {
  switch (aggregation) {
    case "avg":
    case "min":
    case "max":
    case "count":
    case "count_distinct":
    case "median":
    case "stddev":
      return aggregation;
    default:
      return "sum";
  }
}

const REDUCTION_PREFIX: Record<Exclude<ChartReduction, "count">, string> = {
  sum: "Sum of",
  avg: "Average of",
  min: "Minimum of",
  max: "Maximum of",
  count_distinct: "Distinct count of",
  median: "Median of",
  stddev: "Std. deviation of",
};

/** Axis/tooltip label naming what was computed, e.g. "Sum of Education", "Count of rows". */
export function aggregationLabel(aggregation: AggregationOperator | undefined, column: string): string {
  const reduction = chartReduction(aggregation);
  if (reduction === "count") return "Count of rows";
  return `${REDUCTION_PREFIX[reduction]} ${column}`;
}

/**
 * Label for the plotted Y value. Bar and pie always reduce the rows sharing an x key
 * (default: sum), line and area only when an aggregation is configured (otherwise they plot
 * each raw row's value), so only those get an aggregation prefix. Scatter, bubble and
 * heatmap plot raw values or a second dimension and keep the column name.
 */
export function chartYValueLabel(chart: Pick<ChartConfig, "type" | "yAxis" | "aggregation">): string {
  if (!chart.yAxis) return "";
  const reduces =
    chart.type === "bar" ||
    chart.type === "pie" ||
    ((chart.type === "line" || chart.type === "area") && !!chart.aggregation);
  return reduces ? aggregationLabel(chart.aggregation, chart.yAxis) : chart.yAxis;
}

/** Reduces rows sharing an x-axis (and groupBy) key into the column's plotted value. */
export function aggregateValues(rows: DataRow[], column: string, aggregation?: AggregationOperator): number {
  const numeric = (d: DataRow) => Number(d[column]) || 0;
  switch (chartReduction(aggregation)) {
    case "avg":
      return d3.mean(rows, numeric) ?? 0;
    case "min":
      return d3.min(rows, numeric) ?? 0;
    case "max":
      return d3.max(rows, numeric) ?? 0;
    case "count":
      return rows.length;
    case "count_distinct":
      return new Set(rows.map(d => d[column])).size;
    case "median":
      return d3.median(rows, numeric) ?? 0;
    case "stddev":
      return d3.deviation(rows, numeric) ?? 0;
    default:
      return d3.sum(rows, numeric);
  }
}

/**
 * Default order of category keys (stringified x values) on a band/point axis: numeric
 * ascending, dates chronological. Categorical keys keep the order they were given in.
 * Keys that don't parse (e.g. a stray "(Blank)") go last, in their original order.
 */
export function sortAxisKeys(keys: string[], type: AxisValueType): string[] {
  if (type === "categorical") return [...keys];
  const toNumber = type === "numeric" ? (k: string) => Number(k) : (k: string) => Date.parse(k);
  return keys
    .map((key, index) => ({ key, index, n: key.trim() === "" ? NaN : toNumber(key) }))
    .sort((a, b) => {
      const aBad = Number.isNaN(a.n);
      const bBad = Number.isNaN(b.n);
      if (aBad || bBad) return aBad === bBad ? a.index - b.index : aBad ? 1 : -1;
      return a.n - b.n || a.index - b.index;
    })
    .map(k => k.key);
}

/** Tooltip number formatting: thousands separators, at most 2 decimals. */
export function formatChartValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
