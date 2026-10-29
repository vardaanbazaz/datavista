/**
 * The one date rule. Dates are calendar values, not instants: a stored date is the string
 * "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" / "YYYY-MM-DDTHH:mm:ss" when the source had a time
 * of day. Everything here works on the year/month/day/time parts of that string, so the
 * result never depends on the browser's time zone. Do not go through
 * `new Date(str).toISOString()` or local-time getters (`getFullYear`, `getMonth`, ...) for
 * stored values: `Date.parse("January 1, 2008")` is local midnight, and `toISOString` of
 * that is 2007-12-31 anywhere east of UTC.
 *
 * Accepted source formats (each with an optional time "HH:mm", "HH:mm:ss", fractional
 * seconds dropped, optional AM/PM; a trailing "Z" or UTC offset is ignored and the wall
 * clock time is kept as written):
 *   - year first:   2024-01-15, 2024/01/15, 2024.01.15, 2024-01-15T10:30:00
 *   - numeric D/M:  15/01/2024, 01/15/2024 (also "-" or "."); 4-digit year only. Whether
 *                   the first field is the day or the month is decided per column
 *                   (see analyzeDateColumn).
 *   - month names:  24-Feb-21, 24-Feb-2021, 24 February 2021, January 15, 2018, Jan 15 2018
 * Two-digit years (month-name forms only): 00–68 → 2000–2068, 69–99 → 1969–1999, the
 * POSIX/Python strptime "%y" convention.
 *
 * Invalid calendar dates (month 13, Feb 30, day 0) are rejected, never rolled over.
 */

export interface CalendarParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour?: number;
  minute?: number;
  second?: number;
}

export type DatePeriod = "year" | "quarter" | "month" | "week" | "day";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// Time of day after a date: "T10:30", " 10:30:15.123", " 7:05 PM", "T10:30:00Z", "+05:30".
const TIME = String.raw`(?:(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?(?:\s*([AaPp])\.?[Mm]\.?)?(?:\s*(?:Z|[+-]\d{2}(?::?\d{2})?))?)?`;
const YMD = new RegExp(String.raw`^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})${TIME}$`);
const NUMERIC_DM = new RegExp(String.raw`^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})${TIME}$`);
const DAY_MONTHNAME = new RegExp(String.raw`^(\d{1,2})(?:-|\s+|/|\.)([A-Za-z]{3,9})\.?(?:-|\s+|/|\.|,\s*)(\d{4}|\d{2})${TIME}$`);
const MONTHNAME_DAY = new RegExp(String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})${TIME}$`);

export type DateShape = "ymd" | "numeric-dm" | "day-monthname" | "monthname-day";

interface DateMatch {
  shape: DateShape;
  separator: string;
  /** ymd: [y, m, d]. numeric-dm: [first, second, y]. Month-name shapes: [y, m, d]. */
  fields: [number, number, number];
  twoDigitYear: boolean;
  time?: { hour: number; minute: number; second?: number };
  /** Set when the time part itself is impossible (25:00, 13 PM), so the value is invalid. */
  badTime?: boolean;
}

function readTime(m: RegExpMatchArray, start: number): Pick<DateMatch, "time" | "badTime"> {
  if (m[start] === undefined) return {};
  let hour = Number(m[start]);
  const minute = Number(m[start + 1]);
  const second = m[start + 2] !== undefined ? Number(m[start + 2]) : undefined;
  const ampm = m[start + 3]?.toLowerCase();
  if (ampm) {
    if (hour < 1 || hour > 12) return { badTime: true };
    hour = (hour % 12) + (ampm === "p" ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || (second !== undefined && second > 59)) return { badTime: true };
  return { time: { hour, minute, second } };
}

/** Two-digit year → four digits (strptime "%y": 00–68 → 20xx, 69–99 → 19xx). */
export function expandTwoDigitYear(yy: number): number {
  return yy <= 68 ? 2000 + yy : 1900 + yy;
}

/** Recognises the shape of a date string without deciding day/month order or validity. */
function matchDate(raw: string): DateMatch | null {
  const s = raw.trim();
  if (s.length < 6 || s.length > 40) return null;
  let m = s.match(YMD);
  if (m) {
    return { shape: "ymd", separator: m[2], fields: [Number(m[1]), Number(m[3]), Number(m[4])], twoDigitYear: false, ...readTime(m, 5) };
  }
  m = s.match(NUMERIC_DM);
  if (m) {
    return { shape: "numeric-dm", separator: m[2], fields: [Number(m[1]), Number(m[3]), Number(m[4])], twoDigitYear: false, ...readTime(m, 5) };
  }
  m = s.match(DAY_MONTHNAME);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const two = m[3].length === 2;
    const year = two ? expandTwoDigitYear(Number(m[3])) : Number(m[3]);
    return { shape: "day-monthname", separator: "-", fields: [year, month, Number(m[1])], twoDigitYear: two, ...readTime(m, 4) };
  }
  m = s.match(MONTHNAME_DAY);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) return null;
    return { shape: "monthname-day", separator: " ", fields: [Number(m[3]), month, Number(m[2])], twoDigitYear: false, ...readTime(m, 4) };
  }
  return null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
    year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

function resolve(match: DateMatch, dayFirst: boolean): CalendarParts | null {
  if (match.badTime) return null;
  let year: number, month: number, day: number;
  if (match.shape === "numeric-dm") {
    const [a, b, y] = match.fields;
    year = y;
    month = dayFirst ? b : a;
    day = dayFirst ? a : b;
  } else {
    [year, month, day] = match.fields;
  }
  if (!isValidCalendarDate(year, month, day)) return null;
  return { year, month, day, ...match.time };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Parts → the stored string: "YYYY-MM-DD", plus "THH:mm" or "THH:mm:ss" when there is a time. */
export function formatCalendar(p: CalendarParts): string {
  const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  if (p.hour === undefined) return date;
  const time = `${pad(p.hour)}:${pad(p.minute ?? 0)}`;
  return p.second === undefined ? `${date}T${time}` : `${date}T${time}:${pad(p.second)}`;
}

/**
 * Parses one source value to its stored calendar string, or null if it isn't a valid date.
 * `dayFirst` only matters for numeric D/M values ("05/06/2024").
 */
export function parseDateValue(raw: unknown, dayFirst: boolean): string | null {
  if (typeof raw !== "string") return null;
  const match = matchDate(raw);
  if (!match) return null;
  const parts = resolve(match, dayFirst);
  return parts ? formatCalendar(parts) : null;
}

/**
 * Parts of a stored date (or any year-first date string: "2024-01-15", "2024/01/15",
 * "2024-01-15T10:30:00.000Z"). Numbers, booleans, Date objects and day/month-ambiguous
 * strings are not stored dates and return null. Invalid calendar dates return null.
 */
export function parseStoredDate(value: unknown): CalendarParts | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  const m = s.match(YMD);
  if (!m) return null;
  const match: DateMatch = { shape: "ymd", separator: m[2], fields: [Number(m[1]), Number(m[3]), Number(m[4])], twoDigitYear: false, ...readTime(m, 5) };
  return resolve(match, false);
}

/** True when the value is a valid stored (year-first) date. */
export function isStoredDate(value: unknown): boolean {
  return parseStoredDate(value) !== null;
}

/** "YYYY-MM-DD" of a stored date (time dropped), or null. */
export function calendarDay(value: unknown): string | null {
  const p = parseStoredDate(value);
  return p ? formatCalendar({ year: p.year, month: p.month, day: p.day }) : null;
}

/**
 * Milliseconds for the parts read as if they were UTC. Only for ordering and for d3
 * `scaleUtc` positions; it is not the instant the value happened at.
 */
export function partsToUtcMs(p: CalendarParts): number {
  // Date.UTC maps years 0–99 to 1900–1999; setUTCFullYear doesn't.
  const d = new Date(Date.UTC(2000, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0, p.second ?? 0));
  d.setUTCFullYear(p.year);
  return d.getTime();
}

/** ISO 8601 week (Monday start; week 1 holds the year's first Thursday), from the parts with UTC arithmetic. */
export function isoWeek(p: Pick<CalendarParts, "year" | "month" | "day">): { year: number; week: number } {
  const d = new Date(partsToUtcMs({ year: p.year, month: p.month, day: p.day }));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const weekYear = d.getUTCFullYear();
  const yearStart = partsToUtcMs({ year: weekYear, month: 1, day: 1 });
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: weekYear, week };
}

/** Group-by key of a stored date for a period: "2024", "2024-Q1", "2024-01", "2024-W03", "2024-01-15". */
export function periodKey(value: unknown, period: DatePeriod): string | null {
  const p = parseStoredDate(value);
  if (!p) return null;
  switch (period) {
    case "year":
      return pad(p.year, 4);
    case "quarter":
      return `${pad(p.year, 4)}-Q${Math.floor((p.month - 1) / 3) + 1}`;
    case "month":
      return `${pad(p.year, 4)}-${pad(p.month)}`;
    case "week": {
      const w = isoWeek(p);
      return `${pad(w.year, 4)}-W${pad(w.week)}`;
    }
    case "day":
    default:
      return formatCalendar({ year: p.year, month: p.month, day: p.day });
  }
}

const YEAR_KEY = /^(\d{4})$/;
const QUARTER_KEY = /^(\d{4})-Q([1-4])$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;

/**
 * Start of a stored date or of a period key ("2024", "2024-Q2", "2024-03", "2024-W05") as
 * parts, so chart axes and KPI trends can order and position grouped date keys too.
 */
export function dateKeyParts(key: unknown): CalendarParts | null {
  const stored = parseStoredDate(key);
  if (stored) return stored;
  if (typeof key !== "string") return null;
  const s = key.trim();
  let m = s.match(YEAR_KEY);
  if (m) return { year: Number(m[1]), month: 1, day: 1 };
  m = s.match(QUARTER_KEY);
  if (m) return { year: Number(m[1]), month: (Number(m[2]) - 1) * 3 + 1, day: 1 };
  m = s.match(MONTH_KEY);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]), day: 1 };
  m = s.match(WEEK_KEY);
  if (m) {
    const week = Number(m[2]);
    if (week < 1 || week > 53) return null;
    // Monday of week 1 is the Monday on or before Jan 4.
    const jan4 = new Date(partsToUtcMs({ year: Number(m[1]), month: 1, day: 4 }));
    const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (week - 1) * 7 * 86400000;
    const d = new Date(monday);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  return null;
}

/** Sortable/plottable number for a stored date or period key (see partsToUtcMs), or null. */
export function dateKeyMs(key: unknown): number | null {
  const p = dateKeyParts(key);
  return p ? partsToUtcMs(p) : null;
}

/** Orders two stored dates; null/invalid sorts last. */
export function compareStoredDates(a: unknown, b: unknown): number {
  const am = dateKeyMs(a);
  const bm = dateKeyMs(b);
  if (am === null || bm === null) return am === bm ? 0 : am === null ? 1 : -1;
  return am - bm;
}

/**
 * Sort order of two non-null cells (table sort, query ORDER BY, window ORDER BY): numbers by
 * value, two stored dates by their parts, anything else as text.
 */
export function compareCells(a: string | number | boolean, b: string | number | boolean): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const ap = parseStoredDate(a);
  const bp = ap ? parseStoredDate(b) : null;
  if (ap && bp) return partsToUtcMs(ap) - partsToUtcMs(bp);
  return String(a).localeCompare(String(b));
}

/** Adds whole months, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(p: CalendarParts, months: number): CalendarParts {
  const index = p.year * 12 + (p.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { ...p, year, month, day: Math.min(p.day, daysInMonth(year, month)) };
}

/**
 * The next key `steps` periods after a stored date or period key, in the same form
 * ("2024-03" + 1 → "2024-04", "2024-Q4" + 1 → "2025-Q1", "2024-01-31" + 1 → "2024-02-29").
 * Full dates step by month. Returns null if `key` isn't a date key.
 */
export function stepDateKey(key: unknown, steps: number): string | null {
  if (typeof key !== "string") return null;
  const s = key.trim();
  const stored = parseStoredDate(s);
  if (stored) return formatCalendar(addMonths(stored, steps));
  let m = s.match(YEAR_KEY);
  if (m) return pad(Number(m[1]) + steps, 4);
  m = s.match(QUARTER_KEY);
  if (m) {
    const q = Number(m[1]) * 4 + Number(m[2]) - 1 + steps;
    return `${pad(Math.floor(q / 4), 4)}-Q${(q % 4) + 1}`;
  }
  m = s.match(MONTH_KEY);
  if (m) {
    const p = addMonths({ year: Number(m[1]), month: Number(m[2]), day: 1 }, steps);
    return `${pad(p.year, 4)}-${pad(p.month)}`;
  }
  const start = dateKeyParts(s);
  if (start && WEEK_KEY.test(s)) {
    const d = new Date(partsToUtcMs(start) + steps * 7 * 86400000);
    const w = isoWeek({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
    return `${pad(w.year, 4)}-W${pad(w.week)}`;
  }
  return null;
}

/**
 * A date-picker `Date` (local midnight of the day the user clicked) → "YYYY-MM-DD". Local
 * getters are correct here and only here: the picker's Date stands for a local calendar day.
 */
export function calendarFromPickerDate(d: Date): string | null {
  if (isNaN(d.getTime())) return null;
  return formatCalendar({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
}

/**
 * A date-range filter bound → "YYYY-MM-DD". Accepts a picker Date, a stored/year-first date
 * string, or an ISO instant with "Z"/offset (a picker Date that went through JSON), which is
 * read back as the local day it was picked on.
 */
export function rangeBoundDay(v: unknown): string | null {
  if (v instanceof Date) return calendarFromPickerDate(v);
  if (typeof v !== "string") return null;
  if (/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/.test(v.trim())) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : calendarFromPickerDate(d);
  }
  return calendarDay(v);
}

/** Whether the browser locale writes the day before the month (en-IN, en-GB: yes; en-US: no). */
export function localeDayFirst(locale?: string): boolean {
  let lang = locale;
  if (!lang) {
    lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  }
  try {
    const parts = new Intl.DateTimeFormat(lang, { timeZone: "UTC" }).formatToParts(Date.UTC(2024, 0, 15));
    const dayIdx = parts.findIndex(p => p.type === "day");
    const monthIdx = parts.findIndex(p => p.type === "month");
    return dayIdx !== -1 && monthIdx !== -1 && dayIdx < monthIdx;
  } catch {
    return false;
  }
}

export interface DateColumnAnalysis {
  /** Non-blank values that are valid dates under the decided order. */
  validCount: number;
  /** Non-blank values that are not valid dates (month 13, Feb 30, "invalid", "NaN", numbers). */
  invalidCount: number;
  /** Values with a numeric D/M shape ("05/06/2024"); 0 means the order doesn't matter. */
  numericDayMonthCount: number;
  /** Day/month order for numeric D/M values; undefined when the column has none. */
  dayFirst?: boolean;
  /** Where dayFirst came from: the values themselves, or the browser locale. */
  dayFirstSource?: "data" | "locale";
  /** Some numeric D/M values only work day-first and others only month-first. */
  ambiguousMixed: boolean;
  /** Format labels by how many values used them, most common first ("DD/MM/YYYY", ...). */
  formats: string[];
}

function formatLabel(match: DateMatch, dayFirst: boolean): string {
  const sep = match.separator;
  let label: string;
  switch (match.shape) {
    case "ymd":
      label = ["YYYY", "MM", "DD"].join(sep);
      break;
    case "numeric-dm":
      label = (dayFirst ? ["DD", "MM", "YYYY"] : ["MM", "DD", "YYYY"]).join(sep);
      break;
    case "day-monthname":
      label = match.twoDigitYear ? "D-Mon-YY" : "D-Mon-YYYY";
      break;
    case "monthname-day":
    default:
      label = "Month D, YYYY";
  }
  return match.time ? `${label} HH:mm` : label;
}

/**
 * Looks at every non-blank value of a column and decides the day/month order for numeric
 * D/M values: any first field > 12 → day-first; any second field > 12 → month-first; both →
 * ambiguousMixed (the caller leaves the column as text); neither → `localeDayFirst`. Only
 * numeric D/M values vote; year-first ("2023/13/01") and month-name values don't.
 * `forcedDayFirst` (the user's toggle) skips the vote.
 */
export function analyzeDateColumn(
  values: readonly unknown[],
  localeDefaultDayFirst: boolean,
  forcedDayFirst?: boolean
): DateColumnAnalysis {
  const matches: (DateMatch | null)[] = [];
  let firstOver12 = false;
  let secondOver12 = false;
  let numericDayMonthCount = 0;
  for (const v of values) {
    const match = typeof v === "string" ? matchDate(v) : null;
    matches.push(match);
    if (match?.shape === "numeric-dm") {
      numericDayMonthCount++;
      if (match.fields[0] > 12) firstOver12 = true;
      if (match.fields[1] > 12) secondOver12 = true;
    }
  }
  const ambiguousMixed = forcedDayFirst === undefined && firstOver12 && secondOver12;
  let dayFirst: boolean | undefined;
  let dayFirstSource: "data" | "locale" | undefined;
  if (forcedDayFirst !== undefined) {
    dayFirst = forcedDayFirst;
  } else if (numericDayMonthCount > 0) {
    if (firstOver12 && !secondOver12) [dayFirst, dayFirstSource] = [true, "data"];
    else if (secondOver12 && !firstOver12) [dayFirst, dayFirstSource] = [false, "data"];
    else [dayFirst, dayFirstSource] = [localeDefaultDayFirst, "locale"];
  }
  let validCount = 0;
  const formatCounts = new Map<string, number>();
  for (const match of matches) {
    if (!match) continue;
    if (match.shape === "numeric-dm" && ambiguousMixed) continue;
    if (resolve(match, dayFirst ?? localeDefaultDayFirst)) {
      validCount++;
      const label = formatLabel(match, dayFirst ?? localeDefaultDayFirst);
      formatCounts.set(label, (formatCounts.get(label) ?? 0) + 1);
    }
  }
  const formats = [...formatCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  return {
    validCount,
    invalidCount: values.length - validCount,
    numericDayMonthCount,
    dayFirst,
    dayFirstSource,
    ambiguousMixed,
    formats,
  };
}
