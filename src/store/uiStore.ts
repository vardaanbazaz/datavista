import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewType = 'overview' | 'upload' | 'charts' | 'data' | 'filters' | 'export' | 'pivot' | 'stats' | 'window-builder';

export type LlmProvider = 'gemini' | 'openai';

interface UiState {
  activeView: ViewType;
  showWelcome: boolean;
  isLoading: boolean;
  theme: 'light' | 'dark' | 'system';
  isHydrated: boolean;
  /**
   * True once persistenceService.hydrate() has actually finished reading IndexedDB (or
   * given up via its timeout/error fallback) — distinct from `isHydrated`, which the
   * zustand `persist` middleware flips synchronously from localStorage before that real
   * load even starts. UI loading gates should wait on this one, not `isHydrated`.
   */
  isDataHydrated: boolean;
  llmApiKey: string;
  llmProvider: LlmProvider;
  hasSeenTour: boolean;
  runTour: boolean;
  setActiveView: (view: ViewType) => void;
  setShowWelcome: (show: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setIsHydrated: (hydrated: boolean) => void;
  setIsDataHydrated: (hydrated: boolean) => void;
  setLlmApiKey: (key: string) => void;
  setLlmProvider: (provider: LlmProvider) => void;
  setHasSeenTour: (seen: boolean) => void;
  setRunTour: (run: boolean) => void;
  startTour: () => void;
  resetTour: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeView: 'overview',
      showWelcome: false,
      isLoading: false,
      theme: 'system',
      isHydrated: false,
      isDataHydrated: false,
      llmApiKey: '',
      llmProvider: 'gemini',
      hasSeenTour: false,
      runTour: false,
      setActiveView: (view) => set({ activeView: view }),
      setShowWelcome: (show) => set({ showWelcome: show }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setTheme: (theme) => set({ theme }),
      setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
      setIsDataHydrated: (hydrated) => set({ isDataHydrated: hydrated }),
      setLlmApiKey: (key) => set({ llmApiKey: key }),
      setLlmProvider: (provider) => set({ llmProvider: provider }),
      setHasSeenTour: (seen) => set({ hasSeenTour: seen }),
      setRunTour: (run) => set({ runTour: run }),
      startTour: () => set({ runTour: true }),
      resetTour: () => set({ hasSeenTour: false, runTour: true }),
    }),
    {
      name: 'datavista-ui-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hasSeenTour: state.hasSeenTour,
        theme: state.theme,
        llmApiKey: state.llmApiKey,
        llmProvider: state.llmProvider,
        activeView: state.activeView,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Trigger tour automatically ONLY on the very first visit
          if (!state.hasSeenTour) {
            state.runTour = true;
          }
          state.isHydrated = true;
        }
      },
    }
  )
);

