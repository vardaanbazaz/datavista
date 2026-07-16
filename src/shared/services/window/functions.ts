import { DataRow } from "@/shared/types";
import { PartitionItem } from "./partitioner";
import { WindowOrderBy } from "./types";

/**
 * Checks if two rows are peers (have identical values for all ORDER BY columns).
 */
export function arePeers(a: DataRow, b: DataRow, orderBy?: WindowOrderBy[]): boolean {
  if (!orderBy || orderBy.length === 0) return true;
  return orderBy.every(rule => a[rule.column] === b[rule.column]);
}

/**
 * Computes ROW_NUMBER values for a partition.
 */
export function computeRowNumber(partition: PartitionItem[]): number[] {
  return partition.map((_, idx) => idx + 1);
}

/**
 * Computes RANK values for a partition.
 */
export function computeRank(partition: PartitionItem[], orderBy?: WindowOrderBy[]): number[] {
  const ranks: number[] = [];
  let lastRank = 1;
  
  for (let i = 0; i < partition.length; i++) {
    if (i === 0) {
      ranks.push(1);
    } else if (arePeers(partition[i].row, partition[i - 1].row, orderBy)) {
      ranks.push(lastRank);
    } else {
      lastRank = i + 1;
      ranks.push(lastRank);
    }
  }
  return ranks;
}

/**
 * Computes DENSE_RANK values for a partition.
 */
export function computeDenseRank(partition: PartitionItem[], orderBy?: WindowOrderBy[]): number[] {
  const ranks: number[] = [];
  let lastRank = 1;

  for (let i = 0; i < partition.length; i++) {
    if (i === 0) {
      ranks.push(1);
    } else if (arePeers(partition[i].row, partition[i - 1].row, orderBy)) {
      ranks.push(lastRank);
    } else {
      lastRank = lastRank + 1;
      ranks.push(lastRank);
    }
  }
  return ranks;
}

/**
 * Computes PERCENT_RANK values for a partition.
 */
export function computePercentRank(partition: PartitionItem[], orderBy?: WindowOrderBy[]): number[] {
  const n = partition.length;
  if (n <= 1) return partition.map(() => 0);

  const ranks = computeRank(partition, orderBy);
  return ranks.map(r => (r - 1) / (n - 1));
}

/**
 * Computes NTILE values for a partition.
 */
export function computeNtile(partition: PartitionItem[], ntileGroups: number): number[] {
  const n = partition.length;
  if (ntileGroups <= 0) return partition.map(() => 1);

  return partition.map((_, idx) => {
    return Math.floor((idx * ntileGroups) / n) + 1;
  });
}

/**
 * Computes LAG values.
 */
export function computeLag(
  partition: PartitionItem[],
  idx: number,
  targetColumn: string,
  offset = 1,
  defaultValue: string | number | null = null
): string | number | null {
  const targetIdx = idx - offset;
  if (targetIdx < 0 || targetIdx >= partition.length) return defaultValue;
  return partition[targetIdx].row[targetColumn] ?? defaultValue;
}

/**
 * Computes LEAD values.
 */
export function computeLead(
  partition: PartitionItem[],
  idx: number,
  targetColumn: string,
  offset = 1,
  defaultValue: string | number | null = null
): string | number | null {
  const targetIdx = idx + offset;
  if (targetIdx < 0 || targetIdx >= partition.length) return defaultValue;
  return partition[targetIdx].row[targetColumn] ?? defaultValue;
}

/**
 * Computes FIRST_VALUE in the resolved frame.
 */
export function computeFirstValue(
  partition: PartitionItem[],
  targetColumn: string,
  frameStart: number
): string | number | null {
  if (frameStart < 0 || frameStart >= partition.length) return null;
  return partition[frameStart].row[targetColumn] ?? null;
}

/**
 * Computes LAST_VALUE in the resolved frame.
 */
export function computeLastValue(
  partition: PartitionItem[],
  targetColumn: string,
  frameEnd: number
): string | number | null {
  if (frameEnd < 0 || frameEnd >= partition.length) return null;
  return partition[frameEnd].row[targetColumn] ?? null;
}

/**
 * Helper to extract numeric values from partition rows in the frame bounds.
 */
function getFrameNumericValues(
  partition: PartitionItem[],
  targetColumn: string,
  start: number,
  end: number
): number[] {
  const values: number[] = [];
  for (let i = start; i <= end; i++) {
    const val = partition[i].row[targetColumn];
    if (val !== null && val !== undefined && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) {
        values.push(num);
      }
    }
  }
  return values;
}

/**
 * Computes RUNNING_TOTAL (sum) in the resolved frame.
 */
export function computeRunningTotal(
  partition: PartitionItem[],
  targetColumn: string,
  frameStart: number,
  frameEnd: number
): number | null {
  const values = getFrameNumericValues(partition, targetColumn, frameStart, frameEnd);
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0);
}

/**
 * Computes MOVING_AVG (average) in the resolved frame.
 */
export function computeMovingAvg(
  partition: PartitionItem[],
  targetColumn: string,
  frameStart: number,
  frameEnd: number
): number | null {
  const values = getFrameNumericValues(partition, targetColumn, frameStart, frameEnd);
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Computes WINDOW_MIN in the resolved frame.
 */
export function computeWindowMin(
  partition: PartitionItem[],
  targetColumn: string,
  frameStart: number,
  frameEnd: number
): number | null {
  const values = getFrameNumericValues(partition, targetColumn, frameStart, frameEnd);
  if (values.length === 0) return null;
  return Math.min(...values);
}

/**
 * Computes WINDOW_MAX in the resolved frame.
 */
export function computeWindowMax(
  partition: PartitionItem[],
  targetColumn: string,
  frameStart: number,
  frameEnd: number
): number | null {
  const values = getFrameNumericValues(partition, targetColumn, frameStart, frameEnd);
  if (values.length === 0) return null;
  return Math.max(...values);
}
