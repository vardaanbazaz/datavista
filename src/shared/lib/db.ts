import Dexie, { type Table, type Transaction } from 'dexie';
import { Dataset, DataRow, ChartConfig, FilterState, Dashboard, RemovedRow } from '@/shared/types';

export interface UIPreference {
  key: string;
  value: unknown;
}

/**
 * A dataset as stored in the `datasets` table: everything except the per-row arrays
 * (`data`, `dateSourceValues`), which live in `datasetRows`. Renaming, type overrides and
 * dismissing notices rewrite only this small record.
 */
export type StoredDataset = Omit<Dataset, 'data' | 'dateSourceValues' | 'fixSourceValues' | 'removedDuplicates'> & {
  /** Rows in the dataset; the chunks in `datasetRows` must add up to this. */
  rowCount: number;
  /** Number of `datasetRows` records, indices 0..chunkCount-1. */
  chunkCount: number;
  /** Columns that have `dateSourceValues`, so an absent map and an empty one stay distinct. */
  dateSourceColumns?: string[];
  /** Columns that have `fixSourceValues`. */
  fixSourceColumns?: string[];
};

/** Rows "Remove duplicates" took out of one dataset (Dataset.removedDuplicates), one record per dataset. */
export interface RemovedRowsRecord {
  datasetId: string;
  rows: RemovedRow[];
}

/** One slice of a dataset's rows, rows [index * ROW_CHUNK_SIZE, (index + 1) * ROW_CHUNK_SIZE). */
export interface DatasetRowChunk {
  datasetId: string;
  index: number;
  rows: DataRow[];
  /** The same slice of each `dateSourceValues` column. */
  dateSourceValues?: Record<string, (string | null)[]>;
  /** The same slice of each `fixSourceValues` column. */
  fixSourceValues?: Record<string, DataRow[string][]>;
}

/**
 * Rows per chunk. Each chunk is one IndexedDB put, and the browser structured-clones it on
 * the main thread, so this bounds the longest single block while saving or loading.
 * Measured (scripts/bench/persistence.bench.ts, 1M rows × 8 columns): see decisions.md.
 */
export const ROW_CHUNK_SIZE = 20_000;

export function toStoredDataset(dataset: Dataset): StoredDataset {
  const { data, dateSourceValues, fixSourceValues, removedDuplicates: _removed, rowsPending, ...rest } = dataset;
  // Rows not loaded: keep what is on disk (data is [] here, not the real rows).
  if (rowsPending) return { ...rest, ...rowsPending };
  return {
    ...rest,
    rowCount: data.length,
    chunkCount: Math.ceil(data.length / ROW_CHUNK_SIZE),
    ...(dateSourceValues ? { dateSourceColumns: Object.keys(dateSourceValues) } : {}),
    ...(fixSourceValues ? { fixSourceColumns: Object.keys(fixSourceValues) } : {}),
  };
}

function sliceColumns<T>(columns: Record<string, T[]>, start: number, end: number): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [col, values] of Object.entries(columns)) out[col] = values.slice(start, end);
  return out;
}

/** Concatenates one per-row column map across chunks; undefined when the dataset has none. */
function joinColumns<T>(names: string[] | undefined, chunks: DatasetRowChunk[], pick: (c: DatasetRowChunk) => Record<string, T[]> | undefined): Record<string, T[]> | undefined {
  if (!names) return undefined;
  const out: Record<string, T[]> = Object.fromEntries(names.map((c) => [c, [] as T[]]));
  for (const chunk of chunks) {
    for (const col of names) {
      for (const v of pick(chunk)?.[col] || []) out[col].push(v);
    }
  }
  return out;
}

export function toRowChunk(dataset: Dataset, index: number): DatasetRowChunk {
  const start = index * ROW_CHUNK_SIZE;
  const end = start + ROW_CHUNK_SIZE;
  const chunk: DatasetRowChunk = { datasetId: dataset.id, index, rows: dataset.data.slice(start, end) };
  if (dataset.dateSourceValues) chunk.dateSourceValues = sliceColumns(dataset.dateSourceValues, start, end);
  if (dataset.fixSourceValues) chunk.fixSourceValues = sliceColumns(dataset.fixSourceValues, start, end);
  return chunk;
}

/** A dataset whose rows stay on disk until it is selected (see Dataset.rowsPending). */
export function toPendingDataset(stored: StoredDataset): Dataset {
  const { rowCount, chunkCount, dateSourceColumns, fixSourceColumns, ...rest } = stored;
  return {
    ...rest,
    data: [],
    rowsPending: {
      rowCount,
      chunkCount,
      ...(dateSourceColumns ? { dateSourceColumns } : {}),
      ...(fixSourceColumns ? { fixSourceColumns } : {}),
    },
  } as Dataset;
}

/**
 * Rebuilds the in-memory Dataset; null if the chunks don't add up to the stored row count, or
 * the metadata counts removed duplicates whose record is missing.
 */
export function fromStoredDataset(stored: StoredDataset, chunks: (DatasetRowChunk | undefined)[], removed?: RemovedRowsRecord): Dataset | null {
  const { rowCount, chunkCount, dateSourceColumns, fixSourceColumns, ...rest } = stored;
  if (chunks.length !== chunkCount || chunks.some((c) => !c)) return null;
  const full = chunks as DatasetRowChunk[];
  const data: DataRow[] = [];
  for (const chunk of full) {
    for (const row of chunk.rows) data.push(row);
  }
  if (data.length !== rowCount) return null;
  const removedCount = stored.metadata?.removedDuplicateCount ?? 0;
  if (removedCount > 0 && removed?.rows.length !== removedCount) return null;
  const dateSourceValues = joinColumns(dateSourceColumns, full, (c) => c.dateSourceValues);
  const fixSourceValues = joinColumns(fixSourceColumns, full, (c) => c.fixSourceValues);
  return {
    ...rest,
    data,
    ...(dateSourceValues ? { dateSourceValues } : {}),
    ...(fixSourceValues ? { fixSourceValues } : {}),
    ...(removedCount > 0 ? { removedDuplicates: removed!.rows } : {}),
  } as Dataset;
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

/**
 * v3: datasets get an explicit `order` (sidebar position, upload order oldest first), so the
 * sidebar no longer follows the primary key (a random UUID). Existing datasets are numbered
 * by when they were imported (metadata.createdAt, then lastUpdated), ties by id.
 */
export async function upgradeToV3(tx: Transaction): Promise<void> {
  const datasets = tx.table<StoredDataset, string>('datasets');
  const all = await datasets.toArray();
  const when = (d: StoredDataset) => d.metadata?.createdAt ?? d.lastUpdated ?? 0;
  const sorted = [...all].sort((a, b) => when(a) - when(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].order === undefined) await datasets.put({ ...sorted[i], order: i });
  }
}

/**
 * v4: rows removed by "Remove duplicates" move out of the dataset record (metadata) into
 * `removedRows`, so a metadata save (rename, override) no longer carries them.
 */
export async function upgradeToV4(tx: Transaction): Promise<void> {
  const datasets = tx.table<StoredDataset & { metadata?: { removedDuplicates?: RemovedRow[] } }, string>('datasets');
  const removedRows = tx.table<RemovedRowsRecord, string>('removedRows');
  for (const d of await datasets.toArray()) {
    const rows = d.metadata?.removedDuplicates;
    if (!rows) continue;
    await removedRows.put({ datasetId: d.id, rows });
    const { removedDuplicates: _rows, ...metadata } = d.metadata!;
    await datasets.put({ ...d, metadata: { ...metadata, removedDuplicateCount: rows.length } } as StoredDataset);
  }
}

/** Sidebar order: `order`, then import time, then id (stable across reloads). */
export function compareDatasetOrder(a: Pick<Dataset, 'id' | 'order' | 'metadata' | 'lastUpdated'>, b: Pick<Dataset, 'id' | 'order' | 'metadata' | 'lastUpdated'>): number {
  const oa = a.order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.order ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  const ta = a.metadata?.createdAt ?? a.lastUpdated ?? 0;
  const tb = b.metadata?.createdAt ?? b.lastUpdated ?? 0;
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class DataVistaDatabase extends Dexie {
  datasets!: Table<StoredDataset, string>;
  datasetRows!: Table<DatasetRowChunk, [string, number]>;
  removedRows!: Table<RemovedRowsRecord, string>;
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

    // Version 3: explicit dataset order (no index needed: the list is sorted in memory).
    this.version(3).stores({ datasets: 'id' }).upgrade(upgradeToV3);

    // Version 4: removed duplicate rows in their own table, keyed by dataset.
    this.version(4).stores({ removedRows: 'datasetId' }).upgrade(upgradeToV4);
  }
}

export const db = new DataVistaDatabase();
export default db;
