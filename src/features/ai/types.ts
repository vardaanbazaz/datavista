import { DatasetMetadata, Query, CalculatedField } from "@/shared/types";

export type QueryConfig = Query;

export interface AIPromptColumn {
  name: string;
  type: string;
  sampleValues?: string[];
  minimumValue?: number;
  maximumValue?: number;
  uniqueValueCount?: number;
}

export interface AIPromptContext {
  prompt: string;
  datasetName?: string;
  columns: AIPromptColumn[];
  metadata?: DatasetMetadata;
  calculatedFields?: CalculatedField[];
}

export interface AIResponse {
  type: 'query' | 'formula';
  query?: QueryConfig;
  formula?: string;
  fieldName?: string;
  chartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'heatmap' | 'bubble' | 'histogram';
  title?: string;
  explanation?: string;
}
