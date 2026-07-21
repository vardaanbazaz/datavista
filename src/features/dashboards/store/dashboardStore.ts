import { create } from "zustand";
import { Dashboard, Query, GlobalFilter } from "@/shared/types";
import { KPICardConfig } from "@/features/kpi/types";
import { toast } from "@/shared/hooks/use-toast";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useUiStore } from "@/store/uiStore";
import { queryEngine } from "@/shared/services/queryEngine";

interface DashboardState {
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  activeGlobalFilters: GlobalFilter[];
  setDashboards: (dashboards: Dashboard[]) => void;
  setActiveDashboardId: (id: string | null) => void;
  createDashboard: (name: string, datasetId: string, chartIds?: string[]) => void;
  saveDashboard: (id: string, updates: Partial<Dashboard>) => void;
  renameDashboard: (id: string, name: string) => void;
  deleteDashboard: (id: string) => void;
  loadDashboard: (id: string) => void;
  addKpiCard: (dashboardId: string, kpi: KPICardConfig) => void;
  updateKpiCard: (dashboardId: string, kpiId: string, updates: Partial<KPICardConfig>) => void;
  deleteKpiCard: (dashboardId: string, kpiId: string) => void;
  addGlobalFilter: (filter: GlobalFilter) => void;
  removeGlobalFilter: (filterId: string) => void;
  clearGlobalFilters: () => void;
  toggleCrossFilter: (filterInput: Omit<GlobalFilter, "id">) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  activeDashboardId: null,
  activeGlobalFilters: [],
  
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
        variant: "destructive",
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

    set({ activeDashboardId: id, activeGlobalFilters: [] });
    useUiStore.getState().setActiveView('overview');

    toast({
      title: "Dashboard Loaded",
      description: `"${dashboard.name}" context restored.`,
    });
  },

  addKpiCard: (dashboardId, kpi) => {
    const { dashboards } = get();
    const updated = dashboards.map(d => {
      if (d.id === dashboardId) {
        const kpis = d.kpis || [];
        const kpiIds = d.kpiIds || [];
        return {
          ...d,
          kpis: [...kpis, kpi],
          kpiIds: [...kpiIds, kpi.id],
          updatedAt: Date.now()
        };
      }
      return d;
    });
    set({ dashboards: updated });
    toast({
      title: "KPI Card Added",
      description: `"${kpi.title}" has been added to the dashboard.`,
    });
  },

  updateKpiCard: (dashboardId, kpiId, updates) => {
    const { dashboards } = get();
    const updated = dashboards.map(d => {
      if (d.id === dashboardId) {
        const kpis = (d.kpis || []).map(k => k.id === kpiId ? { ...k, ...updates } : k);
        return {
          ...d,
          kpis,
          updatedAt: Date.now()
        };
      }
      return d;
    });
    set({ dashboards: updated });
    toast({
      title: "KPI Card Updated",
      description: "The KPI card configuration has been updated.",
    });
  },

  deleteKpiCard: (dashboardId, kpiId) => {
    const { dashboards } = get();
    const updated = dashboards.map(d => {
      if (d.id === dashboardId) {
        const kpis = (d.kpis || []).filter(k => k.id !== kpiId);
        const kpiIds = (d.kpiIds || []).filter(id => id !== kpiId);
        const layout = (d.layout || []).filter(item => item.i !== kpiId);
        return {
          ...d,
          kpis,
          kpiIds,
          layout,
          updatedAt: Date.now()
        };
      }
      return d;
    });
    set({ dashboards: updated });
    toast({
      title: "KPI Card Removed",
      description: "The KPI card has been removed from the dashboard.",
    });
  },

  addGlobalFilter: (filter) => set((state) => ({
    activeGlobalFilters: [...state.activeGlobalFilters, filter]
  })),

  removeGlobalFilter: (filterId) => set((state) => ({
    activeGlobalFilters: state.activeGlobalFilters.filter(f => f.id !== filterId)
  })),

  clearGlobalFilters: () => set({ activeGlobalFilters: [] }),

  toggleCrossFilter: (filterInput) => set((state) => {
    const existingIndex = state.activeGlobalFilters.findIndex(
      (f) =>
        f.column === filterInput.column &&
        JSON.stringify(f.value) === JSON.stringify(filterInput.value) &&
        f.sourceWidgetId === filterInput.sourceWidgetId
    );

    if (existingIndex > -1) {
      const updated = state.activeGlobalFilters.filter((_, i) => i !== existingIndex);
      return { activeGlobalFilters: updated };
    } else {
      const id = `gf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newFilter: GlobalFilter = {
        ...filterInput,
        id,
      };
      return { activeGlobalFilters: [...state.activeGlobalFilters, newFilter] };
    }
  })
}));
