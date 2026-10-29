import { create } from "zustand";
import { ChartConfig } from "@/shared/types";
import { toast } from "@/shared/hooks/use-toast";

interface ChartState {
  charts: ChartConfig[];
  setCharts: (charts: ChartConfig[]) => void;
  createChart: (chart: ChartConfig) => void;
  deleteChart: (chartId: string) => void;
  /** Changes some settings of one chart (e.g. its date bucket or Top N from the chart's hint). */
  updateChart: (chartId: string, changes: Partial<Omit<ChartConfig, "id">>) => void;
  deleteDatasetCharts: (datasetId: string) => void;
}

export const useChartStore = create<ChartState>((set) => ({
  charts: [],
  setCharts: (charts) => set({ charts }),
  
  createChart: (chart) => set((state) => {
    const updatedCharts = [...state.charts, chart];
    toast({
      title: "Chart created",
      description: `${chart.title} has been added to your dashboard`,
    });
    return { charts: updatedCharts };
  }),
  
  deleteChart: (chartId) => set((state) => {
    const updatedCharts = state.charts.filter(c => c.id !== chartId);
    toast({
      title: "Chart deleted",
      description: "Chart has been removed from your dashboard",
    });
    return { charts: updatedCharts };
  }),
  
  updateChart: (chartId, changes) => set((state) => ({
    charts: state.charts.map(c => (c.id === chartId ? { ...c, ...changes } : c)),
  })),

  deleteDatasetCharts: (datasetId) => set((state) => ({
    charts: state.charts.filter(c => c.datasetId !== datasetId)
  }))
}));
