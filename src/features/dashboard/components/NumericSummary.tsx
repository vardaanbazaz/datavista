import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { NumericProfile } from "@/shared/services/stats/columnProfile";
import { roleLabel } from "@/shared/services/stats/columnProfile";
import { cn } from "@/shared/lib/utils";

type SortKey = "column" | "count" | "mean" | "min" | "max" | "sum" | "missing" | "invalid";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "column", label: "Column", numeric: false },
  { key: "count", label: "Count", numeric: true },
  { key: "mean", label: "Average", numeric: true },
  { key: "min", label: "Min", numeric: true },
  { key: "max", label: "Max", numeric: true },
  { key: "sum", label: "Sum", numeric: true },
  { key: "missing", label: "Missing", numeric: true },
  { key: "invalid", label: "Invalid", numeric: true },
];

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—");

/** The value a row sorts by; hidden statistics (ID sum, constant average) sort last. */
function sortValue(p: NumericProfile, key: SortKey): number | string {
  if (key === "column") return p.column.toLowerCase();
  if (key === "missing" || key === "invalid" || key === "count") return p[key];
  if (p.role === "constant") return Number.NaN;
  if ((p.role === "id" || p.role === "year") && (key === "mean" || key === "sum")) return Number.NaN;
  return p[key];
}

/**
 * Overview table of numeric columns: one row per column, tabular figures, sortable headers,
 * sticky header inside a bounded scroll area. ID/year columns show count, min and
 * max with "—" for average and sum (with their distinct count next to the name); constant
 * columns collapse to one line. Column names are shown exactly as in the data.
 */
export function NumericSummaryTable({ profiles }: { profiles: NumericProfile[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return profiles;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...profiles].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      const na = Number.isNaN(va);
      const nb = Number.isNaN(vb);
      if (na || nb) return na === nb ? 0 : na ? 1 : -1;
      return (va - vb) * dir;
    });
  }, [profiles, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: key === "column" ? "asc" : "desc" }));

  // `relative`: the cells' sr-only spans (position: absolute) stay inside this scroll box;
  // without it they widened a phone's layout viewport (HR on a 390px screen: 578px).
  return (
    <div
      className="relative max-h-[36rem] overflow-auto rounded-b-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      tabIndex={0}
      role="region"
      aria-label="Numeric columns summary (scrollable)"
      data-testid="numeric-summary"
    >
      <table className="w-full border-collapse text-dataTable">
        <caption className="sr-only">Statistics of each numeric column in the rows shown. Select a column header to sort.</caption>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr className="border-b border-border">
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground", c.numeric ? "text-right" : "text-left")}
                >
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "text-foreground",
                      c.numeric && "flex-row-reverse"
                    )}
                  >
                    {c.label}
                    <Icon className={cn("h-3.5 w-3.5", !active && "opacity-50")} aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const tag = roleLabel(p.role);
            const labelsOnly = p.role === "id" || p.role === "year";
            return (
              <tr key={p.column} className="border-b border-border last:border-b-0 hover:bg-accent/50" data-testid={`numeric-row-${p.column}`}>
                <th scope="row" className="max-w-[16rem] px-3 py-1.5 text-left font-medium">
                  <span className="block truncate" title={p.column}>{p.column}</span>
                  {tag && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {tag}
                      {labelsOnly && p.distinct !== null && ` · ${p.distinct.toLocaleString()} distinct`}
                    </span>
                  )}
                </th>
                {p.role === "constant" ? (
                  <>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.count.toLocaleString()}</td>
                    <td colSpan={4} className="px-3 py-1.5 text-left text-muted-foreground">
                      constant: <span className="tabular-nums text-foreground">{fmt(p.min)}</span>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-1.5 text-right tabular-nums">{p.count.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{labelsOnly ? <Hidden why="average" /> : fmt(p.mean)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.min)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.max)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{labelsOnly ? <Hidden why="sum" /> : fmt(p.sum)}</td>
                  </>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums">{p.missing.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{p.invalid.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Hidden({ why }: { why: string }) {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">no {why}: the values are labels</span>
    </span>
  );
}
