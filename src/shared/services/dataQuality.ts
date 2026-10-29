/**
 * Data-quality detectors. Pure functions over a column's values (or its value counts); they
 * never change data. The import worker runs them through parsingService.processRawData, and
 * columnFixes.ts re-runs the per-column ones after a fix changes a column.
 */
import type { ColumnQuality, ValueCount, DataRow } from "@/shared/types";
import { parseStrictNumber, toNumberOrNull } from "@/shared/utils/numeric";
import { isCommaDecimal, parseCurrency, parseGroupedNumber, parseSuffixNumber } from "@/shared/utils/numberFormats";

type Cell = DataRow[string];
type ColumnType = "numeric" | "categorical" | "date";

/** Share of non-blank cells that must read as currency/grouped numbers for an automatic conversion. */
export const AUTO_CONVERT_SHARE = 0.8;
/** A negative or all-nines value above this share of a column's numbers is offered as a missing-value code. */
export const SENTINEL_SHARE = 0.05;
/** Label variants are looked for in columns with at most this many distinct values. */
export const LABEL_VARIANT_MAX_DISTINCT = 1000;
/** Categorical columns with more distinct values than this share of their non-blank cells get a compact tile. */
export const HIGH_CARDINALITY_SHARE = 0.5;

const SAMPLE_COUNT = 5;
/** Share of non-blank cells that must need the suffix reader ("10,000+", "19M") before it is offered. */
const SUFFIX_MIN_SHARE = 0.1;

/** No digit, no number: skips the format regexes for plain text cells. */
function hasDigit(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) return true;
  }
  return false;
}

function topN(counts: Iterable<[string, number]>, n: number): ValueCount[] {
  const top: ValueCount[] = [];
  for (const [value, count] of counts) {
    if (top.length < n || count > top[top.length - 1].count) {
      top.push({ value, count });
      top.sort((a, b) => b.count - a.count);
      if (top.length > n) top.pop();
    }
  }
  return top;
}

/** Case and whitespace don't make a different label: "Lab A", "lab  a", " LAB A". */
export function labelKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function labelVariants(counts: Map<string, number>, isNumberKey: (k: string) => boolean): ValueCount[][] {
  if (counts.size > LABEL_VARIANT_MAX_DISTINCT) return [];
  const groups = new Map<string, ValueCount[]>();
  for (const [value, count] of counts) {
    if (isNumberKey(value)) continue;
    const key = labelKey(value);
    const group = groups.get(key);
    if (group) group.push({ value, count });
    else groups.set(key, [{ value, count }]);
  }
  const out: ValueCount[][] = [];
  for (const group of groups.values()) {
    if (group.length > 1) out.push(group.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1)));
  }
  return out.sort((a, b) => b[0].count - a[0].count);
}

function isAllNines(n: number): boolean {
  return Number.isInteger(n) && n >= 999 && /^9+$/.test(String(n));
}

/**
 * One value of a numeric column that looks like a "missing" code: a negative value that is
 * more than 5% of the numbers in an otherwise non-negative column; -1 in a column of years
 * (whole numbers 1800–2100); or an all-nines value (999, 9999) that is the column's maximum
 * and more than 5% of its numbers.
 */
export function detectSentinel(numberCounts: Map<number, number>): ColumnQuality["sentinel"] {
  let total = 0;
  const negatives: number[] = [];
  for (const [n, c] of numberCounts) {
    total += c;
    if (n < 0) negatives.push(n);
  }
  if (total === 0) return undefined;
  if (negatives.length === 1) {
    const value = negatives[0];
    const count = numberCounts.get(value)!;
    if (count / total > SENTINEL_SHARE) return { value, count, reason: "negative" };
    if (value === -1) {
      let years = 0;
      for (const [n, c] of numberCounts) {
        if (n !== -1 && Number.isInteger(n) && n >= 1800 && n <= 2100) years += c;
      }
      if (years > 0 && years === total - count) return { value, count, reason: "year" };
    }
  }
  let max = -Infinity;
  for (const n of numberCounts.keys()) if (n > max) max = n;
  if (isAllNines(max) && numberCounts.size > 1) {
    const count = numberCounts.get(max)!;
    if (count / total > SENTINEL_SHARE) return { value: max, count, reason: "nines" };
  }
  return undefined;
}

/**
 * Quality of one column from its value counts (keys are String(cell), as in
 * parsingService.generateDatasetMetadata) and the counts of its invalid cells.
 */
export function columnQuality(
  type: ColumnType,
  valueCounts: Map<string, number>,
  invalidCounts: Map<string, number>,
  nonBlank: number
): ColumnQuality {
  let invalidCount = 0;
  for (const c of invalidCounts.values()) invalidCount += c;
  const quality: ColumnQuality = { invalidCount, invalidSamples: topN(invalidCounts, SAMPLE_COUNT) };

  if (type === "categorical") {
    quality.topValues = topN(valueCounts, SAMPLE_COUNT);
    const variants = labelVariants(valueCounts, (k) => parseStrictNumber(k) !== null);
    if (variants.length > 0) quality.labelVariants = variants;
  }

  if (type === "numeric") {
    const numbers = new Map<number, number>();
    for (const [k, c] of valueCounts) {
      const n = toNumberOrNull(k);
      if (n !== null) numbers.set(n, (numbers.get(n) ?? 0) + c);
    }
    const sentinel = detectSentinel(numbers);
    if (sentinel) quality.sentinel = sentinel;
  }

  // "10,000+", "19M": offered as "Convert to number…" when at least half the non-blank cells
  // read and at least 10% need the suffix reader. A plain number column needs nothing, and a
  // code column with a few "85049G"-style codes must not read them as giga.
  if (type !== "date" && nonBlank > 0) {
    let convertible = 0;
    let needsReader = 0;
    for (const [k, c] of valueCounts) {
      const parsed = parseSuffixNumber(k);
      if (!parsed) continue;
      convertible += c;
      if (parseStrictNumber(k) === null) needsReader += c;
    }
    if (needsReader / nonBlank >= SUFFIX_MIN_SHARE && convertible / nonBlank >= 0.5) {
      quality.suffixCandidate = { convertible, total: nonBlank };
    }
  }
  return quality;
}

export interface ImportConversion {
  kind: "currency" | "thousands";
  currency?: { code: string; symbol: string };
  grouping?: "western" | "indian";
}

export interface ImportDetection {
  conversion?: ImportConversion;
  currencyWarning?: string[];
  groupingWarning?: string;
}

/**
 * Currency and thousands-separator detection on a column's cleaned cells (numbers already
 * parsed as JS numbers, blanks null). A column converts automatically only when at least 80%
 * of its non-blank cells are numbers written one way: one currency (plain numbers count as
 * matching), or valid comma grouping. Mixed currencies or comma decimals next to comma
 * grouping leave the column as it is, with a warning.
 */
export function detectImportConversion(values: readonly Cell[]): ImportDetection {
  let nonBlank = 0;
  let plain = 0;
  const codes = new Map<string, number>();
  const symbols = new Map<string, number>();
  let currencyCells = 0;
  let western = 0;
  let indian = 0;
  let groupedBoth = 0;
  let commaDecimal = 0;

  let blanks = 0;
  for (const v of values) if (v === null || v === undefined || v === "") blanks++;
  // Once too many non-blank cells can't be numbers, nothing can convert (same test as below).
  const total = values.length - blanks;
  const tooMany = (other: number) => (total - other) / total < AUTO_CONVERT_SHARE;
  let other = 0;

  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    nonBlank++;
    if (typeof v === "number") { plain++; continue; }
    if (typeof v !== "string" || !hasDigit(v)) {
      if (tooMany(++other)) return {};
      continue;
    }
    if (parseStrictNumber(v) !== null) { plain++; continue; }
    const cur = parseCurrency(v);
    if (cur) {
      currencyCells++;
      codes.set(cur.code, (codes.get(cur.code) ?? 0) + 1);
      symbols.set(cur.symbol, (symbols.get(cur.symbol) ?? 0) + 1);
      continue;
    }
    const grouped = parseGroupedNumber(v);
    if (grouped) {
      if (grouped.grouping === "western") western++;
      else if (grouped.grouping === "indian") indian++;
      else groupedBoth++;
      continue;
    }
    if (isCommaDecimal(v)) commaDecimal++;
    if (tooMany(++other)) return {};
  }
  if (nonBlank === 0) return {};

  if (currencyCells > 0) {
    if ((plain + currencyCells + western + indian + groupedBoth) / nonBlank < AUTO_CONVERT_SHARE) return {};
    if (codes.size > 1) return { currencyWarning: [...codes.keys()].sort() };
    const code = [...codes.keys()][0];
    const symbol = topN(symbols, 1)[0].value;
    return { conversion: { kind: "currency", currency: { code, symbol } } };
  }

  const grouped = western + indian + groupedBoth;
  if (grouped === 0 || (plain + grouped) / nonBlank < AUTO_CONVERT_SHARE) return {};
  if (commaDecimal > 0) {
    return { groupingWarning: `${commaDecimal} value(s) use a comma as the decimal mark (e.g. 1.234,56) next to comma-grouped numbers` };
  }
  if (western > 0 && indian > 0) {
    return { groupingWarning: "mixes western (1,234,567) and Indian (12,34,567) digit grouping" };
  }
  return { conversion: { kind: "thousands", grouping: indian > 0 ? "indian" : "western" } };
}

/** 32-bit FNV-1a, two seeds, for duplicate-row bucketing (collisions are checked exactly). */
function rowHash(parts: string[]): number {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ parts.length;
  for (let p = 0; p < parts.length; p++) {
    const s = parts[p];
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      a = Math.imul(a ^ ch, 0x01000193);
      b = Math.imul(b ^ ch, 0x5bd1e995);
    }
    a = Math.imul(a ^ 0x1f, 0x01000193);
    b = Math.imul(b ^ 0x1f, 0x5bd1e995);
  }
  return (a >>> 0) * 0x200000 + ((b >>> 0) & 0x1fffff);
}

const cellText = (v: unknown): string => (v === null || v === undefined ? "\u0000" : String(v));

/**
 * Indices of rows that exactly repeat an earlier row (every key equal as text, like pandas
 * `duplicated()` on a dtype=str frame). The first occurrence is not counted.
 */
export function findDuplicateRows(rows: readonly Record<string, unknown>[], keys: readonly string[]): number[] {
  const seen = new Map<number, number | number[]>();
  const out: number[] = [];
  const same = (i: number, j: number) => keys.every((k) => cellText(rows[i][k]) === cellText(rows[j][k]));
  for (let i = 0; i < rows.length; i++) {
    const h = rowHash(keys.map((k) => cellText(rows[i][k])));
    const prev = seen.get(h);
    if (prev === undefined) { seen.set(h, i); continue; }
    const candidates = typeof prev === "number" ? [prev] : prev;
    if (candidates.some((j) => same(i, j))) { out.push(i); continue; }
    seen.set(h, [...candidates, i]);
  }
  return out;
}

/** Key for a suggestion the user can dismiss ("Don't ask again"). */
export function suggestionKey(kind: "sentinel" | "variants" | "suffix", column: string, detail = ""): string {
  return `${kind}:${column}:${detail}`;
}

/** Most common group member first: the default merge target. */
export function variantMergeText(group: readonly ValueCount[], target: string): string {
  const fmt = (v: ValueCount) => `'${v.value}' (${v.count.toLocaleString()})`;
  const to = group.find((g) => g.value === target)!;
  const from = group.filter((g) => g.value !== target).map(fmt).join(", ");
  return `Merge ${from} into ${fmt(to)}?`;
}

export function isHighCardinality(uniqueValueCount: number, nonBlank: number): boolean {
  return nonBlank > 0 && uniqueValueCount / nonBlank > HIGH_CARDINALITY_SHARE;
}
