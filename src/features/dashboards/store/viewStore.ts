import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SavedView } from "@/shared/types";

interface ViewStore {
  savedViews: SavedView[];
  addSavedView: (view: Omit<SavedView, "id" | "createdAt">) => SavedView;
  deleteSavedView: (id: string) => void;
  getViewsForDashboard: (dashboardId: string) => SavedView[];
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set, get) => ({
      savedViews: [],
      addSavedView: (viewData) => {
        const newView: SavedView = {
          ...viewData,
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `view-${Math.random().toString(36).substring(2, 9)}`,
          createdAt: Date.now(),
        };
        set((state) => ({
          savedViews: [newView, ...state.savedViews],
        }));
        return newView;
      },
      deleteSavedView: (id) => {
        set((state) => ({
          savedViews: state.savedViews.filter((v) => v.id !== id),
        }));
      },
      getViewsForDashboard: (dashboardId) => {
        return get().savedViews.filter((v) => v.dashboardId === dashboardId);
      },
    }),
    {
      name: "datavista-saved-views",
    }
  )
);
