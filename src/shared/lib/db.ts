import Dexie, { type Table, type Transaction } from 'dexie';
import { Dataset, DataRow, ChartConfig, FilterState, Dashboard } from '@/shared/types';

export interface UIPreference {
  key: string;
  value: unknown;
}

/**
 * A dataset as stored in the `datasets` table: everything except the per-row arrays
 * (`data`, `dateSourceValues`), which live in `datasetRows`. Renaming, type overrides and
 * dismissing notices rewrite only this small record.
 */
export type StoredDataset = Omit<Dataset, 'data' | 'dateSourceValues'> & {
  /** Rows in the dataset; the chunks in `datasetRows` must add up to this. */
  rowCount: number;
  /** Number of `datasetRows` records, indices 0..chunkCount-1. */
  chunkCount: number;
  /** Columns that have `dateSourceValues`, so an absent map and an empty one stay distinct. */
  dateSourceColumns?: string[];
};

/** One slice of a dataset's rows, rows [index * ROW_CHUNK_SIZE, (index + 1) * ROW_CHUNK_SIZE). */
export interface DatasetRowChunk {
  datasetId: string;
  index: number;
  rows: DataRow[];
  /** The same slice of each `dateSourceValues` column. */
  dateSourceValues?: Record<string, (string | null)[]>;
}

/**
 * Rows per chunk. Each chunk is one IndexedDB put, and the browser structured-clones it on
 * the main thread, so this bounds the longest single block while saving or loading.
 * Measured (scripts/bench/persistence.bench.ts, 1M rows × 8 columns): see decisions.md.
 */
export const ROW_CHUNK_SIZE = 20_000;

export function toStoredDataset(dataset: Dataset): StoredDataset {
  const { data, dateSourceValues, ...rest } = dataset;
  return {
    ...rest,
    rowCount: data.length,
    chunkCount: Math.ceil(data.length / ROW_CHUNK_SIZE),
    ...(dateSourceValues ? { dateSourceColumns: Object.keys(dateSourceValues) } : {}),
  };
}

export function toRowChunk(dataset: Dataset, index: number): DatasetRowChunk {
  const start = index * ROW_CHUNK_SIZE;
  const end = start + ROW_CHUNK_SIZE;
  const chunk: DatasetRowChunk = { datasetId: dataset.id, index, rows: dataset.data.slice(start, end) };
  if (dataset.dateSourceValues) {
    chunk.dateSourceValues = {};
    for (const [col, values] of Object.entries(dataset.dateSourceValues)) {
      chunk.dateSourceValues[col] = values.slice(start, end);
    }
  }
  return chunk;
}

/** Rebuilds the in-memory Dataset; null if the chunks don't add up to the stored row count. */
export function fromStoredDataset(stored: StoredDataset, chunks: (DatasetRowChunk | undefined)[]): Dataset | null {
  const { rowCount, chunkCount, dateSourceColumns, ...rest } = stored;
  if (chunks.length !== chunkCount || chunks.some((c) => !c)) return null;
  const data: DataRow[] = [];
  const dateSourceValues: Record<string, (string | null)[]> | undefined = dateSourceColumns
    ? Object.fromEntries(dateSourceColumns.map((c) => [c, []]))
    : undefined;
  for (const chunk of chunks as DatasetRowChunk[]) {
    for (const row of chunk.rows) data.push(row);
    if (dateSourceValues) {
      for (const col of dateSourceColumns!) {
        const values = chunk.dateSourceValues?.[col] || [];
        for (const v of values) dateSourceValues[col].push(v);
      }
    }
  }
  if (data.length !== rowCount) return null;
  return { ...rest, data, ...(dateSourceValues ? { dateSourceValues } : {}) } as Dataset;
}

/**
 * v1 stored each dataset with all its rows in one record and each chart with a copy of its
 * dataset's (filtered) rows. v2 moves rows into `datasetRows` chunks and drops chart rows.
 * Runs inside Dexie's versionchange transaction, so it is all-or-nothing.
 */
export async function upgradeToV2(tx: Transaction): Promise<void> {
  const datasets = tx.table('datasets');
  const rows = tx.table<DatasetRowChunk>('datasetRows');
  const legacy = (await datasets.toArray()) as (Dataset & { data?: unknown })[];
  for (const d of legacy) {
    if (!Array.isArray(d.data)) continue; // already split, or not a dataset we can read
    const dataset = d as Dataset;
    const stored = toStoredDataset(dataset);
    for (let i = 0; i < stored.chunkCount; i++) {
      await rows.put(toRowChunk(dataset, i));
    }
    await datasets.put(stored);
  }
  await tx.table('charts').toCollection().modify((chart: Record<string, unknown>) => {
    delete chart.data;
  });
}

export class DataVistaDatabase extends Dexie {
  datasets!: Table<StoredDataset, string>;
  datasetRows!: Table<DatasetRowChunk, [string, number]>;
  charts!: Table<ChartConfig, string>;
  filters!: Table<{ datasetId: string; state: FilterState }, string>;
  uiState!: Table<UIPreference, string>;
  dashboards!: Table<Dashboard, string>;

  constructor(name = 'DataVistaDatabase') {
    super(name);

    this.version(1).stores({
      datasets: 'id',
      charts: 'id, datasetId',
      filters: 'datasetId',
      uiState: 'key',
      dashboards: 'id'
    });

    // Version 2: dataset rows split out of the dataset record, charts without rows.
    this.version(2).stores({
      datasetRows: '[datasetId+index]'
    }).upgrade(upgradeToV2);
  }
}

export const db = new DataVistaDatabase();
export default db;
