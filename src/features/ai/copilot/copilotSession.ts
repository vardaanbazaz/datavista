/**
 * Sends one copilot question: builds the messages (copilot/context.ts), runs the tool loop
 * (copilot/toolLoop.ts) against the saved provider, and streams the answer into the copilot
 * store. Loaded with the panel (lazy), never at startup.
 */
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useUiStore } from "@/store/uiStore";
import { VIEW_LABELS } from "@/store/viewTypes";
import { createChatClient, describeAiError } from "../client";
import type { ChatMessage } from "../client/types";
import { requestOptions } from "../aiRequests";
import { isConnectionReady, resolveConnection, useAiSettingsStore } from "../settings/aiSettingsStore";
import { buildCopilotMessages } from "./context";
import { copilotTools, createToolEnv, queryTools, runCopilotTool } from "./tools";
import { MAX_TOOL_STEPS, runCopilotTurn } from "./toolLoop";
import { useCopilotStore, type CopilotMessage } from "./copilotStore";

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export const NO_TOOLS_NOTE = "This model can't run local queries, so this answer uses the dataset summary only.";
/** Below Queries the only tools are the actions. */
export const NO_ACTIONS_NOTE = "This model can't use tools, so it can't propose charts, KPI cards or filters.";
export const CAPPED_NOTE = `Stopped after ${MAX_TOOL_STEPS} queries; the answer uses the results so far.`;

/** Earlier turns sent with a question: the chat keeps more (CHAT_MAX_MESSAGES), the model gets the last 10. */
export const CONTEXT_TURNS = 10;

/**
 * Earlier turns as plain text (the numbers from earlier queries are in the answers): the last
 * CONTEXT_TURNS questions and their answers, starting on a question.
 */
export function conversation(list: CopilotMessage[], turns = CONTEXT_TURNS): ChatMessage[] {
  const kept = list.filter((m) => m.text.trim() && (m.role === "user" || m.status === "done" || m.status === "stopped"));
  let start = kept.length;
  for (let seen = 0; start > 0 && seen < turns; ) {
    start--;
    if (kept[start].role === "user") seen++;
  }
  while (start < kept.length && kept[start].role !== "user") start++;
  return kept.slice(start).map((m) => ({ role: m.role, content: m.text }));
}

/**
 * Asks `question` about the active dataset. Returns when the answer is complete, stopped
 * (`signal`) or failed; the store holds the outcome.
 */
export async function askCopilot(question: string, signal: AbortSignal): Promise<void> {
  const dataset = useDatasetStore.getState().activeDataset;
  if (!dataset) return;
  const store = useCopilotStore.getState();
  const history = conversation(store.chats[dataset.id] ?? []);
  store.addMessage(dataset.id, { id: newId(), role: "user", text: question });
  const answerId = newId();
  store.addMessage(dataset.id, { id: answerId, role: "assistant", text: "", steps: [], status: "streaming" });
  const update = (patch: Parameters<typeof store.updateMessage>[2]) => useCopilotStore.getState().updateMessage(dataset.id, answerId, patch);

  try {
    const settings = useAiSettingsStore.getState();
    const conn = resolveConnection(settings);
    if (!isConnectionReady(conn)) throw new Error("Connect an AI provider in AI settings first.");
    const privacy = settings.privacy;
    const tools = copilotTools(privacy);
    const env = createToolEnv(dataset, privacy, question);
    const queries = queryTools(privacy);
    const filters = useFilterStore.getState();
    const messages = buildCopilotMessages(
      {
        dataset,
        view: VIEW_LABELS[useUiStore.getState().activeView],
        filters: filters.activeFilters,
        filteredRowCount: filters.filteredData.length,
        privacy,
      },
      [...history, { role: "user", content: question }],
      { tools: queries.length > 0, rowsTool: queries.some((t) => t.name === "get_rows") }
    );

    const result = await runCopilotTurn({
      client: createChatClient(conn),
      messages,
      tools,
      runTool: (name, args) => runCopilotTool(env, name, args),
      options: requestOptions("chat", conn.model, conn.provider.apiStyle),
      signal,
      onText: (delta) => update((m) => ({ text: m.text + delta, retrying: false })),
      onStep: (step) => update((m) => ({ steps: [...(m.steps ?? []), step], retrying: false })),
      // status 0: no answer before the first-response timeout (client/index.ts).
      onRetry: ({ status }) => update({ retrying: true, retryReason: status === 0 ? "timeout" : "busy" }),
    });
    const notes = [result.toolsUnsupported ? (queries.length ? NO_TOOLS_NOTE : NO_ACTIONS_NOTE) : "", result.capped ? CAPPED_NOTE : ""].filter(Boolean);
    update({ text: result.text, status: "done", retrying: false, note: notes.join(" ") || undefined });
  } catch (e) {
    if (signal.aborted) update({ status: "stopped", retrying: false });
    else update({ status: "error", retrying: false, error: describeAiError(e, resolveConnection(useAiSettingsStore.getState()).apiKey) });
  }
}
