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
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { findMisalignedRows } from "./dataQuality";

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

export type RemovedReason = "duplicate" | "misaligned";

const reasonOf = (r: RemovedRow): RemovedReason => r.reason ?? "duplicate";

/** Metadata counts of the removed rows, by reason (a zero count is left out). */
function withRemovedCounts(meta: NonNullable<Dataset["metadata"]>, removed: readonly RemovedRow[]): NonNullable<Dataset["metadata"]> {
  const { removedDuplicateCount: _d, removedMisalignedCount: _m, ...rest } = meta;
  const dup = removed.filter((r) => reasonOf(r) === "duplicate").length;
  const mis = removed.length - dup;
  return { ...rest, ...(dup > 0 ? { removedDuplicateCount: dup } : {}), ...(mis > 0 ? { removedMisalignedCount: mis } : {}) };
}

/** True when rows with this reason are currently removed. */
export function hasRemovedRows(dataset: Dataset, reason: RemovedReason): boolean {
  return (dataset.removedDuplicates ?? []).some((r) => reasonOf(r) === reason);
}

/**
 * Positions in the full data (before any removal) of rows at `current` positions of
 * dataset.data. `current` must be ascending.
 */
export function toOriginalIndices(dataset: Dataset, current: readonly number[]): number[] {
  const removed = (dataset.removedDuplicates ?? []).map((r) => r.index).sort((a, b) => a - b);
  const out: number[] = [];
  let j = 0;
  let shift = 0;
  for (const c of current) {
    // Original index o = c + (removed indices below o): advance while the next removed one is at or below.
    while (j < removed.length && removed[j] <= c + shift) {
      shift++;
      j++;
    }
    out.push(c + shift);
  }
  return out;
}

/**
 * Takes the rows at `originalIndices` (positions in the full data, before any removal) out of
 * the dataset. The rows and their per-row source cells are added to Dataset.removedDuplicates
 * tagged with `reason`, so restoreRemovedRows can put them back where they were. Indices
 * already removed (for either reason) are skipped.
 */
export function removeRows(dataset: Dataset, originalIndices: readonly number[], reason: RemovedReason, options: FixOptions = {}): Dataset {
  const meta = dataset.metadata;
  const existing = dataset.removedDuplicates ?? [];
  const already = new Set(existing.map((r) => r.index));
  const targets = [...new Set(originalIndices)].filter((i) => !already.has(i)).sort((a, b) => a - b);
  if (!meta || targets.length === 0) return dataset;
  const sortedExisting = existing.map((r) => r.index).sort((a, b) => a - b);
  // Current position of an original index = original − removed rows before it.
  let j = 0;
  const current = targets.map((o) => {
    while (j < sortedExisting.length && sortedExisting[j] < o) j++;
    return o - j;
  });
  const added: RemovedRow[] = targets.map((index, k) => {
    const at = current[k];
    const entry: RemovedRow = { index, row: dataset.data[at] };
    if (reason !== "duplicate") entry.reason = reason;
    if (dataset.dateSourceValues) entry.dateSource = Object.fromEntries(Object.entries(dataset.dateSourceValues).map(([c, v]) => [c, v[at]]));
    if (dataset.fixSourceValues) entry.fixSource = Object.fromEntries(Object.entries(dataset.fixSourceValues).map(([c, v]) => [c, v[at]]));
    return entry;
  });
  const drop = new Set(current);
  const keep = <T,>(arr: T[]) => arr.filter((_, i) => !drop.has(i));
  const data = keep(dataset.data);
  const removed = [...existing, ...added].sort((a, b) => a.index - b.index);
  const next: Dataset = {
    ...dataset,
    data,
    ...(dataset.dateSourceValues ? { dateSourceValues: mapValues(dataset.dateSourceValues, keep) } : {}),
    ...(dataset.fixSourceValues ? { fixSourceValues: mapValues(dataset.fixSourceValues, keep) } : {}),
  };
  next.removedDuplicates = removed;
  next.metadata = withRemovedCounts(withRefreshedRows(next, data, options)!, removed);
  return next;
}

/**
 * Puts back the rows removed for `reason`, at their original positions among the rows still
 * there (rows removed for the other reason stay out), and re-applies column fixes to them.
 */
export function restoreRemovedRows(dataset: Dataset, reason: RemovedReason, options: FixOptions = {}): Dataset {
  const meta = dataset.metadata;
  const all = dataset.removedDuplicates ?? [];
  const back = all.filter((r) => reasonOf(r) === reason);
  if (!meta || back.length === 0) return dataset;
  const stay = all.filter((r) => reasonOf(r) !== reason);
  const stayIdx = stay.map((r) => r.index).sort((a, b) => a - b);
  const total = dataset.data.length + back.length;
  // Position of a restored row = its original index − rows still removed before it.
  const insertAt = new Map<number, RemovedRow>();
  let j = 0;
  for (const r of [...back].sort((a, b) => a.index - b.index)) {
    while (j < stayIdx.length && stayIdx[j] < r.index) j++;
    insertAt.set(r.index - j, r);
  }
  const merge = <T,>(arr: T[], pick: (r: RemovedRow) => T): T[] => {
    const out = new Array<T>(total);
    let k = 0;
    for (let i = 0; i < total; i++) {
      const r = insertAt.get(i);
      out[i] = r ? pick(r) : arr[k++];
    }
    return out;
  };
  const data = merge(dataset.data, (r) => r.row as DataRow);
  const { removedDuplicates: _rows, ...withoutRemoved } = dataset;
  let next: Dataset = { ...withoutRemoved, data, ...(stay.length > 0 ? { removedDuplicates: stay } : {}) };
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
  next.metadata = { ...withRemovedCounts(meta, stay), rowCount: total };
  // Re-apply each fixed column so the restored rows carry the fixes made since.
  for (const column of Object.keys(next.fixSourceValues ?? {})) {
    const fixes = fixesOf(next, column);
    if (fixes.length > 0) next = replayColumn(next, column, fixes, fixes[0].previousType, { deferMeta: true });
  }
  next.metadata = withRefreshedRows(next, next.data, options);
  return next;
}

const misalignedCache = new WeakMap<object, WeakMap<object, number[]>>();

/**
 * Positions in dataset.data of misaligned rows (dataQuality.findMisalignedRows), over the
 * numeric and date columns from the file. A column whose metadata counts no invalid cell for
 * the same type can't fail, so it is skipped; with fewer than two columns left nothing is
 * scanned (most datasets, including the 1M-row retail file). Cached per rows array and metadata.
 */
export function misalignedRowsOf(dataset: Dataset | null | undefined): number[] {
  if (!dataset?.metadata || dataset.rowsPending) return [];
  const byMeta = misalignedCache.get(dataset.data) ?? new WeakMap<object, number[]>();
  misalignedCache.set(dataset.data, byMeta);
  const cached = byMeta.get(dataset.metadata);
  if (cached) return cached;
  const types: Record<string, string> = {};
  for (const col of dataset.metadata.columns) {
    if (col.role === "calculated" || col.role === "window") continue;
    const type = getEffectiveColumnType(dataset, col.name);
    if (type !== "numeric" && type !== "date") continue;
    const counted = col.quality && (dataset.columnTypes?.[col.name] ?? col.inferredDataType) === type;
    if (counted && col.quality!.invalidCount === 0) continue;
    types[col.name] = type;
  }
  const found = findMisalignedRows(dataset.data, types);
  byMeta.set(dataset.metadata, found);
  return found;
}

/** Takes the misaligned rows (misalignedRowsOf) out of the dataset; undo with restoreRemovedRows(…, "misaligned"). */
export function excludeMisalignedRows(dataset: Dataset, options: FixOptions = {}): Dataset {
  const current = misalignedRowsOf(dataset);
  if (current.length === 0) return dataset;
  return removeRows(dataset, toOriginalIndices(dataset, current), "misaligned", options);
}

/**
 * Removes the exact duplicate rows found at import (metadata.quality.duplicateIndices, positions
 * in the full data), keeping each first occurrence. Undo with restoreDuplicateRows.
 */
export function removeDuplicateRows(dataset: Dataset, options: FixOptions = {}): Dataset {
  if (hasRemovedRows(dataset, "duplicate")) return dataset;
  return removeRows(dataset, dataset.metadata?.quality?.duplicateIndices ?? [], "duplicate", options);
}

/** Puts back the rows removeDuplicateRows took out, at their original positions, and re-applies column fixes to them. */
export function restoreDuplicateRows(dataset: Dataset, options: FixOptions = {}): Dataset {
  return restoreRemovedRows(dataset, "duplicate", options);
}

function mapValues<T>(obj: Record<string, T[]>, fn: (arr: T[]) => T[]): Record<string, T[]> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
