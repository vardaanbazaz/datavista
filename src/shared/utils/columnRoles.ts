import { ColumnMetadata, Dataset, AggregationOperator } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";

/**
 * Numeric columns whose numbers are labels, not amounts: adding them up (or averaging
 * them) gives a number nobody can use, e.g. "Sum of release_year" = 220,000.
 * - `year`: a whole number 1800–2100 in every cell, and the name has a "year"/"yr" word.
 * - `id`: the name has an id-like word (id, code, no, number, zip, pin, phone, index, invoice), or
 *   is pandas' unnamed index column ("Unnamed: 0"). Names only: "almost every value is a
 *   distinct integer" also describes amounts (HR MonthlyRate is 97% distinct).
 * Only a hint for defaults and notes: the stored column type is left alone.
 */
export type AggregationFlag = "year" | "id";

const YEAR_WORDS = new Set(["year", "yr"]);
const ID_WORDS = new Set(["id", "code", "no", "number", "zip", "pin", "phone", "index", "invoice"]);

/**
 * Words of a column name: split on anything that isn't a letter or digit, on lower→upper
 * camelCase steps and on letter↔digit steps, lower-cased. "release_year" → [release, year],
 * "CustomerID" → [customer, id], "StockCode" → [stock, code], "YearsAtCompany" → [years, at,
 * company]. Matching whole words keeps "paid", "valid" and "width" from matching "id".
 * (A regex `\b` doesn't work here: `_` is a word character, so `\byear\b` misses "release_year".)
 */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The name says the column holds identifiers (an ID word, or pandas' "Unnamed: N" index column). */
export function isIdName(name: string): boolean {
  const words = nameWords(name);
  if (words.some((w) => ID_WORDS.has(w))) return true;
  return words.length === 2 && words[0] === "unnamed" && /^\d+$/.test(words[1]);
}

/** Flag for one column from its name and import metadata (exact min/max over every row), or null. */
export function columnAggregationFlag(col: ColumnMetadata): AggregationFlag | null {
  const words = nameWords(col.name);
  const ints = col.allIntegerValues;
  if (
    ints &&
    words.some((w) => YEAR_WORDS.has(w)) &&
    col.minimumValue !== undefined &&
    col.maximumValue !== undefined &&
    col.minimumValue >= 1800 &&
    col.maximumValue <= 2100
  ) {
    return "year";
  }
  // pandas writes its index column as "Unnamed: 0" (words: unnamed, 0).
  return isIdName(col.name) ? "id" : null;
}

const cache = new WeakMap<object, Map<string, AggregationFlag | null>>();

/** The flag of a numeric (effective type) column of the dataset; null for other columns or without metadata. */
export function aggregationFlag(dataset: Dataset | null | undefined, column: string | undefined): AggregationFlag | null {
  if (!dataset?.metadata || !column) return null;
  let flags = cache.get(dataset.metadata);
  if (!flags) {
    flags = new Map();
    cache.set(dataset.metadata, flags);
  }
  if (flags.has(column)) return flags.get(column)!;
  const meta = dataset.metadata.columns.find((c) => c.name === column);
  const flag =
    meta && meta.inferredDataType === "numeric" && getEffectiveColumnType(dataset, column) === "numeric"
      ? columnAggregationFlag(meta)
      : null;
  flags.set(column, flag);
  return flag;
}

/** Aggregations that add values up or average them, the ones a note warns about. */
export function isAdditiveAggregation(op: AggregationOperator | undefined): boolean {
  return op === undefined || op === "sum" || op === "avg" || op === "sum_if" || op === "weighted_average";
}

/** Inline note under an aggregation picker, or null when the choice is fine. */
export function aggregationNote(flag: AggregationFlag | null, op: AggregationOperator | undefined): string | null {
  if (!flag || !isAdditiveAggregation(op)) return null;
  return flag === "year"
    ? "Adding up years is rarely meaningful — try Count, or use it as a date"
    : "Adding up ID numbers is rarely meaningful — try Count or Distinct count";
}

/** Numeric (effective type) column whose every valid value is the same, over the whole dataset (import metadata). */
export function isConstantNumericColumn(dataset: Dataset | null | undefined, column: string): boolean {
  const meta = dataset?.metadata?.columns.find((c) => c.name === column);
  return !!meta && meta.minimumValue !== undefined && meta.maximumValue !== undefined && meta.minimumValue === meta.maximumValue;
}

function columnNames(dataset: Dataset): string[] {
  return dataset.metadata ? dataset.metadata.columns.map((c) => c.name) : dataset.columns;
}

/**
 * The column a new KPI measures by default: the first numeric column that is not an ID, not a
 * year and not constant (Sum of "Invoice" or of a year is a number nobody can use). Falls back
 * to the first numeric column of any kind, then the first column (counted), then null.
 */
export function defaultMeasureColumn(dataset: Dataset | null | undefined): string | null {
  if (!dataset) return null;
  const cols = columnNames(dataset);
  const numeric = cols.filter((c) => getEffectiveColumnType(dataset, c) === "numeric");
  return (
    numeric.find((c) => !aggregationFlag(dataset, c) && !isConstantNumericColumn(dataset, c)) ??
    numeric[0] ??
    cols[0] ??
    null
  );
}

/** Aggregations that make sense for a column: every one for numbers; counts only for anything else. */
export function aggregationsForColumn(dataset: Dataset | null | undefined, column: string): AggregationOperator[] {
  if (dataset && column && getEffectiveColumnType(dataset, column) === "numeric") {
    return ["sum", "avg", "count", "count_rows", "count_distinct", "min", "max", "median", "stddev"];
  }
  return ["count", "count_rows", "count_distinct"];
}

const PER_ITEM_WORDS = new Set([
  "rating", "score", "rate", "percent", "percentage", "pct", "price", "age", "avg", "average", "mean", "ratio",
]);

/**
 * The name says each value is a per-item level (a rating, a price, a rate, a percentage), so
 * adding the values up means nothing ("Sum of Rating" = 39.3K) and Average is the useful
 * default. Whole words of nameWords (plain plural "s" too), case-insensitive, so "Usage",
 * "Stage", "Corporate" and "Generated" don't match; a "%" anywhere in the name matches.
 */
export function isPerItemName(name: string): boolean {
  if (name.includes("%")) return true;
  return nameWords(name).some((w) => PER_ITEM_WORDS.has(w) || (w.endsWith("s") && PER_ITEM_WORDS.has(w.slice(0, -1))));
}

/**
 * Default aggregation for a column: Count for IDs, years, constants and non-numbers; Average
 * for a per-item value (isPerItemName); Sum for any other measure.
 */
export function defaultAggregationForColumn(dataset: Dataset | null | undefined, column: string): AggregationOperator {
  if (!dataset || !column) return "count";
  if (getEffectiveColumnType(dataset, column) !== "numeric") return "count";
  if (aggregationFlag(dataset, column) || isConstantNumericColumn(dataset, column)) return "count";
  return isPerItemName(column) ? "avg" : "sum";
}
