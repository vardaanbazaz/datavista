import { describe, it, expect, afterEach, vi } from "vitest";
import { createChatClient, AiError } from "../client";
import { buildRequest } from "../client/styles";
import { parseSse } from "../client/sse";
import { errorFromResponse, redactSecret } from "../client/errors";
import { getProvider } from "../providers/registry";
import type { ChatMessage, ProviderConnection, ToolDefinition } from "../client/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const KEY = "sk-test-SECRET-1234567890";
const messages: ChatMessage[] = [
  { role: "system", content: "Be brief." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi" },
  { role: "user", content: "Sum?" },
];
const tool: ToolDefinition = { name: "get_rows", description: "Rows", parameters: { type: "object", properties: { n: { type: "number" } } } };

function conn(id: string, apiKey = KEY, baseUrl?: string): ProviderConnection {
  const provider = getProvider(id);
  return { provider, baseUrl: baseUrl ?? provider.baseUrl, apiKey };
}

/** A Response whose body arrives in the given chunks (split anywhere). */
function streamResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return typeof response === "function" ? response() : response;
    })
  );
  return calls;
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const ev of parseSse(stream)) out.push(ev);
  return out;
}

describe("request shape per API style", () => {
  it("openai-compatible: /chat/completions, Bearer key, messages as-is, tools as functions, json mode", () => {
    const req = buildRequest(conn("openai"), messages, { model: "gpt-4o-mini", stream: true, json: true, tools: [tool], temperature: 0.1 });
    expect(req.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(req.body).toMatchObject({
      model: "gpt-4o-mini",
      stream: true,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [{ type: "function", function: { name: "get_rows", description: "Rows", parameters: tool.parameters } }],
    });
  });

  it("openai-compatible keyless local server: no Authorization header and no response_format", () => {
    const req = buildRequest(conn("ollama", ""), messages, { model: "llama3.2", json: true });
    expect(req.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(req.headers.authorization).toBeUndefined();
    expect(req.body.response_format).toBeUndefined();
  });

  it("custom base URL: trailing slashes trimmed", () => {
    const req = buildRequest(conn("custom", "", "https://gw.example.com/v1///"), messages, { model: "m" });
    expect(req.url).toBe("https://gw.example.com/v1/chat/completions");
  });

  it("anthropic: /messages, x-api-key + version + browser header, top-level system, max_tokens, tools with input_schema", () => {
    const req = buildRequest(conn("anthropic"), messages, { model: "claude-haiku-5-5", stream: true, tools: [tool] });
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers).toMatchObject({
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(req.headers.authorization).toBeUndefined();
    expect(req.body.system).toBe("Be brief.");
    expect(req.body.max_tokens).toBe(1024);
    expect(req.body.stream).toBe(true);
    expect((req.body.messages as ChatMessage[]).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(req.body.tools).toEqual([{ name: "get_rows", description: "Rows", input_schema: tool.parameters }]);
  });

  it("gemini: key in x-goog-api-key header (never the URL), systemInstruction, role model, SSE endpoint when streaming", () => {
    const req = buildRequest(conn("gemini"), messages, { model: "models/gemini-flash-latest", stream: true, json: true, tools: [tool] });
    expect(req.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse");
    expect(req.url).not.toContain(KEY);
    expect(req.headers["x-goog-api-key"]).toBe(KEY);
    expect(req.body.systemInstruction).toEqual({ parts: [{ text: "Be brief." }] });
    expect(req.body.contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
      { role: "user", parts: [{ text: "Sum?" }] },
    ]);
    expect(req.body.generationConfig).toEqual({ responseMimeType: "application/json" });
    expect(req.body.tools).toEqual([{ functionDeclarations: [{ name: "get_rows", description: "Rows", parameters: tool.parameters }] }]);
    expect(buildRequest(conn("gemini"), messages, { model: "gemini-flash-latest" }).url).toMatch(/:generateContent$/);
  });
});

describe("SSE parser", () => {
  it("handles chunks split mid-line and mid-character, CRLF, comments and multi-line data", async () => {
    const events = await collect(
      streamResponse([": keep-alive\r\n\r\nevent: ping\r\nda", "ta: one\r\ndata: tw", "o\r\n\r\ndata: é", "\n\n", "data: last-no-blank-line"]).body!
    );
    expect(events).toEqual([
      { event: "ping", data: "one\ntwo" },
      { event: undefined, data: "é" },
      { event: undefined, data: "last-no-blank-line" },
    ]);
  });

  it("handles a CR split from its LF across chunks", async () => {
    const events = await collect(streamResponse(["data: a\r", "\n\r", "\ndata: b\n\n"]).body!);
    expect(events.map((e) => e.data)).toEqual(["a", "b"]);
  });
});

describe("streaming per API style", () => {
  it("openai-compatible: concatenates deltas, stops at [DONE], accumulates tool calls", async () => {
    mockFetch(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"get_rows","arguments":"{\\"n\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"5}"}}]}}]}\n\n',
        "data: [DONE]\n\n",
      ])
    );
    const pieces: string[] = [];
    const res = await createChatClient(conn("openai")).chat(messages, { model: "gpt-4o-mini", stream: true, tools: [tool], onText: (t) => pieces.push(t) });
    expect(res.text).toBe("Hello");
    expect(pieces).toEqual(["Hel", "lo"]);
    expect(res.toolCalls).toEqual([{ id: "c1", name: "get_rows", arguments: '{"n":5}' }]);
  });

  it("anthropic: text_delta events, tool_use input_json_delta, message_stop", async () => {
    mockFetch(
      streamResponse([
        'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"get_rows","input":{}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"n\\":2}"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );
    const res = await createChatClient(conn("anthropic")).chat(messages, { model: "claude-haiku-5-5", stream: true });
    expect(res.text).toBe("Hi there");
    expect(res.toolCalls).toEqual([{ id: "t1", name: "get_rows", arguments: '{"n":2}' }]);
  });

  it("gemini: concatenates candidate parts from each event", async () => {
    mockFetch(
      streamResponse([
        'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"A"}]}}]}\r\n\r\n',
        'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"B"}]},"finishReason":"STOP"}]}\r\n\r\n',
      ])
    );
    const res = await createChatClient(conn("gemini")).chat(messages, { model: "gemini-flash-latest", stream: true });
    expect(res.text).toBe("AB");
  });

  it("mid-stream error events after HTTP 200 throw a typed error (each style)", async () => {
    mockFetch(streamResponse(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', 'data: {"error":{"message":"overloaded"}}\n\n']));
    await expect(createChatClient(conn("groq")).chat(messages, { model: "m", stream: true })).rejects.toMatchObject({ kind: "other" });

    mockFetch(streamResponse(['event: error\ndata: {"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}\n\n']));
    await expect(createChatClient(conn("anthropic")).chat(messages, { model: "m", stream: true })).rejects.toMatchObject({ kind: "rate-limited" });

    mockFetch(streamResponse(['data: {"error":{"code":500,"message":"internal","status":"INTERNAL"}}\n\n']));
    const err = await createChatClient(conn("gemini")).chat(messages, { model: "m", stream: true }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toContain("internal");
  });

  it("non-streaming responses parse for each style", async () => {
    mockFetch(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    expect((await createChatClient(conn("openai")).chat(messages, { model: "m" })).text).toBe("ok");
    mockFetch(new Response(JSON.stringify({ content: [{ type: "text", text: "ok2" }] })));
    expect((await createChatClient(conn("anthropic")).chat(messages, { model: "m" })).text).toBe("ok2");
    mockFetch(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok3" }] } }] })));
    expect((await createChatClient(conn("gemini")).chat(messages, { model: "m" })).text).toBe("ok3");
  });
});

describe("error mapping", () => {
  it("fetch TypeError (CORS / network) maps to blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(createChatClient(conn("openai")).chat(messages, { model: "m" })).rejects.toMatchObject({ kind: "blocked" });
    const local = await createChatClient(conn("ollama", "")).chat(messages, { model: "m" }).catch((e) => e);
    expect(local.kind).toBe("blocked");
    expect(local.message).toMatch(/local server/);
  });

  it("401 / 403 / Gemini 400 API_KEY_INVALID map to bad-key", () => {
    expect(errorFromResponse(401, "{}", KEY).kind).toBe("bad-key");
    expect(errorFromResponse(403, "{}", KEY).kind).toBe("bad-key");
    const gemini = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}';
    expect(errorFromResponse(400, gemini, KEY).kind).toBe("bad-key");
  });

  it("404 and 400-with-model-message map to model-not-found; other 400s do not", () => {
    expect(errorFromResponse(404, '{"error":{"message":"The model `x` does not exist"}}', KEY, "x").kind).toBe("model-not-found");
    expect(errorFromResponse(400, '{"error":{"message":"model: claude-nope not found"}}', KEY).kind).toBe("model-not-found");
    expect(errorFromResponse(400, '{"error":{"message":"messages: field required"}}', KEY).kind).toBe("other");
  });

  it("429 maps to rate-limited with the retry-after hint", () => {
    const e = errorFromResponse(429, "{}", KEY, "m", "12");
    expect(e.kind).toBe("rate-limited");
    expect(e.message).toContain("12 s");
  });

  it("other statuses map to other", () => {
    expect(errorFromResponse(500, "boom", KEY).kind).toBe("other");
  });

  it("never puts the key in an error message, even when the provider echoes it", async () => {
    mockFetch(new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}. Bearer ${KEY}` } }), { status: 401 }));
    const err = await createChatClient(conn("openai")).chat(messages, { model: "m" }).catch((e) => e);
    expect(err.kind).toBe("bad-key");
    expect(err.message).not.toContain(KEY);
    expect(err.message).not.toContain("SECRET");
    expect(redactSecret(`x ${KEY} y`, KEY)).toBe("x ••• y");
  });

  it("a stalled request times out with a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
      )
    );
    const err = await createChatClient(conn("openai")).chat(messages, { model: "m", timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toMatch(/did not answer/);
  });

  it("makes no request when a key is required but missing", async () => {
    const calls = mockFetch(new Response("{}"));
    await expect(createChatClient(conn("openai", "")).chat(messages, { model: "m" })).rejects.toMatchObject({ kind: "bad-key" });
    expect(calls).toHaveLength(0);
  });
});

describe("listModels", () => {
  it("parses openai-style data[].id and gemini models[].name", async () => {
    mockFetch(new Response(JSON.stringify({ data: [{ id: "b" }, { id: "a" }] })));
    expect(await createChatClient(conn("groq")).listModels()).toEqual(["a", "b"]);
    mockFetch(
      new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-x", supportedGenerationMethods: ["generateContent"] },
            { name: "models/embed", supportedGenerationMethods: ["embedContent"] },
          ],
        })
      )
    );
    expect(await createChatClient(conn("gemini")).listModels()).toEqual(["gemini-x"]);
  });
});
