import { FilterOperator, FilterValue } from "./query";

export type HierarchyConfig = string[];

export interface DrillFilter {
  column: string;
  operator: FilterOperator;
  value: FilterValue;
}

export interface DrillState {
  currentDepth: number;
  activeFilters: DrillFilter[];
}
