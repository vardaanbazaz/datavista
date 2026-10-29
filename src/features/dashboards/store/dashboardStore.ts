import { create } from "zustand";
import { Dashboard, Query, GlobalFilter, FilterState, FilterCondition } from "@/shared/types";
import { KPICardConfig } from "@/features/kpi/types";
import { toast } from "@/shared/hooks/use-toast";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useUiStore, ViewType } from "@/store/uiStore";
import { queryEngine } from "@/shared/services/queryEngine";
import { summaryEngine } from "@/features/ai/summaryEngine";
import { DetectedAnomaly } from "@/features/ai/anomalyDetector";


export interface DashboardSnapshotState {
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  activeGlobalFilters: GlobalFilter[];
  // Optional: only present on snapshots taken around an action (e.g. loadDashboard)
  // that also mutates the dataset/filter/view stores. Absent on snapshots that don't
  // touch those stores (most mutations), and on older/external snapshots (named
  // workspace snapshots, pre-existing history entries) — undo/redo/restore must skip
  // the external-store restore in that case rather than clobber unrelated state.
  activeDatasetId?: string | null;
  datasetFilterState?: FilterState;
  activeView?: ViewType;
}

const MAX_HISTORY = 25;
const DEBOUNCE_MS = 600;
let lastHistoryTimestamp = 0;

interface DashboardState {
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  activeGlobalFilters: GlobalFilter[];
  
  // AI Automated Analyst State
  executiveSummary: string | null;
  isGeneratingSummary: boolean;
  executiveSummaryDismissed: boolean;
  detectedAnomalies: DetectedAnomaly[];
  // Which path produced the current executiveSummary — 'ai' (sent to the configured LLM
  // provider) or 'offline' (local heuristic, no data left the browser). Lets the panel show
  // an "AI Generated" indicator only when data actually left the browser.
  executiveSummarySource: 'ai' | 'offline' | null;
  generateExecutiveSummary: () => Promise<void>;
  dismissExecutiveSummary: () => void;

  // Undo/Redo History
  past: DashboardSnapshotState[];
  future: DashboardSnapshotState[];

  // History Actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  restoreSnapshotState: (snapshotState: DashboardSnapshotState) => void;

  // Mutating Actions
  setDashboards: (dashboards: Dashboard[]) => void;
  setActiveDashboardId: (id: string | null) => void;
  createDashboard: (name: string, datasetId: string, chartIds?: string[]) => void;
  saveDashboard: (id: string, updates: Partial<Dashboard>, debounceHistory?: boolean) => void;
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

// Builds the same Query shape loadDashboard (and the undo/redo dataset-context
// restore) need from a persisted/snapshotted FilterState, so the two can't drift.
// FilterPanel.tsx uses this same function to apply its filters, for the same reason.
export function buildFilterQuery(filterState: FilterState): Query {
  const conditions: FilterCondition[] = [];

  Object.entries(filterState.numericRangeFilters || {}).forEach(([column, range]) => {
    if (range.min !== undefined || range.max !== undefined) {
      conditions.push({ column, operator: 'between', value: { start: range.min, end: range.max } });
    }
  });

  Object.entries(filterState.textSearchFilters || {}).forEach(([column, text]) => {
    if (text && text.trim()) {
      conditions.push({ column, operator: 'contains', value: text.trim() });
    }
  });

  return {
    filters: {
      categoricalFilters: filterState.categoricalFilters,
      dateRangeFilters: filterState.dateRangeFilters,
      conditions: conditions.length > 0 ? conditions : undefined,
    },
    groupBy: filterState.groupByColumn ? {
      column: filterState.groupByColumn,
      period: filterState.groupByPeriod,
    } : undefined,
    pagination: {
      pageSize: 'all',
    }
  };
}

// Plain JSON.parse(JSON.stringify(...)) would turn dateRangeFilters' Date values
// into ISO strings — consumers like FilterPanel call date-fns' format() on them
// directly, which throws on a string. Clone structurally instead, keeping Dates.
function cloneFilterState(filterState: FilterState): FilterState {
  const dateRangeFilters: FilterState["dateRangeFilters"] = {};
  for (const [column, range] of Object.entries(filterState.dateRangeFilters || {})) {
    dateRangeFilters[column] = {
      start: range.start ? new Date(range.start) : undefined,
      end: range.end ? new Date(range.end) : undefined,
    };
  }
  return {
    categoricalFilters: JSON.parse(JSON.stringify(filterState.categoricalFilters || {})),
    dateRangeFilters,
    // Optional (unlike categoricalFilters/dateRangeFilters above), so only clone them if the
    // source actually had them — forcing them to `{}` here would make every cloned FilterState
    // structurally different from ones that never set them, breaking exact-equality comparisons.
    numericRangeFilters: filterState.numericRangeFilters
      ? JSON.parse(JSON.stringify(filterState.numericRangeFilters))
      : undefined,
    textSearchFilters: filterState.textSearchFilters
      ? JSON.parse(JSON.stringify(filterState.textSearchFilters))
      : undefined,
    groupByColumn: filterState.groupByColumn,
    groupByPeriod: filterState.groupByPeriod,
  };
}

// Captures the dataset/filter/view state that loadDashboard (and similar actions)
// mutate outside of dashboardStore, so a snapshot taken around such an action can
// undo/redo those side effects too — see restoreExternalContext.
function captureExternalContext(): Pick<DashboardSnapshotState, "activeDatasetId" | "datasetFilterState" | "activeView"> {
  return {
    activeDatasetId: useDatasetStore.getState().activeDataset?.id ?? null,
    datasetFilterState: cloneFilterState(useFilterStore.getState().activeFilters),
    activeView: useUiStore.getState().activeView,
  };
}

// Reapplies a captured external context (dataset selection, filters, active view).
// No-op when the snapshot doesn't carry one (older history entries, or named
// workspace snapshots / manual restoreSnapshotState calls that never set it) —
// those must not clobber whatever the dataset/filter/view stores currently hold.
function restoreExternalContext(snapshot: DashboardSnapshotState) {
  if (snapshot.activeDatasetId === undefined) return;

  const currentActiveDataset = useDatasetStore.getState().activeDataset;
  if (snapshot.activeDatasetId !== (currentActiveDataset?.id ?? null)) {
    const dataset = snapshot.activeDatasetId
      ? useDatasetStore.getState().datasets.find(d => d.id === snapshot.activeDatasetId) ?? null
      : null;
    // Rows still on disk (left there at startup): load them, then apply this context.
    if (dataset?.rowsPending) {
      void useDatasetStore.getState().loadRows(dataset.id).then((loaded) => {
        if (loaded) restoreExternalContext(snapshot);
      });
      return;
    }
    // Raw setState (not setActiveDataset): mirrors what loadDashboard did, without
    // re-running formulaEngine/windowEngine augmentation on the restored object.
    useDatasetStore.setState({ activeDataset: dataset });
  }

  const filterState: FilterState = snapshot.datasetFilterState ?? {
    categoricalFilters: {},
    dateRangeFilters: {},
  };
  const dataset = useDatasetStore.getState().activeDataset;
  const filteredData = dataset ? queryEngine.execute(dataset, buildFilterQuery(filterState)).rows : [];
  useFilterStore.setState({ activeFilters: filterState, filteredData });

  if (snapshot.activeView) {
    useUiStore.getState().setActiveView(snapshot.activeView);
  }
}

function pushPast(
  get: () => DashboardState,
  set: (partial: Partial<DashboardState> | ((state: DashboardState) => Partial<DashboardState>)) => void,
  isDebounced = false,
  captureContext = false
) {
  const currentSnapshot: DashboardSnapshotState = {
    dashboards: JSON.parse(JSON.stringify(get().dashboards)),
    activeDashboardId: get().activeDashboardId,
    activeGlobalFilters: JSON.parse(JSON.stringify(get().activeGlobalFilters)),
    ...(captureContext ? captureExternalContext() : {}),
  };

  const now = Date.now();
  const past = get().past;

  // For rapid continuous mutations (e.g. layout dragging), do not add multiple intermediate steps
  if (isDebounced && now - lastHistoryTimestamp < DEBOUNCE_MS && past.length > 0) {
    set({ future: [] });
    return;
  }

  lastHistoryTimestamp = now;

  // Don't push if duplicate of top of past
  if (past.length > 0) {
    const lastPast = past[past.length - 1];
    if (JSON.stringify(lastPast) === JSON.stringify(currentSnapshot)) {
      return;
    }
  }

  const newPast = [...past, currentSnapshot].slice(-MAX_HISTORY);
  set({ past: newPast, future: [] });
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  activeDashboardId: null,
  activeGlobalFilters: [],
  executiveSummary: null,
  isGeneratingSummary: false,
  executiveSummaryDismissed: false,
  detectedAnomalies: [],
  executiveSummarySource: null,
  past: [],
  future: [],

  dismissExecutiveSummary: () => set({ executiveSummaryDismissed: true }),

  generateExecutiveSummary: async () => {
    const requestDatasetId = useDatasetStore.getState().activeDataset?.id ?? null;
    set({ isGeneratingSummary: true, executiveSummaryDismissed: false });
    const dataset = useDatasetStore.getState().activeDataset;
    const allCharts = useChartStore.getState().charts;
    const activeDashboardId = get().activeDashboardId;
    const activeDashboard = get().dashboards.find((d) => d.id === activeDashboardId);
    const charts = activeDashboard
      ? allCharts.filter((c) => c.datasetId === dataset?.id && activeDashboard.chartIds.includes(c.id))
      : allCharts.filter((c) => c.datasetId === dataset?.id);

    const { summary, anomalies, source } = await summaryEngine.generateExecutiveSummary(
      dataset,
      charts,
      get().activeGlobalFilters,
      useFilterStore.getState().filteredData
    );

    // The active dataset may have changed while the request was in flight
    // (e.g. the user switched datasets). Discard stale results rather than
    // painting the new dataset's panel with the old dataset's summary.
    const currentDatasetId = useDatasetStore.getState().activeDataset?.id ?? null;
    if (currentDatasetId !== requestDatasetId) {
      set({ isGeneratingSummary: false });
      return;
    }

    set({
      executiveSummary: summary,
      detectedAnomalies: anomalies,
      executiveSummarySource: source,
      isGeneratingSummary: false,
      executiveSummaryDismissed: false,
    });
  },


  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  undo: () => {
    const { past, future, dashboards, activeDashboardId, activeGlobalFilters } = get();
    if (past.length === 0) return;

    const previousState = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    // Only capture context on the redo-side entry when the state we're restoring
    // also carries one — otherwise a plain mutation's undo would start clobbering
    // live filter/view state on its redo too.
    const captureContext = previousState.activeDatasetId !== undefined;
    const currentState: DashboardSnapshotState = {
      dashboards: JSON.parse(JSON.stringify(dashboards)),
      activeDashboardId,
      activeGlobalFilters: JSON.parse(JSON.stringify(activeGlobalFilters)),
      ...(captureContext ? captureExternalContext() : {}),
    };

    set({
      dashboards: JSON.parse(JSON.stringify(previousState.dashboards)),
      activeDashboardId: previousState.activeDashboardId,
      activeGlobalFilters: JSON.parse(JSON.stringify(previousState.activeGlobalFilters)),
      past: newPast,
      future: [currentState, ...future],
    });
    restoreExternalContext(previousState);

    toast({
      title: "Undo",
      description: "Restored previous state.",
    });
  },

  redo: () => {
    const { past, future, dashboards, activeDashboardId, activeGlobalFilters } = get();
    if (future.length === 0) return;

    const nextState = future[0];
    const newFuture = future.slice(1);
    const captureContext = nextState.activeDatasetId !== undefined;
    const currentState: DashboardSnapshotState = {
      dashboards: JSON.parse(JSON.stringify(dashboards)),
      activeDashboardId,
      activeGlobalFilters: JSON.parse(JSON.stringify(activeGlobalFilters)),
      ...(captureContext ? captureExternalContext() : {}),
    };

    set({
      dashboards: JSON.parse(JSON.stringify(nextState.dashboards)),
      activeDashboardId: nextState.activeDashboardId,
      activeGlobalFilters: JSON.parse(JSON.stringify(nextState.activeGlobalFilters)),
      past: [...past, currentState].slice(-MAX_HISTORY),
      future: newFuture,
    });
    restoreExternalContext(nextState);

    toast({
      title: "Redo",
      description: "Re-applied state.",
    });
  },

  restoreSnapshotState: (snapshotState: DashboardSnapshotState) => {
    pushPast(get, set);
    set({
      dashboards: JSON.parse(JSON.stringify(snapshotState.dashboards || [])),
      activeDashboardId: snapshotState.activeDashboardId,
      activeGlobalFilters: JSON.parse(JSON.stringify(snapshotState.activeGlobalFilters || [])),
      future: [],
    });
    // No-op unless snapshotState carries a captured context (e.g. a history entry
    // from loadDashboard) — see restoreExternalContext.
    restoreExternalContext(snapshotState);
  },
  
  setDashboards: (dashboards) => {
    pushPast(get, set);
    set({ dashboards });
  },
  
  setActiveDashboardId: (activeDashboardId) => {
    pushPast(get, set);
    set({ activeDashboardId });
  },
  
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

    pushPast(get, set);

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

  saveDashboard: (id, updates, debounceHistory = false) => {
    const isDebounced = Boolean(updates.layout) || debounceHistory;
    pushPast(get, set, isDebounced);

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

    pushPast(get, set);

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

    pushPast(get, set);

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

    // Its dataset's rows are still on disk (left there at startup): load, then open.
    const pending = useDatasetStore.getState().datasets.find(d => d.id === dashboard.datasetId && d.rowsPending);
    if (pending) {
      void useDatasetStore.getState().loadRows(pending.id).then((loaded) => {
        if (loaded) get().loadDashboard(id);
      });
      return;
    }

    pushPast(get, set, false, true);

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

    const filteredData = queryEngine.execute(dataset, buildFilterQuery(filterState)).rows;

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
    pushPast(get, set);
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
    pushPast(get, set);
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
    pushPast(get, set);
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

  addGlobalFilter: (filter) => {
    pushPast(get, set);
    set((state) => ({
      activeGlobalFilters: [...state.activeGlobalFilters, filter]
    }));
  },

  removeGlobalFilter: (filterId) => {
    pushPast(get, set);
    set((state) => ({
      activeGlobalFilters: state.activeGlobalFilters.filter(f => f.id !== filterId)
    }));
  },

  clearGlobalFilters: () => {
    pushPast(get, set);
    set({ activeGlobalFilters: [] });
  },

  toggleCrossFilter: (filterInput) => {
    pushPast(get, set);
    set((state) => {
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
    });
  }
}));

// Reset the executive summary panel whenever the active dataset changes
// (by id, not just content) so a stale summary/anomaly list from the
// previous dataset never lingers after a switch (audit #19).
let lastSummaryDatasetId = useDatasetStore.getState().activeDataset?.id ?? null;
useDatasetStore.subscribe((state) => {
  const nextId = state.activeDataset?.id ?? null;
  if (nextId !== lastSummaryDatasetId) {
    lastSummaryDatasetId = nextId;
    useDashboardStore.setState({
      executiveSummary: null,
      detectedAnomalies: [],
      executiveSummaryDismissed: false,
      executiveSummarySource: null,
    });
  }
});
