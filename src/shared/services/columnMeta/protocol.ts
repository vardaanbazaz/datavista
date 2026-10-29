import type { ColumnMetadata, DataRow, Dataset } from "@/shared/types";

/**
 * One slice of a column's cells. Cloning a 1M-cell text column in one postMessage blocks the
 * main thread for ~0.4 s, so cells go across in slices and the worker computes after `last`.
 */
export interface ColumnMetaRequest {
  id: number;
  datasetId: string;
  name: string;
  fileName: string;
  column: string;
  type: Dataset["columnTypes"][string];
  values: DataRow[string][];
  last: boolean;
}

export type ColumnMetaReply = { id: number; meta: ColumnMetadata } | { id: number; error: string };

/** Cells per message. */
export const COLUMN_SLICE = 100_000;
