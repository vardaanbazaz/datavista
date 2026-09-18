import { DescriptiveStats } from "./types";
import { ColumnMetadata } from "@/shared/types";

/**
 * Computes the median of an array of numbers.
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes the percentile of a sorted array of numbers (linear interpolation).
 */
export function calculatePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const idx = (sortedValues.length - 1) * (p / 100);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sortedValues[low];
  return sortedValues[low] + (idx - low) * (sortedValues[high] - sortedValues[low]);
}

/**
 * Computes the mode(s) of an array of numbers.
 * Returns an empty array if all values appear exactly once (no mode).
 */
export function calculateMode(values: number[]): number[] {
  if (values.length === 0) return [];
  const frequencies = new Map<number, number>();
  let maxCount = 0;

  for (const v of values) {
    const c = (frequencies.get(v) || 0) + 1;
    frequencies.set(v, c);
    if (c > maxCount) {
      maxCount = c;
    }
  }

  if (maxCount === 1) return [];

  const modes: number[] = [];
  frequencies.forEach((count, val) => {
    if (count === maxCount) {
      modes.push(val);
    }
  });

  return modes.sort((a, b) => a - b);
}

/**
 * Computes descriptive statistics on a raw list of column values.
 * Reuses metadata fields if analyzing the full unfiltered dataset.
 */
export function computeDescriptive(
  allRawValues: unknown[],
  metadata?: ColumnMetadata,
  isFullDataset?: boolean
): DescriptiveStats {
  const totalCount = allRawValues.length;
  const useCachedMetadata = Boolean(metadata) && isFullDataset === true;

  const numericValues: number[] = [];
  let rawMissingCount = 0;
  const uniqueSet = new Set<unknown>();

  for (const v of allRawValues) {
    if (v === null || v === undefined || v === '') {
      rawMissingCount++;
    } else {
      uniqueSet.add(v);
      const num = Number(v);
      if (!isNaN(num)) {
        numericValues.push(num);
      }
    }
  }

  const validCount = numericValues.length;
  const missingCount = useCachedMetadata && metadata!.missingValueCount !== undefined ? metadata!.missingValueCount : rawMissingCount;
  const nullPercentage = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;
  const uniqueCount = useCachedMetadata && metadata!.uniqueValueCount !== undefined ? metadata!.uniqueValueCount : uniqueSet.size;

  if (validCount === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      mode: [],
      min: 0,
      max: 0,
      range: 0,
      variance: 0,
      stdDev: 0,
      iqr: 0,
      q1: 0,
      q2: 0,
      q3: 0,
      skewness: 0,
      kurtosis: 0,
      uniqueCount,
      missingCount,
      nullPercentage
    };
  }

  const min = useCachedMetadata && metadata!.minimumValue !== undefined ? metadata!.minimumValue : Math.min(...numericValues);
  const max = useCachedMetadata && metadata!.maximumValue !== undefined ? metadata!.maximumValue : Math.max(...numericValues);
  const range = max - min;

  const sum = numericValues.reduce((s, v) => s + v, 0);
  const mean = sum / validCount;

  const median = calculateMedian(numericValues);
  const mode = calculateMode(numericValues);

  // Sorting once for percentiles
  const sortedNumeric = [...numericValues].sort((a, b) => a - b);
  const q1 = calculatePercentile(sortedNumeric, 25);
  const q2 = calculatePercentile(sortedNumeric, 50);
  const q3 = calculatePercentile(sortedNumeric, 75);
  const iqr = q3 - q1;

  // Population Variance & Standard Deviation (consistent with unified query engine)
  const variance = numericValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / validCount;
  const stdDev = Math.sqrt(variance);

  // Skewness
  let skewness = 0;
  if (stdDev > 0) {
    const sumCubes = numericValues.reduce((s, v) => s + Math.pow(v - mean, 3), 0);
    skewness = (sumCubes / validCount) / Math.pow(stdDev, 3);
  }

  // Kurtosis
  let kurtosis = 0;
  if (stdDev > 0) {
    const sumQuads = numericValues.reduce((s, v) => s + Math.pow(v - mean, 4), 0);
    kurtosis = (sumQuads / validCount) / Math.pow(stdDev, 4) - 3;
  }

  return {
    count: validCount,
    sum,
    mean,
    median,
    mode,
    min,
    max,
    range,
    variance,
    stdDev,
    iqr,
    q1,
    q2,
    q3,
    skewness,
    kurtosis,
    uniqueCount,
    missingCount,
    nullPercentage
  };
}
