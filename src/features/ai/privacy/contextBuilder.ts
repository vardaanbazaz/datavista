/**
 * The one place that decides which dataset content an AI request may carry. Every AI
 * request (query, formula, executive summary, and the settings preview) builds its data
 * context here, at the user's privacy level:
 *  - schema:    column names and types (+ calculated field formulas)
 *  - summaries: + numeric stats (min, max, mean, missing, distinct) and top values
 *  - queries:   same context as summaries; the copilot may also run local queries
 *               (copilot/tools.ts) whose aggregate results are sent
 *  - samples:   + a seeded random sample of N rows (20-200), the same rows each time for a
 *               dataset (sampleRowIndices)
 * Columns that look like emails, phone numbers or person names are masked in top values
 * and sample rows at every level unless the user unmasked that column.
 */
import type { Dataset, DataRow } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { detectPii, maskToken, type PiiKind } from "./pii";
import { clampSampleRows, type PrivacyLevel, type PrivacySettings } from "./levels";

export * from "./levels";

export interface AiColumnContext {
  name: string;
  type: "numeric" | "categorical" | "date";
  /** Set when the column looks like personal data. */
  personalData?: PiiKind;
  masked?: boolean;
  stats?: { min?: number; max?: number; mean?: number; missing?: number; distinct?: number; earliest?: string; latest?: string };
  topValues?: { value: string; count: number }[];
}

export interface AiDataContext {
  level: PrivacyLevel;
  dataset: { name: string; rowCount: number; columnCount: number };
  columns: AiColumnContext[];
  calculatedFields: { name: string; formula: string }[];
  sampleRows?: Record<string, string | number | boolean | null>[];
}

/** Rows scanned for top values and value-pattern checks (enough for a stable picture, fast on 1M rows). */
const SCAN_LIMIT = 50_000;
const PII_SAMPLE = 300;
const TOP_VALUES = 5;

/** Columns that look like personal data, with their kind. */
export function detectPersonalColumns(dataset: Dataset): Map<string, PiiKind> {
  const out = new Map<string, PiiKind>();
  const sample = dataset.data.slice(0, PII_SAMPLE);
  for (const col of dataset.columns) {
    const kind = detectPii(col, getEffectiveColumnType(dataset, col), sample.map((r) => r[col]));
    if (kind) out.set(col, kind);
  }
  return out;
}

function round(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return undefined;
  return Math.abs(n) >= 100 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000;
}

function numericStats(dataset: Dataset, col: string, rows: DataRow[]): AiColumnContext["stats"] {
  const meta = dataset.metadata?.columns.find((c) => c.name === col);
  if (meta && meta.minimumValue !== undefined) {
    return {
      min: round(meta.minimumValue),
      max: round(meta.maximumValue),
      mean: round(meta.average),
      missing: meta.missingValueCount,
      distinct: meta.uniqueValueCount,
    };
  }
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  let missing = 0;
  for (let i = 0; i < Math.min(rows.length, SCAN_LIMIT); i++) {
    const v = rows[i][col];
    const num = typeof v === "number" ? v : v === null || v === "" ? NaN : Number(v);
    if (!Number.isFinite(num)) {
      missing++;
      continue;
    }
    if (num < min) min = num;
    if (num > max) max = num;
    sum += num;
    n++;
  }
  return n ? { min: round(min), max: round(max), mean: round(sum / n), missing } : { missing };
}

function topValues(rows: DataRow[], col: string): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < Math.min(rows.length, SCAN_LIMIT); i++) {
    const v = rows[i][col];
    if (v === null || v === undefined || v === "") continue;
    const key = String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_VALUES)
    .map(([value, count]) => ({ value: value.length > 80 ? `${value.slice(0, 77)}...` : value, count }));
}

/** 32-bit FNV-1a hash of a string (the sample seed of a dataset). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `n` row indices out of `total`, picked at random with a seed from `seedKey` (the dataset
 * id): the same dataset gives the same rows every time, so the preview shows exactly what a
 * request sends. Partial Fisher-Yates over a sparse swap map (no array of `total` indices);
 * returned in row order.
 */
export function sampleRowIndices(total: number, n: number, seedKey: string): number[] {
  const k = Math.max(0, Math.min(n, total));
  if (k === total) return Array.from({ length: total }, (_, i) => i);
  const rand = seededRandom(hashSeed(seedKey));
  const swapped = new Map<number, number>();
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (total - i));
    const vi = swapped.get(i) ?? i;
    const vj = swapped.get(j) ?? j;
    swapped.set(j, vi);
    out.push(vj);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Builds the data context for an AI request. `rows` are the rows in view (filtered);
 * defaults to all rows.
 */
export function buildAiContext(dataset: Dataset, settings: PrivacySettings, opts: { rows?: DataRow[] } = {}): AiDataContext {
  const rows = opts.rows ?? dataset.data;
  const personal = detectPersonalColumns(dataset);
  const unmasked = new Set(settings.unmasked);
  const level = settings.level;

  const columns: AiColumnContext[] = dataset.columns.map((name) => {
    const type = getEffectiveColumnType(dataset, name);
    const col: AiColumnContext = { name, type };
    const kind = personal.get(name);
    if (kind) {
      col.personalData = kind;
      col.masked = !unmasked.has(name);
    }
    if (level === "schema") return col;
    if (type === "numeric") {
      // A masked numeric column (a phone column of digits) sends no values: its min/max are one person's number.
      if (col.masked) return col;
      col.stats = numericStats(dataset, name, rows);
    } else if (type === "date") {
      const meta = dataset.metadata?.columns.find((c) => c.name === name);
      if (meta?.earliestDate || meta?.latestDate) col.stats = { earliest: meta.earliestDate, latest: meta.latestDate };
    } else {
      const top = topValues(rows, name);
      col.topValues = col.masked ? top.map((t) => ({ value: maskToken(kind!), count: t.count })) : top;
      const meta = dataset.metadata?.columns.find((c) => c.name === name);
      if (meta) col.stats = { distinct: meta.uniqueValueCount, missing: meta.missingValueCount };
    }
    return col;
  });

  const ctx: AiDataContext = {
    level,
    dataset: { name: dataset.name, rowCount: rows.length, columnCount: dataset.columns.length },
    columns,
    calculatedFields: (dataset.calculatedFields ?? []).map((f) => ({ name: f.name, formula: f.expression })),
  };

  if (level === "samples") {
    const n = clampSampleRows(settings.sampleRows);
    const maskedCols = new Map(columns.filter((c) => c.masked).map((c) => [c.name, c.personalData!]));
    ctx.sampleRows = sampleRowIndices(rows.length, n, dataset.id).map((i) => rows[i]).map((r) => {
      const out: Record<string, string | number | boolean | null> = {};
      for (const name of dataset.columns) {
        const v = r[name] ?? null;
        const kind = maskedCols.get(name);
        out[name] = kind && v !== null && v !== "" ? maskToken(kind) : v;
      }
      return out;
    });
  }
  return ctx;
}

/** Masked column names of a context. */
export function maskedColumns(ctx: AiDataContext): Set<string> {
  return new Set(ctx.columns.filter((c) => c.masked).map((c) => c.name));
}

/**
 * A single value of `column` as it may be sent: the mask token for a masked column, and
 * nothing at the schema level (values are not schema).
 */
export function valueForAi(ctx: AiDataContext, column: string | undefined, value: string): string | null {
  if (ctx.level === "schema") return null;
  const col = column ? ctx.columns.find((c) => c.name === column) : undefined;
  if (col?.masked) return maskToken(col.personalData!);
  return value;
}

/** The context as prompt text (compact JSON: models read it well and it is exact). */
export function renderAiContext(ctx: AiDataContext): string {
  return JSON.stringify(ctx);
}
