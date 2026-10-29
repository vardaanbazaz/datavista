/**
 * The one size cap and file check for every way a file enters DataVista (upload panel,
 * drag and drop, DataTable "replace data"): `importFile` calls `checkImportFile` before it
 * reads a single byte. Sizes are decimal megabytes (1 MB = 1,000,000 bytes), the unit the
 * operating system shows next to the file.
 */

export const MAX_IMPORT_BYTES = 100_000_000;
export const LARGE_FILE_WARNING_BYTES = 50_000_000;

export const IMPORT_EXTENSIONS = ["csv", "tsv", "xlsx", "xls"] as const;
export type ImportExtension = (typeof IMPORT_EXTENSIONS)[number];

const formatMB = (bytes: number, digits: number) => `${(bytes / 1_000_000).toFixed(digits)} MB`;

/** File size and limit in the same unit, with enough decimals that they never read as equal. */
export function formatSizeAgainstLimit(bytes: number, limit: number): { size: string; limit: string } {
  let digits = 1;
  while (digits < 6 && bytes !== limit && formatMB(bytes, digits) === formatMB(limit, digits)) digits++;
  return { size: formatMB(bytes, digits), limit: formatMB(limit, digits) };
}

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export type ImportFileCheck =
  | { ok: true; extension: ImportExtension; warning?: { title: string; description: string } }
  | { ok: false; title: string; description: string };

/** Size and format check. Reads only `name` and `size`, never the contents. */
export function checkImportFile(file: Pick<File, "name" | "size">): ImportFileCheck {
  const extension = fileExtension(file.name);
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      title: "Unsupported format",
      description: "Please choose a CSV, TSV, or XLSX file.",
    };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    const s = formatSizeAgainstLimit(file.size, MAX_IMPORT_BYTES);
    return {
      ok: false,
      title: "File rejected",
      description: `This file is ${s.size}. The maximum supported size is ${s.limit}, to keep the browser stable.`,
    };
  }
  if (file.size > LARGE_FILE_WARNING_BYTES) {
    const s = formatSizeAgainstLimit(file.size, LARGE_FILE_WARNING_BYTES);
    return {
      ok: true,
      extension: extension as ImportExtension,
      warning: {
        title: "Large file",
        description: `This file is ${s.size} (over ${s.limit}). Importing it can take a while and use a lot of memory.`,
      },
    };
  }
  return { ok: true, extension: extension as ImportExtension };
}
