/**
 * What the copilot sends with each conversation: the system prompt, and the dataset context
 * from the one context builder (privacy/contextBuilder.ts:buildAiContext, at the user's
 * privacy level and masking) plus the active view and active filters (filter values pass
 * valueForAi, so masked columns stay masked). Also the starter questions.
 */
import type { Dataset, FilterState } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { columnAggregationFlag } from "@/shared/utils/columnRoles";
import type { ChatMessage } from "../client/types";
import { buildAiContext, detectPersonalColumns, renderAiContext, valueForAi, type AiDataContext } from "../privacy/contextBuilder";
import { levelAtLeast, privacyLevelLabel, type PrivacySettings } from "../privacy/levels";

export interface CopilotScene {
  dataset: Dataset;
  /** Label of the view the user is on ("Data Explorer"). */
  view: string;
  filters: FilterState | undefined;
  /** Rows left after the active filters. */
  filteredRowCount: number;
  privacy: PrivacySettings;
}

function day(d: Date | string | undefined): string {
  if (!d) return "…";
  if (typeof d === "string") return d;
  return Number.isNaN(d.getTime()) ? "…" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The active filters in words, with masked columns' values hidden ("Category in [GAME, FAMILY]"). */
export function describeFilters(filters: FilterState | undefined, ctx: AiDataContext): string[] {
  if (!filters) return [];
  const out: string[] = [];
  for (const [col, values] of Object.entries(filters.categoricalFilters ?? {})) {
    if (!values?.length) continue;
    const shown = values.slice(0, 20).map((v) => valueForAi(ctx, col, String(v)));
    out.push(shown.some((v) => v === null) ? `${col} (filtered)` : `${col} in [${shown.join(", ")}]${values.length > 20 ? ` and ${values.length - 20} more` : ""}`);
  }
  for (const [col, r] of Object.entries(filters.dateRangeFilters ?? {})) {
    if (r && (r.start || r.end)) out.push(`${col} between ${day(r.start)} and ${day(r.end)}`);
  }
  for (const [col, r] of Object.entries(filters.numericRangeFilters ?? {})) {
    if (r && (r.min !== undefined || r.max !== undefined)) out.push(`${col} between ${r.min ?? "…"} and ${r.max ?? "…"}`);
  }
  for (const [col, text] of Object.entries(filters.textSearchFilters ?? {})) {
    if (!text) continue;
    const v = valueForAi(ctx, col, text);
    out.push(v === null ? `${col} (text search)` : `${col} contains ${JSON.stringify(v)}`);
  }
  return out;
}

function systemPrompt(privacy: PrivacySettings, hasTools: boolean, hasRowsTool: boolean): string {
  const lines = [
    "You are DataVista's data copilot. You help the user understand the dataset described below.",
    "Answer concisely in Markdown (short paragraphs, bullet lists, **bold** for key numbers, small tables when comparing groups).",
    "Never invent numbers. Values shown as \"[masked ...]\" are personal data hidden by the user's privacy settings.",
    `Privacy level: ${privacyLevelLabel(privacy.level)}.`,
  ];
  if (hasTools) {
    lines.push(
      "You can run queries in the user's browser with the tools. Use them for any number the context does not already give " +
        "(averages by group, counts, top values). Tools run on the FULL dataset: the user's active filters are NOT applied " +
        "unless you pass them as filters. Say which filters you used. Use exact column names. If a tool returns an error, fix the arguments and try again."
    );
    if (!hasRowsTool) lines.push("You cannot see individual rows; answer from aggregates.");
  } else {
    lines.push("You cannot run queries; answer from the context only, and say when a question needs data you don't have.");
  }
  lines.push(
    "When a chart, KPI card or filter would help, propose it with propose_chart, propose_kpi or propose_filter (at most 3 per answer). " +
      "Each shows the user a card with Apply; nothing changes until they apply it, so never say you created or applied it. " +
      "Use exact column names and leave out aggregation unless the user asked for one (the column's default is used: Average for ratings and prices)."
  );
  return lines.join("\n");
}

/** The messages to send: system prompt, context, then the conversation so far. */
export function buildCopilotMessages(scene: CopilotScene, conversation: ChatMessage[], opts: { tools: boolean; rowsTool: boolean }): ChatMessage[] {
  const ctx = buildAiContext(scene.dataset, scene.privacy);
  const filters = describeFilters(scene.filters, ctx);
  const context =
    `Dataset context (privacy level "${ctx.level}"):\n${renderAiContext(ctx)}\n\n` +
    `The user is on the "${scene.view}" view.\n` +
    (filters.length
      ? `Active filters (${scene.filteredRowCount.toLocaleString("en-US")} of ${scene.dataset.data.length.toLocaleString("en-US")} rows shown): ${filters.join("; ")}`
      : "Active filters: none (all rows shown).");
  return [{ role: "system", content: `${systemPrompt(scene.privacy, opts.tools, opts.rowsTool)}\n\n${context}` }, ...conversation];
}

/** Whether tools apply at this level (the panel shows it; the loop sends them). */
export function toolsEnabled(privacy: PrivacySettings): boolean {
  return levelAtLeast(privacy.level, "queries");
}

/**
 * Up to four starter questions from the dataset's columns: a numeric measure by a category,
 * the most common values of a category, a trend over a date column, and a column summary.
 * ID and year columns are not used as measures; personal-data columns are left out (the
 * copilot can't group on them).
 */
export function starterQuestions(dataset: Dataset): string[] {
  const meta = new Map((dataset.metadata?.columns ?? []).map((c) => [c.name, c]));
  const personal = detectPersonalColumns(dataset);
  const byType = (t: "numeric" | "categorical" | "date") => dataset.columns.filter((c) => !personal.has(c) && getEffectiveColumnType(dataset, c) === t);
  const measures = byType("numeric").filter((c) => {
    const m = meta.get(c);
    return !m || !columnAggregationFlag(m);
  });
  // A category worth grouping by: 2-60 distinct values when known.
  const categories = byType("categorical").filter((c) => {
    const u = meta.get(c)?.uniqueValueCount;
    return u === undefined || (u >= 2 && u <= 60);
  });
  const dates = byType("date");
  const out: string[] = [];
  const m = measures[0];
  const cat = categories[0];
  if (m && cat) out.push(`What is the average ${m} by ${cat}?`);
  if (cat) out.push(`Which ${cat} values are most common?`);
  if (m && dates[0]) out.push(`How does ${m} change over time by month?`);
  else if (measures[1] && cat) out.push(`Which ${cat} has the highest total ${measures[1]}?`);
  if (m) out.push(`Summarise ${m}: range, average and any outliers.`);
  if (out.length === 0) out.push("What does this dataset contain?");
  return out.slice(0, 4);
}
