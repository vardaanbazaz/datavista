import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ViewType } from "./viewTypes";

export type { ViewType };

export type LlmProvider = 'gemini' | 'openai';

import {
  DEFAULT_APPEARANCE,
  DEFAULT_THEME_SETTING,
  readStoredPrefs,
  type Appearance,
  type ThemeSetting,
} from "@/shared/theme/boot";
import { THEME_IDS, type ThemeId } from "@/shared/theme/themes";

/** Appearance (theme, transparency, animation, text size, contrast, motion). Stored per browser with the rest of the UI prefs. */
export type { Appearance, ThemeSetting, TextSize, MotionPreference } from "@/shared/theme/boot";
export { DEFAULT_APPEARANCE, DEFAULT_THEME_SETTING };

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
  /** Which theme, or Automatic (day/night theme by device or schedule). */
  themeSetting: ThemeSetting;
  /** The theme shown right now (themeSetting resolved by ThemeProvider). Not persisted. */
  resolvedTheme: ThemeId;
  appearance: Appearance;
  /** The Appearance panel. Not persisted. */
  isAppearanceOpen: boolean;
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
  /** First-run setup finished or skipped (SetupFlow). */
  hasCompletedSetup: boolean;
  /** The first-run setup dialog. Not persisted. */
  isSetupOpen: boolean;
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
  setThemeSetting: (changes: Partial<ThemeSetting>) => void;
  setResolvedTheme: (theme: ThemeId) => void;
  setAppearance: (changes: Partial<Appearance>) => void;
  setIsAppearanceOpen: (open: boolean) => void;
  setIsHydrated: (hydrated: boolean) => void;
  setIsDataHydrated: (hydrated: boolean) => void;
  setLlmApiKey: (key: string) => void;
  setLlmProvider: (provider: LlmProvider) => void;
  setHasSeenTour: (seen: boolean) => void;
  setIsSetupOpen: (open: boolean) => void;
  completeSetup: () => void;
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
      themeSetting: DEFAULT_THEME_SETTING,
      resolvedTheme: 'light',
      appearance: DEFAULT_APPEARANCE,
      isAppearanceOpen: false,
      isHydrated: false,
      isDataHydrated: false,
      startupStatus: null,
      llmApiKey: '',
      llmProvider: 'gemini',
      hasSeenTour: false,
      runTour: false,
      hasCompletedSetup: false,
      isSetupOpen: false,
      hasAcknowledgedAiInsights: false,
      isSnapshotManagerOpen: false,
      isPrivacyOpen: false,
      setActiveView: (view) => set({ activeView: view }),
      setShowWelcome: (show) => set({ showWelcome: show }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setThemeSetting: (changes) => set((state) => ({ themeSetting: { ...state.themeSetting, ...changes } })),
      setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
      setAppearance: (changes) => set((state) => ({ appearance: { ...state.appearance, ...changes } })),
      setIsAppearanceOpen: (open) => set({ isAppearanceOpen: open }),
      setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
      setIsDataHydrated: (hydrated) => set({ isDataHydrated: hydrated }),
      setLlmApiKey: (key) => set({ llmApiKey: key }),
      setLlmProvider: (provider) => set({ llmProvider: provider }),
      setHasSeenTour: (seen) => set({ hasSeenTour: seen }),
      setIsSetupOpen: (open) => set({ isSetupOpen: open }),
      completeSetup: () => {
        try {
          localStorage.setItem('datavista-visited', 'true');
        } catch {
          /* storage blocked: the flag below still hides setup for this session */
        }
        set({ hasCompletedSetup: true });
      },
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
      // v2 (batch 7): `theme` ("light" | "dark" | "system") became `themeSetting` and
      // `readingComfort` became `appearance` (simpleFrames dropped; transparency and background
      // animation added). v3 (batch 7 phase B): Background animation off by default, so a v1/v2
      // `true` is dropped; `hasCompletedSetup` added. v4: Background animation removed;
      // readStoredPrefs rebuilds `appearance` without it, so the old key is dropped. Every version is read by
      // boot.ts:readStoredPrefs, the same function the pre-paint script uses, so the first paint
      // and the store always agree.
      version: 4,
      migrate: (persistedState, fromVersion) => {
        const old = (persistedState ?? {}) as Record<string, unknown>;
        const { setting, appearance } = readStoredPrefs(JSON.stringify({ state: old, version: fromVersion }), [...THEME_IDS]);
        const { theme: _theme, readingComfort: _rc, ...rest } = old;
        return { ...rest, themeSetting: setting, appearance } as unknown as UiState;
      },
      // A saved state may lack a field added later, or carry an unknown theme id: normalise
      // through readStoredPrefs instead of letting the shallow merge keep a bad value.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiState>;
        // After `migrate`, the saved state is in the current version's shape.
        const { setting, appearance } = readStoredPrefs(JSON.stringify({ state: saved, version: 4 }), [...THEME_IDS]);
        return { ...current, ...saved, themeSetting: setting, appearance };
      },
      partialize: (state) => ({
        hasSeenTour: state.hasSeenTour,
        hasCompletedSetup: state.hasCompletedSetup,
        themeSetting: state.themeSetting,
        appearance: state.appearance,
        llmApiKey: state.llmApiKey,
        llmProvider: state.llmProvider,
        activeView: state.activeView,
        hasAcknowledgedAiInsights: state.hasAcknowledgedAiInsights,
      }),
      // The tour no longer starts by itself: a first visit gets the setup (SetupFlow, opened by
      // Dashboard), which offers the tour; the "?" button and Appearance restart it.
      onRehydrateStorage: () => (state) => {
        if (state) state.isHydrated = true;
      },
    }
  )
);

