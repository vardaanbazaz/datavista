import { OutlierInfo, OutlierRecord } from "./types";
import { calculatePercentile } from "./descriptive";

/**
 * Identifies outliers in a column using either the IQR or Z-score method.
 */
export function computeOutliers(
  allValues: unknown[],
  method: 'iqr' | 'zscore',
  options?: { threshold?: number }
): OutlierInfo {
  const outliers: OutlierRecord[] = [];

  const numericData: { index: number; value: number }[] = [];
  for (let i = 0; i < allValues.length; i++) {
    const v = allValues[i];
    if (v !== null && v !== undefined && v !== "") {
      const num = Number(v);
      if (!isNaN(num)) {
        numericData.push({ index: i, value: num });
      }
    }
  }

  const n = numericData.length;
  const threshold = options?.threshold ?? (method === "iqr" ? 1.5 : 3.0);

  if (n === 0) {
    return {
      method,
      threshold,
      outliers: [],
      count: 0
    };
  }

  if (method === "iqr") {
    const rawNumbers = numericData.map(d => d.value).sort((a, b) => a - b);
    const q1 = calculatePercentile(rawNumbers, 25);
    const q3 = calculatePercentile(rawNumbers, 75);
    const iqr = q3 - q1;

    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;

    for (const item of numericData) {
      if (item.value < lowerBound || item.value > upperBound) {
        const score = item.value < lowerBound ? lowerBound - item.value : item.value - upperBound;
        outliers.push({
          index: item.index,
          value: item.value,
          score
        });
      }
    }
  } else {
    // Z-Score method
    const sum = numericData.reduce((s, d) => s + d.value, 0);
    const mean = sum / n;
    const variance = numericData.reduce((s, d) => s + Math.pow(d.value - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0) {
      for (const item of numericData) {
        const z = (item.value - mean) / stdDev;
        if (Math.abs(z) > threshold) {
          outliers.push({
            index: item.index,
            value: item.value,
            score: z
          });
        }
      }
    }
  }

  return {
    method,
    threshold,
    outliers,
    count: outliers.length
  };
}
