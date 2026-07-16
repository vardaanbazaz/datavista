import { DatasetMetadata } from "./metadata";
import { CalculatedField } from "./formula";
import { WindowQuery } from "../services/window/types";

export interface DataRow {
  [key: string]: string | number | null;
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
}

export interface ChartConfig {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap' | 'area' | 'bubble';
  title: string;
  xAxis?: string;
  yAxis?: string;
  groupBy?: string;
  sizeBy?: string; // For bubble charts
  data: DataRow[];
  datasetId: string; // Tracks which dataset the chart belongs to
}

export interface FilterState {
  categoricalFilters: Record<string, string[]>;
  dateRangeFilters: Record<string, { start?: Date; end?: Date }>;
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

export interface Dashboard {
  id: string;
  name: string;
  chartIds: string[];
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

