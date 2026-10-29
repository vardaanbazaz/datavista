import { generateDatasetMetadata } from "@/shared/services/parsingService";
import type { ColumnMetaRequest, ColumnMetaReply } from "./protocol";

/**
 * Recomputes one column's metadata (counts, min/max, quality findings) off the main thread,
 * after a column fix or duplicate removal changed its cells. One request per column.
 */
let pending: ColumnMetaRequest["values"] = [];

self.addEventListener("message", (event: MessageEvent<ColumnMetaRequest>) => {
  const { id, column, type, values, last, datasetId, name, fileName } = event.data;
  for (const v of values) pending.push(v);
  if (!last) return;
  const all = pending;
  pending = [];
  try {
    const rows = all.map((v) => ({ [column]: v }));
    const meta = generateDatasetMetadata(datasetId, name, rows, [column], { [column]: type }, fileName, 0, {}).columns[0];
    self.postMessage({ id, meta } satisfies ColumnMetaReply);
  } catch (e) {
    self.postMessage({ id, error: String(e) } satisfies ColumnMetaReply);
  }
});
