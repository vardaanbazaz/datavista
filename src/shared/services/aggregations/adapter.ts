import { QueryAggregation, DataRow } from "@/shared/types";
import { countDistinct, weightedAverage, percentile, conditionalAggregate } from "./core";

export const aggregationsAdapter = {
  /**
   * Checks if an operator is an advanced aggregation.
   */
  isAdvanced(operator: string): boolean {
    return [
      "count_distinct",
      "sum_if",
      "count_if",
      "weighted_average",
      "percentile"
    ].includes(operator);
  },

  /**
   * Computes an advanced aggregation value for a set of rows.
   */
  evaluate(agg: QueryAggregation, rows: DataRow[]): number | null {
    const { column, operator, weightColumn, conditionExpression, percentileValue } = agg;

    switch (operator) {
      case "count_distinct": {
        const values = rows.map((r) => r[column]);
        return countDistinct(values);
      }
      case "weighted_average": {
        if (!weightColumn) return null;
        const values = rows.map((r) => r[column]);
        const weights = rows.map((r) => r[weightColumn]);
        return weightedAverage(values, weights);
      }
      case "percentile": {
        const p = percentileValue !== undefined ? percentileValue : 90;
        const values = rows.map((r) => r[column]);
        return percentile(values, p);
      }
      case "sum_if": {
        if (!conditionExpression) return 0;
        return conditionalAggregate(rows, conditionExpression, column, "sum");
      }
      case "count_if": {
        if (!conditionExpression) return 0;
        return conditionalAggregate(rows, conditionExpression, column, "count");
      }
      default:
        return null;
    }
  }
};
export default aggregationsAdapter;
