import * as XLSX from "xlsx";
import { formatCalendar, isValidCalendarDate, parseStoredDate } from "@/shared/utils/dates";

interface DateCode {
  y: number;
  m: number;
  d: number;
}

/**
 * An Excel date serial (days since the workbook's epoch, time as the fraction) → a stored
 * calendar string: "YYYY-MM-DD", plus "THH:mm" or "THH:mm:ss" when the serial has a time.
 * `date1904` is the workbook's 1904 date system (old Mac Excel). Pure arithmetic via
 * SheetJS's parse_date_code, which also knows Excel's fake 1900-02-29 (serial 60); no JS
 * Date and no time zone. Returns null for serials that aren't real calendar dates.
 */
export function excelSerialToCalendar(serial: number, date1904: boolean, withSeconds = false): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  let day = Math.floor(serial);
  let seconds = Math.round((serial - day) * 86400);
  if (seconds >= 86400) {
    day += 1;
    seconds -= 86400;
  }
  const code = XLSX.SSF.parse_date_code(day, { date1904 }) as DateCode | undefined;
  if (!code || !isValidCalendarDate(code.y, code.m, code.d)) return null;
  const parts = { year: code.y, month: code.m, day: code.d };
  if (seconds === 0) return formatCalendar(parts);
  const time = { hour: Math.floor(seconds / 3600), minute: Math.floor((seconds % 3600) / 60) };
  const second = seconds % 60;
  return formatCalendar({ ...parts, ...time, ...(withSeconds || second !== 0 ? { second } : {}) });
}

/**
 * Reads an XLSX/XLS file so that date cells come out as calendar strings instead of Excel
 * serial numbers (40148.32): every numeric cell with a date number format is rewritten in
 * place before `sheet_to_json`, so processRawData sees "2009-12-01T07:40:48" and types the
 * column as a date. Respects the workbook's 1904 date system and keeps times.
 */
export function readWorkbookWithCalendarDates(data: ArrayBuffer): XLSX.WorkBook {
  const workbook = XLSX.read(data, { type: "array", cellNF: true });
  const date1904 = !!workbook.Workbook?.WBProps?.date1904;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    for (const ref of Object.keys(sheet)) {
      if (ref.startsWith("!")) continue;
      const cell = sheet[ref] as XLSX.CellObject;
      let text: string | null = null;
      if (cell.t === "n" && typeof cell.v === "number" && typeof cell.z === "string" && XLSX.SSF.is_date(cell.z)) {
        text = excelSerialToCalendar(cell.v, date1904, /s/i.test(cell.z.replace(/"[^"]*"|\[[^\]]*\]/g, "")));
      } else if (cell.t === "d" && typeof cell.v === "string") {
        const parts = parseStoredDate(cell.v);
        text = parts ? formatCalendar(parts) : null;
      }
      if (text !== null) {
        cell.t = "s";
        cell.v = text;
        delete cell.w;
      }
    }
  }
  return workbook;
}
