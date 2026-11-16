import { AIPromptContext } from "./types";
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

/**
 * Offline heuristic for common analytical phrases, used when no AI provider is connected.
 * Runs locally; nothing is sent anywhere.
 */
export function generateOfflineFallback(context: AIPromptContext, mode?: 'query' | 'formula'): string {
  const promptLower = context.prompt.toLowerCase();
  const columns = context.columns;
  const colNames = columns.map(c => c.name);

  // Find categorical vs numeric columns
  const catCol = columns.find(c => c.type === 'categorical')?.name || colNames[0] || 'Category';
  const numCol = columns.find(c => c.type === 'numeric')?.name || colNames[1] || 'Sales';

  if (mode === 'formula' || promptLower.includes('calculate') || promptLower.includes('margin') || promptLower.includes('ratio')) {
    if (promptLower.includes('margin') && colNames.includes('Profit') && colNames.includes('Sales')) {
      return JSON.stringify({
        type: 'formula',
        formula: '([Profit] / [Sales]) * 100',
        fieldName: 'Profit Margin (%)',
        title: 'Profit Margin Calculation',
        explanation: 'Calculates Profit as a percentage of Sales.'
      });
    }
    if (colNames.length >= 2) {
      return JSON.stringify({
        type: 'formula',
        formula: `[${numCol}] * 1.1`,
        fieldName: `Adjusted ${numCol}`,
        title: `Adjusted ${numCol} Calculation`,
        explanation: `Applies a 10% projection to [${numCol}].`
      });
    }
  }

  // Check for Top N pattern
  const topMatch = promptLower.match(/top\s+(\d+)/);
  const pageSize = topMatch ? parseInt(topMatch[1], 10) : 5;

  return JSON.stringify({
    type: 'query',
    query: {
      groupBy: { column: catCol },
      aggregations: [
        { column: numCol, operator: 'sum', alias: `Total ${numCol}` }
      ],
      sorting: [
        { column: `Total ${numCol}`, direction: 'desc' }
      ],
      pagination: { page: 1, pageSize: topMatch ? pageSize : 'all' }
    },
    chartType: 'bar',
    title: `${catCol} by ${numCol}`,
    explanation: `Offline AI Heuristic: Aggregated [${numCol}] grouped by [${catCol}].`
  });
}
