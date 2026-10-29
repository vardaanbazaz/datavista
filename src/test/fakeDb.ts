import { db, toStoredDataset, toRowChunk } from "@/shared/lib/db";
import type { Dataset } from "@/shared/types";

/** Empties the app database (fake-indexeddb in vitest) between tests. */
export async function resetDb() {
  db.close();
  await db.delete();
  await db.open();
}

/** Writes a dataset the way persistence does: metadata record + row chunks. */
export async function seedDataset(dataset: Dataset) {
  const stored = toStoredDataset(dataset);
  for (let i = 0; i < stored.chunkCount; i++) {
    await db.datasetRows.put(toRowChunk(dataset, i));
  }
  if (dataset.removedDuplicates) await db.removedRows.put({ datasetId: dataset.id, rows: dataset.removedDuplicates });
  await db.datasets.put(stored);
}
