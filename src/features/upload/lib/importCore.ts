import * as XLSX from "xlsx";
import { parseCsvText, type CsvParseIssue } from "@/shared/services/csvParse";
import { processRawData } from "@/shared/services/parsingService";
import type { Dataset, ImportIssue, ImportIssuesSummary } from "@/shared/types";
import { readWorkbookWithCalendarDates } from "./xlsxDates";
import { fileExtension } from "./importLimits";

/**
 * The import pipeline: file bytes -> records -> processRawData -> Dataset. It runs inside
 * the import worker (worker/import.worker.ts), which is its only production caller; it has
 * no DOM or store access, so the unit tests run it directly in Node. Questions for the user
 * (which sheet, keep or exclude broken rows) go out through `io` and the pipeline waits.
 */

export type ImportStage = "reading" | "parsing" | "analysing" | "saving";

export interface SheetInfo {
  name: string;
  /** Data rows (header excluded), from the sheet's used range. */
  rowCount: number;
  headers: string[];
}

export type SheetChoice = { kind: "one"; name: string } | { kind: "append" };

export interface ImportReview {
  fileName: string;
  rowCount: number;
  columnCount: number;
  issues: ImportIssuesSummary;
}

export interface ImportIO {
  /** `fraction` is null when the stage can't tell how far it is (SheetJS reading a workbook). */
  progress(stage: ImportStage, fraction: number | null): void;
  chooseSheet(sheets: SheetInfo[], canAppend: boolean): Promise<SheetChoice>;
  review(review: ImportReview): Promise<{ exclude: boolean }>;
}

export interface ImportOptions {
  /** Day/month order for undecidable numeric dates; the worker has no reliable locale of its own. */
  dayFirstDefault?: boolean;
  /** Bytes read per slice while reading the file. */
  readSliceBytes?: number;
  /** Characters per Papa chunk while parsing CSV. */
  csvChunkSize?: number;
  /** Rows converted per block while reading an XLSX sheet. */
  xlsxBlockRows?: number;
}

/** Name of the column added when every sheet is appended. */
export const SOURCE_SHEET_COLUMN = "Source sheet";
/** Problems kept in metadata for the import summary; the counts cover all of them. */
export const IMPORT_ISSUES_STORED = 100;
const RAW_FIELDS_STORED = 40;
const RAW_FIELD_CHARS = 120;
const PROGRESS_INTERVAL_MS = 100;

/** Drops progress calls closer than PROGRESS_INTERVAL_MS apart, except stage changes and completion. */
function throttledProgress(io: ImportIO): ImportIO["progress"] {
  let lastStage: ImportStage | null = null;
  let lastAt = 0;
  return (stage, fraction) => {
    const now = Date.now();
    if (stage !== lastStage || fraction === 1 || now - lastAt >= PROGRESS_INTERVAL_MS) {
      lastStage = stage;
      lastAt = now;
      io.progress(stage, fraction);
    }
  };
}

async function readSlices(file: Blob, sliceBytes: number, onSlice: (chunk: Uint8Array, done: number) => void) {
  const total = file.size;
  for (let offset = 0; offset < total; offset += sliceBytes) {
    const chunk = new Uint8Array(await file.slice(offset, offset + sliceBytes).arrayBuffer());
    onSlice(chunk, Math.min(total, offset + chunk.length) / total);
  }
}

async function readText(file: Blob, sliceBytes: number, progress: ImportIO["progress"]): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  progress("reading", 0);
  await readSlices(file, sliceBytes, (chunk, done) => {
    parts.push(decoder.decode(chunk, { stream: true }));
    progress("reading", done);
  });
  parts.push(decoder.decode());
  return parts.join("");
}

async function readBytes(file: Blob, sliceBytes: number, progress: ImportIO["progress"]): Promise<Uint8Array> {
  const bytes = new Uint8Array(file.size);
  let at = 0;
  progress("reading", 0);
  await readSlices(file, sliceBytes, (chunk, done) => {
    bytes.set(chunk, at);
    at += chunk.length;
    progress("reading", done);
  });
  return bytes;
}

const truncateRaw = (raw: string[] | undefined): string[] =>
  (raw ?? []).slice(0, RAW_FIELDS_STORED).map(v => (v.length > RAW_FIELD_CHARS ? `${v.slice(0, RAW_FIELD_CHARS)}…` : v));

/** Groups parse errors into the summary stored in metadata. Row numbers become 1-based. */
export function summarizeIssues(errors: CsvParseIssue[], sourceRowCount: number): ImportIssuesSummary {
  const rowIssues = errors.filter((e): e is CsvParseIssue & { row: number } => e.row !== undefined);
  const rows = new Set(rowIssues.map(e => e.row));
  const listed: ImportIssue[] = [...rowIssues]
    .sort((a, b) => a.row - b.row)
    .slice(0, IMPORT_ISSUES_STORED)
    .map(e => ({ row: e.row + 1, code: e.code, message: e.message, raw: truncateRaw(e.raw) }));
  const fileIssues = [...new Set(errors.filter(e => e.row === undefined).map(e => e.message))];
  return { rowCount: rows.size, issueCount: errors.length, fileIssues, listed, excluded: false, sourceRowCount };
}

/** Header keys exactly as `sheet_to_json` names them ("__EMPTY", "Name_1"), so XLSX naming is unchanged. */
function sheetKeys(ws: XLSX.WorkSheet, range: XLSX.Range): string[] {
  const twoRows = { s: range.s, e: { r: Math.min(range.s.r + 1, range.e.r), c: range.e.c } };
  const first = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: twoRows, defval: "" })[0];
  if (first) return Object.keys(first);
  const header = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: twoRows, defval: "" })[0] ?? [];
  return header.map(h => String(h));
}

interface SheetPlan {
  info: SheetInfo;
  ws: XLSX.WorkSheet;
  range: XLSX.Range | null;
}

function planSheet(workbook: XLSX.WorkBook, name: string): SheetPlan {
  const ws = workbook.Sheets[name];
  const ref = ws?.["!ref"];
  if (!ref) return { info: { name, rowCount: 0, headers: [] }, ws, range: null };
  const range = XLSX.utils.decode_range(ref);
  return { info: { name, rowCount: range.e.r - range.s.r, headers: sheetKeys(ws, range) }, ws, range };
}

/** Same records as `sheet_to_json(ws, { defval: "" })`, converted in row blocks so progress can be reported. */
function sheetRecords(
  plan: SheetPlan,
  blockRows: number,
  out: Record<string, unknown>[],
  onRows: (rowsDone: number) => void,
  extra?: Record<string, unknown>
) {
  const { ws, range, info } = plan;
  if (!range || info.headers.length === 0) return;
  const lastCol = range.s.c + info.headers.length - 1;
  for (let r = range.s.r + 1; r <= range.e.r; r += blockRows) {
    const end = Math.min(r + blockRows - 1, range.e.r);
    const part = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      header: info.headers,
      range: { s: { r, c: range.s.c }, e: { r: end, c: lastCol } },
      defval: "",
    });
    for (const rec of part) {
      if (extra) Object.assign(rec, extra);
      out.push(rec);
    }
    onRows(end - range.s.r);
  }
}

function uniqueColumnName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let i = 1;
  while (taken.includes(`${base}.${i}`)) i++;
  return `${base}.${i}`;
}

async function xlsxRecords(
  file: Blob,
  options: Required<Pick<ImportOptions, "readSliceBytes" | "xlsxBlockRows">>,
  io: ImportIO,
  progress: ImportIO["progress"]
): Promise<Record<string, unknown>[]> {
  const bytes = await readBytes(file, options.readSliceBytes, progress);
  progress("parsing", null);
  // Date cells become calendar strings, not serial numbers (xlsxDates.ts).
  const workbook = readWorkbookWithCalendarDates(bytes.buffer as ArrayBuffer);
  const plans = workbook.SheetNames.map(name => planSheet(workbook, name));

  let chosen: SheetPlan[] = plans;
  let appendAll = false;
  if (plans.length > 1) {
    const withRows = plans.filter(p => p.info.rowCount > 0);
    const canAppend =
      withRows.length > 1 && withRows.every(p => p.info.headers.join("\u0000") === withRows[0].info.headers.join("\u0000"));
    const choice = await io.chooseSheet(plans.map(p => p.info), canAppend);
    if (choice.kind === "append" && canAppend) {
      chosen = withRows;
      appendAll = true;
    } else {
      const picked = choice.kind === "one" ? plans.find(p => p.info.name === choice.name) : undefined;
      if (!picked) throw new Error("The chosen sheet is not in this workbook.");
      chosen = [picked];
    }
  }

  const totalRows = chosen.reduce((n, p) => n + p.info.rowCount, 0) || 1;
  const records: Record<string, unknown>[] = [];
  const sourceColumn = appendAll ? uniqueColumnName(SOURCE_SHEET_COLUMN, chosen[0].info.headers) : null;
  let rowsBefore = 0;
  progress("parsing", 0);
  for (const plan of chosen) {
    sheetRecords(plan, options.xlsxBlockRows, records, done => progress("parsing", (rowsBefore + done) / totalRows),
      sourceColumn ? { [sourceColumn]: plan.info.name } : undefined);
    rowsBefore += plan.info.rowCount;
  }
  progress("parsing", 1);
  return records;
}

export async function runImport(file: Blob, fileName: string, options: ImportOptions, io: ImportIO): Promise<Dataset> {
  const progress = throttledProgress(io);
  const readSliceBytes = options.readSliceBytes ?? 4 * 1024 * 1024;
  const ext = fileExtension(fileName);

  let rows: Record<string, unknown>[];
  let importIssues: ImportIssuesSummary;
  if (ext === "csv" || ext === "tsv") {
    let text: string | null = await readText(file, readSliceBytes, progress);
    progress("parsing", 0);
    const parsed = parseCsvText(text, ext === "tsv" ? "\t" : undefined, {
      chunkSize: options.csvChunkSize ?? 1024 * 1024,
      onProgress: f => progress("parsing", f),
    });
    text = null;
    progress("parsing", 1);
    rows = parsed.rows;
    importIssues = summarizeIssues(parsed.errors, rows.length);
    if (importIssues.rowCount > 0) {
      const { exclude } = await io.review({
        fileName,
        rowCount: rows.length,
        columnCount: parsed.headers.length,
        issues: importIssues,
      });
      if (exclude) {
        const bad = new Set(parsed.errors.filter(e => e.row !== undefined).map(e => e.row as number));
        rows = rows.filter((_, i) => !bad.has(i));
        importIssues = { ...importIssues, excluded: true };
      }
    }
  } else if (ext === "xlsx" || ext === "xls") {
    rows = await xlsxRecords(file, { readSliceBytes, xlsxBlockRows: options.xlsxBlockRows ?? 20_000 }, io, progress);
    importIssues = summarizeIssues([], rows.length);
  } else {
    throw new Error("Unsupported file format. Please upload CSV, TSV, or XLSX files.");
  }

  progress("analysing", 0);
  const dataset = processRawData(rows, fileName, {
    dayFirstDefault: options.dayFirstDefault,
    importIssues,
    onProgress: f => progress("analysing", f),
  });
  progress("analysing", 1);
  return dataset;
}
