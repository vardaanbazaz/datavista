import { ColumnMetadata } from "@/shared/types";

export interface DescriptiveStats {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  min: number;
  max: number;
  range: number;
  variance: number;
  stdDev: number;
  iqr: number;
  q1: number;
  q2: number;
  q3: number;
  skewness: number;
  kurtosis: number;
  uniqueCount: number;
  missingCount: number;
  nullPercentage: number;
}

export interface OutlierRecord {
  index: number; // index in the original data array
  value: number;
  score: number; // z-score or distance from IQR bounds
}

export interface OutlierInfo {
  method: 'iqr' | 'zscore';
  threshold: number;
  outliers: OutlierRecord[];
  count: number;
}

export interface CorrelationMatrix {
  columns: string[];
  matrix: Record<string, Record<string, number | null>>;
}

export interface PivotStats {
  rowPath?: string[];
  colPath?: string[];
  valueFieldAlias: string;
  stats: DescriptiveStats;
}
