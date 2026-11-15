import type { ColumnCategorySummary } from "@/shared/services/stats/columnSummary";
import { formatShare } from "@/shared/utils/percent";

const TOP = 3;

/** Summary table: one row per categorical column, the top 3 values inline. */
export function CategorySummaryTable({ stats }: { stats: ColumnCategorySummary[] }) {
  return (
    <div
      className="relative max-h-[36rem] overflow-auto rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      tabIndex={0}
      role="region"
      aria-label="Categorical columns summary (scrollable)"
      data-testid="category-summary"
    >
      <table className="w-full border-collapse text-dataTable">
        <caption className="sr-only">Distinct values, missing values and the most common values of each categorical column.</caption>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-medium">Column</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Distinct</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Missing</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Most common</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((c) => (
            <tr key={c.column} className="border-b border-border last:border-b-0 align-top hover:bg-accent/50" data-testid={`category-row-${c.column}`}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">{c.column}</th>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.distinct.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.missing.toLocaleString()}</td>
              <td className="px-3 py-1.5">
                {c.distinct === 1 && c.top.length > 0 ? (
                  <>constant: {c.top[0].value}</>
                ) : c.highCardinality ? (
                  <span className="text-muted-foreground">Mostly unique values</span>
                ) : (
                  <>
                    {c.top.slice(0, TOP).map((t, i) => (
                      <span key={t.value}>
                        {i > 0 && <span className="text-muted-foreground"> · </span>}
                        {t.value} <span className="tabular-nums text-muted-foreground">{formatShare(t.count, c.rows)}</span>
                      </span>
                    ))}
                    {c.distinct > TOP && <span className="text-muted-foreground"> · {(c.distinct - TOP).toLocaleString()} more</span>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
