import { DataRow } from "@/shared/types";
import { columnNumbers, NumericSummary, summarizeNumbers } from "@/shared/utils/numeric";

export interface ColumnNumericSummary extends NumericSummary {
  column: string;
}

/**
 * count/sum/mean/min/max/sample std per numeric column, over the rows actually shown
 * (Overview cards, DataTable column stats, export summaries). Computed from the rows with
 * the shared numeric rule, so it always agrees with the Stats page, KPI cards and charts.
 * Columns with no valid numbers are left out.
 */
export function summarizeNumericColumns(rows: DataRow[], columns: string[]): ColumnNumericSummary[] {
  const out: ColumnNumericSummary[] = [];
  for (const column of columns) {
    const summary = summarizeNumbers(columnNumbers(rows, column));
    if (summary) out.push({ column, ...summary });
  }
  return out;
}
