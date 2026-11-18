import type { ProviderEntry } from "../providers/registry";

export type ChatRole = "system" | "user" | "assistant" | "tool";

/**
 * One turn. An assistant turn may carry the tool calls the model made; a "tool" turn is the
 * result of one call (`toolCallId` and `name` say which). Each API style shapes these its own
 * way (client/styles.ts:buildRequest).
 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant turns: the calls the model made in this turn. */
  toolCalls?: ToolCall[];
  /** Tool turns: the id of the call this answers. */
  toolCallId?: string;
  /** Tool turns: the tool's name (Gemini matches results by name). */
  name?: string;
}

/** A function the model may call (the copilot's local queries, copilot/tools.ts). */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text of the arguments, as the model produced it. */
  arguments: string;
  /** Gemini: the part's thoughtSignature, sent back verbatim with the call (newer models require it). */
  thoughtSignature?: string;
}

export interface ChatOptions {
  model: string;
  stream?: boolean;
  tools?: ToolDefinition[];
  /** "none": tools stay defined (history may hold tool turns) but the model must answer in text. */
  toolChoice?: "auto" | "none";
  /** Ask for a JSON object where the API supports it (the prompt must still say so). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Streaming only: called with each piece of text as it arrives. */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
  /**
   * Non-streaming: the whole request (default 90 s). Streaming: the longest gap between
   * chunks after the first one (default 30 s).
   */
  timeoutMs?: number;
  /** Streaming: the wait for the first chunk (default 90 s, client/index.ts:FIRST_RESPONSE_TIMEOUT_MS). */
  firstResponseTimeoutMs?: number;
  /**
   * Called before an automatic retry: a 503 or 429 answer (up to 2 retries), or a timeout
   * before any output (once, `status` 0). Waits `delayMs` (Retry-After when the provider sends one).
   */
  onRetry?: (info: { attempt: number; delayMs: number; status: number }) => void;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
}

/** Where a request goes: a registry entry plus the user's base URL (Custom) and key. */
export interface ProviderConnection {
  provider: ProviderEntry;
  baseUrl: string;
  apiKey: string;
}

/** The exact HTTP request a chat call sends. */
export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface StreamAccumulator {
  text: string;
  toolCalls: Map<string, ToolCall>;
  done: boolean;
}
