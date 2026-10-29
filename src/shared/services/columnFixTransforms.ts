import type { ColumnFix, DataRow } from "@/shared/types";
import { toNumberOrNull } from "@/shared/utils/numeric";
import { parseCurrency, parseGroupedNumber, parsePlainOrGrouped, parseSuffixNumber } from "@/shared/utils/numberFormats";

type Cell = DataRow[string];

/** Fix kinds that turn a column into numbers. */
export const CONVERTING_FIXES: ReadonlySet<ColumnFix["kind"]> = new Set(["currency", "thousands", "numberSuffix"]);

/** One cell through one fix. Cells a fix doesn't apply to come back unchanged (same value). */
export function transformCell(v: Cell, fix: ColumnFix): Cell {
  if (v === null || v === undefined) return v ?? null;
  switch (fix.kind) {
    case "sentinel":
      return toNumberOrNull(v) === fix.sentinel ? null : v;
    case "currency":
      if (typeof v !== "string") return v;
      return parseCurrency(v)?.value ?? parsePlainOrGrouped(v) ?? v;
    case "thousands":
      if (typeof v !== "string") return v;
      return parseGroupedNumber(v)?.value ?? v;
    case "numberSuffix":
      if (typeof v === "number") return v;
      // Anything the reader can't read ("Varies with device") becomes missing; the preview
      // and the badge say how many.
      return typeof v === "string" ? (parseSuffixNumber(v)?.value ?? null) : null;
    case "mergeLabels":
      return typeof v === "string" && fix.merge!.from.includes(v) ? fix.merge!.to : v;
  }
}

/** A column's cells through one fix, with how many changed and (numberSuffix) how many couldn't be read. */
export function transformColumn(values: readonly Cell[], fix: ColumnFix): { values: Cell[]; changed: number; unconvertible: number } {
  let changed = 0;
  let unconvertible = 0;
  const out = new Array<Cell>(values.length);
  for (let i = 0; i < values.length; i++) {
    const before = values[i] ?? null;
    const after = transformCell(before, fix);
    if (after !== before) {
      changed++;
      if (after === null && fix.kind === "numberSuffix") unconvertible++;
    }
    out[i] = after;
  }
  return { values: out, changed, unconvertible };
}
