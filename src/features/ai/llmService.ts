import { AIPromptColumn, AIPromptContext } from "./types";
import { nameWords } from "@/shared/utils/columnRoles";
import { OFFLINE_GUESS_LABEL } from "./offlineLabel";
import { functionsByCategory } from "@/shared/services/formula/library/registry";
import { FunctionDefinition } from "@/shared/services/formula/library/types";

/** Renders a function's registry entry as an LLM-facing call signature, e.g. `ROUND(number, decimals?)`. */
function formatFunctionSignature(fn: FunctionDefinition): string {
  const argNames = fn.args.map((arg) => (arg.optional ? `${arg.name}?` : arg.name));
  if (fn.variadic) argNames.push("...");
  return `${fn.name}(${argNames.join(", ")})`;
}

/**
 * Generated FROM formula/library's registry (not hand-written) so this can't drift out
 * of sync with the actual available functions as they're added/removed/renamed.
 */
const FORMULA_FUNCTIONS_BLOCK = Object.entries(functionsByCategory)
  .map(([category, fns]) => `${category}: ${fns.map(formatFunctionSignature).join(", ")}`)
  .join("\n");

export const SYSTEM_PROMPT = `
You are the AI Data Translation Layer for DataVista analytics engine.
Your sole job is to translate natural language user prompts into strict JSON responses representing either a Unified Query Engine QueryConfig OR a Formula Engine string.

IMPORTANT INSTRUCTION: You MUST return ONLY a valid raw JSON object. Do NOT wrap the JSON in Markdown code fences (\`\`\`json ... \`\`\`), markdown text, or any conversational text.

Response JSON Schema:
{
  "type": "query" | "formula",
  "query": {
    "filters": {
      "conditions": [
        { "column": "string", "operator": "equals" | "contains" | "in" | "between" | "greaterThan" | "lessThan" | "startsWith" | "endsWith", "value": "any" }
      ],
      "search": "string"
    },
    "groupBy": {
      "column": "string",
      "period": "day" | "week" | "month" | "quarter" | "year"
    },
    "aggregations": [
      {
        "column": "string",
        "operator": "count_rows" | "count" | "sum" | "avg" | "min" | "max" | "median" | "stddev" | "count_distinct",
        "alias": "string"
      }
    ],
    "sorting": [
      { "column": "string", "direction": "asc" | "desc" }
    ],
    "pagination": {
      "page": 1,
      "pageSize": number | "all"
    }
  },
  "formula": "string using [Column Name] syntax and standard functions",
  "fieldName": "suggested field name if type is formula",
  "chartType": "bar" | "line" | "pie" | "scatter" | "area" | "heatmap" | "bubble" | "histogram",
  "title": "Descriptive title for chart or output",
  "explanation": "Short 1-sentence description"
}

Formula Functions available:
${FORMULA_FUNCTIONS_BLOCK}
Logical Operators (not functions, used infix/prefix): AND, OR, NOT — e.g. [A] > 5 AND NOT [B] == "Closed"
Column syntax: Always wrap column names in square brackets like [Sales] or [Region].

Strict Constraints:
1. Column names referenced in "query" or "formula" MUST EXACTLY match one of the available dataset columns supplied in the context. Do not invent column names.
2. If the user prompt asks to calculate a new column or ratio (e.g., "profit margin", "sales - cost", "moving average"), set type="formula" and supply valid formula expression.
3. If the user prompt asks to query, filter, rank, group, or show top items (e.g. "top 5 regions by revenue", "show electronics sales"), set type="query" and populate query configuration.
`;

/** Group-by columns have at most this many distinct values (more reads as labels or IDs, like App). */
export const OFFLINE_MAX_GROUPS = 50;

/** Words of a phrase, lower-cased, camelCase and punctuation split ("ContentRating" -> content rating). */
const words = (text: string) => nameWords(text);
const singular = (w: string) => (w.endsWith("ies") && w.length > 4 ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") && w.length > 3 ? w.slice(0, -1) : w);

/**
 * Where the question names the column: [start, end) spans of question words where the
 * column's words appear in order as whole words (plurals allowed: "categories" -> Category),
 * or the one word that is its name without spaces ("contentrating"). Case- and
 * space-insensitive; never a raw substring, so "Type" does not match "prototype".
 */
function columnSpans(q: string[], column: string): [number, number][] {
  const col = words(column).map(singular);
  if (col.length === 0) return [];
  const spans: [number, number][] = [];
  for (let i = 0; i + col.length <= q.length; i++) {
    if (col.every((w, j) => q[i + j] === w)) spans.push([i, i + col.length]);
  }
  const joined = col.join("");
  if (col.length > 1) q.forEach((w, i) => w === joined && spans.push([i, i + 1]));
  return spans;
}

/**
 * The columns the question names, longest name first. A match inside a longer column's match
 * doesn't count: "content rating" names Content Rating, not Rating too.
 */
function namedColumns(question: string, columns: AIPromptColumn[]): AIPromptColumn[] {
  const q = words(question).map(singular);
  const found = columns.map((c) => ({ c, spans: columnSpans(q, c.name) })).filter((f) => f.spans.length > 0);
  const inside = (s: [number, number], t: [number, number]) => t[0] <= s[0] && s[1] <= t[1] && t[1] - t[0] > s[1] - s[0];
  return found
    .filter((f) => f.spans.some((s) => !found.some((g) => g !== f && g.spans.some((t) => inside(s, t)))))
    .sort((a, b) => words(b.c.name).length - words(a.c.name).length)
    .map((f) => f.c);
}

const groupable = (c: AIPromptColumn) => c.type === "categorical" && !c.isId && (c.uniqueValueCount === undefined || c.uniqueValueCount <= OFFLINE_MAX_GROUPS);

const OPERATORS: { re: RegExp; op: "avg" | "sum" | "count_rows" | "median" | "max" | "min"; label: string }[] = [
  { re: /\b(average|avg|mean)\b/, op: "avg", label: "Average" },
  { re: /\bmedian\b/, op: "median", label: "Median" },
  { re: /\b(how many|count|number of)\b/, op: "count_rows", label: "Rows" },
  { re: /\b(total|sum)\b/, op: "sum", label: "Total" },
  { re: /\b(maximum|max)\b/, op: "max", label: "Max" },
  { re: /\b(minimum|min)\b/, op: "min", label: "Min" },
];

/** Words that say what to compute even without a column name ("top 5 by ...", "lowest", "per"). */
const INTENT = /\b(top|bottom|highest|lowest|most|least|best|worst|largest|smallest|biggest|by|per|each|trend|over time|compare|distribution|breakdown|group|rank)\b/;

/** The operator a measure gets when the question names none: its default (Average for Rating), Sum otherwise. */
function defaultOperator(c: AIPromptColumn | undefined) {
  const op = c?.defaultAggregation;
  const mapped = op === "avg" || op === "median" || op === "max" || op === "min" || op === "sum" ? op : op === "count" || op === "count_rows" ? "count_rows" : "sum";
  return OPERATORS.find((o) => o.op === mapped)!;
}

/** "Try something like 'average Rating by Category'", from the dataset's own columns. */
export function offlineHint(columns: AIPromptColumn[]): string {
  const measure = columns.find((c) => c.type === "numeric" && !c.isId);
  const group = columns.find((c) => groupable(c) && (c.uniqueValueCount === undefined || c.uniqueValueCount >= 2));
  const op = defaultOperator(measure);
  const what = measure && op.op !== "count_rows" ? `${op.label.toLowerCase()} ${measure.name}` : "number of rows";
  return `Try something like '${what}${group ? ` by ${group.name}` : ""}'.`;
}

/**
 * Offline heuristic for common analytical phrases, used only when no AI provider is
 * connected (never in place of a failed provider answer). Runs locally; nothing is sent.
 * Query: a column the question names is used (a category to group by, a number to
 * aggregate); otherwise the first categorical column with 2-50 distinct values. Never
 * groups by a column with more than 50 distinct values or an ID-flagged column. The
 * operator and sort direction come from words like "average" and "lowest"; with no operator
 * word, the measure's default (defaultAggregationForColumn: Average for Rating, not Sum).
 * A question that names no column and has no recognisable intent ("j") gets a hint
 * ({type: "hint"}) instead of a guess.
 */
export function generateOfflineFallback(context: AIPromptContext, mode?: 'query' | 'formula'): string {
  const promptLower = context.prompt.toLowerCase();
  const columns = context.columns;
  const colNames = columns.map(c => c.name);
  const named = namedColumns(context.prompt, columns);

  const measures = columns.filter((c) => c.type === "numeric" && !c.isId);
  const numCol = named.find((c) => c.type === "numeric" && !c.isId)?.name ?? measures[0]?.name;
  const groupCol =
    named.find(groupable)?.name ??
    columns.find((c) => groupable(c) && (c.uniqueValueCount === undefined || c.uniqueValueCount >= 2))?.name;

  if (mode === 'formula' || promptLower.includes('calculate') || promptLower.includes('margin') || promptLower.includes('ratio')) {
    if (promptLower.includes('margin') && colNames.includes('Profit') && colNames.includes('Sales')) {
      return JSON.stringify({
        type: 'formula',
        formula: '([Profit] / [Sales]) * 100',
        fieldName: 'Profit Margin (%)',
        title: 'Profit Margin Calculation',
        explanation: `${OFFLINE_GUESS_LABEL}: Profit as a percentage of Sales.`
      });
    }
    const f = numCol ?? colNames[1] ?? colNames[0];
    if (colNames.length >= 2 && f) {
      return JSON.stringify({
        type: 'formula',
        formula: `[${f}] * 1.1`,
        fieldName: `Adjusted ${f}`,
        title: `Adjusted ${f} Calculation`,
        explanation: `${OFFLINE_GUESS_LABEL}: a 10% projection of [${f}].`
      });
    }
  }

  const found = OPERATORS.find((o) => o.re.test(promptLower));
  // Nothing to go on ("/ai j"): no column named and no recognisable intent. A hint, not a guess.
  if (named.length === 0 && !found && !INTENT.test(promptLower)) {
    return JSON.stringify({ type: "hint", explanation: offlineHint(columns) });
  }

  // No operator word: the measure's default (Average for a per-item value like Rating). No numeric column: count rows.
  const operator = numCol ? found ?? defaultOperator(columns.find((c) => c.name === numCol)) : OPERATORS.find((o) => o.op === "count_rows")!;
  const measure = operator.op === "count_rows" ? undefined : numCol;
  const alias = measure ? `${operator.label} ${measure}` : "Rows";
  const direction = /\b(lowest|least|bottom|smallest|worst|fewest)\b/.test(promptLower) ? "asc" : "desc";

  const topMatch = promptLower.match(/(?:top|bottom)\s+(\d+)/);
  const what = measure ? `${operator.label.toLowerCase()} ${measure}` : "rows";
  const title = `${what.charAt(0).toUpperCase()}${what.slice(1)}${groupCol ? ` by ${groupCol}` : ""}`;

  return JSON.stringify({
    type: 'query',
    query: {
      ...(groupCol ? { groupBy: { column: groupCol } } : {}),
      aggregations: [
        measure ? { column: measure, operator: operator.op, alias } : { column: groupCol ?? colNames[0], operator: 'count_rows', alias }
      ],
      sorting: [
        { column: alias, direction }
      ],
      pagination: { page: 1, pageSize: topMatch ? parseInt(topMatch[1], 10) : 'all' }
    },
    chartType: 'bar',
    title,
    explanation: `${OFFLINE_GUESS_LABEL}: ${what}${groupCol ? ` by ${groupCol}` : ""}.`
  });
}
