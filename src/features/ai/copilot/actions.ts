/**
 * Copilot actions: the model proposes a chart, a KPI card or a filter through a tool call
 * (never by parsing its text). Each proposal is checked here against the dataset's real
 * columns, their effective types and the aggregations the app allows for them
 * (columnRoles.aggregationsForColumn), mirroring the Chart builder's rules. A bad argument
 * returns an error the model can read and fix. A valid one becomes a card in the chat; nothing
 * changes until the user presses Apply (copilot/applyActions.ts).
 *
 * Actions send no data: the result the model gets back is only "proposed, waiting for the
 * user" and the one-line description built from its own arguments. Filter values are never
 * checked against the rows (that would tell the model whether a value is in the data), so
 * they're available at every privacy level.
 */
import type { AggregationOperator, ChartConfig, FilterCondition } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { aggregationsForColumn, defaultAggregationForColumn } from "@/shared/utils/columnRoles";
import { kpiAutoTitle } from "@/features/kpi/lib/kpiTitle";
import type { ToolDefinition } from "../client/types";

/** At most this many proposals per answer; more get an error result. */
export const MAX_PROPOSALS = 3;
const TITLE_MAX = 80;
const TOP_N_MAX = 50;
/** A bar chart over a category with more values than this shows the top 10 unless the model says otherwise. */
const AUTO_TOP_N_ABOVE = 15;
const AUTO_TOP_N = 10;

export type ProposalKind = "chart" | "kpi" | "filter";
export const ACTION_TOOL_NAMES = ["propose_chart", "propose_kpi", "propose_filter"] as const;
export type ActionToolName = (typeof ACTION_TOOL_NAMES)[number];

export function isActionTool(name: string): name is ActionToolName {
  return (ACTION_TOOL_NAMES as readonly string[]).includes(name);
}

/** Filters to set, by column, in FilterState's own shapes; dates as YYYY-MM-DD (stored as JSON). */
export interface FilterPatch {
  categorical?: Record<string, string[]>;
  numeric?: Record<string, { min?: number; max?: number }>;
  date?: Record<string, { start?: string; end?: string }>;
  text?: Record<string, string>;
}

/** A FilterState as JSON (dates as ISO strings), kept so Undo can restore it after a reload. */
export interface StoredFilterState {
  categoricalFilters: Record<string, string[]>;
  dateRangeFilters: Record<string, { start?: string; end?: string }>;
  numericRangeFilters?: Record<string, { min?: number; max?: number }>;
  textSearchFilters?: Record<string, string>;
  groupByColumn?: string;
  groupByPeriod?: "day" | "month" | "year";
}

/** What Apply did, enough to undo it by id (also after a reload). */
export interface AppliedRecord {
  chartId?: string;
  kpiId?: string;
  /** The dashboard the chart or KPI card was added to. */
  dashboardId?: string;
  /** The KPI's dashboard was created by Apply (Undo deletes it again). */
  createdDashboard?: boolean;
  /** Filters before Apply (filter proposals, and charts that came with filters). */
  prevFilters?: StoredFilterState;
}

export type ChartSpec = Pick<ChartConfig, "type" | "title" | "xAxis" | "yAxis" | "groupBy" | "aggregation" | "topN">;

export interface Proposal {
  id: string;
  kind: ProposalKind;
  /** One line: "Bar chart: average Rating by Category, top 10". */
  description: string;
  /** Columns the action uses, in order. */
  columns: string[];
  chart?: ChartSpec;
  kpi?: { column: string; aggregation: AggregationOperator; title: string };
  /** Filters to set (filter proposals, or a chart's filters). */
  filters?: FilterPatch;
  status: "pending" | "applied" | "dismissed" | "undone";
  applied?: AppliedRecord;
  /** Why the last Apply or Undo did nothing (dataset not open, chart already deleted). */
  error?: string;
}

const AGG_WORDS: Record<string, string> = {
  sum: "total",
  avg: "average",
  count: "count of",
  count_rows: "row count",
  count_distinct: "distinct",
  min: "minimum",
  max: "maximum",
  median: "median",
  stddev: "std. dev. of",
};

const CHART_TYPES = ["bar", "line", "area", "pie", "scatter", "histogram"] as const;
type ChartType = (typeof CHART_TYPES)[number];
const CHART_LABELS: Record<ChartType, string> = { bar: "Bar chart", line: "Line chart", area: "Area chart", pie: "Pie chart", scatter: "Scatter plot", histogram: "Histogram" };
/** Chart types that reduce rows per X value with an aggregation (ChartBuilder's showsAggregation). */
const AGGREGATING: ReadonlySet<ChartType> = new Set(["bar", "line", "area", "pie"]);
const AGG_OPS: AggregationOperator[] = ["sum", "avg", "count", "count_rows", "count_distinct", "min", "max", "median", "stddev"];

/** The filter operators a FilterState can hold (equals/in, contains, between). */
const PROPOSAL_FILTER_OPS = ["equals", "in", "contains", "between"] as const;

const proposalFiltersSchema = {
  type: "array",
  description:
    "Row filters. operator: equals | in | contains | between. equals/in for a category's exact values (values for 'in'); contains for text; " +
    "between for a number or date range (start and/or end, inclusive; dates as YYYY-MM-DD). Values are not checked against the data.",
  items: {
    type: "object",
    properties: {
      column: { type: "string" },
      operator: { type: "string", enum: [...PROPOSAL_FILTER_OPS] },
      value: { type: "string" },
      values: { type: "array", items: { type: "string" } },
      start: { type: "string" },
      end: { type: "string" },
    },
    required: ["column", "operator"],
  },
};

const PROPOSE_NOTE = "The user sees a card and decides; nothing changes until they press Apply. Sends no data.";

/** The action tools; offered at every privacy level. */
export function actionTools(): ToolDefinition[] {
  return [
    {
      name: "propose_chart",
      description:
        `Propose a chart the user can add with one click. ${PROPOSE_NOTE} ` +
        "bar/line/area/pie need x and y; scatter needs numeric x and y; histogram needs a numeric x only. " +
        "aggregation (bar/line/area/pie only) must suit y: sum/avg/min/max/median/stddev need a numeric y; count, count_rows, count_distinct work on any column. " +
        "Omit aggregation to use the column's default (Average for per-item values like Rating or Price). Don't Sum a per-item value unless the user asked for a total.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...CHART_TYPES] },
          x: { type: "string", description: "X axis column (the category or date for bar/line/area/pie)" },
          y: { type: "string", description: "Y axis column (the measure)" },
          aggregation: { type: "string", enum: AGG_OPS },
          groupBy: { type: "string", description: "Optional category column to split the series by (bar/line/area)" },
          topN: { type: "integer", description: `Bar chart over a category: keep the N largest bars (1-${TOP_N_MAX})` },
          filters: { ...proposalFiltersSchema, description: `Optional. Applied as the workspace's filters together with the chart. ${proposalFiltersSchema.description}` },
          title: { type: "string", description: `Chart title, at most ${TITLE_MAX} characters` },
        },
        required: ["type", "x", "title"],
      },
    },
    {
      name: "propose_kpi",
      description:
        `Propose a KPI card (one number) for the Overview dashboard. ${PROPOSE_NOTE} ` +
        "aggregation must suit the column (sum/avg/... need a number; count, count_rows, count_distinct work on any column); omit it for the column's default.",
      parameters: {
        type: "object",
        properties: {
          column: { type: "string" },
          aggregation: { type: "string", enum: AGG_OPS },
          title: { type: "string", description: `Card title, at most ${TITLE_MAX} characters` },
        },
        required: ["column"],
      },
    },
    {
      name: "propose_filter",
      description: `Propose filters for the workspace (Overview, charts and Data Explorer follow them). ${PROPOSE_NOTE}`,
      parameters: {
        type: "object",
        properties: { conditions: proposalFiltersSchema },
        required: ["conditions"],
      },
    },
  ];
}

/** What the action validators need: a column check and filter parsing (tools.ts provides both). */
export interface ActionEnv {
  dataset: import("@/shared/types").Dataset;
  /** The user's question for this answer: a Sum of a per-item column is allowed only when it asks for a total. */
  question: string;
  column: (v: unknown, what: string) => string;
  filters: (v: unknown) => FilterCondition[];
  fail: (message: string) => never;
  newId: () => string;
}

const ASKED_FOR_TOTAL = /\b(sum|sums|summed|total|totals|add(?:ed)? up|altogether|combined)\b/i;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function titleArg(env: ActionEnv, v: unknown, fallback: string): string {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return fallback;
  if (typeof v !== "string") env.fail(`"title" must be text.`);
  const t = v.trim();
  if (t.length > TITLE_MAX) env.fail(`"title" must be at most ${TITLE_MAX} characters.`);
  return t;
}

/** An aggregation for `column`: allowed for its type, the default when omitted, no Sum of a per-item column unless asked. */
function aggregationArg(env: ActionEnv, v: unknown, column: string, what = "aggregation"): AggregationOperator {
  const type = getEffectiveColumnType(env.dataset, column);
  const allowed = aggregationsForColumn(env.dataset, column);
  const def = defaultAggregationForColumn(env.dataset, column);
  if (v === undefined || v === null || v === "") return def;
  if (typeof v !== "string" || !AGG_OPS.includes(v as AggregationOperator)) env.fail(`"${what}" must be one of ${AGG_OPS.join(", ")}.`);
  const op = v as AggregationOperator;
  if (!allowed.includes(op)) env.fail(`"${op}" needs a numeric column; "${column}" is ${type}. Allowed: ${allowed.join(", ")}.`);
  if (op === "sum" && def !== "sum" && !ASKED_FOR_TOTAL.test(env.question)) {
    env.fail(`Sum of "${column}" adds up ${def === "avg" ? "per-item values (a rating, price or rate)" : "an ID, a year or a constant"}, which means nothing; use "${def}" (its default) unless the user asks for a total.`);
  }
  return op;
}

function aggPhrase(op: AggregationOperator, column: string): string {
  return op === "count_rows" ? "row count" : `${AGG_WORDS[op] ?? op} ${column}`;
}

function parseDay(env: ActionEnv, v: unknown, where: string): string {
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) env.fail(`${where} must be a date as YYYY-MM-DD.`);
  return s;
}

/** Filter conditions as a FilterPatch, by column type; operators a FilterState can't hold are refused. */
export function filterPatch(env: ActionEnv, raw: unknown, what = "conditions"): { patch: FilterPatch; phrases: string[]; columns: string[] } {
  if (!Array.isArray(raw) || raw.length === 0) env.fail(`"${what}" must be a non-empty array of {column, operator, value}.`);
  for (const [i, c] of raw.entries()) {
    const op = isObject(c) ? c.operator : undefined;
    if (op === "greaterThan" || op === "lessThan") env.fail(`${what}[${i}]: use "between" with start (for greaterThan) or end (for lessThan); filter ranges are inclusive.`);
    if (typeof op === "string" && !(PROPOSAL_FILTER_OPS as readonly string[]).includes(op)) env.fail(`${what}[${i}].operator must be one of ${PROPOSAL_FILTER_OPS.join(", ")}.`);
  }
  const conditions = env.filters(raw);
  const patch: FilterPatch = {};
  const phrases: string[] = [];
  const columns: string[] = [];
  conditions.forEach((c, i) => {
    const type = getEffectiveColumnType(env.dataset, c.column);
    if (!columns.includes(c.column)) columns.push(c.column);
    const where = `${what}[${i}]`;
    if (c.operator === "between") {
      const { start, end } = c.value as { start?: string | number; end?: string | number };
      if (type === "numeric") {
        const min = start === undefined || start === "" ? undefined : Number(start);
        const max = end === undefined || end === "" ? undefined : Number(end);
        if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) env.fail(`${where}: start and end must be numbers for "${c.column}".`);
        if (min !== undefined && max !== undefined && min > max) env.fail(`${where}: start is after end.`);
        (patch.numeric ??= {})[c.column] = { min, max };
        phrases.push(min !== undefined && max !== undefined ? `${c.column} ${min}–${max}` : min !== undefined ? `${c.column} ≥ ${min}` : `${c.column} ≤ ${max}`);
      } else if (type === "date") {
        const s = start === undefined || start === "" ? undefined : parseDay(env, start, `${where}.start`);
        const e = end === undefined || end === "" ? undefined : parseDay(env, end, `${where}.end`);
        if (s && e && s > e) env.fail(`${where}: start is after end.`);
        (patch.date ??= {})[c.column] = { start: s, end: e };
        phrases.push(s && e ? `${c.column} ${s} to ${e}` : s ? `${c.column} from ${s}` : `${c.column} until ${e}`);
      } else {
        env.fail(`${where}: "between" needs a numeric or date column; "${c.column}" is ${type}. Use equals or in.`);
      }
      return;
    }
    if (c.operator === "contains") {
      if (type !== "categorical") env.fail(`${where}: "contains" needs a text column; "${c.column}" is ${type}.`);
      (patch.text ??= {})[c.column] = String(c.value);
      phrases.push(`${c.column} contains "${String(c.value)}"`);
      return;
    }
    // equals / in
    const values = (Array.isArray(c.value) ? c.value : [c.value]).map(String);
    if (type === "numeric") {
      if (c.operator === "in" || values.length !== 1 || !Number.isFinite(Number(values[0]))) env.fail(`${where}: for numeric "${c.column}" use equals with one number, or between.`);
      const n = Number(values[0]);
      (patch.numeric ??= {})[c.column] = { min: n, max: n };
      phrases.push(`${c.column} = ${n}`);
      return;
    }
    if (type === "date") {
      if (c.operator === "in" || values.length !== 1) env.fail(`${where}: for date "${c.column}" use equals with one day, or between.`);
      const d = parseDay(env, values[0], `${where}.value`);
      (patch.date ??= {})[c.column] = { start: d, end: d };
      phrases.push(`${c.column} = ${d}`);
      return;
    }
    const prev = patch.categorical?.[c.column] ?? [];
    (patch.categorical ??= {})[c.column] = [...new Set([...prev, ...values])];
    const shown = patch.categorical[c.column];
    phrases.push(`${c.column} ${shown.length === 1 ? `= ${shown[0]}` : `in [${shown.slice(0, 5).join(", ")}${shown.length > 5 ? `, +${shown.length - 5}` : ""}]`}`);
  });
  return { patch, phrases, columns };
}

function proposeChart(env: ActionEnv, a: Record<string, unknown>): Proposal {
  const type = a.type as ChartType;
  if (!CHART_TYPES.includes(type)) env.fail(`"type" must be one of ${CHART_TYPES.join(", ")}.`);
  const x = env.column(a.x, "x");
  const xType = getEffectiveColumnType(env.dataset, x);
  const hasY = a.y !== undefined && a.y !== null && a.y !== "";
  if (type !== "histogram" && !hasY) env.fail(`A ${type} chart needs "y". To count rows per ${x}, pass y = "${x}" with aggregation "count_rows".`);
  const y = hasY ? env.column(a.y, "y") : undefined;
  const yType = y ? getEffectiveColumnType(env.dataset, y) : undefined;

  if (type === "histogram" && xType !== "numeric") env.fail(`A histogram needs a numeric x; "${x}" is ${xType}.`);
  if (type === "histogram" && y) env.fail(`A histogram takes x only (its bars count rows); leave out y.`);
  if (type === "scatter" && (xType !== "numeric" || yType !== "numeric")) env.fail(`A scatter plot needs numeric x and y; "${x}" is ${xType}${y ? `, "${y}" is ${yType}` : ""}.`);

  let aggregation: AggregationOperator | undefined;
  if (AGGREGATING.has(type)) aggregation = aggregationArg(env, a.aggregation, y!);
  else if (a.aggregation !== undefined && a.aggregation !== null && a.aggregation !== "") env.fail(`"aggregation" applies to bar, line, area and pie charts only.`);

  let groupBy: string | undefined;
  if (a.groupBy !== undefined && a.groupBy !== null && a.groupBy !== "") {
    if (!["bar", "line", "area"].includes(type)) env.fail(`"groupBy" applies to bar, line and area charts only.`);
    groupBy = env.column(a.groupBy, "groupBy");
    if (getEffectiveColumnType(env.dataset, groupBy) !== "categorical") env.fail(`"groupBy" needs a category column; "${groupBy}" is ${getEffectiveColumnType(env.dataset, groupBy)}.`);
    if (groupBy === x) env.fail(`"groupBy" must differ from x.`);
  }

  let topN: number | undefined;
  const categoricalBar = type === "bar" && xType === "categorical";
  if (a.topN !== undefined && a.topN !== null) {
    if (!categoricalBar) env.fail(`"topN" applies to a bar chart over a category column only.`);
    if (typeof a.topN !== "number" || !Number.isInteger(a.topN) || a.topN < 1 || a.topN > TOP_N_MAX) env.fail(`"topN" must be a whole number from 1 to ${TOP_N_MAX}.`);
    topN = a.topN;
  } else if (categoricalBar) {
    const distinct = env.dataset.metadata?.columns.find((c) => c.name === x)?.uniqueValueCount;
    if (distinct !== undefined && distinct > AUTO_TOP_N_ABOVE) topN = AUTO_TOP_N;
  }

  const filters = a.filters === undefined || a.filters === null || (Array.isArray(a.filters) && a.filters.length === 0) ? undefined : filterPatch(env, a.filters, "filters");

  const measure = y ? (aggregation ? aggPhrase(aggregation, y) : y) : "count";
  const what = type === "scatter" ? `${y} vs ${x}` : type === "histogram" ? `distribution of ${x}` : `${measure} by ${x}`;
  const parts = [`${CHART_LABELS[type]}: ${what}`];
  if (groupBy) parts.push(`split by ${groupBy}`);
  if (topN) parts.push(`top ${topN}`);
  if (filters) parts.push(`filtered to ${filters.phrases.join("; ")}`);
  const autoTitle = type === "scatter" ? `${y} vs ${x}` : type === "histogram" ? `Distribution of ${x}` : `${measure.charAt(0).toUpperCase()}${measure.slice(1)} by ${x}`;
  const chart: ChartSpec = { type, title: titleArg(env, a.title, autoTitle), xAxis: x };
  if (y) chart.yAxis = y;
  if (aggregation) chart.aggregation = aggregation;
  if (groupBy) chart.groupBy = groupBy;
  if (topN) chart.topN = topN;
  const columns = [...new Set([x, ...(y ? [y] : []), ...(groupBy ? [groupBy] : []), ...(filters?.columns ?? [])])];
  return { id: env.newId(), kind: "chart", description: parts.join(", "), columns, chart, ...(filters ? { filters: filters.patch } : {}), status: "pending" };
}

function proposeKpi(env: ActionEnv, a: Record<string, unknown>): Proposal {
  const column = env.column(a.column, "column");
  const aggregation = aggregationArg(env, a.aggregation, column);
  const title = titleArg(env, a.title, kpiAutoTitle(aggregation, column));
  return { id: env.newId(), kind: "kpi", description: `KPI card: ${aggPhrase(aggregation, column)}`, columns: [column], kpi: { column, aggregation, title }, status: "pending" };
}

function proposeFilter(env: ActionEnv, a: Record<string, unknown>): Proposal {
  const { patch, phrases, columns } = filterPatch(env, a.conditions);
  return { id: env.newId(), kind: "filter", description: `Filter: ${phrases.join("; ")}`, columns, filters: patch, status: "pending" };
}

/** Validates one action call; throws (through env.fail) with a message for the model. */
export function validateProposal(env: ActionEnv, name: ActionToolName, args: Record<string, unknown>): Proposal {
  switch (name) {
    case "propose_chart":
      return proposeChart(env, args);
    case "propose_kpi":
      return proposeKpi(env, args);
    case "propose_filter":
      return proposeFilter(env, args);
  }
}
