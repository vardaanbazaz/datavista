/**
 * The one place column fixes change data. A fix (sentinel → missing, currency, thousands
 * separators, "Convert to number…", label merge) is applied to `dataset.data` itself, so
 * every engine (stats, query/KPI, charts, pivot, filters, window, export, AI) reads the same
 * values with no per-engine code. The column's original cells are kept in
 * `dataset.fixSourceValues[column]`; adding or removing a fix replays all of that column's
 * remaining fixes from the originals, in order, so undo is exact.
 */
import type { ColumnFix, ColumnMetadata, DataRow, Dataset, RemovedRow } from "@/shared/types";
import { generateDatasetMetadata } from "./parsingService";
import { CONVERTING_FIXES, transformColumn } from "./columnFixTransforms";
import { parseSuffixNumber } from "@/shared/utils/numberFormats";

type Cell = DataRow[string];
type ColumnType = Dataset["columnTypes"][string];

export interface FixOptions {
  /**
   * Leave the recount of the changed columns' metadata to the caller (the store runs it in a
   * worker: columnMeta/client.ts) and only set their type now. Unit tests and the import use
   * the inline recount.
   */
  deferMeta?: boolean;
}

/** Fresh column metadata merged into `existing`, keeping what the user set on each column. */
export function mergeColumnMeta(existing: ColumnMetadata[], fresh: ColumnMetadata[]): ColumnMetadata[] {
  const byName = new Map(fresh.map((c) => [c.name, c]));
  return existing.map((c) => {
    const f = byName.get(c.name);
    if (!f) return c;
    return {
      ...c,
      inferredDataType: f.inferredDataType,
      role: c.role === "calculated" || c.role === "window" ? c.role : f.role,
      nullableStatus: f.nullableStatus,
      uniqueValueCount: f.uniqueValueCount,
      missingValueCount: f.missingValueCount,
      minimumValue: f.minimumValue,
      maximumValue: f.maximumValue,
      average: f.average,
      categoryCardinality: f.categoryCardinality,
      allIntegerValues: f.allIntegerValues,
      quality: f.quality,
      ...(f.inferredDataType === "date"
        ? { earliestDate: f.earliestDate, latestDate: f.latestDate, invalidDateCount: f.invalidDateCount }
        : {}),
    };
  });
}

/** Column metadata after `columns` changed: recounted now, or only retyped when deferred. */
function refreshColumnMeta(dataset: Dataset, data: DataRow[], columns: string[], types: Dataset["columnTypes"], options: FixOptions): ColumnMetadata[] {
  const meta = dataset.metadata!;
  if (options.deferMeta) {
    const changed = new Set(columns);
    return meta.columns.map((c) => (changed.has(c.name) && types[c.name] && c.inferredDataType !== types[c.name] ? { ...c, inferredDataType: types[c.name] } : c));
  }
  const fresh = generateDatasetMetadata(dataset.id, dataset.name, data, columns, types, meta.originalFileName, 0, {}).columns;
  return mergeColumnMeta(meta.columns, fresh);
}

/**
 * Rebuilds `column` from its original cells through `fixes` (that column's, in order),
 * starting from `baseType`. With no fixes left the originals go back and are dropped.
 */
function replayColumn(dataset: Dataset, column: string, fixes: ColumnFix[], baseType: ColumnType, options: FixOptions): Dataset {
  const originals = dataset.fixSourceValues?.[column] ?? dataset.data.map((r) => r[column] ?? null);
  let values: readonly Cell[] = originals;
  let type = baseType;
  const applied = fixes.map((fix) => {
    const result = transformColumn(values, fix);
    values = result.values;
    if (CONVERTING_FIXES.has(fix.kind)) type = "numeric";
    return { ...fix, changedCount: result.changed, ...(fix.kind === "numberSuffix" ? { unconvertible: result.unconvertible } : {}) };
  });

  // Copy only the rows whose cell changes; the rest keep their object.
  const data = dataset.data.slice();
  for (let i = 0; i < data.length; i++) {
    if (data[i][column] !== values[i]) data[i] = { ...data[i], [column]: values[i] };
  }

  const fixSourceValues = { ...(dataset.fixSourceValues ?? {}) };
  if (fixes.length > 0) fixSourceValues[column] = originals;
  else delete fixSourceValues[column];

  const columnTypes = { ...dataset.columnTypes, [column]: type };
  const appliedById = new Map(applied.map((f) => [f.id, f]));
  // Keep the dataset-wide order: existing fixes stay where they were, new ones go last.
  const kept = (dataset.metadata!.columnFixes ?? []).filter((f) => f.column !== column || appliedById.has(f.id)).map((f) => appliedById.get(f.id) ?? f);
  const added = applied.filter((f) => !kept.some((k) => k.id === f.id));
  const columnFixes = [...kept, ...added];

  const updated: Dataset = {
    ...dataset,
    data,
    columnTypes,
    metadata: {
      ...dataset.metadata!,
      columnFixes,
      columns: refreshColumnMeta(dataset, data, [column], columnTypes, options),
    },
  };
  if (Object.keys(fixSourceValues).length > 0) updated.fixSourceValues = fixSourceValues;
  else delete updated.fixSourceValues;
  return updated;
}

function fixesOf(dataset: Dataset, column: string): ColumnFix[] {
  return (dataset.metadata?.columnFixes ?? []).filter((f) => f.column === column);
}

/** Adds a fix to its column (previousType = the column's current type) and applies it. */
export function addColumnFix(dataset: Dataset, fix: Omit<ColumnFix, "previousType" | "changedCount">, options: FixOptions = {}): Dataset {
  if (!dataset.metadata) return dataset;
  const current = fixesOf(dataset, fix.column);
  const full: ColumnFix = { ...fix, previousType: dataset.columnTypes[fix.column], changedCount: 0 };
  const baseType = current[0]?.previousType ?? full.previousType;
  return replayColumn(dataset, fix.column, [...current.filter((f) => f.id !== fix.id), full], baseType, options);
}

/** Removes one fix and replays the rest of its column from the original cells. */
export function removeColumnFix(dataset: Dataset, fixId: string, options: FixOptions = {}): Dataset {
  const fix = dataset.metadata?.columnFixes?.find((f) => f.id === fixId);
  if (!fix) return dataset;
  const current = fixesOf(dataset, fix.column);
  return replayColumn(dataset, fix.column, current.filter((f) => f.id !== fixId), current[0].previousType, options);
}

/** Before → after for the first `limit` distinct non-blank values, and how many cells can't be read. */
export function previewNumberConversion(dataset: Dataset, column: string, limit = 10) {
  const samples: { before: string; after: number | null }[] = [];
  const seen = new Set<string>();
  let unconvertible = 0;
  let total = 0;
  for (const row of dataset.data) {
    const v = row[column];
    if (v === null || v === undefined || v === "") continue;
    total++;
    const after = typeof v === "number" ? v : parseSuffixNumber(String(v))?.value ?? null;
    if (after === null) unconvertible++;
    const key = String(v);
    if (samples.length < limit && !seen.has(key)) {
      seen.add(key);
      samples.push({ before: key, after });
    }
  }
  const plus = dataset.data.some((r) => typeof r[column] === "string" && parseSuffixNumber(r[column] as string)?.plus);
  return { samples, unconvertible, total, lowerBound: plus };
}

/** Recomputes every column's metadata and the row count after rows were removed or put back. */
function withRefreshedRows(dataset: Dataset, data: DataRow[], options: FixOptions): Dataset["metadata"] {
  const meta = dataset.metadata!;
  return { ...meta, rowCount: data.length, columns: refreshColumnMeta(dataset, data, sourceColumns(dataset), dataset.columnTypes, options) };
}

/** Columns from the file (not calculated or window columns): the ones row changes recount. */
export function sourceColumns(dataset: Dataset): string[] {
  return (dataset.metadata?.columns ?? []).filter((c) => c.role !== "calculated" && c.role !== "window").map((c) => c.name);
}

/**
 * Removes the exact duplicate rows found at import (metadata.quality.duplicateIndices), keeping
 * each first occurrence. The removed rows (and their per-row source text) go to
 * metadata.removedDuplicates so restoreDuplicateRows can put them back where they were.
 */
export function removeDuplicateRows(dataset: Dataset, options: FixOptions = {}): Dataset {
  const meta = dataset.metadata;
  const indices = meta?.quality?.duplicateIndices ?? [];
  if (!meta || indices.length === 0 || dataset.removedDuplicates) return dataset;
  const drop = new Set(indices);
  const removed: RemovedRow[] = indices.map((index) => {
    const entry: RemovedRow = { index, row: dataset.data[index] };
    if (dataset.dateSourceValues) entry.dateSource = Object.fromEntries(Object.entries(dataset.dateSourceValues).map(([c, v]) => [c, v[index]]));
    if (dataset.fixSourceValues) entry.fixSource = Object.fromEntries(Object.entries(dataset.fixSourceValues).map(([c, v]) => [c, v[index]]));
    return entry;
  });
  const keep = <T,>(arr: T[]) => arr.filter((_, i) => !drop.has(i));
  const data = keep(dataset.data);
  const next: Dataset = {
    ...dataset,
    data,
    ...(dataset.dateSourceValues ? { dateSourceValues: mapValues(dataset.dateSourceValues, keep) } : {}),
    ...(dataset.fixSourceValues ? { fixSourceValues: mapValues(dataset.fixSourceValues, keep) } : {}),
  };
  next.removedDuplicates = removed;
  next.metadata = { ...withRefreshedRows(next, data, options)!, removedDuplicateCount: removed.length };
  return next;
}

/** Puts back the rows removeDuplicateRows took out, at their original positions, and re-applies column fixes to them. */
export function restoreDuplicateRows(dataset: Dataset, options: FixOptions = {}): Dataset {
  const meta = dataset.metadata;
  const removed = dataset.removedDuplicates;
  if (!meta || !removed) return dataset;
  const total = dataset.data.length + removed.length;
  const insertAt = new Map(removed.map((r) => [r.index, r]));
  const merge = <T,>(arr: T[], pick: (r: RemovedRow) => T): T[] => {
    const out = new Array<T>(total);
    let j = 0;
    for (let i = 0; i < total; i++) {
      const r = insertAt.get(i);
      out[i] = r ? pick(r) : arr[j++];
    }
    return out;
  };
  const data = merge(dataset.data, (r) => r.row as DataRow);
  const { removedDuplicates: _rows, ...withoutRemoved } = dataset;
  let next: Dataset = { ...withoutRemoved, data };
  if (dataset.dateSourceValues) {
    next.dateSourceValues = Object.fromEntries(Object.entries(dataset.dateSourceValues).map(([c, v]) => [c, merge(v, (r) => r.dateSource?.[c] ?? null)]));
  }
  if (dataset.fixSourceValues) {
    // A column fixed after the removal has no saved original for these rows: their cell then
    // still holds the original value.
    next.fixSourceValues = Object.fromEntries(
      Object.entries(dataset.fixSourceValues).map(([c, v]) => [c, merge(v, (r) => (r.fixSource && c in r.fixSource ? r.fixSource[c] : (r.row[c] ?? null)))])
    );
  }
  const { removedDuplicateCount: _count, ...rest } = meta;
  next.metadata = { ...rest, rowCount: total };
  // Re-apply each fixed column so the restored rows carry the fixes made since.
  for (const column of Object.keys(next.fixSourceValues ?? {})) {
    const fixes = fixesOf(next, column);
    if (fixes.length > 0) next = replayColumn(next, column, fixes, fixes[0].previousType, { deferMeta: true });
  }
  next.metadata = withRefreshedRows(next, next.data, options);
  return next;
}

function mapValues<T>(obj: Record<string, T[]>, fn: (arr: T[]) => T[]): Record<string, T[]> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
