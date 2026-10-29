import { create } from "zustand";
import type { Dataset } from "@/shared/types";
import { toast } from "@/shared/hooks/use-toast";
import { importFile, ImportCancelled, ImportRejected, type ImportJob } from "@/features/upload/lib/importClient";
import type { ImportReview, ImportStage, SheetChoice, SheetInfo } from "@/features/upload/lib/importCore";
import { useDatasetStore } from "./datasetStore";

/**
 * State of the one import in progress, shown by ImportDialog. It lives in a store, not in
 * FileUpload, because FileUpload unmounts while uploadDataset shows the loading view.
 * Every file input goes through `importForUpload` or `importForReplace`.
 */

type Phase = "idle" | "running" | "choosing-sheet" | "reviewing";

interface ImportState {
  phase: Phase;
  fileName: string;
  stage: ImportStage;
  /** null while the stage can't tell how far it is. */
  fraction: number | null;
  startedAt: number;
  stageStartedAt: number;
  /** False once the dataset is being saved: terminating the worker can't undo that. */
  cancellable: boolean;
  sheets: SheetInfo[];
  canAppend: boolean;
  review: ImportReview | null;

  /** Imports a new dataset (upload panel, drag and drop). */
  importForUpload: (file: File) => Promise<void>;
  /** Imports a file for DataTable's "replace data"; resolves null when nothing was imported. */
  importForReplace: (file: File) => Promise<Dataset | null>;
  cancel: () => void;
  answerSheet: (choice: SheetChoice | null) => void;
  answerReview: (answer: { exclude: boolean } | null) => void;
}

let job: ImportJob | null = null;
let pendingSheet: ((choice: SheetChoice | null) => void) | null = null;
let pendingReview: ((answer: { exclude: boolean } | null) => void) | null = null;

export const useImportStore = create<ImportState>((set, get) => {
  const reset = () => {
    job = null;
    pendingSheet = null;
    pendingReview = null;
    set({ phase: "idle", sheets: [], canAppend: false, review: null, cancellable: true, fraction: null });
  };

  /** Runs the shared pipeline; reports rejection, cancellation and errors; null when no dataset came back. */
  const run = async (file: File): Promise<Dataset | null> => {
    if (job) {
      toast({ title: "Import in progress", description: "Wait for the current import to finish or cancel it first." });
      return null;
    }
    const now = Date.now();
    const current = importFile(file, {
      onProgress: (stage, fraction) =>
        set(s => ({ stage, fraction, stageStartedAt: s.stage === stage ? s.stageStartedAt : Date.now() })),
      chooseSheet: (sheets, canAppend) =>
        new Promise(resolve => {
          pendingSheet = resolve;
          set({ phase: "choosing-sheet", sheets, canAppend });
        }),
      review: review =>
        new Promise(resolve => {
          pendingReview = resolve;
          set({ phase: "reviewing", review });
        }),
    });
    if (current.warning) toast(current.warning);
    // A rejected file (size cap, format) never opens the dialog: the toast below says why.
    if (current.started) {
      job = current;
      set({
        phase: "running",
        fileName: file.name,
        stage: "reading",
        fraction: 0,
        startedAt: now,
        stageStartedAt: now,
        cancellable: true,
      });
    }

    try {
      const { dataset, transferMs } = await current.promise;
      performance.mark("datavista-import-done", { detail: { transferMs, rows: dataset.data.length } });
      return dataset;
    } catch (err) {
      if (err instanceof ImportRejected) {
        toast({ title: err.title, description: err.message, variant: "destructive" });
      } else if (err instanceof ImportCancelled) {
        toast({ title: "Import cancelled", description: `${file.name} was not imported.` });
      } else {
        toast({
          title: "Import failed",
          description: err instanceof Error ? err.message : "An error occurred while reading the file.",
          variant: "destructive",
        });
      }
      reset();
      return null;
    } finally {
      if (job === current) job = null;
    }
  };

  return {
    phase: "idle",
    fileName: "",
    stage: "reading",
    fraction: null,
    startedAt: 0,
    stageStartedAt: 0,
    cancellable: true,
    sheets: [],
    canAppend: false,
    review: null,

    importForUpload: async file => {
      const dataset = await run(file);
      if (!dataset) return;
      const now = Date.now();
      set({ phase: "running", stage: "saving", fraction: null, stageStartedAt: now, cancellable: false });
      try {
        await useDatasetStore.getState().uploadDataset(dataset);
      } finally {
        reset();
      }
    },

    importForReplace: async file => {
      const dataset = await run(file);
      reset();
      return dataset;
    },

    cancel: () => {
      if (!get().cancellable) return;
      pendingSheet?.(null);
      pendingReview?.(null);
      job?.cancel();
    },

    answerSheet: choice => {
      const resolve = pendingSheet;
      pendingSheet = null;
      if (choice) set({ phase: "running", sheets: [] });
      resolve?.(choice);
    },

    answerReview: answer => {
      const resolve = pendingReview;
      pendingReview = null;
      if (answer) set({ phase: "running", review: null });
      resolve?.(answer);
    },
  };
});
