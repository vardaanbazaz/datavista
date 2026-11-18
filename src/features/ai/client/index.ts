/**
 * One client for the three API styles (openai-compatible, anthropic, gemini). Plain fetch,
 * no vendor SDKs. Loaded with `await import()` by the AI features so none of it is in the
 * startup bundle.
 */
import { AiError, blockedError, errorFromResponse, idleTimeoutError, isEarlyTimeout, timeoutError } from "./errors";
import { parseSse } from "./sse";
import { applyStreamEvent, buildModelsRequest, buildRequest, parseModels, parseResponse } from "./styles";
import type { BuiltRequest, ChatMessage, ChatOptions, ChatResult, ProviderConnection, StreamAccumulator } from "./types";

export * from "./types";
export { AiError, describeAiError, isEarlyTimeout, isToolsUnsupported, redactSecret } from "./errors";
export type { AiErrorKind } from "./errors";
export { buildRequest } from "./styles";

/**
 * Wait for the provider's first answer: the whole reply (not streaming), or the first stream
 * chunk. Slow models with tools (Gemini Flash) can take well over 30 s to start.
 */
export const FIRST_RESPONSE_TIMEOUT_MS = 90_000;
/** Streaming, after the first chunk: the longest gap allowed between chunks. */
export const STREAM_IDLE_TIMEOUT_MS = 30_000;
/** A timeout before any output is retried this many times (on top of the 503/429 retries). */
export const MAX_TIMEOUT_RETRIES = 1;
const LIST_MODELS_TIMEOUT_MS = 60_000;

/** 503 (overloaded) and 429 (rate limit) are retried this many times before the typed error. */
export const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1_000;
/** A Retry-After longer than this is not waited for: the typed error says when to try again. */
export const MAX_RETRY_WAIT_MS = 20_000;
const RETRY_STATUSES = new Set([429, 503]);

/**
 * How long to wait before retry number `attempt` (0-based): the provider's Retry-After
 * (seconds or an HTTP date) when it sends one, otherwise 1 s, then 2 s. Null when the wait
 * would exceed MAX_RETRY_WAIT_MS.
 */
export function retryDelayMs(retryAfter: string | null | undefined, attempt: number, now = Date.now()): number | null {
  let ms = RETRY_BASE_MS * 2 ** attempt;
  const v = retryAfter?.trim();
  if (v) {
    if (/^\d+(\.\d+)?$/.test(v)) ms = Math.ceil(Number(v) * 1000);
    else {
      const at = Date.parse(v);
      if (Number.isFinite(at)) ms = Math.max(0, at - now);
    }
  }
  return ms > MAX_RETRY_WAIT_MS ? null : ms;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiError("other", "The request was cancelled."));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AiError("other", "The request was cancelled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * fetch with two timeouts: `firstMs` until the first stream chunk (or, not streaming, the
 * whole reply), then `idleMs` between chunks (`touch`, called per chunk), so a long answer
 * that keeps streaming is never cut off but a stalled one is. `timedOut()` says which phase
 * ran out: "first" (no output yet) or "idle".
 */
function timedFetch(url: string, init: RequestInit, firstMs: number, idleMs: number, outer?: AbortSignal) {
  const controller = new AbortController();
  let phase: "first" | "idle" = "first";
  let timedOut: "first" | "idle" | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = phase;
      controller.abort();
    }, ms);
  };
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener("abort", onOuterAbort);
  arm(firstMs);
  const touch = () => {
    phase = "idle";
    arm(idleMs);
  };
  const done = () => {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  };
  const promise = fetch(url, { ...init, signal: controller.signal });
  return { promise, touch, done, timedOut: () => timedOut };
}

type Timeouts = { firstMs: number; idleMs: number };

const timeoutFor = (phase: "first" | "idle", t: Timeouts) => (phase === "first" ? timeoutError(Math.round(t.firstMs / 1000)) : idleTimeoutError(Math.round(t.idleMs / 1000)));

async function send(conn: ProviderConnection, req: { url: string; init: RequestInit }, timeouts: Timeouts, signal?: AbortSignal) {
  const t = timedFetch(req.url, req.init, timeouts.firstMs, timeouts.idleMs, signal);
  let response: Response;
  try {
    response = await t.promise;
  } catch (e) {
    t.done();
    const phase = t.timedOut();
    if (phase) throw timeoutFor(phase, timeouts);
    if (signal?.aborted) throw new AiError("other", "The request was cancelled.");
    // fetch() rejects with a TypeError for CORS refusals and network failures alike.
    void e;
    throw blockedError(conn.baseUrl);
  }
  return { response, t };
}

export function createChatClient(conn: ProviderConnection) {
  const secret = conn.apiKey;
  const style = conn.provider.apiStyle;

  async function failFrom(response: Response, model?: string): Promise<never> {
    const body = await response.text().catch(() => "");
    throw errorFromResponse(response.status, body, secret, model, response.headers.get("retry-after"));
  }

  return {
    /** The exact request chat() would send (for "Preview what will be sent"). */
    buildRequest(messages: ChatMessage[], opts: ChatOptions): BuiltRequest {
      return buildRequest(conn, messages, opts);
    },

    async chat(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
      if (!conn.baseUrl.trim()) throw new AiError("other", "No base URL is set for this provider.");
      if (conn.provider.keyRequired && !conn.apiKey.trim()) throw new AiError("bad-key", "No API key is set for this provider.");
      const built = buildRequest(conn, messages, opts);
      const init: RequestInit = { method: "POST", headers: built.headers, body: JSON.stringify(built.body) };
      const timeouts: Timeouts = opts.stream
        ? { firstMs: opts.firstResponseTimeoutMs ?? FIRST_RESPONSE_TIMEOUT_MS, idleMs: opts.timeoutMs ?? STREAM_IDLE_TIMEOUT_MS }
        : { firstMs: opts.timeoutMs ?? FIRST_RESPONSE_TIMEOUT_MS, idleMs: opts.timeoutMs ?? FIRST_RESPONSE_TIMEOUT_MS };

      // Retries share one backoff (retryDelayMs: 1 s, then 2 s, or Retry-After): up to
      // MAX_RETRIES for 503/429 before any of the answer is read, and MAX_TIMEOUT_RETRIES
      // for a timeout before any output (nothing was shown, so nothing is duplicated).
      let retries = 0;
      let timeoutRetries = 0;
      const backoff = async (status: number, retryAfter: string | null): Promise<boolean> => {
        const delayMs = retryDelayMs(retryAfter, retries);
        if (delayMs === null) return false;
        retries++;
        opts.onRetry?.({ attempt: retries, delayMs, status });
        await sleep(delayMs, opts.signal);
        return true;
      };

      for (;;) {
        let sent: Awaited<ReturnType<typeof send>>;
        try {
          sent = await send(conn, { url: built.url, init }, timeouts, opts.signal);
        } catch (e) {
          if (isEarlyTimeout(e) && timeoutRetries < MAX_TIMEOUT_RETRIES && !opts.signal?.aborted) {
            timeoutRetries++;
            if (await backoff(0, null)) continue;
          }
          throw e;
        }
        const { response, t } = sent;

        // Busy or rate-limited: retry before any of the answer has been read.
        if (RETRY_STATUSES.has(response.status) && retries - timeoutRetries < MAX_RETRIES) {
          const retryAfter = response.headers.get("retry-after");
          if (retryDelayMs(retryAfter, retries) !== null) {
            t.done();
            await response.body?.cancel().catch(() => undefined);
            await backoff(response.status, retryAfter);
            continue;
          }
        }

        try {
          if (!response.ok) await failFrom(response, opts.model);

          if (!opts.stream) {
            const json = await response.json().catch(() => {
              throw new AiError("other", "The provider's answer was not valid JSON.");
            });
            return parseResponse(style, json);
          }

          if (!response.body) throw new AiError("other", "The provider sent no stream.");
          const acc: StreamAccumulator = { text: "", toolCalls: new Map(), done: false };
          // The first-response timer keeps running until the first body chunk (not the headers).
          for await (const ev of parseSse(response.body, t.touch)) {
            const delta = applyStreamEvent(style, ev, acc, secret);
            if (delta) opts.onText?.(delta);
            if (acc.done && style === "openai-compatible") break;
          }
          return { text: acc.text, toolCalls: [...acc.toolCalls.values()] };
        } catch (e) {
          const phase = t.timedOut();
          if (phase) {
            await response.body?.cancel().catch(() => undefined);
            if (phase === "first" && timeoutRetries < MAX_TIMEOUT_RETRIES && !opts.signal?.aborted) {
              timeoutRetries++;
              t.done();
              if (await backoff(0, null)) continue;
            }
            throw timeoutFor(phase, timeouts);
          }
          if (e instanceof AiError) throw e;
          if (opts.signal?.aborted) throw new AiError("other", "The request was cancelled.");
          throw new AiError("other", "The connection dropped while the answer was arriving.");
        } finally {
          t.done();
        }
      }
    },

    /** Model ids from the provider's list endpoint; [] when it has none. */
    async listModels(signal?: AbortSignal): Promise<string[]> {
      const req = buildModelsRequest(conn);
      if (!req) return [];
      const { response, t } = await send(conn, { url: req.url, init: { method: "GET", headers: req.headers } }, { firstMs: LIST_MODELS_TIMEOUT_MS, idleMs: LIST_MODELS_TIMEOUT_MS }, signal);
      try {
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          // A 404 here is the list endpoint missing, not a model.
          if (response.status === 404) throw new AiError("other", "This provider has no model list at that address.", 404);
          throw errorFromResponse(response.status, body, secret);
        }
        const json = await response.json().catch(() => ({}));
        return [...new Set(parseModels(style, json))].sort((a, b) => a.localeCompare(b));
      } finally {
        t.done();
      }
    },

    /**
     * One tiny request to check the key, model and browser access. Pass the options the
     * features use (aiRequests.ts:requestOptions) so a pass means they will work too.
     */
    async testConnection(options: ChatOptions): Promise<void> {
      await this.chat([{ role: "user", content: 'Reply with the JSON object {"ok": true}.' }], { ...options, stream: false, timeoutMs: 30_000 });
    },
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;
