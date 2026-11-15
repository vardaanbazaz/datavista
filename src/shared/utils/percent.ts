/**
 * A count as a share of a total, one decimal: "12.5%". A non-zero share that would round to
 * 0.0% is "<0.1%", and a share short of the whole that would round to 100.0% is ">99.9%", so a
 * rare value never reads as absent and a near-total never reads as all.
 */
export function formatShare(count: number, total: number): string {
  if (!total || !Number.isFinite(count) || !Number.isFinite(total)) return "0.0%";
  return formatPercent((count / total) * 100);
}

/** Same rule for a percentage already computed (0-100). */
export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return "0.0%";
  if (pct > 0 && pct < 0.05) return "<0.1%";
  if (pct < 100 && pct >= 99.95) return ">99.9%";
  return `${pct.toFixed(1)}%`;
}
