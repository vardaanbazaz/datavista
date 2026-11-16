import type { AggregationOperator } from "@/shared/types";

/**
 * Card title the KPI builder suggests for an aggregation of a column: "Average Rating",
 * "Total Revenue", "Row count". Count of rows names no column.
 */
export function kpiAutoTitle(aggregation: AggregationOperator, column: string): string {
  if (aggregation === "count_rows") return "Row count";
  if (!column) return "";
  switch (aggregation) {
    case "sum": return `Total ${column}`;
    case "avg": return `Average ${column}`;
    case "count": return `Count of ${column}`;
    case "count_distinct": return `Distinct ${column}`;
    case "min": return `Minimum ${column}`;
    case "max": return `Maximum ${column}`;
    case "median": return `Median ${column}`;
    case "stddev": return `Std. deviation of ${column}`;
    default: return column;
  }
}

/** Title field state: `edited` once the user has typed in it; from then on it is never replaced. */
export interface KpiTitleState {
  title: string;
  edited: boolean;
}

export type KpiTitleAction =
  /** The aggregation or column changed (or the builder opened): follow it unless edited. */
  | { type: "auto"; aggregation: AggregationOperator; column: string }
  /** The user typed in the field. */
  | { type: "edit"; title: string }
  /** Open the builder on a saved card or a new one. */
  | { type: "reset"; state: KpiTitleState };

export function kpiTitleReducer(state: KpiTitleState, action: KpiTitleAction): KpiTitleState {
  switch (action.type) {
    case "auto": {
      if (state.edited) return state;
      const title = kpiAutoTitle(action.aggregation, action.column);
      return title === state.title ? state : { title, edited: false };
    }
    case "edit":
      return { title: action.title, edited: true };
    case "reset":
      return action.state;
  }
}

/**
 * Title state for opening the builder: a new card follows the measure; a saved card keeps its
 * title, and only follows changes if that title is still the suggestion for its own settings.
 */
export function initialKpiTitle(saved?: { title: string; aggregation: AggregationOperator; column: string }): KpiTitleState {
  if (!saved) return { title: "", edited: false };
  return { title: saved.title, edited: saved.title !== kpiAutoTitle(saved.aggregation, saved.column) };
}
