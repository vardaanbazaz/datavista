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
  computeRunningTotal,
  computeMovingAvg,
  computeWindowMin,
  computeWindowMax
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

    // 2. Loop and apply values/aggregates row by row
    for (let j = 0; j < len; j++) {
      const item = items[j];
      let val: string | number | null = null;
      const targetCol = query.targetColumn || "";

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
        default: {
          // Resolve bounds for FIRST_VALUE, LAST_VALUE, and aggregates
          const { start, end } = resolveFrameBounds(j, len, query.frame, hasOrderBy);
          
          if (query.functionType === "FIRST_VALUE") {
            val = computeFirstValue(items, targetCol, start);
          } else if (query.functionType === "LAST_VALUE") {
            val = computeLastValue(items, targetCol, end);
          } else if (query.functionType === "RUNNING_TOTAL") {
            val = computeRunningTotal(items, targetCol, start, end);
          } else if (query.functionType === "MOVING_AVG") {
            val = computeMovingAvg(items, targetCol, start, end);
          } else if (query.functionType === "WINDOW_MIN") {
            val = computeWindowMin(items, targetCol, start, end);
          } else if (query.functionType === "WINDOW_MAX") {
            val = computeWindowMax(items, targetCol, start, end);
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
   * Registers custom window function output columns within the dataset metadata layer.
   */
  augmentMetadata(dataset: Dataset): Dataset {
    if (!dataset.windowQueries || dataset.windowQueries.length === 0) {
      return dataset;
    }

    const columns = [...dataset.columns];
    const columnTypes = { ...dataset.columnTypes };
    const metadataColumns = dataset.metadata ? [...dataset.metadata.columns] : [];

    for (const q of dataset.windowQueries) {
      if (!columns.includes(q.alias)) {
        columns.push(q.alias);
      }
      columnTypes[q.alias] = "numeric";

      if (dataset.metadata) {
        const exists = metadataColumns.some((c) => c.name === q.alias);
        if (!exists) {
          const colMeta: ColumnMetadata = {
            id: `${dataset.id}_${q.alias}`,
            name: q.alias,
            displayName: q.alias,
            originalHeader: q.alias,
            inferredDataType: "numeric",
            nullableStatus: true,
            uniqueValueCount: 0,
            missingValueCount: 0,
            role: "measure"
          };
          metadataColumns.push(colMeta);
        }
      }
    }

    return {
      ...dataset,
      columns,
      columnTypes,
      metadata: dataset.metadata
        ? {
            ...dataset.metadata,
            columns: metadataColumns,
            columnCount: columns.length
          }
        : undefined
    };
  }
};
export default windowEngine;
