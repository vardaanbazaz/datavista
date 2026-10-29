import { AggregationOperator, ChartConfig, DataRow } from "@/shared/types";
import { aggregateRows } from "@/shared/services/queryEngine";
import { columnNumbers, toNumberOrNull } from "@/shared/utils/numeric";
import { dateKeyMs } from "@/shared/utils/dates";

export type AxisValueType = "numeric" | "categorical" | "date";

/**
 * The reduction a chart actually applies for a configured aggregation. 'sum_if' /
 * 'count_if' / 'weighted_average' / 'percentile' need context (a condition expression, a
 * weight column, a percentile) the chart config doesn't carry, so they fall back to 'sum'
 * rather than silently miscomputing — and are labelled as the sum they really are.
 */
export type ChartReduction =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "count"
  | "count_rows"
  | "count_distinct"
  | "median"
  | "stddev";

export function chartReduction(aggregation?: AggregationOperator): ChartReduction {
  switch (aggregation) {
    case "count_rows":
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

const REDUCTION_PREFIX: Record<Exclude<ChartReduction, "count_rows">, string> = {
  sum: "Sum of",
  avg: "Average of",
  min: "Minimum of",
  max: "Maximum of",
  count: "Count of",
  count_distinct: "Distinct count of",
  median: "Median of",
  stddev: "Std. deviation (sample) of",
};

/** Axis/tooltip label naming what was computed, e.g. "Sum of Education", "Count of rows". */
export function aggregationLabel(aggregation: AggregationOperator | undefined, column: string): string {
  const reduction = chartReduction(aggregation);
  if (reduction === "count_rows") return "Count of rows";
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

/**
 * Reduces rows sharing an x-axis (and groupBy) key into the column's plotted value, with
 * the query engine's own aggregation (same numeric rule, same sample std), so a chart
 * shows the numbers the Stats page and KPI cards show. `numericColumns` gives `count`
 * its meaning (see queryEngine.aggregateRows); without it, `count` counts valid numbers.
 */
export function aggregateValues(
  rows: DataRow[],
  column: string,
  aggregation?: AggregationOperator,
  numericColumns?: ReadonlySet<string>
): number {
  const reduction = chartReduction(aggregation);
  if (reduction === "count_distinct") return new Set(rows.map(d => d[column])).size;
  return aggregateRows(rows, column, reduction, numericColumns);
}

/**
 * aggregateValues for one line/area point: null (a gap) when the rows hold no valid number
 * and the reduction isn't a count, instead of the 0 that sum/avg/min/max give an empty slice.
 */
export function aggregateValuesOrNull(
  rows: DataRow[],
  column: string,
  aggregation?: AggregationOperator,
  numericColumns?: ReadonlySet<string>
): number | null {
  const reduction = chartReduction(aggregation);
  const isCount = reduction === "count" || reduction === "count_rows" || reduction === "count_distinct";
  if (!isCount && columnNumbers(rows, column).length === 0) return null;
  return aggregateValues(rows, column, aggregation, numericColumns);
}

/** Position of an x value along a line/area axis: a number, a date's UTC-ms (utils/dates.ts), or a category. */
export function axisPosition(value: unknown, type: AxisValueType): number | string | null {
  if (value === null || value === undefined) return null;
  if (type === "numeric") return toNumberOrNull(value);
  if (type === "date") return dateKeyMs(value);
  return String(value);
}

export interface LinePoint<T> {
  row: T;
  /** Number for numeric axes, UTC-ms for date axes (use d3.scaleUtc), string for categories. */
  x: number | string;
  /** null where the cell is blank or not a number: the line/area breaks there. */
  y: number | null;
}

/**
 * Rows of a line or area chart in x order. A row whose y isn't a valid number (blank,
 * "NaN", junk) stays in the series with y = null, so the chart draws a gap there (d3
 * `.defined`) instead of plotting 0 or joining its neighbours. Rows with no plottable x
 * are dropped.
 */
export function lineSeries<T extends DataRow>(rows: T[], xColumn: string, yColumn: string, xType: AxisValueType): LinePoint<T>[] {
  const points: LinePoint<T>[] = [];
  for (const row of rows) {
    const x = axisPosition(row[xColumn], xType);
    if (x === null) continue;
    points.push({ row, x, y: toNumberOrNull(row[yColumn]) });
  }
  return points.sort((a, b) =>
    typeof a.x === "number" && typeof b.x === "number" ? a.x - b.x : String(a.x).localeCompare(String(b.x))
  );
}

/**
 * Default order of category keys (stringified x values) on a band/point axis: numeric
 * ascending, dates chronological. Categorical keys keep the order they were given in.
 * Keys that don't parse (e.g. a stray "(Blank)") go last, in their original order.
 */
export function sortAxisKeys(keys: string[], type: AxisValueType): string[] {
  if (type === "categorical") return [...keys];
  const toNumber = type === "numeric" ? (k: string) => Number(k) : (k: string) => dateKeyMs(k) ?? NaN;
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
