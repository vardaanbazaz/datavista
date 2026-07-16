export enum AdvancedAggregationType {
  CountDistinct = "count_distinct",
  SumIf = "sum_if",
  CountIf = "count_if",
  WeightedAverage = "weighted_average",
  Percentile = "percentile"
}

export interface AggregationConfig {
  weightColumn?: string;
  conditionExpression?: string;
  percentileValue?: number;
}
