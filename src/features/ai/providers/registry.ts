/**
 * The AI provider registry. The data lives in registry.json so that
 * scripts/ai/check-browser-access.mjs can write browser-access results back into it;
 * this file only types and reads it.
 */
import registryData from "./registry.json";

export type ApiStyle = "openai-compatible" | "anthropic" | "gemini";

/**
 * Whether a page on the deployed site can call the provider directly (CORS).
 * - ok: checked, a browser can call it with a key.
 * - needs-proxy: checked, the browser blocks it; it stays selectable with a warning.
 * - local: runs on the user's machine; they must allow the site's origin themselves.
 * - unchecked: not checked (custom base URLs, or the check could not reach it).
 */
export type BrowserAccessStatus = "ok" | "needs-proxy" | "local" | "unchecked";

export interface BrowserAccess {
  status: BrowserAccessStatus;
  /** YYYY-MM-DD of the check, null when never checked. */
  checkedAt: string | null;
  detail?: string;
}

export interface ProviderEntry {
  id: string;
  label: string;
  /** Empty for Custom: the user supplies it. */
  baseUrl: string;
  apiStyle: ApiStyle;
  keyRequired: boolean;
  suggestedModels: string[];
  /** Path under baseUrl that lists models, or null when the provider has none. */
  modelsEndpoint: string | null;
  browserAccess: BrowserAccess;
  setupNote: string;
  /**
   * openai-compatible only: the provider accepts `response_format: {type: "json_object"}`.
   * Local and custom servers vary, so they get JSON instructions in the prompt only.
   */
  jsonMode?: boolean;
}

interface RegistryFile {
  checkedOrigin: string;
  providers: ProviderEntry[];
}

const JSON_MODE_PROVIDERS = new Set(["openai", "groq", "mistral", "deepseek", "together", "openrouter"]);

const data = registryData as RegistryFile;

export const PROVIDERS: readonly ProviderEntry[] = data.providers.map((p) => ({
  ...p,
  jsonMode: p.apiStyle === "openai-compatible" && JSON_MODE_PROVIDERS.has(p.id),
}));

/** The site origin the browser-access check used. */
export const CHECKED_ORIGIN = data.checkedOrigin;

export const DEFAULT_PROVIDER_ID = "gemini";

export function getProvider(id: string): ProviderEntry {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID)!;
}

export function isProviderId(id: unknown): id is string {
  return typeof id === "string" && PROVIDERS.some((p) => p.id === id);
}

export function defaultModel(provider: ProviderEntry): string {
  return provider.suggestedModels[0] ?? "";
}

/** One line for the settings: whether a browser can call this provider. */
export function browserAccessText(provider: ProviderEntry): string {
  const { status, checkedAt } = provider.browserAccess;
  switch (status) {
    case "ok":
      return `Works from the browser (checked ${checkedAt}).`;
    case "needs-proxy":
      return `Browsers are blocked from calling this provider directly (checked ${checkedAt}); it needs a proxy.`;
    case "local":
      return "Runs on your computer. Allow this site's origin first (see the note).";
    default:
      return "Browser access not checked. The server must allow this site's origin (CORS).";
  }
}
