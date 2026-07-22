import { create } from "zustand";

export type ViewType = 'overview' | 'upload' | 'charts' | 'data' | 'filters' | 'export' | 'pivot' | 'stats' | 'window-builder';

export type LlmProvider = 'gemini' | 'openai';

interface UiState {
  activeView: ViewType;
  showWelcome: boolean;
  isLoading: boolean;
  theme: 'light' | 'dark' | 'system';
  isHydrated: boolean;
  llmApiKey: string;
  llmProvider: LlmProvider;
  setActiveView: (view: ViewType) => void;
  setShowWelcome: (show: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setIsHydrated: (hydrated: boolean) => void;
  setLlmApiKey: (key: string) => void;
  setLlmProvider: (provider: LlmProvider) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'overview',
  showWelcome: false,
  isLoading: false,
  theme: 'system',
  isHydrated: false,
  llmApiKey: typeof window !== 'undefined' ? localStorage.getItem('datavista_llm_api_key') || '' : '',
  llmProvider: (typeof window !== 'undefined' ? (localStorage.getItem('datavista_llm_provider') as LlmProvider) || 'gemini' : 'gemini'),
  setActiveView: (view) => set({ activeView: view }),
  setShowWelcome: (show) => set({ showWelcome: show }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setTheme: (theme) => set({ theme }),
  setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
  setLlmApiKey: (key) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('datavista_llm_api_key', key);
    }
    set({ llmApiKey: key });
  },
  setLlmProvider: (provider) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('datavista_llm_provider', provider);
    }
    set({ llmProvider: provider });
  },
}));

