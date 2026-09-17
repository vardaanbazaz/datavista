import { create } from "zustand";
import { Dataset, CalculatedField, WindowQuery, DataRow, DatasetMetadata } from "@/shared/types";
import { useUiStore } from "./uiStore";
import { useFilterStore } from "./filterStore";
import { useChartStore } from "./chartStore";
import { toast } from "@/shared/hooks/use-toast";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { windowEngine } from "@/shared/services/window";
import { queryCache } from "@/shared/services/optimizer";

interface DatasetState {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  setDatasets: (datasets: Dataset[]) => void;
  setActiveDataset: (dataset: Dataset | null) => void;
  uploadDataset: (dataset: Dataset) => Promise<void>;
  updateDatasetData: (
    datasetId: string,
    newRawData: DataRow[],
    newMetadata?: DatasetMetadata,
    newColumnTypes?: Record<string, "numeric" | "categorical" | "date">,
    newColumns?: string[]
  ) => void;
  selectDataset: (dataset: Dataset) => void;
  renameDataset: (id: string, newName: string) => void;
  deleteDataset: (id: string) => void;
  addCalculatedField: (fieldName: string, expression: string) => void;
  deleteCalculatedField: (fieldName: string) => void;
  addWindowQuery: (query: WindowQuery) => void;
  deleteWindowQuery: (alias: string) => void;
}

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
   */
  function applyActiveDatasetUpdate(updater: (dataset: Dataset) => Dataset): Dataset | null {
    const { activeDataset, datasets } = get();
    if (!activeDataset) return null;

    const updatedDataset = updater(activeDataset);

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

  return {
  datasets: [],
  activeDataset: null,
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

  updateDatasetData: (datasetId, newRawData, newMetadata, newColumnTypes, newColumns) => {
    const { datasets, activeDataset } = get();
    const targetDataset = datasets.find((d) => d.id === datasetId);
    if (!targetDataset) return;

    // Purge optimizer cache so stale aggregations are cleared
    queryCache.invalidate(datasetId);

    const nextVersion = (targetDataset.version || 1) + 1;
    const computedColumns = newColumns || (newMetadata ? newMetadata.columns.map((c) => c.name) : targetDataset.columns);
    const computedTypes = newColumnTypes || targetDataset.columnTypes;

    const updatedDataset: Dataset = {
      ...targetDataset,
      data: newRawData,
      columns: computedColumns,
      columnTypes: computedTypes,
      metadata: newMetadata || targetDataset.metadata,
      version: nextVersion,
      lastUpdated: Date.now(),
      calculatedFields: targetDataset.calculatedFields || [],
      windowQueries: targetDataset.windowQueries || [],
    };

    const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(updatedDataset));

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
    const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(dataset));
    set({ activeDataset: evaluated });
    useFilterStore.getState().setFilteredData(evaluated.data);
    useFilterStore.getState().resetFilters();
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
    
    if (activeDataset && activeDataset.id === id) {
      if (updatedDatasets.length > 0) {
        const nextActive = updatedDatasets[0];
        set({ activeDataset: nextActive });
        useFilterStore.getState().setFilteredData(nextActive.data);
        useFilterStore.getState().resetFilters();
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
  }
  };
});
