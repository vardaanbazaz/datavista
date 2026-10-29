import { create } from "zustand";
import { WorkspaceSnapshot } from "@/shared/types";
import { useDashboardStore } from "./dashboardStore";
import { useDatasetStore } from "@/store/datasetStore";
import { toast } from "@/shared/hooks/use-toast";

const STORAGE_KEY = "datavista_workspace_snapshots";

function loadSnapshotsFromStorage(): WorkspaceSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load snapshots from localStorage:", err);
    return [];
  }
}

function saveSnapshotsToStorage(snapshots: WorkspaceSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch (err) {
    console.error("Failed to save snapshots to localStorage:", err);
  }
}

interface SnapshotState {
  snapshots: WorkspaceSnapshot[];
  addSnapshot: (name: string, description?: string) => WorkspaceSnapshot | null;
  deleteSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;
  clearSnapshots: () => void;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: loadSnapshotsFromStorage(),

  addSnapshot: (name: string, description?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        title: "Invalid Snapshot Name",
        description: "Snapshot name cannot be empty.",
        variant: "destructive",
      });
      return null;
    }

    const dashboardStore = useDashboardStore.getState();
    const datasetStore = useDatasetStore.getState();

    const snapshotId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `snap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newSnapshot: WorkspaceSnapshot = {
      id: snapshotId,
      name: trimmedName,
      description: description?.trim(),
      timestamp: Date.now(),
      dashboardState: {
        dashboards: JSON.parse(JSON.stringify(dashboardStore.dashboards)),
        activeDashboardId: dashboardStore.activeDashboardId,
        activeGlobalFilters: JSON.parse(JSON.stringify(dashboardStore.activeGlobalFilters)),
      },
      datasetState: {
        activeDatasetId: datasetStore.activeDataset?.id || null,
      },
    };

    const updated = [newSnapshot, ...get().snapshots];
    set({ snapshots: updated });
    saveSnapshotsToStorage(updated);

    toast({
      title: "Snapshot Saved",
      description: `Workspace snapshot "${trimmedName}" has been created.`,
    });

    return newSnapshot;
  },

  deleteSnapshot: (id: string) => {
    const snapshotToDelete = get().snapshots.find((s) => s.id === id);
    const updated = get().snapshots.filter((s) => s.id !== id);
    set({ snapshots: updated });
    saveSnapshotsToStorage(updated);

    if (snapshotToDelete) {
      toast({
        title: "Snapshot Deleted",
        description: `Snapshot "${snapshotToDelete.name}" has been removed.`,
      });
    }
  },

  restoreSnapshot: (id: string) => {
    const snapshot = get().snapshots.find((s) => s.id === id);
    if (!snapshot) {
      toast({
        title: "Restore Failed",
        description: "Snapshot not found.",
        variant: "destructive",
      });
      return;
    }

    // 1. Restore dataset if specified and available
    if (snapshot.datasetState?.activeDatasetId) {
      const dataset = useDatasetStore
        .getState()
        .datasets.find((d) => d.id === snapshot.datasetState?.activeDatasetId);
      // Rows still on disk (left there at startup): load them, then restore.
      if (dataset?.rowsPending) {
        void useDatasetStore.getState().loadRows(dataset.id).then((loaded) => {
          if (loaded) get().restoreSnapshot(id);
        });
        return;
      }
      if (dataset) {
        useDatasetStore.setState({ activeDataset: dataset });
      }
    }

    // 2. Restore dashboard store state
    const dashboardStore = useDashboardStore.getState();
    const newDashboards = JSON.parse(JSON.stringify(snapshot.dashboardState.dashboards || []));
    const newActiveId = snapshot.dashboardState.activeDashboardId;
    const newGlobalFilters = JSON.parse(
      JSON.stringify(snapshot.dashboardState.activeGlobalFilters || [])
    );

    // Call restoreSnapshotState on dashboardStore
    if (dashboardStore.restoreSnapshotState) {
      dashboardStore.restoreSnapshotState({
        dashboards: newDashboards,
        activeDashboardId: newActiveId,
        activeGlobalFilters: newGlobalFilters,
      });
    } else {
      useDashboardStore.setState({
        dashboards: newDashboards,
        activeDashboardId: newActiveId,
        activeGlobalFilters: newGlobalFilters,
      });
    }

    toast({
      title: "Snapshot Restored",
      description: `Restored workspace snapshot "${snapshot.name}".`,
    });
  },

  clearSnapshots: () => {
    set({ snapshots: [] });
    saveSnapshotsToStorage([]);
  },
}));
