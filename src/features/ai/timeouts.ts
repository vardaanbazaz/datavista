/**
 * Test hook for the AI waits (first response 90 s, stream idle 30 s, "Still waiting" 15 s,
 * retry backoff 1 s). End-to-end tests set `window.__DATAVISTA_AI_TIMEOUTS__` with an init
 * script so a mocked slow provider takes seconds, not minutes; the assertions stay the same
 * (the note shows only after the wait, the retry happens, the timeout error appears).
 * Read only in development builds (`import.meta.env.DEV`, the e2e dev server): a production
 * page always uses the real values.
 */
export interface AiTimeoutOverrides {
  firstResponseMs?: number;
  streamIdleMs?: number;
  stillWaitingMs?: number;
  retryBaseMs?: number;
}

declare global {
  interface Window {
    __DATAVISTA_AI_TIMEOUTS__?: AiTimeoutOverrides;
  }
}

/** The override for `key` in a development build, else `fallback`. */
export function aiTimeout(key: keyof AiTimeoutOverrides, fallback: number): number {
  if (!import.meta.env.DEV || typeof window === "undefined") return fallback;
  const v = window.__DATAVISTA_AI_TIMEOUTS__?.[key];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}
