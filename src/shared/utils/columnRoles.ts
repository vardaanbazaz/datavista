import { ColumnMetadata, Dataset, AggregationOperator } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";

/**
 * Numeric columns whose numbers are labels, not amounts: adding them up (or averaging
 * them) gives a number nobody can use, e.g. "Sum of release_year" = 220,000.
 * - `year`: a whole number 1800–2100 in every cell, and the name has a "year"/"yr" word.
 * - `id`: the name has an id-like word (id, code, no, number, zip, pin, phone, index), or
 *   is pandas' unnamed index column ("Unnamed: 0"). Names only: "almost every value is a
 *   distinct integer" also describes amounts (HR MonthlyRate is 97% distinct).
 * Only a hint for defaults and notes: the stored column type is left alone.
 */
export type AggregationFlag = "year" | "id";

const YEAR_WORDS = new Set(["year", "yr"]);
const ID_WORDS = new Set(["id", "code", "no", "number", "zip", "pin", "phone", "index"]);

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
  if (words.some((w) => ID_WORDS.has(w))) return "id";
  // pandas writes its index column as "Unnamed: 0" (words: unnamed, 0).
  if (words.length === 2 && words[0] === "unnamed" && /^\d+$/.test(words[1])) return "id";
  return null;
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
