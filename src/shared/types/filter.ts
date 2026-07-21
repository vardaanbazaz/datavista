import { FilterOperator, FilterValue } from "./query";

export interface GlobalFilter {
  id: string;
  column: string;
  operator: FilterOperator;
  value: FilterValue;
  sourceWidgetId?: string; // Optional: ID of the widget that created this filter (for cross-filtering)
  linkedDatasets?: string[]; // Optional: IDs of other datasets to apply this filter to if the column matches
  datasetId?: string; // Optional: ID of the dataset this filter originated from
  label?: string; // Optional: Human-readable description of the filter (e.g. "Region = East")
}
