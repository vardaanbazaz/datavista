import { AggregationOperator, ConditionalFormatRule } from "@/shared/types";

export interface KPICardConfig {
  id: string;
  title: string;
  datasetId: string;
  primaryMetric: {
    column: string;
    aggregation: AggregationOperator;
  };
  trendConfiguration?: {
    dateColumn: string;
    comparisonPeriod: 'day' | 'week' | 'month' | 'quarter' | 'year';
  };
  sparkline: boolean;
  polarity: 'positive' | 'negative'; // 'positive' (increase is green), 'negative' (decrease is green)
  formattingRules?: ConditionalFormatRule[];
}

