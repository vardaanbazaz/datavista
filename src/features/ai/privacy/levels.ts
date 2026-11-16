/** Privacy levels and their settings. Kept apart from contextBuilder so settings UI can import them without loading the builder. */
export type PrivacyLevel = "schema" | "summaries" | "samples";

export const PRIVACY_LEVELS: { id: PrivacyLevel; label: string; description: string }[] = [
  { id: "schema", label: "Schema", description: "Column names and types only." },
  { id: "summaries", label: "Summaries", description: "Plus numeric stats (min, max, mean) and each text column's top values." },
  { id: "samples", label: "Sample rows", description: "Plus the first rows of the data." },
];

export const SAMPLE_ROWS_MIN = 20;
export const SAMPLE_ROWS_MAX = 200;
export const SAMPLE_ROWS_DEFAULT = 50;
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "summaries";

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

