/**
 * Typed AI errors. Every message is plain words for the settings and toasts, and never
 * contains the API key (redactSecret runs on anything taken from a provider response).
 */
export type AiErrorKind = "blocked" | "bad-key" | "model-not-found" | "rate-limited" | "other";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = status;
  }
}

/** Replaces every occurrence of the secret (and a Bearer header carrying it) with "•••". */
export function redactSecret(text: string, secret: string | undefined): string {
  let out = text;
  const s = secret?.trim();
  if (s && s.length >= 4) out = out.split(s).join("•••");
  // Belt and braces: providers sometimes echo a partial key ("sk-abc...xyz") or a header.
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1•••");
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{2})[A-Za-z0-9*_.-]{6,}/g, "$1•••");
  out = out.replace(/\bAIza[0-9A-Za-z_-]{10,}/g, "AIza•••");
  return out;
}

/** The provider's own error message from a JSON (or text) body, redacted and shortened. */
export function providerMessage(body: string, secret: string | undefined): string {
  let msg = body;
  try {
    const parsed = JSON.parse(body);
    const err = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    msg =
      (typeof err === "string" ? err : err?.message) ??
      (typeof parsed?.message === "string" ? parsed.message : undefined) ??
      (typeof parsed?.detail === "string" ? parsed.detail : body);
  } catch {
    /* plain text body */
  }
  msg = redactSecret(String(msg).replace(/\s+/g, " ").trim(), secret);
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

const MODEL_MISSING = /model[^.]*?(not[ _]found|does not exist|not exist|is not (?:found|supported|available)|unknown|invalid|no such|not available)|(unknown|invalid|unsupported) model|model_not_found|no endpoints found/i;
const KEY_INVALID = /API_KEY_INVALID|API key not valid|invalid[ _-]?api[ _-]?key|incorrect api key|invalid x-api-key|authentication/i;

/** Maps an HTTP error response to a typed error. `forModel` names the model for "not found". */
export function errorFromResponse(status: number, body: string, secret: string | undefined, model?: string, retryAfter?: string | null): AiError {
  const detail = providerMessage(body, secret);
  const suffix = detail ? ` Provider said: "${detail}"` : "";
  if (status === 401 || status === 403 || (status === 400 && KEY_INVALID.test(body))) {
    return new AiError("bad-key", `The provider rejected the API key (${status}). Check that it is copied in full and belongs to this provider.${suffix}`, status);
  }
  if (status === 404 || ((status === 400 || status === 422) && MODEL_MISSING.test(body))) {
    const name = model ? `"${model}"` : "This model";
    return new AiError("model-not-found", `${name} was not found at this provider. Pick another model or press Load models.${suffix}`, status);
  }
  if (status === 429) {
    const wait = retryAfter && /^\d+$/.test(retryAfter) ? ` Try again in ${retryAfter} s.` : " Wait a moment and try again.";
    return new AiError("rate-limited", `Too many requests, or the account is out of quota (429).${wait}${suffix}`, status);
  }
  return new AiError("other", `The provider returned an error (${status}).${suffix}`, status);
}

/** fetch() itself threw: the browser blocked it (CORS), or the network/server is unreachable. */
export function blockedError(baseUrl: string): AiError {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
  return new AiError(
    "blocked",
    local
      ? "Could not reach the local server. Check that it is running and that it allows this site's origin (see the provider note)."
      : "The browser could not reach the provider. You may be offline, or the provider blocks requests from web pages (CORS) and needs a proxy."
  );
}

export function timeoutError(seconds: number): AiError {
  return new AiError("other", `The provider did not answer within ${seconds} s. It may be slow or unreachable; try again.`);
}

/** Plain words for any error from an AI call, safe to show (never includes the key). */
export function describeAiError(e: unknown, secret?: string): string {
  if (e instanceof AiError) return redactSecret(e.message, secret);
  if (e instanceof Error) return redactSecret(e.message, secret);
  return "Something went wrong with the AI request.";
}
