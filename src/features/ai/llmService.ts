import { AIPromptContext } from "./types";
import { LlmProvider } from "@/store/uiStore";
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

const LLM_REQUEST_TIMEOUT_MS = 30000;

/**
 * fetch() with an AbortController-based timeout. Without this, a stalled network condition
 * (captive portal, dropped connection, provider hang) leaves the calling UI's "generating..."
 * state stuck true forever, with no cancel path.
 */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = LLM_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`AI request timed out after ${timeoutMs / 1000}s. The service may be slow or unreachable - please try again.`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callLLM(
  apiKey: string,
  provider: LlmProvider,
  context: AIPromptContext,
  mode?: 'query' | 'formula'
): Promise<string> {
  if (!apiKey || apiKey.trim() === '') {
    // Provide a smart offline heuristic response if no API key is set
    return generateOfflineFallback(context, mode);
  }

  const contextMessage = `
Context Dataset: ${context.datasetName || 'Active Dataset'}
Available Columns: ${JSON.stringify(context.columns)}
Existing Calculated Fields: ${JSON.stringify(context.calculatedFields || [])}
User Prompt: "${context.prompt}"
Target Mode Preference: ${mode || 'auto'}
  `;

  if (provider === 'gemini') {
    // Key goes in the x-goog-api-key header (Google's documented alternative to the
    // ?key= query param) — a query-param key is more likely to leak into provider
    // access logs, browser history, or a TLS-inspecting proxy log.
    // "latest" alias tracks Google's current GA Flash model, so a dated model
    // name (e.g. gemini-1.5-flash) can't silently go stale after deprecation.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { text: contextMessage }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("No response text returned from Gemini API");
    }
    return candidateText;
  } else {
    // OpenAI Provider
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextMessage }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No response text returned from OpenAI API");
    }
    return content;
  }
}

/**
 * Offline Heuristic Fallback for common analytical phrases when API key is missing
 */
function generateOfflineFallback(context: AIPromptContext, mode?: 'query' | 'formula'): string {
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
