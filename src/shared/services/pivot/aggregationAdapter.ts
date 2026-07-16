import { PivotValueField } from "./types";
import { QueryAggregation } from "@/shared/types";

export const aggregationAdapter = {
  /**
   * Translates pivot value fields into unified Query Engine aggregations.
   */
  toQueryAggregations(valueFields: PivotValueField[]): QueryAggregation[] {
    return valueFields.map(vf => ({
      column: vf.column,
      operator: vf.operator,
      alias: this.getValueFieldAlias(vf),
      weightColumn: vf.weightColumn,
      conditionExpression: vf.conditionExpression,
      percentileValue: vf.percentileValue
    }));
  },

  /**
   * Deterministic alias for value field aggregations.
   */
  getValueFieldAlias(vf: PivotValueField): string {
    return `${vf.operator}_${vf.column}`;
  }
};
