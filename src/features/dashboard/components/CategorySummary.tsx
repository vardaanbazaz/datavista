import type { ColumnCategorySummary } from "@/shared/services/stats/columnSummary";

const pct = (count: number, rows: number) => (rows ? ((count / rows) * 100).toFixed(1) : "0.0");
const TOP = 3;

/** Ledger: one row per categorical column, the top 3 values inline. */
export function CategoryLedger({ stats }: { stats: ColumnCategorySummary[] }) {
  return (
    <div
      className="max-h-[36rem] overflow-auto rounded-sm border border-border bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      role="region"
      aria-label="Categorical columns ledger (scrollable)"
      data-testid="category-ledger"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Distinct values, missing values and the most common values of each categorical column.</caption>
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b-[3px] border-double border-borderStrong text-muted-foreground">
            <th scope="col" className="px-3 py-2 text-left font-semibold">Column</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Distinct</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Missing</th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">Most common</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((c) => (
            <tr key={c.column} className="border-b border-border/70 last:border-b-0 align-top" data-testid={`category-tile-${c.column}`}>
              <th scope="row" className="px-3 py-2 text-left font-normal">{c.column}</th>
              <td className="px-3 py-2 text-right font-mono">{c.distinct.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono">{c.missing.toLocaleString()}</td>
              <td className="px-3 py-2">
                {c.distinct === 1 && c.top.length > 0 ? (
                  <>constant: {c.top[0].value}</>
                ) : c.highCardinality ? (
                  <span className="text-muted-foreground">Mostly unique values</span>
                ) : (
                  <>
                    {c.top.slice(0, TOP).map((t, i) => (
                      <span key={t.value}>
                        {i > 0 && <span className="text-muted-foreground"> · </span>}
                        {t.value} <span className="font-mono text-muted-foreground">{pct(t.count, c.rows)}%</span>
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
