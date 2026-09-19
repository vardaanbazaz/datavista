import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchWithTimeout, callLLM } from "../llmService";
import { AIPromptContext } from "../types";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mock fetch that hangs forever unless the request's AbortSignal fires. */
function fetchThatHangsUntilAborted(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
      // otherwise: never resolves, simulating a stalled network request
    })) as typeof fetch;
}

describe("llmService fetchWithTimeout", () => {
  it("aborts a hung request and throws a clear timeout error, not a raw AbortError", async () => {
    vi.stubGlobal("fetch", fetchThatHangsUntilAborted());

    await expect(fetchWithTimeout("https://example.com/api", {}, 20)).rejects.toThrow(/timed out/i);
  });

  it("actually cancels the underlying request (signal fires) rather than just failing UI-side", async () => {
    let sawAbort = false;
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          sawAbort = true;
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      })) as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchWithTimeout("https://example.com/api", {}, 20)).rejects.toThrow();
    expect(sawAbort).toBe(true);
  });

  it("resolves normally and does not mistake a real network error for a timeout", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", (() => Promise.reject(networkError)) as typeof fetch);

    await expect(fetchWithTimeout("https://example.com/api", {}, 5000)).rejects.toBe(networkError);
  });

  it("returns the response when the request completes before the timeout", async () => {
    const fakeResponse = new Response("ok", { status: 200 });
    vi.stubGlobal("fetch", (() => Promise.resolve(fakeResponse)) as typeof fetch);

    const result = await fetchWithTimeout("https://example.com/api", {}, 5000);
    expect(result).toBe(fakeResponse);
  });
});

// Regression test for: the Gemini API key was sent as a ?key= URL query param, which is
// more likely to leak into provider access logs, browser history, or a TLS-inspecting
// proxy log than a header. Google's own API reference documents x-goog-api-key as the
// supported header-based alternative, matching the OpenAI path's existing use of an
// Authorization header instead of a URL-embedded key.
describe("llmService callLLM - Gemini auth", () => {
  const context: AIPromptContext = {
    prompt: "test prompt",
    columns: [],
  };

  it("sends the API key via the x-goog-api-key header, not the URL", async () => {
    const fakeResponse = new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
      { status: 200 }
    );
    let capturedUrl: string | undefined;
    let capturedHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      "fetch",
      ((url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = init?.headers;
        return Promise.resolve(fakeResponse);
      }) as typeof fetch
    );

    await callLLM("super-secret-key", "gemini", context);

    expect(capturedUrl).not.toContain("super-secret-key");
    expect(capturedUrl).not.toContain("key=");
    expect((capturedHeaders as Record<string, string>)["x-goog-api-key"]).toBe("super-secret-key");
  });
});
