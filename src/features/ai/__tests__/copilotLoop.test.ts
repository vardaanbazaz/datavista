import { describe, it, expect, afterEach, vi } from "vitest";
import { createChatClient, AiError, retryDelayMs, MAX_RETRY_WAIT_MS } from "../client";
import { getProvider } from "../providers/registry";
import type { ProviderConnection } from "../client/types";
import { runCopilotTurn, MAX_TOOL_STEPS, type CopilotStep } from "../copilot/toolLoop";
import { copilotTools, createToolEnv, runCopilotTool } from "../copilot/tools";
import { requestOptions } from "../aiRequests";
import type { Dataset, DataRow } from "@/shared/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const CATS = ["GAME", "FAMILY", "TOOLS"];
function dataset(): Dataset {
  const data: DataRow[] = Array.from({ length: 30 }, (_, i) => ({ Category: CATS[i % 3], Rating: i % 3 === 0 ? 4 : i % 3 === 1 ? 3 : 5 }));
  return { id: "loop", name: "apps", data, columns: ["Category", "Rating"], columnTypes: { Category: "categorical", Rating: "numeric" } };
}
const privacy = { level: "queries" as const, sampleRows: 50, unmasked: [] };

function conn(id: string): ProviderConnection {
  const provider = getProvider(id);
  return { provider, baseUrl: provider.baseUrl, apiKey: "k-123456789" };
}

function sse(events: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(e));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const ARGS = { groupBy: { column: "Category" }, aggregations: [{ op: "avg", column: "Rating" }] };

/** Per style: a streamed reply that calls `aggregate`, and a streamed text reply. */
const STYLE = {
  openai: {
    toolReply: () =>
      sse([
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "aggregate", arguments: JSON.stringify(ARGS).slice(0, 20) } }] } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(ARGS).slice(20) } }] } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    textReply: (t: string) => sse([`data: ${JSON.stringify({ choices: [{ delta: { content: t.slice(0, 5) } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: { content: t.slice(5) } }] })}\n\n`, "data: [DONE]\n\n"]),
  },
  anthropic: {
    toolReply: () =>
      sse([
        `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "aggregate", input: {} } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(ARGS) } })}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ]),
    textReply: (t: string) =>
      sse([
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ]),
  },
  gemini: {
    toolReply: () => sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "aggregate", args: ARGS }, thoughtSignature: "SIG-1" }] }, finishReason: "STOP" }] })}\n\n`]),
    textReply: (t: string) => sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] }, finishReason: "STOP" }] })}\n\n`]),
  },
} as const;

function stubFetch(handler: (body: Record<string, unknown>, n: number) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return handler(body, bodies.length);
    })
  );
  return bodies;
}

function turn(providerId: string, extra: Partial<Parameters<typeof runCopilotTurn>[0]> = {}) {
  const c = conn(providerId);
  const env = createToolEnv(dataset(), privacy);
  const text: string[] = [];
  const steps: CopilotStep[] = [];
  const promise = runCopilotTurn({
    client: createChatClient(c),
    messages: [
      { role: "system", content: "ctx" },
      { role: "user", content: "Average rating by category?" },
    ],
    tools: copilotTools(privacy),
    runTool: (name, args) => runCopilotTool(env, name, args),
    options: requestOptions("chat", "m-1", c.provider.apiStyle),
    onText: (d) => text.push(d),
    onStep: (s) => steps.push(s),
    ...extra,
  });
  return { promise, text, steps };
}

describe("tool-call round trip per API style", () => {
  it("openai-compatible: tool_calls -> role tool with tool_call_id -> streamed answer", async () => {
    const bodies = stubFetch((_b, n) => (n === 1 ? STYLE.openai.toolReply() : STYLE.openai.textReply("Average: GAME 4, FAMILY 3, TOOLS 5.")));
    const { promise, text, steps } = turn("openai");
    const res = await promise;
    expect(steps).toHaveLength(1);
    expect(steps[0].summary).toBe("average Rating by Category · 3 rows");
    expect(steps[0].result).toMatchObject({ rows: [{ Category: "TOOLS", avg_Rating: 5 }, { Category: "GAME", avg_Rating: 4 }, { Category: "FAMILY", avg_Rating: 3 }] });
    expect(res.text).toBe("Average: GAME 4, FAMILY 3, TOOLS 5.");
    expect(text.join("")).toBe(res.text);
    expect(text.length).toBeGreaterThan(1); // streamed in pieces
    const msgs = bodies[1].messages as Record<string, unknown>[];
    expect(msgs[2]).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "call_a", type: "function", function: { name: "aggregate", arguments: JSON.stringify(ARGS) } }] });
    expect(msgs[3]).toMatchObject({ role: "tool", tool_call_id: "call_a" });
    expect(JSON.parse(String(msgs[3].content)).rows[0]).toEqual({ Category: "TOOLS", avg_Rating: 5 });
    expect(bodies.every((b) => b.stream === true && Array.isArray(b.tools))).toBe(true);
  });

  it("anthropic: tool_use block -> user tool_result -> streamed answer", async () => {
    const bodies = stubFetch((_b, n) => (n === 1 ? STYLE.anthropic.toolReply() : STYLE.anthropic.textReply("TOOLS leads with 5.")));
    const { promise, steps } = turn("anthropic");
    const res = await promise;
    expect(res.text).toBe("TOOLS leads with 5.");
    expect(steps).toHaveLength(1);
    const msgs = bodies[1].messages as { role: string; content: unknown }[];
    expect(msgs[1]).toEqual({ role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "aggregate", input: ARGS }] });
    const results = msgs[2].content as { type: string; tool_use_id: string; content: string }[];
    expect(msgs[2].role).toBe("user");
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(JSON.parse(results[0].content).groups).toBe(3);
  });

  it("gemini: functionCall (thoughtSignature echoed) -> functionResponse object -> streamed answer", async () => {
    const bodies = stubFetch((_b, n) => (n === 1 ? STYLE.gemini.toolReply() : STYLE.gemini.textReply("TOOLS: 5")));
    const { promise, steps } = turn("gemini");
    const res = await promise;
    expect(res.text).toBe("TOOLS: 5");
    expect(steps).toHaveLength(1);
    const contents = bodies[1].contents as { role: string; parts: Record<string, unknown>[] }[];
    expect(contents[1]).toEqual({ role: "model", parts: [{ functionCall: { name: "aggregate", args: ARGS }, thoughtSignature: "SIG-1" }] });
    expect(contents[2].role).toBe("user");
    const fr = contents[2].parts[0].functionResponse as { name: string; response: { groups: number } };
    expect(fr.name).toBe("aggregate");
    expect(fr.response.groups).toBe(3);
  });
});

describe("step cap and fallback", () => {
  it(`stops after ${MAX_TOOL_STEPS} tool steps and asks for an answer with tool_choice none`, async () => {
    const bodies = stubFetch((b) => (b.tool_choice === "none" ? STYLE.openai.textReply("Here is what I found.") : STYLE.openai.toolReply()));
    const { promise, steps } = turn("openai");
    const res = await promise;
    expect(steps).toHaveLength(MAX_TOOL_STEPS);
    expect(res.capped).toBe(true);
    expect(res.text).toBe("Here is what I found.");
    expect(bodies).toHaveLength(MAX_TOOL_STEPS + 1);
    expect(bodies[MAX_TOOL_STEPS].tool_choice).toBe("none");
    expect(Array.isArray(bodies[MAX_TOOL_STEPS].tools)).toBe(true);
  });

  it("anthropic and gemini step cap use their own 'no tools' switch", async () => {
    const a = stubFetch((b) => ((b.tool_choice as { type?: string })?.type === "none" ? STYLE.anthropic.textReply("done") : STYLE.anthropic.toolReply()));
    expect((await turn("anthropic").promise).capped).toBe(true);
    expect(a[a.length - 1].tool_choice).toEqual({ type: "none" });
    const g = stubFetch((b) => (b.toolConfig ? STYLE.gemini.textReply("done") : STYLE.gemini.toolReply()));
    expect((await turn("gemini").promise).text).toBe("done");
    expect(g[g.length - 1].toolConfig).toEqual({ functionCallingConfig: { mode: "NONE" } });
  });

  it("a model that rejects tools: answered again without tools, flagged", async () => {
    const bodies = stubFetch((b) =>
      b.tools ? new Response(JSON.stringify({ error: { message: "registry.ollama.ai/library/gemma does not support tools" } }), { status: 400 }) : STYLE.openai.textReply("From the summary: ...")
    );
    const { promise, steps } = turn("ollama");
    const res = await promise;
    expect(res.toolsUnsupported).toBe(true);
    expect(res.text).toBe("From the summary: ...");
    expect(steps).toEqual([]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].tools).toBeUndefined();
  });

  it("OpenRouter's 'No endpoints found that support tool use' (404) also falls back", async () => {
    stubFetch((b) => (b.tools ? new Response(JSON.stringify({ error: { message: "No endpoints found that support tool use." } }), { status: 404 }) : STYLE.openai.textReply("ok")));
    expect((await turn("openrouter").promise).toolsUnsupported).toBe(true);
  });

  it("a 400 that only mentions tools (a schema error) is shown, not turned into the fallback", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { message: "Invalid schema for function 'aggregate': tools[1].parameters is invalid." } }), { status: 400 }));
    await expect(turn("openai").promise).rejects.toMatchObject({ kind: "other" });
  });

  it("other errors are not swallowed", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 }));
    await expect(turn("openai").promise).rejects.toMatchObject({ kind: "bad-key" });
  });
});

describe("retry on 503 / 429", () => {
  it("retryDelayMs: 1 s then 2 s; Retry-After seconds or date; too long -> no retry", () => {
    expect(retryDelayMs(null, 0)).toBe(1000);
    expect(retryDelayMs(null, 1)).toBe(2000);
    expect(retryDelayMs("3", 0)).toBe(3000);
    expect(retryDelayMs(new Date(10_000).toUTCString(), 0, 5_000)).toBe(5000);
    expect(retryDelayMs(String(MAX_RETRY_WAIT_MS / 1000 + 1), 0)).toBeNull();
  });

  it("503 then 200: retried after the backoff, onRetry called, answer arrives", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++n === 1 ? new Response("overloaded", { status: 503 }) : STYLE.openai.textReply("fine now")))
    );
    const retries: unknown[] = [];
    const p = createChatClient(conn("openai")).chat([{ role: "user", content: "hi" }], { model: "m", stream: true, onRetry: (i) => retries.push(i) });
    await vi.advanceTimersByTimeAsync(999);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const res = await p;
    expect(res.text).toBe("fine now");
    expect(retries).toEqual([{ attempt: 1, delayMs: 1000, status: 503 }]);
  });

  it("429 with Retry-After: waits that long; after 2 retries the typed error", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        return new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429, headers: { "retry-after": "4" } });
      })
    );
    const retries: { delayMs: number }[] = [];
    const p = createChatClient(conn("openai")).chat([{ role: "user", content: "hi" }], { model: "m", onRetry: (i) => retries.push(i) });
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(8000);
    const err = await caught;
    expect(n).toBe(3);
    expect(retries.map((r) => r.delayMs)).toEqual([4000, 4000]);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("rate-limited");
  });

  it("a Retry-After beyond the cap is not waited for; other statuses are not retried", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++, new Response("{}", { status: 429, headers: { "retry-after": "600" } }))));
    await expect(createChatClient(conn("openai")).chat([{ role: "user", content: "hi" }], { model: "m" })).rejects.toMatchObject({ kind: "rate-limited" });
    expect(n).toBe(1);
    n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++, new Response("{}", { status: 500 }))));
    await expect(createChatClient(conn("openai")).chat([{ role: "user", content: "hi" }], { model: "m" })).rejects.toMatchObject({ kind: "other" });
    expect(n).toBe(1);
  });

  it("stop during the wait cancels", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    const ctrl = new AbortController();
    const p = createChatClient(conn("openai")).chat([{ role: "user", content: "hi" }], { model: "m", signal: ctrl.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10);
    ctrl.abort();
    const err = await p;
    expect(err.message).toMatch(/cancelled/);
  });
});
