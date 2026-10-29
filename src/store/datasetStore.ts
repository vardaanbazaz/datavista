import { create } from "zustand";
import { Dataset, CalculatedField, WindowQuery, DataRow, DatasetMetadata } from "@/shared/types";
import { useUiStore } from "./uiStore";
import { useFilterStore } from "./filterStore";
import { useChartStore } from "./chartStore";
import { toast } from "@/shared/hooks/use-toast";
import { db } from "@/shared/lib/db";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { windowEngine } from "@/shared/services/window";
import { queryCache } from "@/shared/services/optimizer";
import { reparseDateColumn } from "@/shared/services/parsingService";
import { perfMark, perfMeasure } from "@/shared/lib/perfMarks";
import { loadPendingRows } from "@/shared/services/datasetRows";

/** A dataset whose rows are being read from disk (datasetStore.loadRows). */
export interface RowsLoading {
  datasetId: string;
  name: string;
  loadedRows: number;
  totalRows: number;
}

interface DatasetState {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  /** Set while a dataset left on disk at startup is being loaded. */
  rowsLoading: RowsLoading | null;
  /**
   * The dataset with its rows: as is when loaded, read from disk (with progress in
   * `rowsLoading`) when it was left there at startup. Null if it's gone or its rows are missing.
   */
  loadRows: (datasetId: string) => Promise<Dataset | null>;
  setDatasets: (datasets: Dataset[]) => void;
  setActiveDataset: (dataset: Dataset | null) => void;
  uploadDataset: (dataset: Dataset) => Promise<void>;
  updateDatasetData: (
    datasetId: string,
    newRawData: DataRow[],
    newMetadata?: DatasetMetadata,
    newColumnTypes?: Record<string, "numeric" | "categorical" | "date">,
    newColumns?: string[],
    newDateSourceValues?: Dataset["dateSourceValues"]
  ) => void;
  selectDataset: (dataset: Dataset) => void;
  renameDataset: (id: string, newName: string) => void;
  deleteDataset: (id: string) => void;
  addCalculatedField: (fieldName: string, expression: string) => void;
  deleteCalculatedField: (fieldName: string) => void;
  addWindowQuery: (query: WindowQuery) => void;
  deleteWindowQuery: (alias: string) => void;
  setColumnTypeOverride: (columnName: string, overrideType: 'numeric' | 'categorical' | 'date' | null) => void;
  /** Re-reads a date column's numeric D/M values day-first or month-first (parsingService.reparseDateColumn). */
  setDateDayFirst: (columnName: string, dayFirst: boolean) => void;
  /** Hides the "re-import for correct dates" notice for this dataset, for good. */
  dismissDateReimportNotice: (datasetId: string) => void;
}

/** Marks a dataset's cell values as changed, so persistence rewrites its rows. */
function withNewRows(dataset: Dataset): Dataset {
  return { ...dataset, rowsRevision: (dataset.rowsRevision ?? 0) + 1 };
}

/** One read per dataset at a time; a second request waits for the first. */
const rowLoads = new Map<string, Promise<Dataset | null>>();
/** The dataset the user picked last, so a slower load that finishes later doesn't take over. */
let lastSelectedId: string | null = null;

export const useDatasetStore = create<DatasetState>((set, get) => {
  /**
   * Shared commit path for actions that mutate the active dataset's calculatedFields or
   * windowQueries (addCalculatedField, deleteCalculatedField, addWindowQuery,
   * deleteWindowQuery). Runs the updater, re-evaluates (formulaEngine then windowEngine),
   * and writes the SAME evaluated result to both `datasets[]` and `activeDataset`.
   *
   * This exists because all four call sites independently had the identical bug: they
   * computed `evaluated` correctly for `activeDataset` but wrote the pre-evaluation
   * `updatedDataset` into `datasets[]` instead (a one-word copy-paste mistake, repeated
   * four times). Any code that later re-selects activeDataset from the raw `datasets[]`
   * array (persistenceService.hydrate, dashboardStore.loadDashboard/restoreExternalContext,
   * snapshotStore — see docs/INVESTIGATION-item3-window-pivot-zeroing-2026-09-14.md and the
   * 2026-09-14 comprehensive audit) inherited that staleness — window/calculated columns
   * silently zeroed out. Funneling all four through one function means there's only one
   * place left to get this right, instead of four.
   *
   * `changesRows: false` is for updates that leave every stored cell value as it was (type
   * overrides): the re-evaluation may rebuild `data`, but with the same values, so
   * `rowsRevision` stays and persistence writes only the metadata.
   */
  function applyActiveDatasetUpdate(
    updater: (dataset: Dataset) => Dataset,
    { changesRows = true }: { changesRows?: boolean } = {}
  ): Dataset | null {
    const { activeDataset, datasets } = get();
    if (!activeDataset) return null;

    const updated = updater(activeDataset);
    const updatedDataset = changesRows && updated !== activeDataset ? withNewRows(updated) : updated;

    queryCache.invalidate(activeDataset.id);
    const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(updatedDataset));
    const updatedDatasets = datasets.map(d => (d.id === activeDataset.id ? evaluated : d));

    set({
      datasets: updatedDatasets,
      activeDataset: evaluated,
    });

    useFilterStore.getState().setFilteredData(evaluated.data);

    return evaluated;
  }

  /** Makes a loaded dataset the active one (the shared tail of selectDataset). */
  function activate(dataset: Dataset) {
    const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(dataset));
    set({ activeDataset: evaluated });
    useFilterStore.getState().setFilteredData(evaluated.data);
    useFilterStore.getState().resetFilters();
  }

  return {
  datasets: [],
  activeDataset: null,
  rowsLoading: null,

  loadRows: (datasetId) => {
    const current = get().datasets.find((d) => d.id === datasetId);
    if (!current) return Promise.resolve(null);
    if (!current.rowsPending) return Promise.resolve(current);
    const running = rowLoads.get(datasetId);
    if (running) return running;

    const totalRows = current.rowsPending.rowCount;
    set({ rowsLoading: { datasetId, name: current.name, loadedRows: 0, totalRows } });
    const job = loadPendingRows(current, (loadedRows) => {
      if (get().rowsLoading?.datasetId === datasetId) {
        set({ rowsLoading: { datasetId, name: current.name, loadedRows, totalRows } });
      }
    })
      .then((loaded) => {
        // The dataset may have been renamed or deleted while its rows were read.
        const latest = get().datasets.find((d) => d.id === datasetId);
        if (!latest) return null;
        if (!loaded) {
          toast({
            title: "Dataset could not be loaded",
            description: `Saved rows of "${latest.name}" are incomplete.`,
            variant: "destructive",
          });
          return null;
        }
        // Keep a rename made while loading; metadata from the load (it may be re-derived)
        // unless the metadata itself changed meanwhile.
        const merged: Dataset = latest.rowsPending
          ? { ...loaded, name: latest.name, metadata: latest.metadata === current.metadata ? loaded.metadata : latest.metadata }
          : latest;
        if (latest.rowsPending) set({ datasets: get().datasets.map((d) => (d.id === datasetId ? merged : d)) });
        return merged;
      })
      .catch((e) => {
        console.error(`Failed to load rows of dataset ${datasetId}:`, e);
        toast({ title: "Dataset could not be loaded", description: String(e), variant: "destructive" });
        return null;
      })
      .finally(() => {
        rowLoads.delete(datasetId);
        if (get().rowsLoading?.datasetId === datasetId) set({ rowsLoading: null });
      });
    rowLoads.set(datasetId, job);
    return job;
  },
  setDatasets: (datasets) => {
    const evaluated = datasets.map(d => windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(d)));
    set({ datasets: evaluated });
  },
  setActiveDataset: (activeDataset) => {
    const evaluated = activeDataset ? windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(activeDataset)) : null;
    set({ activeDataset: evaluated });
  },
  
  uploadDataset: async (dataset) => {
    useUiStore.getState().setIsLoading(true);
    // Simulate processing time for better UX
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const initialDataset: Dataset = {
      ...dataset,
      version: dataset.version || 1,
      lastUpdated: dataset.lastUpdated || Date.now(),
    };

    const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(initialDataset));
    
    set((state) => ({
      datasets: [...state.datasets, evaluated],
      activeDataset: evaluated,
    }));
    
    // Set derived state/view
    useFilterStore.getState().setFilteredData(evaluated.data);
    useFilterStore.getState().resetFilters();
    useUiStore.getState().setActiveView('overview');
    useUiStore.getState().setIsLoading(false);

    toast({
      title: "Dataset uploaded successfully",
      description: `${dataset.name} with ${dataset.data.length} rows`,
    });
  },

  updateDatasetData: (datasetId, newRawData, newMetadata, newColumnTypes, newColumns, newDateSourceValues) => {
    const { datasets, activeDataset } = get();
    const targetDataset = datasets.find((d) => d.id === datasetId);
    if (!targetDataset) return;

    // Purge optimizer cache so stale aggregations are cleared
    queryCache.invalidate(datasetId);

    const nextVersion = (targetDataset.version || 1) + 1;
    const computedColumns = newColumns || (newMetadata ? newMetadata.columns.map((c) => c.name) : targetDataset.columns);
    const computedTypes = newColumnTypes || targetDataset.columnTypes;

    // Carry a column's manual override forward only if its auto-detected type
    // didn't change across this update; a changed inferred type means the
    // underlying data shape changed enough that a prior override (based on the
    // old shape) shouldn't silently persist — matches schemaDiff's existing
    // treatment of a cross-version type change as breaking.
    const mergedMetadata = newMetadata && targetDataset.metadata
      ? {
          ...newMetadata,
          columns: newMetadata.columns.map((newCol) => {
            const oldCol = targetDataset.metadata!.columns.find((c) => c.name === newCol.name);
            if (oldCol && oldCol.userOverrideType && oldCol.inferredDataType === newCol.inferredDataType) {
              return { ...newCol, userOverrideType: oldCol.userOverrideType };
            }
            // Inferred type changed (or there was no prior override): don't let a stale
            // override survive even if newMetadata's column object happened to carry one
            // (e.g. a caller building newMetadata by spreading the old column list).
            return { ...newCol, userOverrideType: undefined };
          }),
        }
      : newMetadata;

    const updatedDataset: Dataset = {
      ...targetDataset,
      data: newRawData,
      columns: computedColumns,
      columnTypes: computedTypes,
      metadata: mergedMetadata || targetDataset.metadata,
      version: nextVersion,
      lastUpdated: Date.now(),
      calculatedFields: targetDataset.calculatedFields || [],
      windowQueries: targetDataset.windowQueries || [],
      // Original date text belongs to the rows it came with; old text would misalign.
      dateSourceValues: newDateSourceValues,
    };

    const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(withNewRows(updatedDataset)));

    const updatedDatasets = datasets.map((d) => (d.id === datasetId ? evaluated : d));

    const isCurrentlyActive = activeDataset?.id === datasetId;

    set({
      datasets: updatedDatasets,
      activeDataset: isCurrentlyActive ? evaluated : activeDataset,
    });

    if (isCurrentlyActive) {
      useFilterStore.getState().setFilteredData(evaluated.data);
      useFilterStore.getState().resetFilters();
    }

    toast({
      title: "Dataset Updated",
      description: `"${updatedDataset.name}" updated to v${nextVersion} (${newRawData.length} rows).`,
    });
  },
  
  selectDataset: (dataset) => {
    lastSelectedId = dataset.id;
    if (!dataset.rowsPending) {
      activate(dataset);
      return;
    }
    // Rows still on disk: load them (MainContent shows rowsLoading), then switch.
    void get().loadRows(dataset.id).then((loaded) => {
      if (loaded && lastSelectedId === dataset.id) activate(loaded);
    });
  },
  
  renameDataset: (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    
    const { datasets, activeDataset } = get();
    
    // Check if new name already exists
    if (datasets.some(d => d.name.toLowerCase() === trimmed.toLowerCase() && d.id !== id)) {
      toast({
        title: "Rename failed",
        description: "A dataset with this name already exists.",
        variant: "destructive",
      });
      return;
    }
    
    const updatedDatasets = datasets.map(d => 
      d.id === id ? { ...d, name: trimmed } : d
    );
    
    const updatedActive = activeDataset && activeDataset.id === id 
      ? { ...activeDataset, name: trimmed } 
      : activeDataset;
    
    set({
      datasets: updatedDatasets,
      activeDataset: updatedActive
    });
    
    toast({
      title: "Dataset renamed",
      description: `Renamed to "${trimmed}"`,
    });
  },
  
  deleteDataset: (id) => {
    const { datasets, activeDataset } = get();
    const targetDataset = datasets.find(d => d.id === id);
    const updatedDatasets = datasets.filter(d => d.id !== id);
    
    set({ datasets: updatedDatasets });
    
    // Delete associated charts
    useChartStore.getState().deleteDatasetCharts(id);

    // Clean up the dataset's per-id rows in IndexedDB (filters, pivot config) — these
    // aren't covered by the datasets[] table sync in persistenceService, so without this
    // they accumulate forever and could leak into a reused dataset id.
    db.filters.delete(id).catch((e) => console.error("Failed to delete filters for dataset:", e));
    db.uiState.delete(`pivotConfig::${id}`).catch((e) => console.error("Failed to delete pivot config for dataset:", e));

    if (activeDataset && activeDataset.id === id) {
      if (updatedDatasets.length > 0) {
        const nextActive = updatedDatasets[0];
        if (nextActive.rowsPending) {
          set({ activeDataset: null });
          useFilterStore.getState().setFilteredData([]);
          get().selectDataset(nextActive);
        } else {
          set({ activeDataset: nextActive });
          useFilterStore.getState().setFilteredData(nextActive.data);
          useFilterStore.getState().resetFilters();
        }
      } else {
        set({ activeDataset: null });
        useFilterStore.getState().setFilteredData([]);
        useFilterStore.getState().resetFilters();
        useUiStore.getState().setActiveView('upload');
      }
    }

    toast({
      title: "Dataset deleted",
      description: `Removed "${targetDataset?.name || 'Dataset'}"`,
    });
  },

  addCalculatedField: (fieldName, expression) => {
    const calculatedField: CalculatedField = {
      name: fieldName,
      expression,
    };

    const evaluated = applyActiveDatasetUpdate((dataset) => ({
      ...dataset,
      calculatedFields: [
        ...(dataset.calculatedFields || []).filter(f => f.name !== fieldName),
        calculatedField,
      ],
    }));
    if (!evaluated) return;

    toast({
      title: "Calculated field added",
      description: `Field '${fieldName}' has been calculated successfully.`,
    });
  },

  deleteCalculatedField: (fieldName) => {
    const evaluated = applyActiveDatasetUpdate((dataset) => ({
      ...dataset,
      calculatedFields: (dataset.calculatedFields || []).filter(f => f.name !== fieldName),
    }));
    if (!evaluated) return;

    toast({
      title: "Calculated field deleted",
      description: `Field '${fieldName}' has been deleted.`,
    });
  },

  addWindowQuery: (query) => {
    const evaluated = applyActiveDatasetUpdate((dataset) => ({
      ...dataset,
      windowQueries: [
        ...(dataset.windowQueries || []).filter(q => q.alias !== query.alias),
        query,
      ],
    }));
    if (!evaluated) return;

    toast({
      title: "Window function added",
      description: `Window column '${query.alias}' has been defined successfully.`,
    });
  },

  deleteWindowQuery: (alias) => {
    const evaluated = applyActiveDatasetUpdate((dataset) => ({
      ...dataset,
      windowQueries: (dataset.windowQueries || []).filter(q => q.alias !== alias),
    }));
    if (!evaluated) return;

    toast({
      title: "Window function deleted",
      description: `Window column '${alias}' has been deleted.`,
    });
  },

  setColumnTypeOverride: (columnName, overrideType) => {
    // Formula and window evaluation don't read userOverrideType, so no cell value changes.
    applyActiveDatasetUpdate((dataset) => {
      if (!dataset.metadata) return dataset;
      return {
        ...dataset,
        metadata: {
          ...dataset.metadata,
          columns: dataset.metadata.columns.map((c) =>
            c.name === columnName ? { ...c, userOverrideType: overrideType } : c
          ),
        },
      };
    }, { changesRows: false });
  },

  setDateDayFirst: (columnName, dayFirst) => {
    perfMark("date-toggle");
    applyActiveDatasetUpdate((dataset) => reparseDateColumn(dataset, columnName, dayFirst));
    perfMeasure("date-toggle", "date-toggle");
  },

  dismissDateReimportNotice: (datasetId) => {
    const dismiss = (d: Dataset): Dataset =>
      d.id === datasetId && d.metadata
        ? { ...d, metadata: { ...d.metadata, dateReimportNoticeDismissed: true } }
        : d;
    const { datasets, activeDataset } = get();
    set({
      datasets: datasets.map(dismiss),
      activeDataset: activeDataset ? dismiss(activeDataset) : null,
    });
  }
  };
});
