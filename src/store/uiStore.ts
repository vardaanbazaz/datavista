import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ViewType } from "./viewTypes";

export type { ViewType };

export type LlmProvider = 'gemini' | 'openai';

/** One startup step: "Loading rows of “sales”", with rows read so far when known. */
export interface StartupStatus {
  step: string;
  loadedRows?: number;
  totalRows?: number;
}

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
  /** What startup is doing right now, for the loading screen (persistenceService.hydrate). Not persisted. */
  startupStatus: StartupStatus | null;
  llmApiKey: string;
  llmProvider: LlmProvider;
  hasSeenTour: boolean;
  runTour: boolean;
  /**
   * One-time, persistent acknowledgement that the Executive Summary panel auto-generates
   * insights by sending dataset content to the configured AI provider. Set only when the
   * user explicitly clicks "Generate AI Insights" — independent of dashboardStore's
   * per-dataset executiveSummary/executiveSummaryDismissed reset (audit #19), so switching
   * datasets or reloading doesn't re-prompt once the user has consented once.
   */
  hasAcknowledgedAiInsights: boolean;
  isSnapshotManagerOpen: boolean;
  /** The "Data & privacy" dialog (clear all local data). Not persisted. */
  isPrivacyOpen: boolean;
  setIsPrivacyOpen: (open: boolean) => void;
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
  setHasAcknowledgedAiInsights: (acknowledged: boolean) => void;
  setIsSnapshotManagerOpen: (open: boolean) => void;
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
      startupStatus: null,
      llmApiKey: '',
      llmProvider: 'gemini',
      hasSeenTour: false,
      runTour: false,
      hasAcknowledgedAiInsights: false,
      isSnapshotManagerOpen: false,
      isPrivacyOpen: false,
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
      setHasAcknowledgedAiInsights: (acknowledged) => set({ hasAcknowledgedAiInsights: acknowledged }),
      setIsSnapshotManagerOpen: (open) => set({ isSnapshotManagerOpen: open }),
      setIsPrivacyOpen: (open) => set({ isPrivacyOpen: open }),
    }),
    {
      name: 'datavista-ui-storage',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // No-op for now — bump `version` and replace this when the persisted shape
      // changes, so old localStorage data from a prior version gets migrated instead
      // of silently mismatching the new state shape.
      migrate: (persistedState) => persistedState as UiState,
      partialize: (state) => ({
        hasSeenTour: state.hasSeenTour,
        theme: state.theme,
        llmApiKey: state.llmApiKey,
        llmProvider: state.llmProvider,
        activeView: state.activeView,
        hasAcknowledgedAiInsights: state.hasAcknowledgedAiInsights,
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

