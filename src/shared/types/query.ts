import { DataRow } from "./index";
import { WindowQuery } from "../services/window/types";

export type FilterOperator = 
  | 'equals' 
  | 'contains' 
  | 'in' 
  | 'between' 
  | 'greaterThan' 
  | 'lessThan' 
  | 'startsWith' 
  | 'endsWith';

export type FilterValue = 
  | string 
  | number 
  | boolean 
  | string[] 
  | number[]
  | { start?: string | Date; end?: string | Date } 
  | null;

export interface FilterCondition {
  column: string;
  operator: FilterOperator;
  value: FilterValue;
}

export interface QueryFilters {
  categoricalFilters?: Record<string, string[]>;
  dateRangeFilters?: Record<string, { start?: string | Date; end?: string | Date }>;
  search?: string;
  conditions?: FilterCondition[];
}

export interface QuerySort {
  column: string;
  direction: 'asc' | 'desc';
}

export interface QueryGroupBy {
  column: string;
  period?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

export type AggregationOperator = 
  | 'count' 
  | 'sum' 
  | 'avg' 
  | 'min' 
  | 'max' 
  | 'median' 
  | 'stddev'
  | 'count_distinct'
  | 'sum_if'
  | 'count_if'
  | 'weighted_average'
  | 'percentile';

export interface QueryAggregation {
  column: string;
  operator: AggregationOperator;
  alias: string;
  weightColumn?: string;
  conditionExpression?: string;
  percentileValue?: number;
}

export interface QueryPagination {
  page?: number;
  pageSize?: number | 'all';
}

export interface QueryOptions {
  bypassCache?: boolean;
}

export interface Query {
  filters?: QueryFilters;
  sorting?: QuerySort[];
  groupBy?: QueryGroupBy;
  aggregations?: QueryAggregation[];
  windowQueries?: WindowQuery[];
  pagination?: QueryPagination;
  options?: QueryOptions;
}

export interface QueryResultMetadata {
  executionTimeMs: number;
  cacheHit: boolean;
  totalRowsBeforeFilter: number;
  totalRowsAfterFilter: number;
  totalPages?: number;
  currentPage?: number;
  optimizerTimeSavedMs?: number;
}

export interface QueryResult {
  rows: DataRow[];
  summary?: Record<string, number>;
  metadata: QueryResultMetadata;
}
