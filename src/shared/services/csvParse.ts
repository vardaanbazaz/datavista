import Papa from "papaparse";
import { normalizeHeaders } from "./parsingService";

/**
 * The one CSV/TSV parse path (the import worker, and the golden test suites). Papa runs
 * with header:false so the header row is ours to name: Papa's own header mode keys a blank
 * header as "" and renames duplicates "Name_1", which made processRawData drop/shift
 * columns. Header names follow pandas instead (see normalizeHeaders): blank ->
 * "Unnamed: <i>", repeats -> "Name.1", "Name.2".
 */

export interface CsvParseIssue {
  type: string;
  code: string;
  message: string;
  /** 0-based data-row index (header excluded), when the issue belongs to a row. */
  row?: number;
  /** The row's fields as parsed (all of them, including any past the header width). */
  raw?: string[];
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

const rawFields = (src: unknown[] | undefined): string[] | undefined =>
  src ? src.map(v => String(v ?? "")) : undefined;

/**
 * Turns Papa's array rows (header row first) into keyed records, one chunk at a time, so
 * a large file never holds Papa's arrays and the records at once. A short row leaves its
 * missing columns undefined (they become null in processRawData); fields past the header
 * width are dropped. Both are reported in `errors`, like Papa's header mode does. Papa's own
 * errors carry a row index within their chunk; it is shifted to the data-row index here.
 */
export class CsvRecordBuilder {
  headers: string[] = [];
  rows: Record<string, unknown>[] = [];
  errors: CsvParseIssue[] = [];
  /** Papa rows seen so far, header row included. */
  private seen = 0;

  addChunk(matrix: unknown[][], papaErrors: Papa.ParseError[] = []): void {
    let start = 0;
    if (this.seen === 0 && matrix.length > 0) {
      const rawHeader = matrix[0].map(h => String(h ?? ""));
      if (rawHeader.length > 0) rawHeader[0] = rawHeader[0].replace(/^\uFEFF/, "");
      this.headers = normalizeHeaders(rawHeader);
      start = 1;
    }
    for (const e of papaErrors) {
      const row = e.row === undefined ? undefined : this.seen + e.row - 1;
      this.errors.push({
        type: e.type,
        code: e.code,
        message: e.message,
        ...(row !== undefined && row >= 0 ? { row, raw: rawFields(matrix[e.row as number]) } : {}),
      });
    }
    const headers = this.headers;
    const width = headers.length;
    for (let r = start; r < matrix.length; r++) {
      const src = matrix[r];
      const rec: Record<string, unknown> = {};
      for (let c = 0; c < width; c++) rec[headers[c]] = src[c];
      const row = this.rows.length;
      this.rows.push(rec);
      if (src.length !== width) {
        const code = src.length < width ? "TooFewFields" : "TooManyFields";
        this.errors.push({
          type: "FieldMismatch",
          code,
          message: `${code === "TooFewFields" ? "Too few" : "Too many"} fields: expected ${width} fields but parsed ${src.length}`,
          row,
          raw: rawFields(src),
        });
      }
    }
    this.seen += matrix.length;
  }

  result(): CsvParseResult {
    return { headers: this.headers, rows: this.rows, errors: this.errors };
  }
}

/** Keyed records from a whole Papa matrix (header row first). */
export function recordsFromMatrix(matrix: unknown[][]): CsvParseResult {
  const builder = new CsvRecordBuilder();
  builder.addChunk(matrix);
  return builder.result();
}

export interface CsvChunkedOptions {
  /** Characters per Papa chunk. */
  chunkSize?: number;
  /** Called after each chunk with the share of the text parsed so far (0..1). */
  onProgress?: (fraction: number) => void;
}

/**
 * Parses CSV/TSV text. With `chunkSize`, Papa parses it in chunks and `onProgress` reports
 * how far it got; the records are the same either way.
 */
export function parseCsvText(text: string, delimiter?: string, options: CsvChunkedOptions = {}): CsvParseResult {
  const builder = new CsvRecordBuilder();
  if (!options.chunkSize) {
    const parsed = Papa.parse<unknown[]>(text, csvParseOptions(delimiter));
    builder.addChunk(parsed.data, parsed.errors);
    return builder.result();
  }
  const total = text.length || 1;
  // Papa streams a string in chunks synchronously; its typings only allow `chunk` for files.
  const chunked = {
    ...csvParseOptions(delimiter),
    chunkSize: options.chunkSize,
    chunk: (results: Papa.ParseResult<unknown[]>) => {
      builder.addChunk(results.data, results.errors);
      options.onProgress?.(Math.min(1, results.meta.cursor / total));
    },
  };
  Papa.parse<unknown[]>(text, chunked as Papa.ParseConfig<unknown[]>);
  return builder.result();
}
