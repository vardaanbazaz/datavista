import { describe, it, expect, afterEach, vi } from "vitest";
import { createChatClient, AiError, FIRST_RESPONSE_TIMEOUT_MS, STREAM_IDLE_TIMEOUT_MS, MAX_TIMEOUT_RETRIES } from "../client";
import { getProvider } from "../providers/registry";
import type { ProviderConnection } from "../client/types";

/**
 * The timeout split (client/index.ts): 90 s for the first response (whole reply, or the first
 * stream chunk; headers alone don't count), then 30 s between chunks, and one retry of a
 * timeout before any output on the 503/429 backoff path.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const enc = new TextEncoder();
const conn = (): ProviderConnection => {
  const provider = getProvider("openai");
  return { provider, baseUrl: provider.baseUrl, apiKey: "sk-test-123456" };
};
const chunk = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

/** A 200 stream whose chunks arrive at the given times (ms after the response), then [DONE]. */
function timedStream(parts: { at: number; text: string }[], signal?: AbortSignal | null): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      signal?.addEventListener("abort", () => {
        timers.forEach(clearTimeout);
        controller.error(new DOMException("aborted", "AbortError"));
      });
      for (const p of parts) timers.push(setTimeout(() => controller.enqueue(enc.encode(chunk(p.text))), p.at));
      const end = Math.max(0, ...parts.map((p) => p.at)) + 1;
      timers.push(
        setTimeout(() => {
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        }, end)
      );
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A fetch that never answers until aborted. */
const hang = (_u: string, init: RequestInit) =>
  new Promise<Response>((_r, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

describe("timeout split: first response, then idle between chunks", () => {
  it("defaults: 90 s for the first response, 30 s idle, one retry", () => {
    expect(FIRST_RESPONSE_TIMEOUT_MS).toBe(90_000);
    expect(STREAM_IDLE_TIMEOUT_MS).toBe(30_000);
    expect(MAX_TIMEOUT_RETRIES).toBe(1);
  });

  it("a slow first chunk (45 s) is waited for although it is past the 30 s idle limit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => timedStream([{ at: 45_000, text: "slow " }, { at: 60_000, text: "but fine" }], init.signal));
    vi.stubGlobal("fetch", fetchMock);
    const p = createChatClient(conn()).chat([{ role: "user", content: "hi" }], { model: "m", stream: true });
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(p).resolves.toMatchObject({ text: "slow but fine" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("headers without a body chunk don't stop the 90 s clock: no chunk by 90 s is a first-response timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => timedStream([{ at: 500_000, text: "never" }], init.signal));
    vi.stubGlobal("fetch", fetchMock);
    const retries: unknown[] = [];
    const caught = createChatClient(conn())
      .chat([{ role: "user", content: "hi" }], { model: "m", stream: true, onRetry: (i) => retries.push(i) })
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(89_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 90 s: timed out, retried once after the 1 s backoff, then 90 s again.
    await vi.advanceTimersByTimeAsync(1 + 1_000 + 90_000);
    const err = await caught;
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toBe("The provider did not answer within 90 s. It may be slow or unreachable; try again.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retries).toEqual([{ attempt: 1, delayMs: 1000, status: 0 }]);
  });

  it("after the first chunk, a 30 s gap is an idle timeout and is not retried (text was shown)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => timedStream([{ at: 10, text: "partial" }, { at: 40_000, text: " late" }], init.signal));
    vi.stubGlobal("fetch", fetchMock);
    const shown: string[] = [];
    const caught = createChatClient(conn())
      .chat([{ role: "user", content: "hi" }], { model: "m", stream: true, onText: (d) => shown.push(d) })
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(10 + 30_000);
    const err = await caught;
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toBe("The provider stopped sending the answer for 30 s. Try again.");
    expect(shown).toEqual(["partial"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("retry on an early timeout", () => {
  it("no answer within the first-response timeout: retried once on the backoff path, then answered", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchMock = vi.fn((u: string, init: RequestInit) => (++n === 1 ? hang(u, init) : Promise.resolve(timedStream([{ at: 5, text: "here now" }], init.signal))));
    vi.stubGlobal("fetch", fetchMock);
    const retries: unknown[] = [];
    const p = createChatClient(conn()).chat([{ role: "user", content: "hi" }], { model: "m", stream: true, onRetry: (i) => retries.push(i) });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(retries).toEqual([{ attempt: 1, delayMs: 1000, status: 0 }]);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000 + 10);
    await expect(p).resolves.toMatchObject({ text: "here now" });
    expect(n).toBe(2);
  });

  it("not streaming: the whole reply gets 90 s, and an early timeout is retried once too", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((u: string, init: RequestInit) => (++n === 1 ? hang(u, init) : Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }))))
    );
    const p = createChatClient(conn()).chat([{ role: "user", content: "hi" }], { model: "m" });
    await vi.advanceTimersByTimeAsync(89_999);
    expect(n).toBe(1);
    await vi.advanceTimersByTimeAsync(1 + 1_000);
    await expect(p).resolves.toMatchObject({ text: "{}" });
    expect(n).toBe(2);
  });

  it("a 503 and an early timeout share the backoff (1 s, then 2 s)", async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((u: string, init: RequestInit) => {
        n++;
        if (n === 1) return Promise.resolve(new Response("overloaded", { status: 503 }));
        if (n === 2) return hang(u, init);
        return Promise.resolve(timedStream([{ at: 1, text: "ok" }], init.signal));
      })
    );
    const retries: unknown[] = [];
    const p = createChatClient(conn()).chat([{ role: "user", content: "hi" }], { model: "m", stream: true, onRetry: (i) => retries.push(i) });
    await vi.advanceTimersByTimeAsync(1_000 + 90_000 + 2_000 + 5);
    await expect(p).resolves.toMatchObject({ text: "ok" });
    expect(retries).toEqual([
      { attempt: 1, delayMs: 1000, status: 503 },
      { attempt: 2, delayMs: 2000, status: 0 },
    ]);
  });

  it("Stop during the wait is not retried", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(hang);
    vi.stubGlobal("fetch", fetchMock);
    const c = new AbortController();
    const caught = createChatClient(conn()).chat([{ role: "user", content: "hi" }], { model: "m", stream: true, signal: c.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    c.abort();
    const err = await caught;
    expect(err.message).toBe("The request was cancelled.");
    await vi.advanceTimersByTimeAsync(100_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
