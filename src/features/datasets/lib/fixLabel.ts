import type { ColumnFix } from "@/shared/types";

const quote = (v: string) => `'${v}'`;

/** The text of a fix's badge, e.g. "converted from $". */
export function fixLabel(fix: ColumnFix): string {
  switch (fix.kind) {
    case "currency":
      return fix.currency!.symbol.toUpperCase() === fix.currency!.code
        ? `converted from ${fix.currency!.symbol}`
        : `converted from ${fix.currency!.symbol} (${fix.currency!.code})`;
    case "thousands":
      return `commas removed (${fix.grouping === "indian" ? "Indian 12,34,567" : "1,234,567"} grouping)`;
    case "sentinel":
      return `${fix.sentinel} treated as missing (${fix.changedCount.toLocaleString()} cells)`;
    case "numberSuffix":
      return [
        "converted to number",
        fix.lowerBound ? `"+" values read as their lower bound` : "",
        fix.unconvertible ? `${fix.unconvertible.toLocaleString()} unreadable → missing` : "",
      ].filter(Boolean).join("; ");
    case "mergeLabels":
      return `merged ${fix.merge!.from.map(quote).join(", ")} into ${quote(fix.merge!.to)}`;
  }
}
