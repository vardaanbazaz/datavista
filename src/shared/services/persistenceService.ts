import { db } from "@/shared/lib/db";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { usePivotStore } from "@/store/pivotStore";
import {
  isValidDataset,
  isValidChartConfig,
  isValidFilterState,
  isValidUIState,
  isValidDashboard
} from "@/shared/utils/validators";
import { FilterState, Query } from "@/shared/types";
import { queryEngine } from "@/shared/services/queryEngine";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { toast } from "@/shared/hooks/use-toast";

function createDebouncer(delay: number) {
  let timer: any = null;
  return (callback: () => void) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, delay);
  };
}

export const persistenceService = {
  isHydrating: false,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.hydrate();
    this.subscribeToStoreUpdates();
  },

  async hydrate() {
    if (this.isHydrating) return;
    this.isHydrating = true;

    // Timeout fallback (4s) to unlock UI and switch to in-memory mode
    const hydrationTimeout = setTimeout(() => {
      console.warn("Hydration timed out. Unlocking UI with defaults.");
      useUiStore.setState({ isHydrated: true });
      this.isHydrating = false;
    }, 4000);

    try {
      // 1. Fetch datasets
      const allDatasets = await db.datasets.toArray();
      const validDatasets = allDatasets.filter(isValidDataset);

      // 2. Fetch charts
      const allCharts = await db.charts.toArray();
      const validCharts = allCharts.filter((c) => isValidChartConfig(c) && validDatasets.some((d) => d.id === c.datasetId));

      // 3. Fetch filters
      const allFilters = await db.filters.toArray();
      const validFiltersMap: Record<string, FilterState> = {};
      allFilters.forEach((f) => {
        if (isValidFilterState(f.state)) {
          validFiltersMap[f.datasetId] = f.state;
        }
      });

      // 4. Fetch UI preferences
      const preferences = await db.uiState.toArray();
      const prefs: Record<string, any> = {};
      preferences.forEach((p) => {
        if (isValidUIState(p.key, p.value)) {
          prefs[p.key] = p.value;
        }
      });

      // Fetch dashboards
      const allDashboards = await db.dashboards.toArray();
      const validDashboards = allDashboards.filter(isValidDashboard);

      // 5. Hydrate datasetStore
      const evaluatedDatasets = validDatasets.map(d => formulaEngine.evaluateCalculatedFields(d));
      useDatasetStore.setState({
        datasets: evaluatedDatasets
      });

      // 6. Hydrate chartStore
      useChartStore.setState({
        charts: validCharts
      });

      // Hydrate dashboardStore
      useDashboardStore.setState({
        dashboards: validDashboards
      });

      // 7. Restore active dashboard or active dataset
      const activeDashboardId = prefs["activeDashboardId"];
      const activeDashboard = validDashboards.find((d) => d.id === activeDashboardId);
      
      if (activeDashboard) {
        useDashboardStore.setState({ activeDashboardId: activeDashboard.id });
        const activeDataset = evaluatedDatasets.find((d) => d.id === activeDashboard.datasetId);
        if (activeDataset) {
          useDatasetStore.setState({ activeDataset });
          const filterState = activeDashboard.settings?.filterState || {
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
          
          const filteredData = queryEngine.execute(activeDataset, query).rows;
          useFilterStore.setState({ activeFilters: filterState, filteredData });
        } else {
          useDatasetStore.setState({ activeDataset: null });
          useFilterStore.setState({ filteredData: [], activeFilters: { categoricalFilters: {}, dateRangeFilters: {} } });
        }
      } else {
        const activeDatasetId = prefs["activeDatasetId"];
        const activeDataset = evaluatedDatasets.find((d) => d.id === activeDatasetId);
        if (activeDataset) {
          useDatasetStore.setState({ activeDataset });
          // Hydrate active filters
          const activeFilters = validFiltersMap[activeDataset.id];
          if (activeFilters) {
            const query: Query = {
              filters: {
                categoricalFilters: activeFilters.categoricalFilters,
                dateRangeFilters: activeFilters.dateRangeFilters,
              },
              groupBy: activeFilters.groupByColumn ? {
                column: activeFilters.groupByColumn,
                period: activeFilters.groupByPeriod,
              } : undefined,
              pagination: {
                pageSize: 'all',
              }
            };
            
            const filteredData = queryEngine.execute(activeDataset, query).rows;
            useFilterStore.setState({ activeFilters, filteredData });
          } else {
            useFilterStore.setState({ filteredData: activeDataset.data });
          }
        }
      }

      // 8. Hydrate uiStore preferences
      if (prefs["theme"]) {
        useUiStore.setState({ theme: prefs["theme"] });
        if (prefs["theme"] === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
      if (prefs["activeView"]) {
        useUiStore.setState({ activeView: prefs["activeView"] });
      }
      if (prefs["showWelcome"] !== undefined) {
        useUiStore.setState({ showWelcome: prefs["showWelcome"] });
      }

      // Trigger hydration readiness
      useUiStore.setState({ isHydrated: true });
    } catch (error) {
      console.error("Hydration failed, falling back to clean memory state:", error);
      toast({
        title: "Offline Sync Disabled",
        description: "IndexedDB is blocked or unavailable. Running in memory-only mode.",
        variant: "destructive"
      });
      useUiStore.setState({ isHydrated: true });
    } finally {
      clearTimeout(hydrationTimeout);
      this.isHydrating = false;
    }
  },

  subscribeToStoreUpdates() {
    const debounceFilters = createDebouncer(250);
    const debounceCharts = createDebouncer(300);
    const debounceDashboards = createDebouncer(300);

    let lastActiveDatasetId = useDatasetStore.getState().activeDataset?.id;
    let lastDatasets = useDatasetStore.getState().datasets;
    let lastFilters = useFilterStore.getState().activeFilters;
    let lastCharts = useChartStore.getState().charts;
    let lastTheme = useUiStore.getState().theme;
    let lastActiveView = useUiStore.getState().activeView;
    let lastShowWelcome = useUiStore.getState().showWelcome;
    let lastDashboards = useDashboardStore.getState().dashboards;
    let lastActiveDashboardId = useDashboardStore.getState().activeDashboardId;

    // Watch datasetStore
    useDatasetStore.subscribe(async (state) => {
      if (this.isHydrating) return;

      const currentActiveDatasetId = state.activeDataset?.id;
      if (currentActiveDatasetId !== lastActiveDatasetId) {
        lastActiveDatasetId = currentActiveDatasetId;
        try {
          await db.uiState.put({ key: "activeDatasetId", value: currentActiveDatasetId || null });
        } catch (e) {
          console.error("Failed to save activeDatasetId:", e);
        }

        // De-select active dashboard if switching to a different dataset
        const activeDashboardId = useDashboardStore.getState().activeDashboardId;
        if (activeDashboardId) {
          const activeDashboard = useDashboardStore.getState().dashboards.find(d => d.id === activeDashboardId);
          if (activeDashboard && activeDashboard.datasetId !== currentActiveDatasetId) {
            useDashboardStore.setState({ activeDashboardId: null });
          }
        }

        // Restore pivot configuration for the new active dataset
        if (currentActiveDatasetId) {
          try {
            const pref = await db.uiState.get(`pivotConfig::${currentActiveDatasetId}`);
            if (pref && pref.value) {
              usePivotStore.setState({ pivotConfig: pref.value });
            } else {
              usePivotStore.setState({ pivotConfig: null });
            }
          } catch (e) {
            console.error("Failed to load pivot config:", e);
            usePivotStore.setState({ pivotConfig: null });
          }
        } else {
          usePivotStore.setState({ pivotConfig: null });
        }

        if (state.activeDataset) {
          try {
            const filterRecord = await db.filters.get(state.activeDataset.id);
            if (filterRecord && isValidFilterState(filterRecord.state)) {
              const activeDataset = state.activeDataset;
              const activeFilters = filterRecord.state;
              
              const query: Query = {
                filters: {
                  categoricalFilters: activeFilters.categoricalFilters,
                  dateRangeFilters: activeFilters.dateRangeFilters,
                },
                groupBy: activeFilters.groupByColumn ? {
                  column: activeFilters.groupByColumn,
                  period: activeFilters.groupByPeriod,
                } : undefined,
                pagination: {
                  pageSize: 'all',
                }
              };
              
              const filteredData = queryEngine.execute(activeDataset, query).rows;
              useFilterStore.setState({ activeFilters, filteredData });
            } else {
              useFilterStore.setState({
                activeFilters: {
                  categoricalFilters: {},
                  dateRangeFilters: {},
                },
                filteredData: state.activeDataset.data
              });
            }
          } catch (e) {
            console.error("Failed to retrieve dataset filters from DB:", e);
          }
        }
      }

      if (state.datasets !== lastDatasets) {
        lastDatasets = state.datasets;
        try {
          await db.datasets.clear();
          await db.datasets.bulkAdd(state.datasets);
        } catch (e) {
          console.error("Failed to sync datasets to DB:", e);
        }
      }
    });

    // Watch filterStore
    useFilterStore.subscribe((state) => {
      if (this.isHydrating) return;

      const activeDataset = useDatasetStore.getState().activeDataset;
      if (activeDataset && state.activeFilters !== lastFilters) {
        lastFilters = state.activeFilters;

        // If a dashboard is active, auto-update its filter state
        const activeDashboardId = useDashboardStore.getState().activeDashboardId;
        if (activeDashboardId) {
          const activeDashboard = useDashboardStore.getState().dashboards.find(d => d.id === activeDashboardId);
          if (activeDashboard) {
            const updatedSettings = {
              ...activeDashboard.settings,
              filterState: state.activeFilters
            };
            useDashboardStore.getState().saveDashboard(activeDashboardId, { settings: updatedSettings });
          }
        }

        debounceFilters(async () => {
          try {
            await db.filters.put({
              datasetId: activeDataset.id,
              state: state.activeFilters
            });
          } catch (e) {
            console.error("Failed to sync filters to DB:", e);
          }
        });
      }
    });

    // Watch chartStore
    useChartStore.subscribe((state) => {
      if (this.isHydrating) return;

      if (state.charts !== lastCharts) {
        lastCharts = state.charts;

        // Chart Lifecycle Safety: Clean up deleted charts from all dashboards
        const { dashboards, saveDashboard } = useDashboardStore.getState();
        const allChartIds = new Set(state.charts.map((c) => c.id));

        dashboards.forEach((dashboard) => {
          const hasMissingCharts = dashboard.chartIds.some((id) => !allChartIds.has(id));
          if (hasMissingCharts) {
            const updatedChartIds = dashboard.chartIds.filter((id) => allChartIds.has(id));
            const updatedLayout = (dashboard.layout || []).filter((item) => allChartIds.has(item.i));
            saveDashboard(dashboard.id, {
              chartIds: updatedChartIds,
              layout: updatedLayout,
            });
          }
        });

        debounceCharts(async () => {
          try {
            await db.charts.clear();
            await db.charts.bulkAdd(state.charts);
          } catch (e) {
            console.error("Failed to sync charts to DB:", e);
          }
        });
      }
    });

    // Watch dashboardStore
    useDashboardStore.subscribe((state) => {
      if (this.isHydrating) return;

      if (state.dashboards !== lastDashboards) {
        lastDashboards = state.dashboards;
        debounceDashboards(async () => {
          try {
            await db.dashboards.clear();
            await db.dashboards.bulkAdd(state.dashboards);
          } catch (e) {
            console.error("Failed to sync dashboards to DB:", e);
          }
        });
      }

      if (state.activeDashboardId !== lastActiveDashboardId) {
        lastActiveDashboardId = state.activeDashboardId;
        (async () => {
          try {
            await db.uiState.put({ key: "activeDashboardId", value: state.activeDashboardId });
          } catch (e) {
            console.error("Failed to sync activeDashboardId to DB:", e);
          }
        })();
      }
    });

    // Watch uiStore
    useUiStore.subscribe(async (state) => {
      if (this.isHydrating) return;

      if (state.theme !== lastTheme) {
        lastTheme = state.theme;
        try {
          await db.uiState.put({ key: "theme", value: state.theme });
        } catch (e) {
          console.error("Failed to sync theme preference:", e);
        }
      }
      if (state.activeView !== lastActiveView) {
        lastActiveView = state.activeView;
        try {
          await db.uiState.put({ key: "activeView", value: state.activeView });
        } catch (e) {
          console.error("Failed to sync activeView preference:", e);
        }
      }
      if (state.showWelcome !== lastShowWelcome) {
        lastShowWelcome = state.showWelcome;
        try {
          await db.uiState.put({ key: "showWelcome", value: state.showWelcome });
        } catch (e) {
          console.error("Failed to sync showWelcome preference:", e);
        }
      }
    });

    // Watch pivotStore
    usePivotStore.subscribe((state) => {
      if (this.isHydrating) return;
      const activeDataset = useDatasetStore.getState().activeDataset;
      if (activeDataset) {
        db.uiState.put({
          key: `pivotConfig::${activeDataset.id}`,
          value: state.pivotConfig
        }).catch(e => console.error("Failed to sync pivot config:", e));
      }
    });
  }
};
