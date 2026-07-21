import { create } from "zustand";
import { DrillState, Query } from "@/shared/types";

interface DrillStore {
  // Drill-down states per widget ID
  widgetDrillStates: Record<string, DrillState>;
  setWidgetDrillState: (widgetId: string, state: DrillState) => void;
  resetWidgetDrillState: (widgetId: string) => void;
  setAllWidgetDrillStates: (states: Record<string, DrillState>) => void;
  resetAllWidgetDrillStates: () => void;
  
  // Drill-through modal state
  isDrillThroughOpen: boolean;
  drillThroughDatasetId: string | null;
  drillThroughQuery: Query | null;
  drillThroughTitle: string;
  openDrillThrough: (datasetId: string, query: Query, title: string) => void;
  closeDrillThrough: () => void;
}

export const useDrillStore = create<DrillStore>((set) => ({
  widgetDrillStates: {},
  setWidgetDrillState: (widgetId, state) => set((prev) => ({
    widgetDrillStates: {
      ...prev.widgetDrillStates,
      [widgetId]: state,
    }
  })),
  resetWidgetDrillState: (widgetId) => set((prev) => {
    const updated = { ...prev.widgetDrillStates };
    delete updated[widgetId];
    return { widgetDrillStates: updated };
  }),
  setAllWidgetDrillStates: (states) => set({ widgetDrillStates: states }),
  resetAllWidgetDrillStates: () => set({ widgetDrillStates: {} }),
  
  isDrillThroughOpen: false,
  drillThroughDatasetId: null,
  drillThroughQuery: null,
  drillThroughTitle: "Drill Through Raw Data",
  openDrillThrough: (datasetId, query, title) => set({
    isDrillThroughOpen: true,
    drillThroughDatasetId: datasetId,
    drillThroughQuery: query,
    drillThroughTitle: title,
  }),
  closeDrillThrough: () => set({
    isDrillThroughOpen: false,
    drillThroughDatasetId: null,
    drillThroughQuery: null,
  }),
}));
