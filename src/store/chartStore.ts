import { create } from "zustand";
import { ChartConfig } from "@/shared/types";
import { toast } from "@/shared/hooks/use-toast";

interface ChartState {
  charts: ChartConfig[];
  setCharts: (charts: ChartConfig[]) => void;
  createChart: (chart: ChartConfig) => void;
  deleteChart: (chartId: string) => void;
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
  
  deleteDatasetCharts: (datasetId) => set((state) => ({
    charts: state.charts.filter(c => c.datasetId !== datasetId)
  }))
}));
