import { Dataset, DataRow, ValueCount } from "@/shared/types";
import { isHighCardinality } from "@/shared/services/dataQuality";
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

export interface ColumnCategorySummary {
  column: string;
  distinct: number;
  missing: number;
  /** Rows the shares are taken of (missing included). */
  rows: number;
  /** The 5 most common values; empty for a high-cardinality column (names, IDs, free text). */
  top: ValueCount[];
  highCardinality: boolean;
}

const TOP = 5;

/**
 * Distinct count, missing count and top 5 values per categorical column (Overview tiles).
 * When `rows` is the whole dataset, the counts stored with the column metadata are used
 * (exact, computed at import or after a fix); otherwise they are counted from the rows.
 */
export function summarizeCategoricalColumns(rows: DataRow[], columns: string[], dataset?: Dataset): ColumnCategorySummary[] {
  const whole = dataset !== undefined && rows.length === dataset.data.length;
  return columns.map((column) => {
    const meta = whole ? dataset!.metadata?.columns.find((c) => c.name === column) : undefined;
    if (meta?.quality?.topValues) {
      const high = isHighCardinality(meta.uniqueValueCount, rows.length - meta.missingValueCount);
      return { column, distinct: meta.uniqueValueCount, missing: meta.missingValueCount, rows: rows.length, top: high ? [] : meta.quality.topValues, highCardinality: high };
    }
    const counts = new Map<string, number>();
    let missing = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][column];
      if (v === null || v === undefined || v === "") { missing++; continue; }
      const key = String(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const high = isHighCardinality(counts.size, rows.length - missing);
    const top: ValueCount[] = high
      ? []
      : [...counts].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([value, count]) => ({ value, count }));
    return { column, distinct: counts.size, missing, rows: rows.length, top, highCardinality: high };
  });
}
