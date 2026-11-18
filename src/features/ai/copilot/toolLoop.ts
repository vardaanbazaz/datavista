/**
 * One copilot answer: the model may call local tools (copilot/tools.ts) up to MAX_TOOL_STEPS
 * times, then answers in text. Every request streams, so whichever reply turns out to be the
 * final one is already streaming (a reply is only known to be final once it arrives with no
 * tool calls). Works the same for the three API styles; client/styles.ts shapes the tool turns.
 *  - Step cap: past MAX_TOOL_STEPS calls, extra calls get an error result and the next request
 *    keeps the tools defined (Anthropic rejects tool history without them) but sets
 *    toolChoice "none", so the model must answer.
 *  - No tools: when the provider or model rejects the tools on the first request, the request
 *    is sent again without them (answer from the context only) and `toolsUnsupported` is set.
 */
import type { ChatClient } from "../client";
import { isToolsUnsupported } from "../client/errors";
import type { ChatMessage, ChatOptions, ToolCall, ToolDefinition } from "../client/types";
import type { ToolRunResult } from "./tools";

export const MAX_TOOL_STEPS = 6;

export interface CopilotStep {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  args: unknown;
  result: unknown;
}

export interface CopilotTurnOptions {
  client: Pick<ChatClient, "chat">;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  runTool: (name: string, rawArgs: string) => ToolRunResult;
  /** Model and per-style request options (aiRequests.ts:requestOptions("chat", ...)). */
  options: ChatOptions;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  onStep?: (step: CopilotStep) => void;
  onRetry?: ChatOptions["onRetry"];
  maxSteps?: number;
}

export interface CopilotTurnResult {
  text: string;
  steps: CopilotStep[];
  /** The model refused tools; the answer is from the context only. */
  toolsUnsupported: boolean;
  /** The step cap was reached and the model was asked to answer. */
  capped: boolean;
}

const STEP_LIMIT_RESULT = (max: number) => JSON.stringify({ error: `Step limit reached (${max} queries). Answer now with the results you have.` });

export async function runCopilotTurn(o: CopilotTurnOptions): Promise<CopilotTurnResult> {
  const maxSteps = o.maxSteps ?? MAX_TOOL_STEPS;
  const history: ChatMessage[] = [...o.messages];
  const steps: CopilotStep[] = [];
  let useTools = o.tools.length > 0;
  let toolsUnsupported = false;
  let capped = false;
  let text = "";
  let callSeq = 0;

  for (let round = 0; ; round++) {
    const forceText = useTools && steps.length >= maxSteps;
    if (forceText) capped = true;
    let roundText = "";
    const onText = (delta: string) => {
      // Keep text from earlier rounds ("Let me check...") apart from the next.
      if (!roundText && text) o.onText?.("\n\n");
      roundText += delta;
      o.onText?.(delta);
    };
    const opts: ChatOptions = {
      ...o.options,
      stream: true,
      signal: o.signal,
      onText,
      onRetry: o.onRetry,
      tools: useTools ? o.tools : undefined,
      toolChoice: forceText ? "none" : undefined,
    };

    let res;
    try {
      res = await o.client.chat(history, opts);
    } catch (e) {
      if (useTools && round === 0 && isToolsUnsupported(e)) {
        useTools = false;
        toolsUnsupported = true;
        continue;
      }
      throw e;
    }

    if (res.text) text = text ? `${text}\n\n${res.text}` : res.text;
    const calls: ToolCall[] = useTools && !forceText ? res.toolCalls : [];
    if (calls.length === 0) return { text, steps, toolsUnsupported, capped };

    // Every call needs an id the next request can answer (Gemini sends none).
    const named = calls.map((c) => ({ ...c, id: c.id && c.id !== String(Number(c.id)) ? c.id : `call_${++callSeq}` }));
    history.push({ role: "assistant", content: res.text, toolCalls: named });
    for (const call of named) {
      if (steps.length >= maxSteps) {
        history.push({ role: "tool", toolCallId: call.id, name: call.name, content: STEP_LIMIT_RESULT(maxSteps) });
        capped = true;
        continue;
      }
      const r = o.runTool(call.name, call.arguments);
      const step: CopilotStep = { id: call.id, name: call.name, ok: r.ok, summary: r.summary, args: r.args, result: r.result };
      steps.push(step);
      o.onStep?.(step);
      history.push({ role: "tool", toolCallId: call.id, name: call.name, content: r.content });
    }
  }
}
