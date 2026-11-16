/**
 * AI provider settings. Non-secret choices (provider, model, base URL, privacy level) are
 * persisted to localStorage `datavista-ai-settings`; keys are held in memory and stored
 * only through keyStorage (session by default, device on opt-in).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_PROVIDER_ID, defaultModel, getProvider, isProviderId, type ProviderEntry } from "../providers/registry";
import {
  DEFAULT_PRIVACY_LEVEL,
  SAMPLE_ROWS_DEFAULT,
  clampSampleRows,
  type PrivacyLevel,
  type PrivacySettings,
} from "../privacy/levels";
import { forgetKey as forgetStoredKey, loadKeys, migrateLegacyKey, saveKey } from "./keyStorage";

export interface AiSettingsState {
  providerId: string;
  /** Chosen model per provider id (empty: the provider's first suggestion). */
  models: Record<string, string>;
  /** Base URL per provider id; only Custom uses it (others use the registry's). */
  baseUrls: Record<string, string>;
  privacy: PrivacySettings;
  /** In memory only (see keyStorage). */
  keys: Record<string, string>;
  /** In memory only: which providers' keys are remembered on this device. */
  remembered: Record<string, boolean>;

  setProvider: (id: string) => void;
  setModel: (providerId: string, model: string) => void;
  setBaseUrl: (providerId: string, url: string) => void;
  setKey: (providerId: string, key: string, remember: boolean) => void;
  forgetKey: (providerId: string) => void;
  setPrivacyLevel: (level: PrivacyLevel) => void;
  setSampleRows: (n: number) => void;
  setColumnUnmasked: (column: string, unmasked: boolean) => void;
  reloadKeys: () => void;
}

migrateLegacyKey();
const initialKeys = loadKeys();

const LEVELS: PrivacyLevel[] = ["schema", "summaries", "samples"];

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      providerId: DEFAULT_PROVIDER_ID,
      models: {},
      baseUrls: {},
      privacy: { level: DEFAULT_PRIVACY_LEVEL, sampleRows: SAMPLE_ROWS_DEFAULT, unmasked: [] },
      keys: initialKeys.keys,
      remembered: initialKeys.remembered,

      setProvider: (id) => set({ providerId: isProviderId(id) ? id : DEFAULT_PROVIDER_ID }),
      setModel: (providerId, model) => set((s) => ({ models: { ...s.models, [providerId]: model.trim() } })),
      setBaseUrl: (providerId, url) => set((s) => ({ baseUrls: { ...s.baseUrls, [providerId]: url.trim() } })),
      setKey: (providerId, key, remember) => {
        saveKey(providerId, key, remember);
        const trimmed = key.trim();
        set((s) => {
          const keys = { ...s.keys };
          const remembered = { ...s.remembered };
          if (trimmed) keys[providerId] = trimmed;
          else delete keys[providerId];
          if (trimmed && remember) remembered[providerId] = true;
          else delete remembered[providerId];
          return { keys, remembered };
        });
      },
      forgetKey: (providerId) => {
        forgetStoredKey(providerId);
        set((s) => {
          const keys = { ...s.keys };
          const remembered = { ...s.remembered };
          delete keys[providerId];
          delete remembered[providerId];
          return { keys, remembered };
        });
      },
      setPrivacyLevel: (level) => set((s) => ({ privacy: { ...s.privacy, level } })),
      setSampleRows: (n) => set((s) => ({ privacy: { ...s.privacy, sampleRows: clampSampleRows(n) } })),
      setColumnUnmasked: (column, unmasked) =>
        set((s) => {
          const list = new Set(s.privacy.unmasked);
          if (unmasked) list.add(column);
          else list.delete(column);
          return { privacy: { ...s.privacy, unmasked: [...list] } };
        }),
      reloadKeys: () => set(loadKeys()),
    }),
    {
      name: "datavista-ai-settings",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Keys are never written here.
      partialize: (s) => ({ providerId: s.providerId, models: s.models, baseUrls: s.baseUrls, privacy: s.privacy }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AiSettingsState>;
        const privacy = (saved.privacy ?? {}) as Partial<PrivacySettings>;
        return {
          ...current,
          providerId: isProviderId(saved.providerId) ? saved.providerId : current.providerId,
          models: typeof saved.models === "object" && saved.models ? saved.models : {},
          baseUrls: typeof saved.baseUrls === "object" && saved.baseUrls ? saved.baseUrls : {},
          privacy: {
            level: LEVELS.includes(privacy.level as PrivacyLevel) ? (privacy.level as PrivacyLevel) : DEFAULT_PRIVACY_LEVEL,
            sampleRows: clampSampleRows(privacy.sampleRows ?? SAMPLE_ROWS_DEFAULT),
            unmasked: Array.isArray(privacy.unmasked) ? privacy.unmasked.filter((c): c is string => typeof c === "string") : [],
          },
        };
      },
    }
  )
);

export interface ResolvedConnection {
  provider: ProviderEntry;
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** The saved provider, base URL, key and model. */
export function resolveConnection(s: Pick<AiSettingsState, "providerId" | "models" | "baseUrls" | "keys">): ResolvedConnection {
  const provider = getProvider(s.providerId);
  const baseUrl = provider.id === "custom" ? s.baseUrls[provider.id] ?? "" : provider.baseUrl;
  return { provider, baseUrl, apiKey: s.keys[provider.id] ?? "", model: s.models[provider.id] || defaultModel(provider) };
}

/**
 * Whether AI requests may be made: a key is set (or the provider needs none, like Ollama or
 * LM Studio), a base URL is known and a model is chosen. Nothing is ever sent otherwise.
 */
export function isConnectionReady(c: ResolvedConnection): boolean {
  if (!c.baseUrl.trim() || !c.model.trim()) return false;
  return !c.provider.keyRequired || c.apiKey.trim() !== "";
}

export function isAiConnected(s: Pick<AiSettingsState, "providerId" | "models" | "baseUrls" | "keys"> = useAiSettingsStore.getState()): boolean {
  return isConnectionReady(resolveConnection(s));
}

/** React hook: true when AI requests may be made. */
export function useAiConnected(): boolean {
  return useAiSettingsStore((s) => isAiConnected(s));
}

/** React hook: the saved provider's label (for "Sends ... to <label>"). */
export function useProviderLabel(): string {
  return useAiSettingsStore((s) => getProvider(s.providerId).label);
}
