import { DatasetMetadata, Query, CalculatedField, AggregationOperator } from "@/shared/types";

export type QueryConfig = Query;

export interface AIPromptColumn {
  name: string;
  type: string;
  sampleValues?: string[];
  minimumValue?: number;
  maximumValue?: number;
  uniqueValueCount?: number;
  /** Holds identifiers (columnRoles.isIdName or the import's identifier role): never grouped or aggregated offline. */
  isId?: boolean;
  /** columnRoles.defaultAggregationForColumn: the operator used when the question names none (Average for Rating, not Sum). */
  defaultAggregation?: AggregationOperator;
}

export interface AIPromptContext {
  prompt: string;
  datasetName?: string;
  columns: AIPromptColumn[];
  metadata?: DatasetMetadata;
  calculatedFields?: CalculatedField[];
}

export interface AIResponse {
  /** 'hint' (offline heuristic only): the question named no column and no intent; `explanation` suggests one. */
  type: 'query' | 'formula' | 'hint';
  query?: QueryConfig;
  formula?: string;
  fieldName?: string;
  chartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'heatmap' | 'bubble' | 'histogram';
  title?: string;
  explanation?: string;
}
