/**
 * The one numeric rule every aggregation path uses (stats, query/KPI, charts, pivot,
 * window functions, dashboard summary, table stats, export).
 *
 * A cell counts as a number only if it is a finite JS number, or a string that is a clean
 * decimal number after trimming ASCII whitespace: optional sign, digits, optional decimal
 * point, optional exponent ("1e3" is fine). Everything else — blanks, null tokens ("N/A",
 * "NaN", "-", ...), junk ("ERROR"), hex ("0x1A"), "Infinity", currency ("$1"), thousands
 * separators ("1,000"), booleans, dates — is null and is EXCLUDED from sum/avg/min/max/
 * std/median/count. It is never treated as 0.
 */

/** Case-insensitive, compared after ASCII trimming. */
export const NULL_TOKENS: ReadonlySet<string> = new Set([
  "",
  "n/a",
  "na",
  "nan",
  "null",
  "none",
  "#n/a",
  "-",
  "undefined",
]);

const STRICT_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
// ASCII whitespace only: space, \t, \n, \v, \f, \r. Non-breaking and other Unicode spaces
// are part of the value and must survive (String.prototype.trim would strip them).
const ASCII_EDGE_WHITESPACE = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;

export function trimAscii(value: string): string {
  return value.replace(ASCII_EDGE_WHITESPACE, "");
}

export function isNullToken(value: string): boolean {
  return NULL_TOKENS.has(trimAscii(value).toLowerCase());
}

/** Strict string -> number. Returns null for null tokens and anything that isn't a clean number. */
export function parseStrictNumber(value: string): number | null {
  const s = trimAscii(value);
  if (!STRICT_NUMBER.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The shared cell -> number rule. Never calls Number() on non-strings (Number(true) is 1). */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseStrictNumber(value);
  return null;
}

/** Valid numbers of a column slice, in order. */
export function numericValues(values: Iterable<unknown>): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = toNumberOrNull(v);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Valid numbers of `column` across `rows`, in row order. */
export function columnNumbers(rows: readonly Record<string, unknown>[], column: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const n = toNumberOrNull(rows[i][column]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Loop-based min/max: Math.min(...values) overflows the call stack on large arrays. */
export function minMax(values: readonly number[]): { min: number; max: number } | null {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function sum(values: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s;
}

/** Mean, or 0 for an empty slice (the app's convention for an empty aggregate). */
export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/**
 * SAMPLE variance (divide by n − 1), matching pandas/Excel VAR.S. Undefined for n < 2;
 * returns 0 there, the app's convention for an aggregate that can't be computed.
 */
export function sampleVariance(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = sum(values) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - m;
    ss += d * d;
  }
  return ss / (n - 1);
}

/** SAMPLE standard deviation (n − 1); 0 for n < 2. */
export function sampleStdDev(values: readonly number[]): number {
  return Math.sqrt(sampleVariance(values));
}

/** Median of an unsorted slice, or 0 when empty. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface NumericSummary {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  std: number;
}

/** count/sum/mean/min/max/sample std of the valid numbers in a column slice, or null if none. */
export function summarizeNumbers(values: readonly number[]): NumericSummary | null {
  const mm = minMax(values);
  if (!mm) return null;
  const s = sum(values);
  return {
    count: values.length,
    sum: s,
    mean: s / values.length,
    min: mm.min,
    max: mm.max,
    std: sampleStdDev(values),
  };
}
