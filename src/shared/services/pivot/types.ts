import { AggregationOperator } from "../query";

export interface PivotValueField {
  column: string; // The data row property name (either imported or calculated)
  operator: AggregationOperator; // 'count' | 'sum' | 'avg' | 'min' | 'max' | 'median' | 'stddev'
  displayName: string;
  weightColumn?: string;
  conditionExpression?: string;
  percentileValue?: number;
}

export interface PivotDimensionSort {
  column: string;
  direction: 'asc' | 'desc';
}

export interface PivotValueSort {
  valueFieldAlias: string;
  columnPath: string[]; // e.g. ['2023', 'Q1'] or [] for Grand Total
  direction: 'asc' | 'desc';
}

export interface PivotDisplayOptions {
  showRowTotals?: boolean;
  showColumnTotals?: boolean;
  showGrandTotals?: boolean;
  layout?: 'compact' | 'tabular';
}

export interface PivotConfig {
  rowDimensions: string[];    // e.g. ['Region', 'Category']
  columnDimensions: string[]; // e.g. ['Year', 'Quarter']
  valueFields: PivotValueField[];
  dimensionSorts?: PivotDimensionSort[];
  valueSorts?: PivotValueSort[];
  displayOptions?: PivotDisplayOptions;
}

export interface PivotRowNode {
  key: string;            // The value of the dimension, e.g. "North". Root has key "Grand Total"
  dimension?: string;     // The dimension column name, e.g. "Region"
  level: number;          // Nesting depth: -1 for root, 0, 1...
  path: string[];         // e.g. ["North", "Electronics"]
  children: PivotRowNode[];
  isTotal: boolean;       // True if this is a sub-total row or Grand Total row
  values: Record<string, Record<string, number | null>>; // columnKey -> valueFieldAlias -> value
}

export interface PivotColumnNode {
  key: string;            // The value of the dimension, e.g. "2023". Root has key "Grand Total"
  dimension?: string;     // The dimension column name, e.g. "Year"
  level: number;          // Nesting depth: -1 for root, 0, 1...
  path: string[];         // e.g. ["2023", "Q1"]
  children: PivotColumnNode[];
  isTotal: boolean;       // True if this is a sub-total column or Grand Total column
}
