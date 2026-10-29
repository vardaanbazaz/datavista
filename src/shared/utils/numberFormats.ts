/**
 * Readers for numbers written with formatting the strict rule (numeric.ts) rejects:
 * currency marks ("$1.99", "ksh 6976"), thousands separators ("1,234,567", "12,34,567")
 * and size/count suffixes ("10,000+", "19M", "512k"). Nothing here runs implicitly: each
 * reader backs a column fix (services/dataQuality.ts) that keeps the original text.
 */
import { parseStrictNumber, trimAscii } from "./numeric";

/** Western grouping: 1,234 / 1,234,567 (first group 1–3 digits, then groups of 3). */
const WESTERN = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
/** Indian lakh/crore grouping: 1,234 / 12,34,567 / 1,23,45,678 (groups of 2, last group of 3). */
const INDIAN = /^[+-]?\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/;
/** Comma as the decimal mark (1.234,56 / 12,5): never read as grouping. */
const COMMA_DECIMAL = /^[+-]?\d+(?:\.\d{3})*,\d+$/;

export type Grouping = "western" | "indian" | "both";

/**
 * A number with comma grouping valid for the whole value, or null. "both" when the value is
 * valid either way (1,234 / 123,456,789 is western only; 12,34,567 Indian only).
 */
export function parseGroupedNumber(value: string): { value: number; grouping: Grouping } | null {
  const s = trimAscii(value);
  if (!s.includes(",")) return null;
  const western = WESTERN.test(s);
  const indian = INDIAN.test(s);
  if (!western && !indian) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { value: n, grouping: western && indian ? "both" : western ? "western" : "indian" };
}

export function isCommaDecimal(value: string): boolean {
  const s = trimAscii(value);
  return COMMA_DECIMAL.test(s) && parseGroupedNumber(s) === null;
}

/** Plain strict number or a validly grouped one. */
export function parsePlainOrGrouped(value: string): number | null {
  return parseStrictNumber(value) ?? parseGroupedNumber(value)?.value ?? null;
}

/** Currency marks by code. Matching is case-insensitive; "$" is read as USD. */
const CURRENCY_TOKENS: [string, string][] = [
  ["$", "USD"], ["usd", "USD"], ["us$", "USD"],
  ["₹", "INR"], ["rs.", "INR"], ["rs", "INR"], ["inr", "INR"],
  ["€", "EUR"], ["eur", "EUR"],
  ["£", "GBP"], ["gbp", "GBP"],
  ["¥", "JPY"], ["jpy", "JPY"],
  ["kshs", "KES"], ["ksh.", "KES"], ["ksh", "KES"], ["kes", "KES"],
];
const TOKEN_PATTERN = CURRENCY_TOKENS.map(([t]) => t.replace(/[.$]/g, "\\$&")).join("|");
const NUMBER_PART = String.raw`[+-]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?|[+-]?\.\d+`;
const CURRENCY_BEFORE = new RegExp(`^([+-]?)(${TOKEN_PATTERN})\\s?(${NUMBER_PART})$`, "i");
const CURRENCY_AFTER = new RegExp(`^(${NUMBER_PART})\\s?(${TOKEN_PATTERN})$`, "i");

function currencyCode(token: string): string {
  const lower = token.toLowerCase();
  return CURRENCY_TOKENS.find(([t]) => t === lower)![1];
}

function numberPart(text: string): number | null {
  return parseStrictNumber(text) ?? parseGroupedNumber(text)?.value ?? null;
}

/** "$1.99", "ksh 6976", "1,200 INR", "-₹5" -> value, ISO-ish code and the mark as written. */
export function parseCurrency(value: string): { value: number; code: string; symbol: string } | null {
  const s = trimAscii(value);
  let m = CURRENCY_BEFORE.exec(s);
  if (m) {
    const n = numberPart(m[3]);
    if (n === null || /^[+-]/.test(m[3]) && m[1]) return null;
    return { value: m[1] === "-" ? -n : n, code: currencyCode(m[2]), symbol: m[2] };
  }
  m = CURRENCY_AFTER.exec(s);
  if (m) {
    const n = numberPart(m[1]);
    if (n === null) return null;
    return { value: n, code: currencyCode(m[2]), symbol: m[2] };
  }
  return null;
}

const SUFFIX = /^([+-]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?|[+-]?\.\d+)\s?([kmg])?(\+)?$/i;
const MULTIPLIER: Record<string, number> = { k: 1e3, m: 1e6, g: 1e9 };

/**
 * "10,000+" -> 10000 (lower bound), "19M" -> 19e6, "512k" -> 512e3, "1.5G" -> 1.5e9, plain
 * numbers as is. Null for anything else ("Varies with device").
 */
export function parseSuffixNumber(value: string): { value: number; plus: boolean; suffix: boolean } | null {
  const m = SUFFIX.exec(trimAscii(value));
  if (!m) return null;
  const n = numberPart(m[1]);
  if (n === null) return null;
  const mult = m[2] ? MULTIPLIER[m[2].toLowerCase()] : 1;
  return { value: n * mult, plus: m[3] === "+", suffix: m[2] !== undefined };
}

/** A number shown with the currency mark it was written with: "$1.99", "ksh 6976", "1,200 INR" stays "INR 1200". */
export function formatCurrency(value: number, symbol: string): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return /^[^a-z]$/i.test(symbol) ? `${sign}${symbol}${abs}` : `${sign}${symbol} ${abs}`;
}
