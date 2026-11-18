/**
 * The copilot's local queries. The model asks for a query; it runs here, in the browser, on
 * the full dataset through queryEngine, and only the result goes back to the provider:
 *  - describe_column(column): stats or top values
 *  - aggregate(filters, groupBy (+ date period), aggregations, sort, limit <= 50)
 *  - value_counts(column, limit <= 20)
 *  - get_rows(filters, columns, limit <= 20): Sample rows level only
 * Every argument is checked against the dataset's real columns and the allowed operators; a
 * bad argument returns an error the model can read and fix. Personal-data columns (pii.ts)
 * are masked in results, can't be grouped or filtered on (a filter value would let the model
 * test whether a person is in the data), and get_rows masks their cells.
 * Gated by privacy level here as well as in the tool list: no tools below "queries", get_rows
 * only at "samples".
 */
import type { Dataset, DataRow, FilterCondition, QueryAggregation, QuerySort } from "@/shared/types";
import { queryEngine, aggregateRows, numericColumnSet } from "@/shared/services/queryEngine";
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { columnNumbers, mean, median, minMax, sampleStdDev, sum } from "@/shared/utils/numeric";
import { calendarDay } from "@/shared/utils/dates";
import type { ToolDefinition } from "../client/types";
import { detectPersonalColumns } from "../privacy/contextBuilder";
import { maskToken, type PiiKind } from "../privacy/pii";
import { levelAtLeast, privacyLevelLabel, type PrivacySettings } from "../privacy/levels";

export const AGGREGATE_LIMIT_MAX = 50;
export const VALUE_COUNTS_LIMIT_MAX = 20;
export const GET_ROWS_LIMIT_MAX = 20;
const AGGREGATIONS_MAX = 5;
const FILTERS_MAX = 10;
const IN_VALUES_MAX = 100;
const TOP_VALUES = 10;

export type CopilotToolName = "describe_column" | "aggregate" | "value_counts" | "get_rows";

const FILTER_OPS = ["equals", "in", "contains", "startsWith", "endsWith", "greaterThan", "lessThan", "between"] as const;
type FilterOp = (typeof FILTER_OPS)[number];
const AGG_OPS = ["count_rows", "count", "count_distinct", "sum", "avg", "min", "max", "median", "stddev"] as const;
type AggOp = (typeof AGG_OPS)[number];
const NUMERIC_OPS = new Set<AggOp>(["sum", "avg", "min", "max", "median", "stddev"]);
const PERIODS = ["day", "week", "month", "quarter", "year"] as const;
type Period = (typeof PERIODS)[number];

const OP_WORDS: Record<AggOp, string> = {
  count_rows: "row count",
  count: "count",
  count_distinct: "distinct",
  sum: "sum",
  avg: "average",
  min: "min",
  max: "max",
  median: "median",
  stddev: "std. dev.",
};

const filtersSchema = {
  type: "array",
  description:
    "Optional row filters, all must match. operator: equals | in | contains | startsWith | endsWith | greaterThan | lessThan | between. " +
    "Use value for single-value operators (numbers as text are fine), values for 'in', start/end for 'between' (numbers or YYYY-MM-DD dates).",
  items: {
    type: "object",
    properties: {
      column: { type: "string" },
      operator: { type: "string", enum: [...FILTER_OPS] },
      value: { type: "string", description: "equals, contains, startsWith, endsWith, greaterThan, lessThan" },
      values: { type: "array", items: { type: "string" }, description: "in" },
      start: { type: "string", description: "between: lower bound (inclusive)" },
      end: { type: "string", description: "between: upper bound (inclusive)" },
    },
    required: ["column", "operator"],
  },
};

const FULL_DATA_NOTE =
  "Runs in the user's browser on the FULL dataset; the user's active filters are NOT applied unless you pass them as filters.";

/** Tool definitions for a privacy level: none below Queries; get_rows only at Sample rows. */
export function copilotTools(privacy: Pick<PrivacySettings, "level">): ToolDefinition[] {
  if (!levelAtLeast(privacy.level, "queries")) return [];
  const tools: ToolDefinition[] = [
    {
      name: "describe_column",
      description: `Statistics of one column: count, missing, min/max/mean/median/sum for numbers, earliest/latest for dates, distinct count and top values for text. ${FULL_DATA_NOTE}`,
      parameters: {
        type: "object",
        properties: { column: { type: "string", description: "Exact column name" } },
        required: ["column"],
      },
    },
    {
      name: "aggregate",
      description:
        `Group and aggregate rows (like SQL GROUP BY). Returns at most ${AGGREGATE_LIMIT_MAX} result rows plus the total number of groups. ${FULL_DATA_NOTE}`,
      parameters: {
        type: "object",
        properties: {
          filters: filtersSchema,
          groupBy: {
            type: "object",
            description: "Optional. Column to group by; for a date column, optionally a period.",
            properties: { column: { type: "string" }, period: { type: "string", enum: [...PERIODS] } },
            required: ["column"],
          },
          aggregations: {
            type: "array",
            description: `1 to ${AGGREGATIONS_MAX} aggregations. op: ${AGG_OPS.join(" | ")}. sum/avg/min/max/median/stddev need a numeric column; count_rows needs no column.`,
            items: {
              type: "object",
              properties: { op: { type: "string", enum: [...AGG_OPS] }, column: { type: "string" } },
              required: ["op"],
            },
          },
          sort: {
            type: "object",
            description: "Optional. by: the group column or an aggregation's alias (e.g. avg_Rating, row_count).",
            properties: { by: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } },
            required: ["by"],
          },
          limit: { type: "integer", description: `1-${AGGREGATE_LIMIT_MAX}, default 20` },
        },
        required: ["aggregations"],
      },
    },
    {
      name: "value_counts",
      description: `How many rows hold each value of a column, most common first (at most ${VALUE_COUNTS_LIMIT_MAX}). ${FULL_DATA_NOTE}`,
      parameters: {
        type: "object",
        properties: {
          column: { type: "string" },
          limit: { type: "integer", description: `1-${VALUE_COUNTS_LIMIT_MAX}, default 10` },
          filters: filtersSchema,
        },
        required: ["column"],
      },
    },
  ];
  if (levelAtLeast(privacy.level, "samples")) {
    tools.push({
      name: "get_rows",
      description: `A few raw rows matching filters (at most ${GET_ROWS_LIMIT_MAX}); personal-data columns are masked. ${FULL_DATA_NOTE}`,
      parameters: {
        type: "object",
        properties: {
          filters: filtersSchema,
          columns: { type: "array", items: { type: "string" }, description: "Columns to return (default: all)" },
          sort: {
            type: "object",
            properties: { by: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } },
            required: ["by"],
          },
          limit: { type: "integer", description: `1-${GET_ROWS_LIMIT_MAX}, default 10` },
        },
      },
    });
  }
  return tools;
}

/** What one tool call did, for the model (content) and for the chat step (summary, args, result). */
export interface ToolRunResult {
  ok: boolean;
  /** JSON text sent back to the model. */
  content: string;
  /** One line for the collapsed step: "average Rating by Category · 34 rows". */
  summary: string;
  /** The parsed arguments (or the raw text when it wasn't JSON). */
  args: unknown;
  /** The result object (also in `content`), for the expanded step. */
  result: unknown;
}

export interface ToolEnv {
  dataset: Dataset;
  privacy: PrivacySettings;
  /** Columns masked as personal data (not unmasked by the user), with their kind. */
  masked: Map<string, PiiKind>;
  columns: Set<string>;
}

export function createToolEnv(dataset: Dataset, privacy: PrivacySettings): ToolEnv {
  const unmasked = new Set(privacy.unmasked);
  const masked = new Map<string, PiiKind>();
  for (const [col, kind] of detectPersonalColumns(dataset)) if (!unmasked.has(col)) masked.set(col, kind);
  const columns = new Set([...dataset.columns, ...(dataset.metadata?.columns.map((c) => c.name) ?? [])]);
  return { dataset, privacy, masked, columns };
}

class ToolArgError extends Error {}

function fail(message: string): never {
  throw new ToolArgError(message);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function round(n: unknown): unknown {
  if (typeof n !== "number" || !Number.isFinite(n)) return n;
  return Math.abs(n) >= 100 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000;
}

function columnArg(env: ToolEnv, v: unknown, what = "column"): string {
  if (typeof v !== "string" || !v.trim()) fail(`"${what}" must be a column name.`);
  if (env.columns.has(v)) return v;
  const lower = v.trim().toLowerCase();
  const match = [...env.columns].find((c) => c.toLowerCase() === lower);
  if (match) return match;
  const names = [...env.columns].slice(0, 60).join(", ");
  fail(`Unknown column "${v}". Columns are: ${names}.`);
}

function limitArg(v: unknown, def: number, max: number): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) fail(`"limit" must be a whole number from 1 to ${max}.`);
  return Math.min(v, max);
}

function scalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function filtersArg(env: ToolEnv, v: unknown): FilterCondition[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`"filters" must be an array of {column, operator, value}.`);
  if (v.length > FILTERS_MAX) fail(`At most ${FILTERS_MAX} filters.`);
  return v.map((f, i) => {
    if (!isObject(f)) fail(`filters[${i}] must be an object {column, operator, value}.`);
    const column = columnArg(env, f.column, `filters[${i}].column`);
    if (env.masked.has(column)) fail(`"${column}" holds personal data and is masked; it can't be filtered on. Filter on another column.`);
    const op = f.operator as FilterOp;
    if (!FILTER_OPS.includes(op)) fail(`filters[${i}].operator must be one of ${FILTER_OPS.join(", ")}.`);
    const value = op === "in" && f.values !== undefined ? f.values : op === "between" && f.value === undefined ? { start: f.start, end: f.end } : f.value;
    if (value === undefined || value === null) fail(`filters[${i}] needs a value${op === "in" ? "s array" : op === "between" ? " (start and/or end)" : ""}.`);
    if (op === "in") {
      if (!Array.isArray(value) || value.length === 0 || value.length > IN_VALUES_MAX || !value.every(scalar)) {
        fail(`filters[${i}].value for "in" must be a non-empty array (at most ${IN_VALUES_MAX}) of strings or numbers.`);
      }
      return { column, operator: op, value: value.map(String) };
    }
    if (op === "between") {
      const range = Array.isArray(value) && value.length === 2 ? { start: value[0], end: value[1] } : value;
      if (!isObject(range) || (range.start === undefined && range.end === undefined)) {
        fail(`filters[${i}].value for "between" must be {"start": ..., "end": ...}.`);
      }
      for (const k of ["start", "end"] as const) {
        const b = range[k];
        if (typeof b === "string" && b.trim() !== "" && Number.isFinite(Number(b))) range[k] = Number(b);
        if (b !== undefined && b !== null && typeof b !== "number" && typeof b !== "string") fail(`filters[${i}].value.${k} must be a number or a date.`);
      }
      return { column, operator: op, value: { start: (range.start ?? undefined) as string | number | undefined, end: (range.end ?? undefined) as string | number | undefined } };
    }
    if (op === "greaterThan" || op === "lessThan") {
      if (typeof value !== "number" && typeof value !== "string") fail(`filters[${i}].value must be a number or a date.`);
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      return { column, operator: op, value: Number.isFinite(n) ? n : value };
    }
    if (!scalar(value)) fail(`filters[${i}].value must be a string or number.`);
    return { column, operator: op, value: typeof value === "boolean" ? String(value) : value };
  });
}

function sortArg(v: unknown, allowed: string[]): QuerySort | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObject(v) || typeof v.by !== "string") fail(`"sort" must be {"by": ..., "direction": "asc" | "desc"}.`);
  if (!allowed.includes(v.by)) fail(`sort.by must be one of: ${allowed.join(", ")}.`);
  const direction = v.direction ?? "desc";
  if (direction !== "asc" && direction !== "desc") fail(`sort.direction must be "asc" or "desc".`);
  return { column: v.by, direction };
}

function filterRows(env: ToolEnv, filters: FilterCondition[]): DataRow[] {
  if (filters.length === 0) return env.dataset.data;
  return queryEngine.execute(env.dataset, { filters: { conditions: filters }, options: { bypassCache: true } }).rows;
}

function filterText(filters: FilterCondition[]): string {
  return filters.length ? ` (${filters.length} filter${filters.length === 1 ? "" : "s"})` : "";
}

function rowsText(n: number): string {
  return `${n.toLocaleString("en-US")} row${n === 1 ? "" : "s"}`;
}

function maskValue(env: ToolEnv, column: string, value: unknown): unknown {
  const kind = env.masked.get(column);
  return kind && value !== null && value !== undefined && value !== "" ? maskToken(kind) : value;
}

function topValues(env: ToolEnv, rows: DataRow[], column: string, limit: number) {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const r of rows) {
    const v = r[column];
    if (v === null || v === undefined || v === "") {
      missing++;
      continue;
    }
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const nonBlank = rows.length - missing;
  const values = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value: maskValue(env, column, value) as string, count, share: round(nonBlank ? count / nonBlank : 0) }));
  return { distinct: counts.size, missing, values };
}

function describeColumn(env: ToolEnv, a: Record<string, unknown>) {
  const column = columnArg(env, a.column);
  const rows = env.dataset.data;
  const type = getEffectiveColumnType(env.dataset, column);
  const result: Record<string, unknown> = { column, type, rows: rows.length };
  if (env.masked.has(column)) {
    // A personal-data column (even a numeric phone column): counts only, no values or extremes.
    const top = topValues(env, rows, column, 0);
    Object.assign(result, { personalData: `masked (${env.masked.get(column)})`, missing: top.missing, distinct: top.distinct });
    return { result, summary: `described ${column} · ${rowsText(rows.length)}` };
  }
  if (type === "numeric") {
    const nums = columnNumbers(rows, column);
    const mm = minMax(nums);
    Object.assign(result, {
      count: nums.length,
      missingOrInvalid: rows.length - nums.length,
      min: round(mm?.min),
      max: round(mm?.max),
      mean: round(nums.length ? mean(nums) : undefined),
      median: round(nums.length ? median(nums) : undefined),
      stddev: round(nums.length > 1 ? sampleStdDev(nums) : undefined),
      sum: round(sum(nums)),
    });
  } else if (type === "date") {
    let earliest: string | null = null;
    let latest: string | null = null;
    let valid = 0;
    for (const r of rows) {
      const d = calendarDay(r[column]);
      if (d === null) continue;
      valid++;
      if (earliest === null || d < earliest) earliest = d;
      if (latest === null || d > latest) latest = d;
    }
    Object.assign(result, { validDates: valid, missingOrInvalid: rows.length - valid, earliest, latest });
  } else {
    const top = topValues(env, rows, column, TOP_VALUES);
    Object.assign(result, { distinct: top.distinct, missing: top.missing, topValues: top.values });
  }
  return { result, summary: `described ${column} · ${rowsText(rows.length)}` };
}

function valueCounts(env: ToolEnv, a: Record<string, unknown>) {
  const column = columnArg(env, a.column);
  const limit = limitArg(a.limit, 10, VALUE_COUNTS_LIMIT_MAX);
  const filters = filtersArg(env, a.filters);
  const rows = filterRows(env, filters);
  const top = topValues(env, rows, column, limit);
  const result: Record<string, unknown> = { column, matchedRows: rows.length, distinct: top.distinct, missing: top.missing, values: top.values };
  if (env.masked.has(column)) result.note = "Personal-data column: values are masked.";
  return { result, summary: `value counts of ${column}${filterText(filters)} · ${rowsText(top.values.length)}` };
}

interface AggSpec {
  op: AggOp;
  column: string;
  alias: string;
}

function aggregationsArg(env: ToolEnv, v: unknown): AggSpec[] {
  if (!Array.isArray(v) || v.length === 0) fail(`"aggregations" must be a non-empty array of {op, column}.`);
  if (v.length > AGGREGATIONS_MAX) fail(`At most ${AGGREGATIONS_MAX} aggregations.`);
  const aliases = new Set<string>();
  return v.map((x, i) => {
    if (!isObject(x)) fail(`aggregations[${i}] must be {op, column}.`);
    const op = x.op as AggOp;
    if (!AGG_OPS.includes(op)) fail(`aggregations[${i}].op must be one of ${AGG_OPS.join(", ")}.`);
    let column = "";
    if (op !== "count_rows") {
      column = columnArg(env, x.column, `aggregations[${i}].column`);
      if (env.masked.has(column) && !["count", "count_distinct"].includes(op)) {
        fail(`aggregations[${i}]: "${column}" holds personal data and is masked; only count and count_distinct are allowed on it.`);
      }
      if (NUMERIC_OPS.has(op) && getEffectiveColumnType(env.dataset, column) !== "numeric") {
        fail(`aggregations[${i}]: "${op}" needs a numeric column; "${column}" is ${getEffectiveColumnType(env.dataset, column)}. Use count, count_distinct or value_counts.`);
      }
    }
    let alias = op === "count_rows" ? "row_count" : `${op}_${column}`;
    for (let k = 2; aliases.has(alias); k++) alias = `${op}_${column}_${k}`;
    aliases.add(alias);
    return { op, column, alias };
  });
}

function aggregate(env: ToolEnv, a: Record<string, unknown>) {
  const filters = filtersArg(env, a.filters);
  const aggs = aggregationsArg(env, a.aggregations);
  const limit = limitArg(a.limit, 20, AGGREGATE_LIMIT_MAX);

  let groupBy: { column: string; period?: Period } | undefined;
  if (a.groupBy !== undefined && a.groupBy !== null) {
    const g = typeof a.groupBy === "string" ? { column: a.groupBy } : a.groupBy;
    if (!isObject(g)) fail(`"groupBy" must be {"column": ..., "period": ...}.`);
    const column = columnArg(env, g.column, "groupBy.column");
    if (env.masked.has(column)) fail(`"${column}" holds personal data and is masked; it can't be grouped by. Group by another column.`);
    let period: Period | undefined;
    if (g.period !== undefined && g.period !== null) {
      if (getEffectiveColumnType(env.dataset, column) !== "date") fail(`groupBy.period only applies to a date column; "${column}" is not a date.`);
      if (!PERIODS.includes(g.period as Period)) fail(`groupBy.period must be one of ${PERIODS.join(", ")}.`);
      period = g.period as Period;
    }
    groupBy = { column, period };
  }

  const aggregations: QueryAggregation[] = aggs.map((x) => ({ column: x.column, operator: x.op, alias: x.alias }));
  const label = aggs.map((x) => (x.op === "count_rows" ? "row count" : `${OP_WORDS[x.op]} ${x.column}`)).join(", ");

  if (!groupBy) {
    const rows = filterRows(env, filters);
    const numeric = numericColumnSet(env.dataset);
    const values: Record<string, unknown> = {};
    for (const x of aggs) values[x.alias] = round(x.op === "count_distinct" ? new Set(rows.map((r) => r[x.column]).filter((v) => v !== null && v !== undefined && v !== "")).size : aggregateRows(rows, x.column, x.op, numeric));
    return { result: { matchedRows: rows.length, rows: [values] }, summary: `${label}${filterText(filters)} · ${rowsText(1)}` };
  }

  const allowedSort = [groupBy.column, ...aggs.map((x) => x.alias)];
  const sort = sortArg(a.sort, allowedSort) ?? (groupBy.period ? { column: groupBy.column, direction: "asc" as const } : { column: aggs[0].alias, direction: "desc" as const });

  const res = queryEngine.execute(env.dataset, {
    filters: filters.length ? { conditions: filters } : undefined,
    groupBy,
    aggregations,
    sorting: [sort],
    options: { bypassCache: true },
  });
  const total = res.rows.length;
  const out = res.rows.slice(0, limit).map((r) => {
    const o: Record<string, unknown> = { [groupBy!.column]: r[groupBy!.column] };
    for (const x of aggs) o[x.alias] = round(r[x.alias]);
    return o;
  });
  const result: Record<string, unknown> = {
    matchedRows: res.metadata.totalRowsAfterFilter,
    groups: total,
    rows: out,
    sortedBy: `${sort.column} ${sort.direction}`,
  };
  if (total > out.length) result.note = `Showing ${out.length} of ${total} groups.`;
  const by = groupBy.period ? `${groupBy.column} (${groupBy.period})` : groupBy.column;
  return { result, summary: `${label} by ${by}${filterText(filters)} · ${rowsText(total)}` };
}

function getRows(env: ToolEnv, a: Record<string, unknown>) {
  const filters = filtersArg(env, a.filters);
  const limit = limitArg(a.limit, 10, GET_ROWS_LIMIT_MAX);
  let columns = env.dataset.columns;
  if (a.columns !== undefined && a.columns !== null) {
    if (!Array.isArray(a.columns) || a.columns.length === 0) fail(`"columns" must be a non-empty array of column names.`);
    columns = a.columns.map((c, i) => columnArg(env, c, `columns[${i}]`));
  }
  const sort = sortArg(a.sort, [...env.columns]);
  if (sort && env.masked.has(sort.column)) fail(`"${sort.column}" holds personal data and is masked; it can't be sorted on.`);
  const res = queryEngine.execute(env.dataset, {
    filters: filters.length ? { conditions: filters } : undefined,
    sorting: sort ? [sort] : undefined,
    options: { bypassCache: true },
  });
  const rows = res.rows.slice(0, limit).map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c] = maskValue(env, c, r[c] ?? null);
    return o;
  });
  return {
    result: { matchedRows: res.metadata.totalRowsAfterFilter, rows },
    summary: `looked up rows${filterText(filters)} · ${rowsText(rows.length)}`,
  };
}

/** Runs one tool call. Never throws: errors come back as `{ error }` for the model to read. */
export function runCopilotTool(env: ToolEnv, name: string, rawArgs: string): ToolRunResult {
  let args: unknown = rawArgs;
  try {
    const level = env.privacy.level;
    if (!levelAtLeast(level, "queries")) fail(`Local queries are off at the "${privacyLevelLabel(level)}" privacy level.`);
    try {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } catch {
      fail("The arguments were not valid JSON.");
    }
    if (!isObject(args)) fail("The arguments must be a JSON object.");
    let out: { result: unknown; summary: string };
    switch (name) {
      case "describe_column":
        out = describeColumn(env, args);
        break;
      case "aggregate":
        out = aggregate(env, args);
        break;
      case "value_counts":
        out = valueCounts(env, args);
        break;
      case "get_rows":
        if (!levelAtLeast(level, "samples")) fail(`get_rows needs the "Sample rows" privacy level; it is "${privacyLevelLabel(level)}". Use aggregate or value_counts.`);
        out = getRows(env, args);
        break;
      default:
        fail(`Unknown tool "${name}". Tools: describe_column, aggregate, value_counts${levelAtLeast(level, "samples") ? ", get_rows" : ""}.`);
    }
    return { ok: true, content: JSON.stringify(out.result), summary: out.summary, args, result: out.result };
  } catch (e) {
    const message = e instanceof ToolArgError ? e.message : `The query failed: ${e instanceof Error ? e.message : String(e)}`;
    const result = { error: message };
    return { ok: false, content: JSON.stringify(result), summary: `${name}: ${message}`, args, result };
  }
}
