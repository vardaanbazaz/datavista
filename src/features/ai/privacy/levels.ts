/** Privacy levels and their settings. Kept apart from contextBuilder so settings UI can import them without loading the builder. */
export type PrivacyLevel = "schema" | "summaries" | "queries" | "samples";

export const PRIVACY_LEVELS: { id: PrivacyLevel; label: string; description: string; sends: string }[] = [
  { id: "schema", label: "Schema", description: "Column names and types only.", sends: "column names and types" },
  {
    id: "summaries",
    label: "Summaries",
    description: "Plus numeric stats (min, max, mean) and each text column's top values.",
    sends: "column names, types and summaries",
  },
  {
    id: "queries",
    label: "Queries",
    description: "Plus the copilot may run queries on your data in this browser; it receives only their results (totals, averages, counts, top values), never rows.",
    sends: "column summaries and the results of queries it runs in this browser",
  },
  {
    id: "samples",
    label: "Sample rows",
    description: "Plus a random sample of rows (the same rows each time for a dataset), and the copilot may look up a few rows.",
    sends: "column summaries, query results and a sample of rows",
  },
];

/** Order of the levels: each one sends everything the ones before it send. */
const RANK: Record<PrivacyLevel, number> = { schema: 0, summaries: 1, queries: 2, samples: 3 };

/** True when `level` sends at least what `min` sends. */
export function levelAtLeast(level: PrivacyLevel, min: PrivacyLevel): boolean {
  return RANK[level] >= RANK[min];
}

export function isPrivacyLevel(v: unknown): v is PrivacyLevel {
  return typeof v === "string" && v in RANK;
}

export function privacyLevelLabel(level: PrivacyLevel): string {
  return PRIVACY_LEVELS.find((l) => l.id === level)?.label ?? level;
}

/** What a level sends, in a few words ("column names, types and summaries"). */
export function privacyLevelSends(level: PrivacyLevel): string {
  return PRIVACY_LEVELS.find((l) => l.id === level)?.sends ?? "";
}

/**
 * What the dataset context alone carries at a level (buildAiContext), for one-shot requests
 * that run no queries (command palette /ai, formula builder): Queries sends the same as
 * Summaries there.
 */
export function contextSends(level: PrivacyLevel): string {
  if (level === "schema") return "column names and types";
  if (level === "samples") return "column summaries and a sample of rows";
  return "column names, types and summaries";
}

export const SAMPLE_ROWS_MIN = 20;
export const SAMPLE_ROWS_MAX = 200;
export const SAMPLE_ROWS_DEFAULT = 50;
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "queries";

export interface PrivacySettings {
  level: PrivacyLevel;
  sampleRows: number;
  /** Column names the user chose to send unmasked even though they look like personal data. */
  unmasked: string[];
}

export function clampSampleRows(n: number): number {
  if (!Number.isFinite(n)) return SAMPLE_ROWS_DEFAULT;
  return Math.min(SAMPLE_ROWS_MAX, Math.max(SAMPLE_ROWS_MIN, Math.round(n)));
}
