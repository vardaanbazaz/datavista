import { create } from "zustand";

export type ViewType = 'overview' | 'upload' | 'charts' | 'data' | 'filters' | 'export' | 'pivot' | 'stats' | 'window-builder';

interface UiState {
  activeView: ViewType;
  showWelcome: boolean;
  isLoading: boolean;
  theme: 'light' | 'dark' | 'system';
  isHydrated: boolean;
  setActiveView: (view: ViewType) => void;
  setShowWelcome: (show: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setIsHydrated: (hydrated: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'overview',
  showWelcome: false,
  isLoading: false,
  theme: 'system',
  isHydrated: false,
  setActiveView: (view) => set({ activeView: view }),
  setShowWelcome: (show) => set({ showWelcome: show }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setTheme: (theme) => set({ theme }),
  setIsHydrated: (hydrated) => set({ isHydrated: hydrated }),
}));
