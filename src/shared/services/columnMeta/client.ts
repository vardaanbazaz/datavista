import type { ColumnMetadata, Dataset } from "@/shared/types";
import { generateDatasetMetadata } from "@/shared/services/parsingService";
import { COLUMN_SLICE, type ColumnMetaReply, type ColumnMetaRequest } from "./protocol";

/**
 * Fresh metadata for `columns` of `dataset`, computed in a worker one column at a time (on
 * 1M rows a column takes 0.1–1.5 s, a date column the longest), so the main thread only
 * copies each column out and clones it across. Runs inline where there is no Worker (tests).
 */
export async function computeColumnMetadata(dataset: Dataset, columns: string[]): Promise<ColumnMetadata[]> {
  const fileName = dataset.metadata?.originalFileName ?? `${dataset.name}.csv`;
  if (typeof Worker === "undefined") {
    return generateDatasetMetadata(dataset.id, dataset.name, dataset.data, columns, dataset.columnTypes, fileName, 0, {}).columns;
  }
  const worker = new Worker(new URL("./columnMeta.worker.ts", import.meta.url), { type: "module" });
  try {
    const out: ColumnMetadata[] = [];
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const reply = new Promise<ColumnMetaReply>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<ColumnMetaReply>) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message));
      });
      const rows = dataset.data;
      for (let start = 0; start < rows.length || start === 0; start += COLUMN_SLICE) {
        const end = Math.min(rows.length, start + COLUMN_SLICE);
        const values = new Array(end - start);
        for (let r = start; r < end; r++) values[r - start] = rows[r][column] ?? null;
        const request: ColumnMetaRequest = {
          id: i, datasetId: dataset.id, name: dataset.name, fileName, column,
          type: dataset.columnTypes[column], values, last: end >= rows.length,
        };
        worker.postMessage(request);
        // Let the page paint and handle input between slices.
        await new Promise((r) => setTimeout(r, 0));
      }
      const result = await reply;
      if ("error" in result) throw new Error(result.error);
      out.push(result.meta);
    }
    return out;
  } finally {
    worker.terminate();
  }
}
