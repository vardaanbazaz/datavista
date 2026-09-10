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
   * Deterministic alias for value field aggregations. Must incorporate every
   * parameter that changes the computed value (weightColumn, conditionExpression,
   * percentileValue) — otherwise two value fields on the same column+operator
   * with different params collide in the results map and silently overwrite
   * each other.
   */
  getValueFieldAlias(vf: PivotValueField): string {
    const parts = [vf.operator, vf.column];
    if (vf.weightColumn) parts.push(`w:${vf.weightColumn}`);
    if (vf.conditionExpression) parts.push(`c:${vf.conditionExpression}`);
    if (vf.percentileValue !== undefined && vf.percentileValue !== null) {
      parts.push(`p:${vf.percentileValue}`);
    }
    return parts.join("_");
  }
};
