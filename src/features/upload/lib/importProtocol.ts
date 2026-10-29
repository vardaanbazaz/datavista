import type { Dataset } from "@/shared/types";
import type { ImportOptions, ImportReview, ImportStage, SheetChoice, SheetInfo } from "./importCore";

/** Messages between importClient.ts (main thread) and worker/import.worker.ts. */

export type ToWorker =
  | { type: "start"; file: File; options: ImportOptions }
  | { type: "sheet"; choice: SheetChoice }
  | { type: "review"; exclude: boolean };

export type FromWorker =
  | { type: "progress"; stage: ImportStage; fraction: number | null }
  | { type: "sheets"; sheets: SheetInfo[]; canAppend: boolean }
  | { type: "review"; review: ImportReview }
  /** `sentAt` is `performance.timeOrigin + performance.now()` just before postMessage. */
  | { type: "done"; dataset: Dataset; sentAt: number }
  | { type: "error"; message: string };
