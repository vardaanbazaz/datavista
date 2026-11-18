/**
 * Request and response shapes for the three API styles. Pure functions (no fetch), so the
 * request shape is unit-testable and "Preview what will be sent" shows the real body.
 */
import { AiError, providerMessage } from "./errors";
import type { SseEvent } from "./sse";
import type { BuiltRequest, ChatMessage, ChatOptions, ChatResult, ProviderConnection, StreamAccumulator, ToolCall } from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

export function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Gemini's model list returns "models/gemini-x"; requests take the bare id. */
function geminiModelId(model: string): string {
  return model.trim().replace(/^models\//, "");
}

function splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  return { system, rest: messages.filter((m) => m.role !== "system") };
}

/** Tool-call arguments as an object (models sometimes send "" for no arguments). */
function argsObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** A tool result as an object (Gemini's functionResponse.response must be one). */
function resultObject(content: string): Record<string, unknown> {
  try {
    const v = JSON.parse(content);
    return v && typeof v === "object" && !Array.isArray(v) ? v : { result: v };
  } catch {
    return { result: content };
  }
}

/**
 * Groups runs of consecutive tool turns: Anthropic and Gemini want all results of one
 * assistant turn in a single user turn.
 */
function groupToolTurns(messages: ChatMessage[]): (ChatMessage | ChatMessage[])[] {
  const out: (ChatMessage | ChatMessage[])[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (m.role === "tool" && Array.isArray(last)) last.push(m);
    else out.push(m.role === "tool" ? [m] : m);
  }
  return out;
}

function anthropicMessages(rest: ChatMessage[]): Record<string, unknown>[] {
  return groupToolTurns(rest).map((m) => {
    if (Array.isArray(m)) {
      return { role: "user", content: m.map((t) => ({ type: "tool_result", tool_use_id: t.toolCallId ?? "", content: t.content })) };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: Record<string, unknown>[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: argsObject(c.arguments) });
      return { role: "assistant", content: blocks };
    }
    return { role: m.role, content: m.content };
  });
}

function geminiContents(rest: ChatMessage[]): Record<string, unknown>[] {
  return groupToolTurns(rest).map((m) => {
    if (Array.isArray(m)) {
      return { role: "user", parts: m.map((t) => ({ functionResponse: { name: t.name ?? "", response: resultObject(t.content) } })) };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const parts: Record<string, unknown>[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls) {
        const part: Record<string, unknown> = { functionCall: { name: c.name, args: argsObject(c.arguments) } };
        if (c.thoughtSignature) part.thoughtSignature = c.thoughtSignature;
        parts.push(part);
      }
      return { role: "model", parts };
    }
    return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
  });
}

function openAiMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content };
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments || "{}" } })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

export function buildRequest(conn: ProviderConnection, messages: ChatMessage[], opts: ChatOptions): BuiltRequest {
  const base = trimBase(conn.baseUrl);
  const key = conn.apiKey.trim();
  const style = conn.provider.apiStyle;

  if (style === "anthropic") {
    const { system, rest } = splitSystem(messages);
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: anthropicMessages(rest),
    };
    if (system) body.system = system;
    if (opts.stream) body.stream = true;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.tools?.length) {
      body.tools = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
      if (opts.toolChoice === "none") body.tool_choice = { type: "none" };
    }
    return {
      url: `${base}/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body,
    };
  }

  if (style === "gemini") {
    const { system, rest } = splitSystem(messages);
    const model = geminiModelId(opts.model);
    const generationConfig: Record<string, unknown> = {};
    if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) generationConfig.maxOutputTokens = opts.maxTokens;
    if (opts.json) generationConfig.responseMimeType = "application/json";
    const body: Record<string, unknown> = {
      contents: geminiContents(rest),
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
    if (opts.tools?.length) {
      body.tools = [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
      if (opts.toolChoice === "none") body.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    }
    const path = opts.stream ? `:streamGenerateContent?alt=sse` : `:generateContent`;
    return {
      url: `${base}/models/${encodeURIComponent(model)}${path}`,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body,
    };
  }

  // openai-compatible
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: openAiMessages(messages),
  };
  if (opts.stream) body.stream = true;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.json && conn.provider.jsonMode) body.response_format = { type: "json_object" };
  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    if (opts.toolChoice === "none") body.tool_choice = "none";
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return { url: `${base}/chat/completions`, headers, body };
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Parses a non-streaming response body. */
export function parseResponse(style: ProviderConnection["provider"]["apiStyle"], json: Json): ChatResult {
  if (style === "anthropic") {
    const blocks: Json[] = Array.isArray(json?.content) ? json.content : [];
    return {
      text: blocks.filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join(""),
      toolCalls: blocks
        .filter((b) => b?.type === "tool_use")
        .map((b) => ({ id: String(b.id ?? ""), name: String(b.name ?? ""), arguments: JSON.stringify(b.input ?? {}) })),
    };
  }
  if (style === "gemini") {
    const parts: Json[] = json?.candidates?.[0]?.content?.parts ?? [];
    return geminiParts(parts);
  }
  const msg = json?.choices?.[0]?.message ?? {};
  const calls: Json[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  return {
    text: typeof msg.content === "string" ? msg.content : "",
    toolCalls: calls.map((c, i) => ({ id: String(c.id ?? i), name: String(c.function?.name ?? ""), arguments: String(c.function?.arguments ?? "") })),
  };
}

function geminiParts(parts: Json[]): ChatResult {
  const toolCalls: ToolCall[] = [];
  let text = "";
  parts.forEach((p, i) => {
    if (typeof p?.text === "string") text += p.text;
    if (p?.functionCall) {
      const call: ToolCall = { id: String(p.functionCall.id ?? i), name: String(p.functionCall.name ?? ""), arguments: JSON.stringify(p.functionCall.args ?? {}) };
      if (typeof p.thoughtSignature === "string") call.thoughtSignature = p.thoughtSignature;
      toolCalls.push(call);
    }
  });
  return { text, toolCalls };
}

function streamError(raw: string, err: Json | string | undefined, secret: string): AiError {
  const type = typeof err === "object" ? String(err?.type ?? err?.status ?? "") : "";
  const message = providerMessage(raw, secret);
  if (/rate_limit|RESOURCE_EXHAUSTED/i.test(type)) return new AiError("rate-limited", `Too many requests (stopped mid-answer). Provider said: "${message}"`);
  return new AiError("other", `The provider stopped with an error mid-answer. Provider said: "${message}"`);
}

function parseData(data: string): Json | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** Folds one SSE event into the accumulator; returns the new text, if any. Throws on in-stream errors. */
export function applyStreamEvent(style: ProviderConnection["provider"]["apiStyle"], ev: SseEvent, acc: StreamAccumulator, secret: string): string {
  if (style === "anthropic") {
    const json = parseData(ev.data);
    const type = ev.event ?? json?.type;
    if (type === "error" || json?.type === "error") throw streamError(ev.data, json?.error, secret);
    if (!json) return "";
    if (type === "message_stop") {
      acc.done = true;
      return "";
    }
    if (type === "content_block_start" && json.content_block?.type === "tool_use") {
      acc.toolCalls.set(String(json.index), { id: String(json.content_block.id ?? ""), name: String(json.content_block.name ?? ""), arguments: "" });
      return "";
    }
    if (type === "content_block_delta") {
      if (json.delta?.type === "text_delta") {
        const t = String(json.delta.text ?? "");
        acc.text += t;
        return t;
      }
      if (json.delta?.type === "input_json_delta") {
        const call = acc.toolCalls.get(String(json.index));
        if (call) call.arguments += String(json.delta.partial_json ?? "");
      }
    }
    return "";
  }

  if (style === "gemini") {
    const json = parseData(ev.data);
    if (!json) return "";
    if (json.error) throw streamError(ev.data, json.error, secret);
    const parts: Json[] = json.candidates?.[0]?.content?.parts ?? [];
    const { text, toolCalls } = geminiParts(parts);
    for (const c of toolCalls) acc.toolCalls.set(`${acc.toolCalls.size}`, c);
    acc.text += text;
    if (json.candidates?.[0]?.finishReason) acc.done = true;
    return text;
  }

  // openai-compatible
  if (ev.data.trim() === "[DONE]") {
    acc.done = true;
    return "";
  }
  const json = parseData(ev.data);
  if (!json) return "";
  if (json.error) throw streamError(ev.data, json.error, secret);
  const delta = json.choices?.[0]?.delta ?? {};
  for (const tc of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
    const idx = String(tc.index ?? 0);
    const call = acc.toolCalls.get(idx) ?? { id: "", name: "", arguments: "" };
    if (tc.id) call.id = String(tc.id);
    if (tc.function?.name) call.name += String(tc.function.name);
    if (tc.function?.arguments) call.arguments += String(tc.function.arguments);
    acc.toolCalls.set(idx, call);
  }
  const t = typeof delta.content === "string" ? delta.content : "";
  acc.text += t;
  return t;
}

/** The request that lists models, or null when the provider has no list. */
export function buildModelsRequest(conn: ProviderConnection): { url: string; headers: Record<string, string> } | null {
  const endpoint = conn.provider.modelsEndpoint;
  if (!endpoint) return null;
  const base = trimBase(conn.baseUrl);
  const key = conn.apiKey.trim();
  if (conn.provider.apiStyle === "anthropic") {
    return {
      url: `${base}${endpoint}?limit=100`,
      headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION, "anthropic-dangerous-direct-browser-access": "true" },
    };
  }
  if (conn.provider.apiStyle === "gemini") {
    return { url: `${base}${endpoint}?pageSize=200`, headers: { "x-goog-api-key": key } };
  }
  return { url: `${base}${endpoint}`, headers: key ? { authorization: `Bearer ${key}` } : {} };
}

export function parseModels(style: ProviderConnection["provider"]["apiStyle"], json: Json): string[] {
  if (style === "gemini") {
    const models: Json[] = Array.isArray(json?.models) ? json.models : [];
    return models
      .filter((m) => !Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => geminiModelId(String(m.name ?? "")))
      .filter(Boolean);
  }
  const list: Json[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
  return list.map((m) => String(m.id ?? m.name ?? "")).filter(Boolean);
}
