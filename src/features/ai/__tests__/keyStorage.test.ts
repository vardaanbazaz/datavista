import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

let local: MemoryStorage;
let session: MemoryStorage;

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = () => import("../settings/keyStorage");

describe("key storage modes", () => {
  it("keeps a key for this session only by default (sessionStorage, not localStorage)", async () => {
    const ks = await load();
    ks.saveKey("openai", " sk-abc ", false);
    expect(JSON.parse(session.getItem(ks.KEYS_STORAGE_KEY)!)).toEqual({ openai: "sk-abc" });
    expect(local.getItem(ks.KEYS_STORAGE_KEY)).toBeNull();
    expect(ks.loadKeys()).toEqual({ keys: { openai: "sk-abc" }, remembered: {} });
  });

  it("remembers a key on this device on opt-in, and switching back moves it to the session", async () => {
    const ks = await load();
    ks.saveKey("openai", "sk-abc", true);
    expect(JSON.parse(local.getItem(ks.KEYS_STORAGE_KEY)!)).toEqual({ openai: "sk-abc" });
    expect(session.getItem(ks.KEYS_STORAGE_KEY)).toBeNull();
    expect(ks.loadKeys().remembered).toEqual({ openai: true });

    ks.saveKey("openai", "sk-abc", false);
    expect(local.getItem(ks.KEYS_STORAGE_KEY)).toBeNull();
    expect(ks.loadKeys()).toEqual({ keys: { openai: "sk-abc" }, remembered: {} });
  });

  it("forgets a key from both storages, per provider", async () => {
    const ks = await load();
    ks.saveKey("openai", "a", true);
    ks.saveKey("groq", "b", false);
    ks.forgetKey("openai");
    expect(ks.loadKeys().keys).toEqual({ groq: "b" });
    ks.forgetAllKeys();
    expect(ks.loadKeys().keys).toEqual({});
  });

  it("the settings store never persists keys", async () => {
    const { useAiSettingsStore } = await import("../settings/aiSettingsStore");
    useAiSettingsStore.getState().setKey("openai", "sk-secret-value", true);
    useAiSettingsStore.getState().setModel("openai", "gpt-4o-mini");
    const persisted = local.getItem("datavista-ai-settings") ?? "";
    expect(persisted).toContain("gpt-4o-mini");
    expect(persisted).not.toContain("sk-secret-value");
    expect(useAiSettingsStore.getState().keys.openai).toBe("sk-secret-value");
  });
});

describe("legacy key migration", () => {
  const legacy = (state: Record<string, unknown>) => local.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true, ...state }, version: 4 }));

  it("moves an old-style key to remembered, keeps the provider, flags a one-time notice and removes it from ui storage", async () => {
    legacy({ llmApiKey: "AIza-old-key-1234", llmProvider: "gemini" });
    const ks = await load();
    ks.migrateLegacyKey();
    expect(ks.loadKeys()).toEqual({ keys: { gemini: "AIza-old-key-1234" }, remembered: { gemini: true } });
    expect(local.getItem(ks.MIGRATION_NOTICE_KEY)).toBe("gemini");
    const ui = JSON.parse(local.getItem("datavista-ui-storage")!);
    expect(ui.state).toEqual({ hasSeenTour: true });
    expect(JSON.parse(local.getItem("datavista-ai-settings")!).state.providerId).toBe("gemini");
  });

  it("is idempotent and keeps an OpenAI choice", async () => {
    legacy({ llmApiKey: "sk-old", llmProvider: "openai" });
    const ks = await load();
    ks.migrateLegacyKey();
    ks.migrateLegacyKey();
    expect(ks.loadKeys().keys).toEqual({ openai: "sk-old" });
  });

  it("an empty old key is dropped without a notice", async () => {
    legacy({ llmApiKey: "", llmProvider: "gemini" });
    const ks = await load();
    ks.migrateLegacyKey();
    expect(ks.loadKeys().keys).toEqual({});
    expect(local.getItem(ks.MIGRATION_NOTICE_KEY)).toBeNull();
  });

  it("the settings store picks up a migrated key at startup", async () => {
    legacy({ llmApiKey: "sk-old", llmProvider: "openai" });
    const { useAiSettingsStore, isAiConnected } = await import("../settings/aiSettingsStore");
    const s = useAiSettingsStore.getState();
    expect(s.providerId).toBe("openai");
    expect(s.keys.openai).toBe("sk-old");
    expect(s.remembered.openai).toBe(true);
    expect(isAiConnected(s)).toBe(true);
  });
});

describe("connection readiness", () => {
  it("needs a key for hosted providers, none for local ones, and a base URL for Custom", async () => {
    const { isAiConnected } = await import("../settings/aiSettingsStore");
    expect(isAiConnected({ providerId: "openai", models: {}, baseUrls: {}, keys: {} })).toBe(false);
    expect(isAiConnected({ providerId: "openai", models: {}, baseUrls: {}, keys: { openai: "k" } })).toBe(true);
    expect(isAiConnected({ providerId: "ollama", models: {}, baseUrls: {}, keys: {} })).toBe(true);
    expect(isAiConnected({ providerId: "custom", models: { custom: "m" }, baseUrls: {}, keys: {} })).toBe(false);
    expect(isAiConnected({ providerId: "custom", models: { custom: "m" }, baseUrls: { custom: "http://x/v1" }, keys: {} })).toBe(true);
  });
});
