import Dexie, { type Table } from "dexie";
import { db, toStoredDataset, toRowChunk, fromStoredDataset, type DatasetRowChunk } from "@/shared/lib/db";
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
  isValidDashboard,
  type ValidatedUIState
} from "@/shared/utils/validators";
import { Dataset, ChartConfig, Dashboard, FilterState, Query } from "@/shared/types";
import { queryEngine } from "@/shared/services/queryEngine";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { windowEngine } from "@/shared/services/window";
import type { PivotConfig } from "@/shared/services/pivot";
import { toast } from "@/shared/hooks/use-toast";

function createDebouncer(delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;
  const debounce = (callback: () => void) => {
    if (timer) clearTimeout(timer);
    pending = callback;
    timer = setTimeout(() => {
      timer = null;
      const run = pending;
      pending = null;
      run?.();
    }, delay);
  };
  /** Runs the waiting callback now (page hidden / closing, tests). */
  debounce.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const run = pending;
    pending = null;
    run?.();
  };
  return debounce;
}

/** Row saves wait this long so a burst of changes (two quick toggles) is written once. */
const ROW_SAVE_DELAY_MS = 500;

/** Promises of writes still running, so whenIdle() can wait for them. */
const inFlight = new Set<Promise<unknown>>();
function track<T>(p: Promise<T>): Promise<T> {
  inFlight.add(p);
  p.finally(() => inFlight.delete(p)).catch(() => {});
  return p;
}

const rowsRevision = (d: Dataset) => d.rowsRevision ?? 0;

/**
 * Keeps the `datasets` (metadata) and `datasetRows` (row chunks) tables in step with
 * datasetStore, writing only what changed:
 * - metadata-only change (rename, type override, notice dismissed): one small put, no rows;
 * - rows changed (`rowsRevision` differs from what is on disk or queued): after
 *   ROW_SAVE_DELAY_MS, one transaction that puts every chunk one at a time, deletes chunks
 *   past the new end and puts the metadata. A reload mid-save aborts the transaction, so
 *   the old version survives whole;
 * - removed dataset: its metadata and chunks, in one transaction.
 * All writes run one after another on a single queue. While a dataset has a row save
 * waiting, its metadata is only written by that save, never alone: metadata from the new
 * version next to rows from the old one is the mix a reload must not see.
 */
function createDatasetSync() {
  /** Revision of the rows on disk, per dataset id. */
  const onDisk = new Map<string, number>();
  /** Revision on disk or waiting to be written. */
  const target = new Map<string, number>();
  /** Ids with a row save waiting for the debounce. */
  const dirty = new Set<string>();
  const debounce = createDebouncer(ROW_SAVE_DELAY_MS);
  let queue: Promise<void> = Promise.resolve();

  const latest = (id: string) => useDatasetStore.getState().datasets.find((d) => d.id === id);

  function enqueue(job: () => Promise<void>) {
    queue = queue.then(job).catch((e) => console.error("Dataset save job failed:", e));
    track(queue);
  }

  async function saveMetadata(id: string) {
    const d = latest(id);
    if (!d || dirty.has(id) || onDisk.get(id) !== rowsRevision(d)) return;
    try {
      await db.datasets.put(toStoredDataset(d));
    } catch (e) {
      reportSyncFailure(`Dataset "${d.name}"`, e);
    }
  }

  async function saveRows(id: string) {
    const d = latest(id);
    if (!d) return;
    const stored = toStoredDataset(d);
    target.set(id, rowsRevision(d));
    try {
      await db.transaction("rw", db.datasets, db.datasetRows, async () => {
        // One put per chunk, awaited in turn: each is its own structured clone, so the
        // main thread is free between them (bulkPut would clone them all in one go).
        for (let i = 0; i < stored.chunkCount; i++) {
          await db.datasetRows.put(toRowChunk(d, i));
        }
        await db.datasetRows
          .where("[datasetId+index]")
          .between([id, stored.chunkCount], [id, Dexie.maxKey], true, true)
          .delete();
        await db.datasets.put(stored);
      });
      onDisk.set(id, rowsRevision(d));
    } catch (e) {
      // Nothing was written (the transaction aborted). Forget the target so the next
      // change to this dataset tries the rows again.
      target.delete(id);
      reportSyncFailure(`Dataset "${d.name}"`, e);
    }
  }

  async function remove(id: string) {
    onDisk.delete(id);
    try {
      await db.transaction("rw", db.datasets, db.datasetRows, async () => {
        await db.datasets.delete(id);
        await db.datasetRows
          .where("[datasetId+index]")
          .between([id, Dexie.minKey], [id, Dexie.maxKey], true, true)
          .delete();
      });
    } catch (e) {
      console.error(`Failed to delete dataset ${id} from DB:`, e);
    }
  }

  function flushRows() {
    for (const id of [...dirty]) {
      dirty.delete(id);
      enqueue(() => saveRows(id));
    }
  }

  return {
    /** Datasets just loaded from disk: their rows are there at their current revision. */
    seed(datasets: Dataset[]) {
      for (const d of datasets) {
        onDisk.set(d.id, rowsRevision(d));
        target.set(d.id, rowsRevision(d));
      }
    },
    onChange(next: Dataset[], prev: Dataset[]) {
      const prevById = new Map(prev.map((d) => [d.id, d]));
      const nextIds = new Set(next.map((d) => d.id));
      for (const id of prevById.keys()) {
        if (nextIds.has(id)) continue;
        dirty.delete(id);
        target.delete(id);
        enqueue(() => remove(id));
      }
      for (const d of next) {
        if (prevById.get(d.id) === d) continue;
        if (target.get(d.id) !== rowsRevision(d)) {
          target.set(d.id, rowsRevision(d));
          dirty.add(d.id);
          debounce(flushRows);
        } else if (!dirty.has(d.id)) {
          enqueue(() => saveMetadata(d.id));
        }
      }
    },
    flush: () => debounce.flush(),
  };
}

/**
 * Keeps one keyed table (charts, dashboards) in step with a store array: after `delay`,
 * puts the records whose object changed since the last write and deletes the ones that
 * are gone, in one transaction. Writes run one after another.
 */
function createRecordSync<T extends { id: string }>(label: string, table: () => Table<T, string>, delay: number) {
  const onDisk = new Map<string, T>();
  const debounce = createDebouncer(delay);
  let latestItems: T[] | null = null;
  let queue: Promise<void> = Promise.resolve();

  async function write() {
    const items = latestItems;
    latestItems = null;
    if (!items) return;
    const ids = new Set(items.map((i) => i.id));
    const puts = items.filter((i) => onDisk.get(i.id) !== i);
    const deletes = [...onDisk.keys()].filter((id) => !ids.has(id));
    if (puts.length === 0 && deletes.length === 0) return;
    try {
      await db.transaction("rw", table(), async () => {
        if (deletes.length > 0) await table().bulkDelete(deletes);
        if (puts.length > 0) await table().bulkPut(puts);
      });
      deletes.forEach((id) => onDisk.delete(id));
      puts.forEach((i) => onDisk.set(i.id, i));
    } catch (e) {
      reportSyncFailure(label, e);
    }
  }

  return {
    /** Records just loaded from disk (including ones hydrate left out as invalid). */
    seed(items: T[]) {
      onDisk.clear();
      items.forEach((i) => onDisk.set(i.id, i));
    },
    schedule(items: T[]) {
      latestItems = items;
      debounce(() => {
        queue = queue.then(write);
        track(queue);
      });
    },
    flush: () => debounce.flush(),
  };
}

async function restorePivotConfig(datasetId: string | null | undefined) {
  if (!datasetId) {
    usePivotStore.setState({ pivotConfig: null });
    return;
  }
  try {
    const pref = await db.uiState.get(`pivotConfig::${datasetId}`);
    // uiState values are untyped storage; this key is only ever written by the pivot
    // store's own persistence below, with a PivotConfig.
    usePivotStore.setState({ pivotConfig: (pref && (pref.value as PivotConfig)) || null });
  } catch (e) {
    console.error("Failed to load pivot config:", e);
    usePivotStore.setState({ pivotConfig: null });
  }
}

function isQuotaExceededError(e: unknown): boolean {
  const name = (e as { name?: string } | undefined)?.name;
  const innerName = (e as { inner?: { name?: string } } | undefined)?.inner?.name;
  return name === "QuotaExceededError" || innerName === "QuotaExceededError";
}

function reportSyncFailure(what: string, e: unknown) {
  console.error(`Failed to sync ${what} to DB:`, e);
  if (isQuotaExceededError(e)) {
    toast({
      title: "Storage full: changes not saved",
      description: `${what} could not be saved because this browser's storage for the site is full. Your work is still open in this tab but is not saved: reloading or closing the tab will lose it (the last saved copy is unchanged). To free space, delete datasets or charts you no longer need, or clear other sites' data in your browser settings, then make any change to save again.`,
      variant: "destructive"
    });
  } else {
    toast({
      title: "Sync Failed",
      description: `${what} could not be saved to local storage. Your work is still open in this tab but is not saved and may be lost on reload; the last saved copy is unchanged.`,
      variant: "destructive"
    });
  }
}

/**
 * Datasets persisted before ColumnMetadata.allIntegerValues existed load without it.
 * Recompute it from the dataset's own rows so the "might be categorical" heuristic
 * (src/shared/utils/columnType.ts) doesn't have to special-case a missing field beyond
 * its existing fail-closed default. No-ops (returns the dataset unchanged) if metadata
 * is absent or every column already has the field.
 */
function backfillAllIntegerValues(dataset: Dataset): Dataset {
  if (!dataset.metadata) return dataset;
  const needsBackfill = dataset.metadata.columns.some((c) => c.allIntegerValues === undefined);
  if (!needsBackfill) return dataset;

  return {
    ...dataset,
    metadata: {
      ...dataset.metadata,
      columns: dataset.metadata.columns.map((col) => {
        if (col.allIntegerValues !== undefined) return col;
        if (col.inferredDataType !== 'numeric') return { ...col, allIntegerValues: false };
        const allIntegers = dataset.data.every((row) => {
          const val = row[col.name];
          return val === null || val === undefined || (typeof val === 'number' && Number.isInteger(val));
        });
        return { ...col, allIntegerValues: allIntegers };
      }),
    },
  };
}

async function loadDatasets(): Promise<{ datasets: Dataset[] }> {
  const stored = await db.datasets.toArray();
  const datasets: Dataset[] = [];
  for (const s of stored) {
    // Chunk by chunk inside one read transaction: a consistent snapshot, and each chunk is
    // its own structured clone, so no single main-thread block covers all the rows.
    const chunks = await db.transaction("r", db.datasetRows, async () => {
      const out: (DatasetRowChunk | undefined)[] = [];
      for (let i = 0; i < (s.chunkCount ?? 0); i++) {
        out.push(await db.datasetRows.get([s.id, i]));
      }
      return out;
    });
    const dataset = fromStoredDataset(s, chunks);
    if (dataset) datasets.push(dataset);
    else console.error(`Dataset ${s.id} has missing row chunks; skipped.`);
  }
  return { datasets };
}

const datasetSync = createDatasetSync();
const chartSync = createRecordSync<ChartConfig>("Charts", () => db.charts, 300);
const dashboardSync = createRecordSync<Dashboard>("Dashboards", () => db.dashboards, 300);
const debounceFilters = createDebouncer(250);

/** What the subscribers compare against; reset at the end of hydrate. */
const last = {
  activeDatasetId: undefined as string | undefined,
  filters: undefined as FilterState | undefined,
  theme: undefined as unknown,
  activeView: undefined as unknown,
  showWelcome: undefined as unknown,
  activeDashboardId: undefined as string | null | undefined,
};

function seedBaselines() {
  last.activeDatasetId = useDatasetStore.getState().activeDataset?.id;
  last.filters = useFilterStore.getState().activeFilters;
  last.theme = useUiStore.getState().theme;
  last.activeView = useUiStore.getState().activeView;
  last.showWelcome = useUiStore.getState().showWelcome;
  last.activeDashboardId = useDashboardStore.getState().activeDashboardId;
}

export const persistenceService = {
  isHydrating: false,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    seedBaselines();
    this.hydrate();
    this.subscribeToStoreUpdates();
    this.flushOnPageHide();
  },

  /** Starts every waiting (debounced) write now. */
  flush() {
    debounceFilters.flush();
    datasetSync.flush();
    chartSync.flush();
    dashboardSync.flush();
  },

  /** Flushes, then resolves once every write has finished (tests, e2e helpers). */
  async whenIdle() {
    this.flush();
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight]);
      this.flush();
    }
  },

  flushOnPageHide() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    // Best effort: the browser may close the page before these writes finish.
    window.addEventListener("pagehide", () => this.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush();
    });
  },

  async hydrate() {
    if (this.isHydrating) return;
    this.isHydrating = true;
    let hydratedState: { datasets: Dataset[]; charts: ChartConfig[]; dashboards: Dashboard[] } | null = null;

    // Timeout fallback (4s): unlock the UI so it doesn't stay stuck on the
    // loading screen. Deliberately does NOT clear `isHydrating` — that guard
    // must only drop in the `finally` below, once hydrate()'s own reads/writes
    // have actually finished. Clearing it here would let write-subscribers
    // fire (and clear+rewrite tables) while hydrate() is still reading from
    // them.
    const hydrationTimeout = setTimeout(() => {
      console.warn("Hydration timed out. Unlocking UI with defaults.");
      useUiStore.setState({ isDataHydrated: true });
    }, 4000);

    try {
      // 1. Fetch datasets (metadata records + their row chunks)
      const { datasets: allDatasets } = await loadDatasets();
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
      // Only entries that passed isValidUIState are stored, so the known keys carry the
      // types that validator enforces.
      const prefs: Partial<ValidatedUIState> & Record<string, unknown> = {};
      preferences.forEach((p) => {
        if (isValidUIState(p.key, p.value)) {
          prefs[p.key] = p.value;
        }
      });

      // Fetch dashboards
      const allDashboards = await db.dashboards.toArray();
      const validDashboards = allDashboards.filter(isValidDashboard);

      // 5. Hydrate datasetStore
      // Re-run BOTH formulaEngine and windowEngine here, not just formulaEngine — this is
      // the sole bridge from persisted (IndexedDB) data into a live session, so it's the
      // one place a defensive re-evaluation is worth its cost: it self-heals any dataset
      // that was persisted with calculatedFields/windowQueries defined but without their
      // materialized columns (e.g. from before this fix, or from any future bypass that
      // writes datasets[] directly). windowEngine.evaluate no-ops for datasets with no
      // window queries, so this is free for the common case.
      const evaluatedDatasets = validDatasets
        .map(backfillAllIntegerValues)
        .map(d => windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(d)));
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
          await restorePivotConfig(activeDataset.id);
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
          await restorePivotConfig(activeDataset.id);
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

      // What is on disk now; the subscribers write only differences from here.
      datasetSync.seed(evaluatedDatasets);
      chartSync.seed(allCharts);
      dashboardSync.seed(allDashboards);
      seedBaselines();
      hydratedState = { datasets: evaluatedDatasets, charts: validCharts, dashboards: validDashboards };

      // Trigger hydration readiness (real IndexedDB load complete)
      useUiStore.setState({ isDataHydrated: true });
    } catch (error) {
      console.error("Hydration failed, falling back to clean memory state:", error);
      toast({
        title: "Offline Sync Disabled",
        description: "IndexedDB is blocked or unavailable. Running in memory-only mode.",
        variant: "destructive"
      });
      useUiStore.setState({ isDataHydrated: true });
    } finally {
      clearTimeout(hydrationTimeout);
      this.isHydrating = false;
    }

    // Changes made while hydrating (after the 4 s timeout unlocked the UI) were skipped by
    // the subscribers; write them now.
    if (hydratedState) {
      const { datasets, charts, dashboards } = hydratedState;
      if (useDatasetStore.getState().datasets !== datasets) datasetSync.onChange(useDatasetStore.getState().datasets, datasets);
      if (useChartStore.getState().charts !== charts) chartSync.schedule(useChartStore.getState().charts);
      if (useDashboardStore.getState().dashboards !== dashboards) dashboardSync.schedule(useDashboardStore.getState().dashboards);
    }
  },

  async onActiveDatasetChange(activeDataset: Dataset | null) {
    const currentActiveDatasetId = activeDataset?.id;
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
    await restorePivotConfig(currentActiveDatasetId);

    if (activeDataset) {
      try {
        const filterRecord = await db.filters.get(activeDataset.id);
        if (filterRecord && isValidFilterState(filterRecord.state)) {
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
            filteredData: activeDataset.data
          });
        }
      } catch (e) {
        console.error("Failed to retrieve dataset filters from DB:", e);
      }
    }
  },

  subscribeToStoreUpdates() {
    // Watch datasetStore
    useDatasetStore.subscribe((state, prev) => {
      if (this.isHydrating) return;

      // Decide what to write synchronously, before any await, so two quick changes are
      // compared in order.
      if (state.datasets !== prev.datasets) {
        datasetSync.onChange(state.datasets, prev.datasets);
      }

      const currentActiveDatasetId = state.activeDataset?.id;
      if (currentActiveDatasetId !== last.activeDatasetId) {
        last.activeDatasetId = currentActiveDatasetId;
        void track(this.onActiveDatasetChange(state.activeDataset));
      }
    });

    // Watch filterStore
    useFilterStore.subscribe((state) => {
      if (this.isHydrating) return;

      const activeDataset = useDatasetStore.getState().activeDataset;
      if (activeDataset && state.activeFilters !== last.filters) {
        last.filters = state.activeFilters;

        // If a dashboard is active, auto-update its filter state
        const activeDashboardId = useDashboardStore.getState().activeDashboardId;
        if (activeDashboardId) {
          const activeDashboard = useDashboardStore.getState().dashboards.find(d => d.id === activeDashboardId);
          if (activeDashboard) {
            const updatedSettings = {
              ...activeDashboard.settings,
              filterState: state.activeFilters
            };
            // Filter changes fire rapidly (e.g. dragging a date-range slider); debounce
            // the undo/redo history push the same way layout drags are, so filter noise
            // doesn't evict genuinely undo-worthy actions from MAX_HISTORY.
            useDashboardStore.getState().saveDashboard(activeDashboardId, { settings: updatedSettings }, true);
          }
        }

        debounceFilters(() => {
          track(db.filters.put({
            datasetId: activeDataset.id,
            state: state.activeFilters
          })).catch((e) => console.error("Failed to sync filters to DB:", e));
        });
      }
    });

    // Watch chartStore
    useChartStore.subscribe((state, prev) => {
      if (this.isHydrating) return;

      if (state.charts !== prev.charts) {
        // Chart Lifecycle Safety: Clean up deleted charts from all dashboards
        const { dashboards, saveDashboard } = useDashboardStore.getState();
        const allChartIds = new Set(state.charts.map((c) => c.id));

        dashboards.forEach((dashboard) => {
          const hasMissingCharts = dashboard.chartIds.some((id) => !allChartIds.has(id));
          if (hasMissingCharts) {
            const updatedChartIds = dashboard.chartIds.filter((id) => allChartIds.has(id));
            const updatedLayout = (dashboard.layout || []).filter((item) => {
              const isKpiCard = (dashboard.kpiIds || []).includes(item.i);
              return isKpiCard || allChartIds.has(item.i);
            });
            saveDashboard(dashboard.id, {
              chartIds: updatedChartIds,
              layout: updatedLayout,
            });
          }
        });

        chartSync.schedule(state.charts);
      }
    });

    // Watch dashboardStore
    useDashboardStore.subscribe((state, prev) => {
      if (this.isHydrating) return;

      if (state.dashboards !== prev.dashboards) {
        dashboardSync.schedule(state.dashboards);
      }

      if (state.activeDashboardId !== last.activeDashboardId) {
        last.activeDashboardId = state.activeDashboardId;
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

      if (state.theme !== last.theme) {
        last.theme = state.theme;
        try {
          await db.uiState.put({ key: "theme", value: state.theme });
        } catch (e) {
          console.error("Failed to sync theme preference:", e);
        }
      }
      if (state.activeView !== last.activeView) {
        last.activeView = state.activeView;
        try {
          await db.uiState.put({ key: "activeView", value: state.activeView });
        } catch (e) {
          console.error("Failed to sync activeView preference:", e);
        }
      }
      if (state.showWelcome !== last.showWelcome) {
        last.showWelcome = state.showWelcome;
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
        track(db.uiState.put({
          key: `pivotConfig::${activeDataset.id}`,
          value: state.pivotConfig
        })).catch(e => console.error("Failed to sync pivot config:", e));
      }
    });
  }
};
