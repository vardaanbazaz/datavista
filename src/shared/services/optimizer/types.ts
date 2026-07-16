import { DataRow, QueryResult } from "@/shared/types";

export type QueryHash = string;

export interface CacheEntry<T> {
  key: string;
  datasetId: string;
  data: T;
  rowCount: number;
  insertedAt: number;
  lastAccessedAt: number;
  hitCount: number;
}

export type ExecutionNode =
  | 'FILTER'             // Run full filtering
  | 'PROCESS'            // Run sorting, grouping, aggregations, windowing
  | 'PAGINATE'           // Run pagination slicing
  | 'REUSE_FILTER'       // Retrieve filtered rows from cache
  | 'REUSE_PROCESS';     // Retrieve processed result from cache

export interface ExecutionPlan {
  planId: string;
  filterCacheKey: string;
  processCacheKey: string;
  steps: ExecutionNode[];
  reuseFilterData: DataRow[] | null;
  reuseProcessResult: QueryResult | null;
}

export interface OptimizerMetrics {
  cacheHits: number;
  cacheMisses: number;
  estimatedTimeSavedMs: number;
}
