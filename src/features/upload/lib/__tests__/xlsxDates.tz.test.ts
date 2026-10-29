import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { processRawData } from "@/shared/services/parsingService";
import { excelSerialToCalendar, readWorkbookWithCalendarDates } from "../xlsxDates";

/** A small workbook built in memory: numeric date cells with a date number format (no JS Dates, so the fixture itself is TZ-free). */
function workbookBytes(date1904: boolean): ArrayBuffer {
  const ws: XLSX.WorkSheet = {
    "!ref": "A1:C4",
    A1: { t: "s", v: "InvoiceDate" },
    B1: { t: "s", v: "Day" },
    C1: { t: "s", v: "Quantity" },
    A2: { t: "n", v: 40148.32, z: "yyyy-mm-dd hh:mm" },
    B2: { t: "n", v: 39448, z: "yyyy-mm-dd" },
    C2: { t: "n", v: 6 },
    A3: { t: "n", v: 40148.5, z: "m/d/yy h:mm:ss" },
    B3: { t: "n", v: 39813, z: "dd-mmm-yy" },
    C3: { t: "n", v: 12 },
    A4: { t: "n", v: 40149, z: "yyyy-mm-dd hh:mm" },
    B4: { t: "n", v: 39814, z: "yyyy-mm-dd" },
    C4: { t: "n", v: 40148 },
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  if (date1904) wb.Workbook = { ...(wb.Workbook ?? {}), WBProps: { date1904: true } };
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("Excel date serials", () => {
  it("convert to calendar strings with times, 1900 and 1904 systems", () => {
    expect(excelSerialToCalendar(39448, false)).toBe("2008-01-01");
    expect(excelSerialToCalendar(40148.32, false)).toBe("2009-12-01T07:40:48");
    expect(excelSerialToCalendar(40148.5, false)).toBe("2009-12-01T12:00");
    expect(excelSerialToCalendar(40148.5, false, true)).toBe("2009-12-01T12:00:00");
    expect(excelSerialToCalendar(40148, true)).toBe("2013-12-02");
    expect(excelSerialToCalendar(60, false)).toBeNull(); // Excel's fake 1900-02-29
    expect(excelSerialToCalendar(-1, false)).toBeNull();
  });

  it("an imported workbook gets calendar dates, not serial numbers (1900 system)", () => {
    const wb = readWorkbookWithCalendarDates(workbookBytes(false));
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const ds = processRawData(rows, "retail.xlsx", { dayFirstDefault: true });
    expect(ds.columnTypes.InvoiceDate).toBe("date");
    expect(ds.columnTypes.Day).toBe("date");
    expect(ds.data.map(r => r.InvoiceDate)).toEqual(["2009-12-01T07:40:48", "2009-12-01T12:00:00", "2009-12-02"]);
    expect(ds.data.map(r => r.Day)).toEqual(["2008-01-01", "2008-12-31", "2009-01-01"]);
    // A plain number that happens to be a serial-sized value stays a number.
    expect(ds.columnTypes.Quantity).toBe("numeric");
    expect(ds.data[2].Quantity).toBe(40148);
    const day = ds.metadata!.columns.find(c => c.name === "Day")!;
    expect([day.earliestDate, day.latestDate]).toEqual(["2008-01-01", "2009-01-01"]);
  });

  it("respects the workbook's 1904 date system", () => {
    const wb = readWorkbookWithCalendarDates(workbookBytes(true));
    expect(wb.Workbook?.WBProps?.date1904).toBe(true);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    expect(rows[0].Day).toBe("2012-01-02");
    expect(rows[0].InvoiceDate).toBe("2013-12-02T07:40:48");
  });
});
