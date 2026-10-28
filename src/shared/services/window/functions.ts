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
): DataRow[string] {
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
): DataRow[string] {
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
): DataRow[string] {
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
): DataRow[string] {
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
  let min = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) min = values[i];
  }
  return min;
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
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

/**
 * Extracts a single numeric value (or null for missing/non-numeric) from a partition row.
 */
function getNumericValue(partition: PartitionItem[], targetColumn: string, i: number): number | null {
  const val = partition[i].row[targetColumn];
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/**
 * Computes running sum + count for every row of a partition in a single O(n) sweep.
 *
 * `resolveFrameBounds` always produces `start`/`end` indices that are non-decreasing as
 * the row index increases (true for every frame type this engine supports: UNBOUNDED,
 * CURRENT ROW, and N PRECEDING/FOLLOWING all move forward-only as idx grows). That lets a
 * two-pointer sweep add and remove each element at most once instead of rescanning the
 * whole frame per row, turning the previous O(n) rescan x n rows into O(n) total.
 */
function computeFrameSumsAndCounts(
  partition: PartitionItem[],
  targetColumn: string,
  bounds: { start: number; end: number }[]
): { sums: number[]; counts: number[] } {
  const n = partition.length;
  const sums: number[] = new Array(n).fill(0);
  const counts: number[] = new Array(n).fill(0);
  let sum = 0;
  let count = 0;
  let left = 0;
  let right = -1;

  for (let j = 0; j < n; j++) {
    const { start, end } = bounds[j];

    while (right < end) {
      right++;
      const v = getNumericValue(partition, targetColumn, right);
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    while (left < start) {
      const v = getNumericValue(partition, targetColumn, left);
      if (v !== null) {
        sum -= v;
        count--;
      }
      left++;
    }

    sums[j] = sum;
    counts[j] = count;
  }

  return { sums, counts };
}

/**
 * O(n) RUNNING_TOTAL for a whole partition (replaces per-row computeRunningTotal calls,
 * which rescan the frame from scratch on every row — O(n^2) for the default cumulative frame).
 */
export function computeRunningTotals(
  partition: PartitionItem[],
  targetColumn: string,
  bounds: { start: number; end: number }[]
): (number | null)[] {
  const { sums, counts } = computeFrameSumsAndCounts(partition, targetColumn, bounds);
  return sums.map((s, i) => (counts[i] === 0 ? null : s));
}

/**
 * O(n) MOVING_AVG for a whole partition (replaces per-row computeMovingAvg calls).
 */
export function computeMovingAvgs(
  partition: PartitionItem[],
  targetColumn: string,
  bounds: { start: number; end: number }[]
): (number | null)[] {
  const { sums, counts } = computeFrameSumsAndCounts(partition, targetColumn, bounds);
  return sums.map((s, i) => (counts[i] === 0 ? null : s / counts[i]));
}

/**
 * Shared O(n) sweep for WINDOW_MIN/WINDOW_MAX using a monotonic deque of candidate row
 * indices. Valid under the same forward-only bounds guarantee as computeFrameSumsAndCounts:
 * each element enters and leaves the deque at most once across the whole partition. A plain
 * array + head pointer stands in for the deque so front eviction stays O(1) (no Array.shift()).
 *
 * `keepFront(incoming, candidate)` decides whether `candidate` (at the back of the deque)
 * is now useless and should be dropped in favor of `incoming`.
 */
function computeMonotonicFrameExtreme(
  partition: PartitionItem[],
  targetColumn: string,
  bounds: { start: number; end: number }[],
  keepFront: (incoming: number, candidate: number) => boolean
): (number | null)[] {
  const n = partition.length;
  const results: (number | null)[] = new Array(n).fill(null);
  const dequeIdx: number[] = [];
  let head = 0;
  let right = -1;

  for (let j = 0; j < n; j++) {
    const { start, end } = bounds[j];

    while (right < end) {
      right++;
      const v = getNumericValue(partition, targetColumn, right);
      if (v !== null) {
        while (dequeIdx.length > head) {
          const backIdx = dequeIdx[dequeIdx.length - 1];
          const backVal = getNumericValue(partition, targetColumn, backIdx) as number;
          if (keepFront(v, backVal)) {
            dequeIdx.pop();
          } else {
            break;
          }
        }
        dequeIdx.push(right);
      }
    }

    while (head < dequeIdx.length && dequeIdx[head] < start) {
      head++;
    }

    results[j] = head < dequeIdx.length
      ? (getNumericValue(partition, targetColumn, dequeIdx[head]) as number)
      : null;
  }

  return results;
}

/**
 * O(n) WINDOW_MIN for a whole partition (replaces per-row computeWindowMin calls).
 */
export function computeWindowMins(
  partition: PartitionItem[],
  targetColumn: string,
  bounds: { start: number; end: number }[]
): (number | null)[] {
  return computeMonotonicFrameExtreme(partition, targetColumn, bounds, (incoming, candidate) => incoming <= candidate);
}

/**
 * O(n) WINDOW_MAX for a whole partition (replaces per-row computeWindowMax calls).
 */
export function computeWindowMaxs(
  partition: PartitionItem[],
  targetColumn: string,
  bounds: { start: number; end: number }[]
): (number | null)[] {
  return computeMonotonicFrameExtreme(partition, targetColumn, bounds, (incoming, candidate) => incoming >= candidate);
}
