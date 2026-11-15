import type { DataRow } from "@/shared/types";

/** A column's distinct values with how many rows hold each, most common first (ties A→Z). */
export type ValueCount = { value: string; count: number };

// Keyed by the rows array: an edit, fix or re-import makes a new array, so a stale entry is
// never read and old ones are freed with their rows. One pass per column per dataset version.
const cache = new WeakMap<DataRow[], Map<string, ValueCount[]>>();

/**
 * Distinct values of `column` (as the categorical filter compares them: `String(cell)`), blank,
 * null and undefined cells left out, sorted by count. Cached per rows array and column.
 */
export function columnValueCounts(rows: DataRow[], column: string): ValueCount[] {
  let byColumn = cache.get(rows);
  if (!byColumn) {
    byColumn = new Map();
    cache.set(rows, byColumn);
  }
  const hit = byColumn.get(column);
  if (hit) return hit;
  const counts = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][column];
    if (cell === null || cell === undefined || cell === "") continue;
    const key = String(cell);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const list: ValueCount[] = [];
  counts.forEach((count, value) => list.push({ value, count }));
  list.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  byColumn.set(column, list);
  return list;
}

/**
 * The values a picker shows: the selected ones first (so a choice never disappears), then the
 * most common values matching `search` (case-insensitive substring), at most `limit` in all.
 * `matching` is how many values match the search; `hidden` is how many of those are not shown.
 */
export function visibleValues(
  all: ValueCount[],
  selected: readonly string[],
  search: string,
  limit: number
): { shown: ValueCount[]; matching: number; hidden: number } {
  const needle = search.trim().toLowerCase();
  const chosen = new Set(selected);
  const shown: ValueCount[] = [];
  const byValue = new Map<string, ValueCount>();
  for (const v of all) if (chosen.has(v.value)) byValue.set(v.value, v);
  for (const s of selected) shown.push(byValue.get(s) ?? { value: s, count: 0 });
  let matching = 0;
  let shownMatching = 0;
  for (const v of all) {
    if (needle && !v.value.toLowerCase().includes(needle)) continue;
    matching++;
    if (chosen.has(v.value)) {
      shownMatching++;
      continue;
    }
    if (shown.length >= limit) continue;
    shown.push(v);
    shownMatching++;
  }
  return { shown, matching, hidden: matching - shownMatching };
}
