import { DataRow, Dataset, ColumnMetadata } from "@/shared/types";
import { WindowQuery, WindowFrame } from "./types";
import { partitionAndSort, PartitionItem } from "./partitioner";
import {
  computeRowNumber,
  computeRank,
  computeDenseRank,
  computePercentRank,
  computeNtile,
  computeLag,
  computeLead,
  computeFirstValue,
  computeLastValue,
  computeRunningTotals,
  computeMovingAvgs,
  computeWindowMins,
  computeWindowMaxs
} from "./functions";

/**
 * Resolves the start and end row indices of the window frame for the row at `idx` in a partition of size `length`.
 */
export function resolveFrameBounds(
  idx: number,
  length: number,
  frame?: WindowFrame,
  hasOrderBy = false
): { start: number; end: number } {
  if (!frame) {
    if (hasOrderBy) {
      // Default: ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      return { start: 0, end: idx };
    } else {
      // Default: ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
      return { start: 0, end: length - 1 };
    }
  }

  const { start, end } = frame;
  let startIdx = 0;
  let endIdx = length - 1;

  // 1. Start Bound
  switch (start.type) {
    case "UNBOUNDED_PRECEDING":
      startIdx = 0;
      break;
    case "CURRENT_ROW":
      startIdx = idx;
      break;
    case "PRECEDING":
      startIdx = Math.max(0, idx - (start.value ?? 0));
      break;
    case "FOLLOWING":
      startIdx = Math.min(length - 1, idx + (start.value ?? 0));
      break;
  }

  // 2. End Bound
  switch (end.type) {
    case "UNBOUNDED_FOLLOWING":
      endIdx = length - 1;
      break;
    case "CURRENT_ROW":
      endIdx = idx;
      break;
    case "PRECEDING":
      endIdx = Math.max(0, idx - (end.value ?? 0));
      break;
    case "FOLLOWING":
      endIdx = Math.min(length - 1, idx + (end.value ?? 0));
      break;
  }

  return { start: startIdx, end: endIdx };
}

/**
 * Executes a single window query over the cloned dataset rows.
 */
function executeSingleQuery(data: DataRow[], query: WindowQuery): DataRow[] {
  // Partition and sort
  const partitions = partitionAndSort(data, query.partitionBy, query.orderBy);

  partitions.forEach((items) => {
    const len = items.length;
    
    // 1. Precompute ranking outputs if applicable
    let ranks: number[] = [];
    const hasOrderBy = !!query.orderBy && query.orderBy.length > 0;
    
    switch (query.functionType) {
      case "ROW_NUMBER":
        ranks = computeRowNumber(items);
        break;
      case "RANK":
        ranks = computeRank(items, query.orderBy);
        break;
      case "DENSE_RANK":
        ranks = computeDenseRank(items, query.orderBy);
        break;
      case "PERCENT_RANK":
        ranks = computePercentRank(items, query.orderBy);
        break;
      case "NTILE":
        ranks = computeNtile(items, query.ntileGroups ?? 1);
        break;
    }

    const targetCol = query.targetColumn || "";

    // 1b. Cumulative/rolling aggregates rescan their frame per row if computed one row at a
    // time (O(n^2) over a partition). Resolve every row's frame bounds up front and run a
    // single O(n) sweep instead — see computeRunningTotals/computeMovingAvgs/computeWindowMins/
    // computeWindowMaxs in ./functions for why the forward-only bounds make that sweep valid.
    let cumulativeResults: (number | null)[] | null = null;
    if (
      query.functionType === "RUNNING_TOTAL" ||
      query.functionType === "MOVING_AVG" ||
      query.functionType === "WINDOW_MIN" ||
      query.functionType === "WINDOW_MAX"
    ) {
      const bounds = items.map((_, j) => resolveFrameBounds(j, len, query.frame, hasOrderBy));
      switch (query.functionType) {
        case "RUNNING_TOTAL":
          cumulativeResults = computeRunningTotals(items, targetCol, bounds);
          break;
        case "MOVING_AVG":
          cumulativeResults = computeMovingAvgs(items, targetCol, bounds);
          break;
        case "WINDOW_MIN":
          cumulativeResults = computeWindowMins(items, targetCol, bounds);
          break;
        case "WINDOW_MAX":
          cumulativeResults = computeWindowMaxs(items, targetCol, bounds);
          break;
      }
    }

    // 2. Loop and apply values/aggregates row by row
    for (let j = 0; j < len; j++) {
      const item = items[j];
      let val: string | number | null = null;

      switch (query.functionType) {
        case "ROW_NUMBER":
        case "RANK":
        case "DENSE_RANK":
        case "PERCENT_RANK":
        case "NTILE":
          val = ranks[j];
          break;
        case "LAG":
          val = computeLag(items, j, targetCol, query.offset, query.defaultValue);
          break;
        case "LEAD":
          val = computeLead(items, j, targetCol, query.offset, query.defaultValue);
          break;
        case "RUNNING_TOTAL":
        case "MOVING_AVG":
        case "WINDOW_MIN":
        case "WINDOW_MAX":
          val = cumulativeResults![j];
          break;
        default: {
          // Resolve bounds for FIRST_VALUE / LAST_VALUE (single-index lookups, no rescan)
          const { start, end } = resolveFrameBounds(j, len, query.frame, hasOrderBy);

          if (query.functionType === "FIRST_VALUE") {
            val = computeFirstValue(items, targetCol, start);
          } else if (query.functionType === "LAST_VALUE") {
            val = computeLastValue(items, targetCol, end);
          }
          break;
        }
      }

      item.row[query.alias] = val;
    }
  });

  // Reassemble dataset in the original order
  const result: DataRow[] = new Array(data.length);
  partitions.forEach((items) => {
    for (const item of items) {
      result[item.originalIndex] = item.row;
    }
  });

  return result;
}

export const windowEngine = {
  /**
   * Executes window function queries, returning a new immutable dataset array with columns appended.
   */
  execute(data: DataRow[], queries: WindowQuery[]): DataRow[] {
    if (queries.length === 0) return data;

    // Shallow copy rows to avoid mutating original objects
    let result = data.map((row) => ({ ...row }));

    for (const query of queries) {
      result = executeSingleQuery(result, query);
    }

    return result;
  },

  /**
   * Materializes window function output columns into dataset.data (mirrors
   * formulaEngine.evaluateCalculatedFields' pattern) and keeps columns/columnTypes/
   * metadata.columns in sync — including pruning aliases for window queries that
   * were since removed or renamed, so no phantom column definitions survive.
   */
  evaluate(dataset: Dataset): Dataset {
    const currentQueries = dataset.windowQueries || [];
    const currentAliases = new Set(currentQueries.map((q) => q.alias));

    // Prior window-derived column names, identified via the dedicated 'window'
    // metadata role (exclusive to this function — unlike 'measure', which raw
    // numeric columns also carry, so it can't be used to tell them apart).
    const priorAliasNames = new Set(
      (dataset.metadata?.columns || []).filter((c) => c.role === "window").map((c) => c.name)
    );

    if (currentAliases.size === 0 && priorAliasNames.size === 0) {
      return dataset;
    }

    // 1. Strip any alias no longer present in the current windowQueries list
    // (removed or renamed) — same reconciliation formulaEngine does for
    // calculated fields, but keyed off a role that's actually unambiguous.
    const cleanData: DataRow[] = dataset.data.map((row) => {
      const cleanRow: DataRow = {};
      Object.keys(row).forEach((key) => {
        if (priorAliasNames.has(key) && !currentAliases.has(key)) return;
        cleanRow[key] = row[key];
      });
      return cleanRow;
    });

    // 2. Recompute every current window query's values, real per-row values.
    const materialized = currentAliases.size > 0 ? this.execute(cleanData, currentQueries) : cleanData;

    // 3. Rebuild columns/columnTypes/metadata.columns: drop stale window-derived
    // entries not in currentAliases, keep everything else, re-add current aliases.
    const columns = dataset.columns.filter((c) => !priorAliasNames.has(c) || currentAliases.has(c));
    for (const alias of currentAliases) {
      if (!columns.includes(alias)) columns.push(alias);
    }

    const columnTypes: Record<string, "numeric" | "categorical" | "date"> = {};
    for (const [k, v] of Object.entries(dataset.columnTypes)) {
      if (!priorAliasNames.has(k) || currentAliases.has(k)) columnTypes[k] = v;
    }
    for (const alias of currentAliases) {
      columnTypes[alias] = "numeric";
    }

    let metadata = dataset.metadata;
    if (metadata) {
      const metadataColumns = metadata.columns.filter(
        (c) => c.role !== "window" || currentAliases.has(c.name)
      );
      for (const q of currentQueries) {
        if (!metadataColumns.some((c) => c.name === q.alias)) {
          const colMeta: ColumnMetadata = {
            id: `${dataset.id}_${q.alias}`,
            name: q.alias,
            displayName: q.alias,
            originalHeader: q.alias,
            inferredDataType: "numeric",
            nullableStatus: true,
            uniqueValueCount: 0,
            missingValueCount: 0,
            role: "window"
          };
          metadataColumns.push(colMeta);
        }
      }
      metadata = {
        ...metadata,
        columns: metadataColumns,
        columnCount: columns.length
      };
    }

    return {
      ...dataset,
      data: materialized,
      columns,
      columnTypes,
      metadata
    };
  }
};
export default windowEngine;
