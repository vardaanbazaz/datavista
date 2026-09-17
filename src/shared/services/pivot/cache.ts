import { DataRow } from "@/shared/types";
import { hashQuery } from "../optimizer";
import { PivotConfig } from "./types";
import { PivotResultModel } from "./resultModel";

// Bound the number of pivot configs cached per filtered-rows array, mirroring
// filterCache/processCache's maxEntries=5 (see optimizer/cache.ts).
const MAX_ENTRIES_PER_DATA_ARRAY = 5;

/**
 * Caches pivot results (row/column hierarchy + per-cell aggregations) so
 * toggling a pivot config back and forth, or remounting the pivot view,
 * doesn't rebuild the tree and re-run every aggregation from scratch.
 *
 * Outer key is the *identity* of the filtered-rows array, not a parallel
 * state slice like activeFilters — filteredData is set from more than one
 * call site (FilterPanel, aiEngine, datasetStore), so a filters-derived key
 * could match while the underlying rows differ, silently serving a pivot
 * result against the wrong data.
 *
 * This relies on queryEngine's cache-hit path reusing the same array
 * instance for a repeat filter combination (REUSE_PROCESS returns
 * `reuseProcessResult.rows` as-is; `pageSize: 'all'` never slices it) so
 * A -> B -> A filter/config toggling still hits here. If that upstream
 * reuse-on-hit behavior ever changes to always return a fresh array, this
 * cache degrades to always missing (safe — same recompute as today) rather
 * than ever serving a stale result against different rows (unsafe).
 *
 * WeakMap keys mean entries for a filtered-rows array are freed automatically
 * once nothing else references it (e.g. the dataset is deleted or refiltered)
 * — no manual invalidation wiring needed.
 */
const pivotCache = new WeakMap<DataRow[], Map<string, PivotResultModel>>();

/**
 * Looks up a cached pivot result for this exact filtered-rows array + config.
 */
export function getCachedPivotResult(
  data: DataRow[],
  config: PivotConfig
): PivotResultModel | undefined {
  const inner = pivotCache.get(data);
  if (!inner) return undefined;

  const key = hashQuery(config);
  const result = inner.get(key);
  if (result) {
    // LRU refresh: move to the end of insertion order.
    inner.delete(key);
    inner.set(key, result);
  }
  return result;
}

/**
 * Stores a pivot result for this filtered-rows array + config, evicting the
 * least-recently-used entry once the per-array cap is exceeded.
 */
export function setCachedPivotResult(
  data: DataRow[],
  config: PivotConfig,
  result: PivotResultModel
): void {
  let inner = pivotCache.get(data);
  if (!inner) {
    inner = new Map();
    pivotCache.set(data, inner);
  }

  const key = hashQuery(config);
  if (inner.has(key)) {
    inner.delete(key);
  } else {
    while (inner.size >= MAX_ENTRIES_PER_DATA_ARRAY) {
      const oldestKey = inner.keys().next().value;
      if (oldestKey === undefined) break;
      inner.delete(oldestKey);
    }
  }

  inner.set(key, result);
}
