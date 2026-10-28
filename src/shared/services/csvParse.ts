import Papa from "papaparse";
import { normalizeHeaders } from "./parsingService";

/**
 * The one CSV/TSV parse path (FileUpload, DataTable "replace data", and the golden test
 * suites). Papa runs with header:false so the header row is ours to name: Papa's own
 * header mode keys a blank header as "" and renames duplicates "Name_1", which made
 * processRawData drop/shift columns. Header names follow pandas instead (see
 * normalizeHeaders): blank -> "Unnamed: <i>", repeats -> "Name.1", "Name.2".
 */

export interface CsvParseIssue {
  type: string;
  code: string;
  message: string;
  /** 0-based data-row index (header excluded), when the issue belongs to a row. */
  row?: number;
}

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, unknown>[];
  errors: CsvParseIssue[];
}

export function csvParseOptions(delimiter?: string) {
  return {
    header: false,
    skipEmptyLines: "greedy" as const,
    delimiter,
  };
}

/**
 * Turns Papa's array rows (header row first) into keyed records. A short row leaves its
 * missing columns undefined (they become null in processRawData); fields past the header
 * width are dropped. Both are reported in `errors`, like Papa's header mode does.
 */
export function recordsFromMatrix(matrix: unknown[][]): CsvParseResult {
  if (matrix.length === 0) return { headers: [], rows: [], errors: [] };
  const rawHeader = matrix[0].map(h => String(h ?? ""));
  if (rawHeader.length > 0) rawHeader[0] = rawHeader[0].replace(/^\uFEFF/, "");
  const headers = normalizeHeaders(rawHeader);
  const width = headers.length;

  const rows: Record<string, unknown>[] = new Array(matrix.length - 1);
  const errors: CsvParseIssue[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const src = matrix[r];
    const rec: Record<string, unknown> = {};
    for (let c = 0; c < width; c++) rec[headers[c]] = src[c];
    rows[r - 1] = rec;
    if (src.length !== width) {
      const code = src.length < width ? "TooFewFields" : "TooManyFields";
      errors.push({
        type: "FieldMismatch",
        code,
        message: `${code === "TooFewFields" ? "Too few" : "Too many"} fields: expected ${width} fields but parsed ${src.length}`,
        row: r - 1,
      });
    }
  }
  return { headers, rows, errors };
}

function toIssues(errors: Papa.ParseError[]): CsvParseIssue[] {
  return errors.map(e => ({ type: e.type, code: e.code, message: e.message, row: e.row }));
}

/** Parses CSV/TSV text (used by tests and anything that already holds the text). */
export function parseCsvText(text: string, delimiter?: string): CsvParseResult {
  const parsed = Papa.parse<unknown[]>(text, csvParseOptions(delimiter));
  const result = recordsFromMatrix(parsed.data);
  return { ...result, errors: [...toIssues(parsed.errors), ...result.errors] };
}

/** Parses a CSV/TSV File the same way parseCsvText parses text. */
export function parseCsvFile(file: File, delimiter?: string): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<unknown[]>(file, {
      ...csvParseOptions(delimiter),
      complete: parsed => {
        const result = recordsFromMatrix(parsed.data);
        resolve({ ...result, errors: [...toIssues(parsed.errors), ...result.errors] });
      },
      error: err => reject(err),
    });
  });
}
