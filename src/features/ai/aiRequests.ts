/**
 * How the AI features talk to the provider. Each request's dataset content comes from
 * privacy/contextBuilder.ts:buildAiContext (the user's privacy level and personal-data
 * masking); the HTTP call goes through client/. Both are loaded with `await import()`, so
 * neither is in the startup bundle.
 */
import type { Dataset, DataRow, ChartConfig, FilterState, GlobalFilter } from "@/shared/types";
import type { ChatMessage, ChatOptions, BuiltRequest } from "./client/types";
import type { DetectedAnomaly } from "./anomalyDetector";
import type { ApiStyle } from "./providers/registry";
import { SYSTEM_PROMPT } from "./llmService";
import { useAiSettingsStore, resolveConnection, isConnectionReady } from "./settings/aiSettingsStore";

export type AiRequestKind = "query" | "formula" | "summary";

const SUMMARY_SYSTEM_PROMPT =
  "You are a data analyst writing for a busy manager. Write a concise, professional 2 to 3 sentence executive summary " +
  "of the dataset's state, key metrics and any notable spikes, drops or unusual values. Plain text only: no markdown, no JSON, no lists.";

async function loadBuilder() {
  return import("./privacy/contextBuilder");
}

/** Messages for an AI query or formula request. */
export async function buildQueryMessages(prompt: string, dataset: Dataset, mode?: "query" | "formula"): Promise<ChatMessage[]> {
  const { buildAiContext, renderAiContext } = await loadBuilder();
  const ctx = buildAiContext(dataset, useAiSettingsStore.getState().privacy);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Dataset context (privacy level "${ctx.level}"; values shown as "[masked ...]" are hidden personal data):\n${renderAiContext(ctx)}\n\n` +
        `Target mode preference: ${mode ?? "auto"}\n` +
        `User prompt: ${JSON.stringify(prompt)}`,
    },
  ];
}

/** Messages for the executive summary. Filter values and unusual values pass the same masking. */
export async function buildSummaryMessages(
  dataset: Dataset,
  charts: ChartConfig[],
  filters: FilterState | GlobalFilter[] | undefined,
  anomalies: DetectedAnomaly[],
  rows?: DataRow[]
): Promise<ChatMessage[]> {
  const { buildAiContext, renderAiContext, valueForAi } = await loadBuilder();
  const ctx = buildAiContext(dataset, useAiSettingsStore.getState().privacy, { rows });

  const filterParts: string[] = Array.isArray(filters)
    ? filters.map((f) => {
        const v = valueForAi(ctx, f.column, JSON.stringify(f.value));
        return v === null ? f.column : `${f.column} = ${v}`;
      })
    : Object.entries(filters?.categoricalFilters ?? {}).map(([col, values]) => {
        const shown = values.map((v) => valueForAi(ctx, col, String(v)));
        return shown.some((v) => v === null) ? `${col} (filtered)` : `${col}: [${shown.join(", ")}]`;
      });

  // Unusual values name a category (dimensionKey); hide it when its column is masked, and
  // leave them out entirely at the schema level (they are data values).
  const anomalyText =
    ctx.level === "schema"
      ? "Not shared (privacy level: schema)."
      : anomalies
          .slice(0, 5)
          .map((a) => {
            const masked = a.dimensionColumn && a.dimensionKey ? valueForAi(ctx, a.dimensionColumn, a.dimensionKey) : a.dimensionKey;
            return masked && a.dimensionKey && masked !== a.dimensionKey ? a.description.split(a.dimensionKey).join(masked) : a.description;
          })
          .join(" ") || "No statistically significant outliers detected.";

  return [
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Dataset context (privacy level "${ctx.level}"):\n${renderAiContext(ctx)}\n\n` +
        `Charts on the dashboard: ${charts.length}\n` +
        `Active filters: ${filterParts.join("; ") || "None"}\n` +
        `Detected outliers/unusual values: ${anomalyText}`,
    },
  ];
}

/**
 * Request options for a kind of AI request, shared by the real calls and "Test connection"
 * so a passing test means the features work. openai-compatible gets no temperature or
 * max_tokens: newer OpenAI (reasoning) models reject both, and other servers have sane defaults.
 */
export function requestOptions(kind: AiRequestKind, model: string, style: ApiStyle): ChatOptions {
  const json = kind !== "summary";
  if (style === "openai-compatible") return { model, json };
  return kind === "summary" ? { model, temperature: 0.3, maxTokens: 400 } : { model, json, temperature: 0.1, maxTokens: 1500 };
}

/** Sends messages to the saved provider and returns the text. Throws AiError (typed) on failure. */
export async function runChat(kind: AiRequestKind, messages: ChatMessage[]): Promise<string> {
  const conn = resolveConnection(useAiSettingsStore.getState());
  if (!isConnectionReady(conn)) {
    const { AiError } = await import("./client/errors");
    throw new AiError("bad-key", "Connect an AI provider in AI settings first.");
  }
  const { createChatClient } = await import("./client");
  const result = await createChatClient(conn).chat(messages, requestOptions(kind, conn.model, conn.provider.apiStyle));
  return result.text;
}

export interface RequestPreview {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * The exact request the next AI query on `dataset` would send (the user's question shown as
 * a placeholder), with the key replaced by "•••". Built by the same functions as the real call.
 */
export async function previewNextRequest(
  dataset: Dataset,
  draft?: { providerId: string; model: string; baseUrl?: string }
): Promise<RequestPreview> {
  const state = useAiSettingsStore.getState();
  const conn = resolveConnection(draft ? { ...state, providerId: draft.providerId, models: { ...state.models, [draft.providerId]: draft.model }, baseUrls: { ...state.baseUrls, [draft.providerId]: draft.baseUrl ?? "" } } : state);
  const messages = await buildQueryMessages("<your question>", dataset, "query");
  const { buildRequest } = await import("./client/styles");
  const built: BuiltRequest = buildRequest({ ...conn, apiKey: conn.apiKey ? "•••" : "" }, messages, requestOptions("query", conn.model, conn.provider.apiStyle));
  return built;
}
