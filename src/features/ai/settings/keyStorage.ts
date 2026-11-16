/**
 * API keys live only here: sessionStorage by default (gone when the tab closes), or
 * localStorage when the user opts into "Remember on this device". Never IndexedDB, never
 * the zustand-persisted settings, never exports. One key per provider id.
 */
export const KEYS_STORAGE_KEY = "datavista-ai-keys";
/** Set when an old-style key was moved to "remembered"; the app says so once, then removes it. */
export const MIGRATION_NOTICE_KEY = "datavista-ai-key-migrated";
const LEGACY_UI_STORAGE_KEY = "datavista-ui-storage";
const SETTINGS_STORAGE_KEY = "datavista-ai-settings";

type KeyMap = Record<string, string>;

function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readMap(storage: Storage | null): KeyMap {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(KEYS_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: KeyMap = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string" && v.trim()) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function writeMap(storage: Storage | null, map: KeyMap): void {
  if (!storage) return;
  try {
    if (Object.keys(map).length === 0) storage.removeItem(KEYS_STORAGE_KEY);
    else storage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked: the key stays in memory for this page */
  }
}

export interface StoredKeys {
  keys: KeyMap;
  /** Provider ids whose key is remembered on this device (localStorage). */
  remembered: Record<string, boolean>;
}

export function loadKeys(): StoredKeys {
  const remembered = readMap(safeStorage("local"));
  const session = readMap(safeStorage("session"));
  const keys: KeyMap = { ...remembered, ...session };
  return { keys, remembered: Object.fromEntries(Object.keys(remembered).filter((id) => !(id in session)).map((id) => [id, true])) };
}

export function saveKey(providerId: string, key: string, remember: boolean): void {
  const local = safeStorage("local");
  const session = safeStorage("session");
  const localMap = readMap(local);
  const sessionMap = readMap(session);
  delete localMap[providerId];
  delete sessionMap[providerId];
  const trimmed = key.trim();
  if (trimmed) (remember ? localMap : sessionMap)[providerId] = trimmed;
  writeMap(local, localMap);
  writeMap(session, sessionMap);
}

export function forgetKey(providerId: string): void {
  saveKey(providerId, "", false);
}

/**
 * Moves a key saved by older versions (localStorage `datavista-ui-storage`.state.llmApiKey,
 * which also held the provider) to "remembered", the same device-wide storage it had, and
 * flags a one-time notice. Idempotent; safe to call from several places at startup.
 */
export function migrateLegacyKey(): void {
  const local = safeStorage("local");
  if (!local) return;
  let raw: { state?: Record<string, unknown>; version?: number } | null = null;
  try {
    raw = JSON.parse(local.getItem(LEGACY_UI_STORAGE_KEY) ?? "null");
  } catch {
    return;
  }
  const state = raw?.state;
  if (!state || !("llmApiKey" in state || "llmProvider" in state)) return;

  const key = typeof state.llmApiKey === "string" ? state.llmApiKey.trim() : "";
  const providerId = state.llmProvider === "openai" ? "openai" : "gemini";
  if (key) {
    const map = readMap(local);
    if (!map[providerId]) {
      map[providerId] = key;
      writeMap(local, map);
    }
    try {
      local.setItem(MIGRATION_NOTICE_KEY, providerId);
      // Keep the provider the user had chosen, unless new settings already exist.
      if (!local.getItem(SETTINGS_STORAGE_KEY)) {
        local.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ state: { providerId }, version: 1 }));
      }
    } catch {
      /* ignore */
    }
  }
  delete state.llmApiKey;
  delete state.llmProvider;
  try {
    local.setItem(LEGACY_UI_STORAGE_KEY, JSON.stringify(raw));
  } catch {
    /* ignore */
  }
}

/** Removes every key from both storages (Clear all local data). */
export function forgetAllKeys(): void {
  writeMap(safeStorage("local"), {});
  writeMap(safeStorage("session"), {});
}
