import { create } from "zustand";
import { Dashboard, Query } from "@/shared/types";
import { toast } from "@/shared/hooks/use-toast";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useUiStore } from "@/store/uiStore";
import { queryEngine } from "@/shared/services/queryEngine";

interface DashboardState {
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  setDashboards: (dashboards: Dashboard[]) => void;
  setActiveDashboardId: (id: string | null) => void;
  createDashboard: (name: string, datasetId: string, chartIds?: string[]) => void;
  saveDashboard: (id: string, updates: Partial<Dashboard>) => void;
  renameDashboard: (id: string, name: string) => void;
  deleteDashboard: (id: string) => void;
  loadDashboard: (id: string) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  activeDashboardId: null,
  
  setDashboards: (dashboards) => set({ dashboards }),
  
  setActiveDashboardId: (activeDashboardId) => set({ activeDashboardId }),
  
  createDashboard: (name, datasetId, chartIds = []) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        title: "Invalid Name",
        description: "Dashboard name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    const { dashboards } = get();
    if (dashboards.some(d => d.name.toLowerCase() === trimmedName.toLowerCase() && d.datasetId === datasetId)) {
      toast({
        title: "Duplicate Dashboard",
        description: "A dashboard with this name already exists for this dataset.",
        variant: "destructive",
      });
      return;
    }

    const id = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `dash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newDashboard: Dashboard = {
      id,
      name: trimmedName,
      chartIds,
      datasetId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        filterState: useFilterStore.getState().activeFilters
      }
    };

    set({
      dashboards: [...dashboards, newDashboard],
      activeDashboardId: id
    });

    toast({
      title: "Dashboard Created",
      description: `"${trimmedName}" has been successfully created.`,
    });
  },

  saveDashboard: (id, updates) => {
    const { dashboards } = get();
    const updated = dashboards.map(d => 
      d.id === id 
        ? { ...d, ...updates, updatedAt: Date.now() } 
        : d
    );
    set({ dashboards: updated });
  },

  renameDashboard: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        title: "Invalid Name",
        description: "Dashboard name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    const { dashboards } = get();
    const dashboard = dashboards.find(d => d.id === id);
    if (!dashboard) return;

    if (dashboards.some(d => d.name.toLowerCase() === trimmed.toLowerCase() && d.id !== id && d.datasetId === dashboard.datasetId)) {
      toast({
        title: "Rename Failed",
        description: "A dashboard with this name already exists.",
        variant: "destructive",
      });
      return;
    }

    const updated = dashboards.map(d => 
      d.id === id 
        ? { ...d, name: trimmed, updatedAt: Date.now() } 
        : d
    );

    set({ dashboards: updated });

    toast({
      title: "Dashboard Renamed",
      description: `Renamed to "${trimmed}"`,
    });
  },

  deleteDashboard: (id) => {
    const { dashboards, activeDashboardId } = get();
    const dashboardToDelete = dashboards.find(d => d.id === id);
    if (!dashboardToDelete) return;

    const updated = dashboards.filter(d => d.id !== id);
    
    set({ 
      dashboards: updated,
      activeDashboardId: activeDashboardId === id ? null : activeDashboardId
    });

    toast({
      title: "Dashboard Deleted",
      description: `"${dashboardToDelete.name}" has been removed.`,
    });
  },

  loadDashboard: (id) => {
    const { dashboards } = get();
    const dashboard = dashboards.find(d => d.id === id);
    if (!dashboard) {
      toast({
        title: "Error",
        description: "Dashboard not found.",
        variant: "destructive",
      });
      return;
    }

    // Restore associated dataset context
    const dataset = useDatasetStore.getState().datasets.find(d => d.id === dashboard.datasetId);
    if (!dataset) {
      // Graceful handling when dataset is missing/deleted
      set({ activeDashboardId: id });
      useDatasetStore.setState({ activeDataset: null });
      useFilterStore.setState({ filteredData: [], activeFilters: { categoricalFilters: {}, dateRangeFilters: {} } });
      useUiStore.getState().setActiveView('overview');
      toast({
        title: "Dataset Missing",
        description: `The dataset for "${dashboard.name}" has been deleted.`,
        variant: "warning" as any,
      });
      return;
    }

    // Set active dataset
    useDatasetStore.setState({ activeDataset: dataset });
    
    // Restore filters
    const filterState = dashboard.settings?.filterState || {
      categoricalFilters: {},
      dateRangeFilters: {},
    };

    const query: Query = {
      filters: {
        categoricalFilters: filterState.categoricalFilters,
        dateRangeFilters: filterState.dateRangeFilters,
      },
      groupBy: filterState.groupByColumn ? {
        column: filterState.groupByColumn,
        period: filterState.groupByPeriod,
      } : undefined,
      pagination: {
        pageSize: 'all',
      }
    };

    const filteredData = queryEngine.execute(dataset, query).rows;

    useFilterStore.setState({
      activeFilters: filterState,
      filteredData
    });

    set({ activeDashboardId: id });
    useUiStore.getState().setActiveView('overview');

    toast({
      title: "Dashboard Loaded",
      description: `"${dashboard.name}" context restored.`,
    });
  }
}));
