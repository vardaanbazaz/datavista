import type { ProviderEntry } from "../providers/registry";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A function the model may call. Accepted by every API style; not used by any feature yet. */
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
}

export interface ChatOptions {
  model: string;
  stream?: boolean;
  tools?: ToolDefinition[];
  /** Ask for a JSON object where the API supports it (the prompt must still say so). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Streaming only: called with each piece of text as it arrives. */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
  /** Non-streaming: whole request. Streaming: the wait for the first byte and between chunks. */
  timeoutMs?: number;
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
