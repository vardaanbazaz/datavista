import * as XLSX from "xlsx";
import { parseCsvText, type CsvParseIssue } from "@/shared/services/csvParse";
import { processRawData } from "@/shared/services/parsingService";
import { findDuplicateRows } from "@/shared/services/dataQuality";
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
  /**
   * Data rows (header excluded), from the sheet's declared range (its <dimension> tag, read
   * before the cells). Can count trailing formatted blank rows; the import's own count is exact.
   */
  rowCount: number;
  /**
   * Even the second preview filled up and SheetJS reported no longer range (the sheet
   * declares no range): it has rowCount rows or more. Shown as "1,000+ rows".
   */
  rowCountUnknown?: boolean;
  headers: string[];
}

export type SheetChoice = { kind: "one"; name: string } | { kind: "append" };

export interface ImportReview {
  fileName: string;
  rowCount: number;
  columnCount: number;
  issues: ImportIssuesSummary;
  /** Exact duplicate rows among all rows read (the final count, after any exclusion, is in metadata.quality). */
  duplicateRowCount: number;
}

export interface ImportIO {
  /**
   * `fraction` is null when the stage can't tell how far it is (SheetJS reading a workbook).
   * `detail` says what the stage is doing when the stage name isn't enough.
   */
  progress(stage: ImportStage, fraction: number | null, detail?: string): void;
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

/** Drops progress calls closer than PROGRESS_INTERVAL_MS apart, except stage or detail changes and completion. */
function throttledProgress(io: ImportIO): ImportIO["progress"] {
  let lastStage: ImportStage | null = null;
  let lastDetail: string | undefined;
  let lastAt = 0;
  return (stage, fraction, detail) => {
    const now = Date.now();
    if (stage !== lastStage || detail !== lastDetail || fraction === 1 || now - lastAt >= PROGRESS_INTERVAL_MS) {
      lastStage = stage;
      lastDetail = detail;
      lastAt = now;
      io.progress(stage, fraction, detail);
    }
  };
}

/** Progress texts for the XLSX stages (ImportDialog shows them in place of the stage name). */
export const XLSX_DETAIL = {
  workbook: "Reading workbook — large files can take a minute",
  sheetList: "Reading workbook — large files can take a minute; you'll choose a sheet next",
  sheet: (name: string) => `Reading sheet “${name}” — large files can take a minute`,
  rows: "Converting rows",
} as const;

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

/**
 * Name, row count and headers of every sheet without reading the cells: `sheetRows` parses
 * each sheet's first PREVIEW_ROWS rows only, and SheetJS keeps the declared full range in
 * `!fullref` when the sheet is longer (online_retail_II.xlsx, 44 MB: ~8 s instead of ~60 s).
 * Without a declared range (some writers omit <dimension>) a sheet that fills the preview has
 * an unknown length.
 */
const PREVIEW_ROWS = 3;
/** Second, larger preview for sheets the first one could not size (see previewSheets). */
const RECOUNT_ROWS = 1001;

function readPreview(bytes: ArrayBuffer, names: string[], sheetRows: number): SheetInfo[] {
  const preview = XLSX.read(bytes, { type: "array", sheetRows, sheets: names });
  return names.map(name => {
    const ws = preview.Sheets[name];
    const ref = ws?.["!ref"];
    if (!ref) return { name, rowCount: 0, headers: [] };
    const range = XLSX.utils.decode_range(ref);
    const full = ws["!fullref"] ? XLSX.utils.decode_range(ws["!fullref"]) : null;
    const headers = sheetKeys(ws, range);
    const rows = (full ?? range).e.r - (full ?? range).s.r;
    const filled = range.e.r - range.s.r >= sheetRows - 1;
    return full || !filled ? { name, rowCount: rows, headers } : { name, rowCount: rows, rowCountUnknown: true, headers };
  });
}

/**
 * A preview that fills up with no longer range is ambiguous: the sheet has exactly that many
 * rows, or declares no range. Those sheets (tiny ones, or rare writers) are read again with
 * RECOUNT_ROWS rows, which gives exact counts up to 1,000 and "1,000+" past that.
 */
function previewSheets(bytes: ArrayBuffer, names: string[]): SheetInfo[] {
  const first = readPreview(bytes, names, PREVIEW_ROWS);
  const unsure = first.filter(s => s.rowCountUnknown).map(s => s.name);
  if (unsure.length === 0) return first;
  const recount = new Map(readPreview(bytes, unsure, RECOUNT_ROWS).map(s => [s.name, s]));
  return first.map(s => recount.get(s.name) ?? s);
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
  const bytes = (await readBytes(file, options.readSliceBytes, progress)).buffer as ArrayBuffer;
  // Sheet names first (workbook.xml only, ~3 s for 44 MB), so a one-sheet file pays for no
  // preview and a several-sheet file shows the picker before the long read (~8 s, not ~60 s).
  progress("parsing", null, XLSX_DETAIL.workbook);
  const names = XLSX.read(bytes, { type: "array", bookSheets: true }).SheetNames;

  let chosenNames = names;
  let appendAll = false;
  if (names.length > 1) {
    progress("parsing", null, XLSX_DETAIL.sheetList);
    const infos = previewSheets(bytes, names);
    const withRows = infos.filter(s => s.rowCount > 0);
    const canAppend =
      withRows.length > 1 && withRows.every(s => s.headers.join("\u0000") === withRows[0].headers.join("\u0000"));
    const choice = await io.chooseSheet(infos, canAppend);
    if (choice.kind === "append" && canAppend) {
      chosenNames = withRows.map(s => s.name);
      appendAll = true;
    } else {
      const picked = choice.kind === "one" ? names.find(n => n === choice.name) : undefined;
      if (!picked) throw new Error("The chosen sheet is not in this workbook.");
      chosenNames = [picked];
      progress("parsing", null, XLSX_DETAIL.sheet(picked));
    }
    if (appendAll) progress("parsing", null, XLSX_DETAIL.workbook);
  }

  // Only the chosen sheets are parsed (`sheets`); date cells become calendar strings (xlsxDates.ts).
  const workbook = readWorkbookWithCalendarDates(bytes, names.length > 1 ? chosenNames : undefined);
  const chosen = chosenNames.map(name => planSheet(workbook, name));

  const totalRows = chosen.reduce((n, p) => n + p.info.rowCount, 0) || 1;
  const records: Record<string, unknown>[] = [];
  const sourceColumn = appendAll ? uniqueColumnName(SOURCE_SHEET_COLUMN, chosen[0].info.headers) : null;
  let rowsBefore = 0;
  progress("parsing", 0, XLSX_DETAIL.rows);
  for (const plan of chosen) {
    sheetRecords(plan, options.xlsxBlockRows, records, done => progress("parsing", (rowsBefore + done) / totalRows, XLSX_DETAIL.rows),
      sourceColumn ? { [sourceColumn]: plan.info.name } : undefined);
    rowsBefore += plan.info.rowCount;
  }
  progress("parsing", 1, XLSX_DETAIL.rows);
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
        duplicateRowCount: rows.length > 0 ? findDuplicateRows(rows, Object.keys(rows[0])).length : 0,
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
