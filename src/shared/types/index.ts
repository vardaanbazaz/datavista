import { DatasetMetadata } from "./metadata";
import { CalculatedField } from "./formula";
import { WindowQuery } from "../services/window/types";

import { ConditionalFormatRule } from "./formatting";
import { ForecastConfig } from "../services/forecasting/types";
import type { AggregationOperator } from "./query";

export interface DataRow {
  [key: string]: string | number | boolean | null;
}

export interface Dataset {
  id: string;
  name: string;
  data: DataRow[];
  columns: string[];
  columnTypes: Record<string, 'numeric' | 'categorical' | 'date'>;
  metadata?: DatasetMetadata;
  calculatedFields?: CalculatedField[];
  windowQueries?: WindowQuery[];
  version?: number;
  lastUpdated?: number;
}

export interface ChartConfig {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap' | 'area' | 'bubble' | (string & {});
  title: string;
  xAxis?: string;
  yAxis?: string;
  groupBy?: string;
  sizeBy?: string; // For bubble charts
  /** How chartData rows sharing an x-axis (and groupBy) key are reduced into yAxis's plotted value. Defaults to 'sum'. */
  aggregation?: AggregationOperator;
  data: DataRow[];
  datasetId: string; // Tracks which dataset the chart belongs to
  drillPath?: string[]; // Dimension hierarchy for drill-down
  formattingRules?: ConditionalFormatRule[];
  forecast?: ForecastConfig;
}

export interface FilterState {
  categoricalFilters: Record<string, string[]>;
  dateRangeFilters: Record<string, { start?: Date; end?: Date }>;
  /** Optional so existing FilterState literals across the codebase don't need updating. */
  numericRangeFilters?: Record<string, { min?: number; max?: number }>;
  /** Per-column substring ("contains") search on categorical columns. */
  textSearchFilters?: Record<string, string>;
  groupByColumn?: string;
  groupByPeriod?: 'day' | 'month' | 'year';
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

import { KPICardConfig } from "@/features/kpi/types";

export interface Dashboard {
  id: string;
  name: string;
  chartIds: string[];
  kpiIds?: string[];
  kpis?: KPICardConfig[];
  datasetId: string;
  createdAt: number;
  updatedAt: number;
  settings?: {
    filterState?: FilterState;
  };
  layout?: DashboardLayoutItem[];
}

export * from "./query";
export * from "./metadata";
export * from "./formula";
export * from "../services/window/types";
export * from "./filter";
export * from "./drill";
export * from "./formatting";
export * from "./serialization";
export * from "./commands";
export * from "./plugins";


