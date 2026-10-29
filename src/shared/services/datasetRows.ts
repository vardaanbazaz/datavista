import { db, fromStoredDataset, toStoredDataset, type DatasetRowChunk, type RemovedRowsRecord, type StoredDataset } from "@/shared/lib/db";
import { Dataset } from "@/shared/types";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { windowEngine } from "@/shared/services/window";

/** Rows in a dataset, also while its rows are still on disk (Dataset.rowsPending). */
export function datasetRowCount(dataset: Dataset): number {
  return dataset.rowsPending?.rowCount ?? dataset.data.length;
}

/**
 * Reads a stored dataset's row chunks, one `get` at a time inside one read transaction (a
 * consistent snapshot; each chunk is its own structured clone, so no single main-thread
 * block covers all the rows). `onProgress(loadedRows, totalRows)` after a chunk, at most every 5%. Null
 * when chunks are missing.
 */
export async function readDatasetRows(
  stored: StoredDataset,
  onProgress?: (loadedRows: number, totalRows: number) => void
): Promise<Dataset | null> {
  const wantRemoved = (stored.metadata?.removedDuplicateCount ?? 0) > 0;
  let removed: RemovedRowsRecord | undefined;
  const chunks = await db.transaction("r", db.datasetRows, db.removedRows, async () => {
    if (wantRemoved) removed = await db.removedRows.get(stored.id);
    const out: (DatasetRowChunk | undefined)[] = [];
    let loaded = 0;
    let reportedStep = -1;
    for (let i = 0; i < (stored.chunkCount ?? 0); i++) {
      const chunk = await db.datasetRows.get([stored.id, i]);
      out.push(chunk);
      loaded += chunk?.rows.length ?? 0;
      // Every 5% at most: each report re-renders the loading view.
      const step = Math.floor((loaded / Math.max(stored.rowCount, 1)) * 20);
      if (step !== reportedStep) {
        reportedStep = step;
        onProgress?.(loaded, stored.rowCount);
      }
    }
    return out;
  });
  return fromStoredDataset(stored, chunks, removed);
}

/**
 * Datasets persisted before ColumnMetadata.allIntegerValues existed load without it.
 * Recompute it from the dataset's own rows so the "might be categorical" heuristic
 * (src/shared/utils/columnType.ts) doesn't have to special-case a missing field beyond
 * its existing fail-closed default. No-ops (returns the dataset unchanged) if metadata
 * is absent or every column already has the field.
 */
export function backfillAllIntegerValues(dataset: Dataset): Dataset {
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

/**
 * What a dataset fresh from disk goes through before the session uses it: the
 * allIntegerValues backfill, then calculated and window columns re-materialized (this is
 * the sole bridge from IndexedDB into a live session, so it self-heals a dataset persisted
 * with calculatedFields/windowQueries but without their columns).
 */
export function prepareLoadedDataset(dataset: Dataset): Dataset {
  return windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(backfillAllIntegerValues(dataset)));
}

/** Loads the rows of a dataset left unloaded at startup and prepares it; null if its chunks are missing. */
export async function loadPendingRows(
  dataset: Dataset,
  onProgress?: (loadedRows: number, totalRows: number) => void
): Promise<Dataset | null> {
  const loaded = await readDatasetRows(toStoredDataset(dataset), onProgress);
  return loaded ? prepareLoadedDataset(loaded) : null;
}
