import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { runImport, SOURCE_SHEET_COLUMN, type ImportIO, type ImportStage } from "../importCore";
import { readWorkbookWithCalendarDates } from "../xlsxDates";
import { processRawData } from "@/shared/services/parsingService";

const STAGE_ORDER: ImportStage[] = ["reading", "parsing", "analysing"];

function recordingIO(overrides: Partial<ImportIO> = {}) {
  const events: { stage: ImportStage; fraction: number | null }[] = [];
  const io: ImportIO = {
    progress: (stage, fraction) => events.push({ stage, fraction }),
    chooseSheet: () => Promise.reject(new Error("unexpected sheet question")),
    review: () => Promise.reject(new Error("unexpected review")),
    ...overrides,
  };
  return { io, events };
}

/** ~200k rows, about 6 MB: id, a category, a number, a date. */
function generatedCsv(rows: number): string {
  const lines = ["id,region,amount,day"];
  const regions = ["North", "South", "East", "West"];
  for (let i = 1; i <= rows; i++) {
    lines.push(`${i},${regions[i % 4]},${(i % 1000) / 10},2024-01-${String((i % 28) + 1).padStart(2, "0")}`);
  }
  return lines.join("\n") + "\n";
}

describe("runImport (the worker's pipeline)", () => {
  it("imports a generated 200k-row CSV with progress in stage order", async () => {
    const file = new File([generatedCsv(200_000)], "big.csv", { type: "text/csv" });
    const { io, events } = recordingIO();
    const ds = await runImport(file, file.name, { readSliceBytes: 512 * 1024, csvChunkSize: 256 * 1024 }, io);

    expect(ds.data.length).toBe(200_000);
    expect(ds.columns).toEqual(["id", "region", "amount", "day"]);
    expect(ds.columnTypes).toEqual({ id: "numeric", region: "categorical", amount: "numeric", day: "date" });
    expect(ds.metadata?.parsingStatistics.errorCount).toBe(0);

    // Stages never go backwards, every stage reports, and fractions rise within a stage.
    const stageIndex = events.map(e => STAGE_ORDER.indexOf(e.stage));
    expect(stageIndex.every(i => i >= 0)).toBe(true);
    expect(stageIndex).toEqual([...stageIndex].sort((a, b) => a - b));
    for (const stage of STAGE_ORDER) {
      const fractions = events.filter(e => e.stage === stage).map(e => e.fraction as number);
      expect(fractions.length).toBeGreaterThan(1);
      expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
      expect(fractions[fractions.length - 1]).toBe(1);
    }
    // Parsing really ran in several chunks with intermediate progress.
    expect(events.filter(e => e.stage === "parsing" && e.fraction! > 0 && e.fraction! < 1).length).toBeGreaterThan(0);
  });

  it("reports row-level parse problems with 1-based rows and raw values; keep leaves them in", async () => {
    const text = readFileSync("tests/fixtures/messy/playstore.csv", "utf8");
    const file = new File([text], "playstore.csv");
    let asked = 0;
    const { io } = recordingIO({
      review: async review => {
        asked++;
        expect(review.rowCount).toBe(80);
        expect(review.columnCount).toBe(13);
        expect(review.issues.rowCount).toBe(1);
        expect(review.issues.listed[0]).toMatchObject({ row: 80, code: "TooFewFields" });
        expect(review.issues.listed[0].raw[0]).toBe("Life Made WI-Fi Touchscreen Photo Frame");
        expect(review.issues.listed[0].raw).toHaveLength(12);
        return { exclude: false };
      },
    });
    const ds = await runImport(file, file.name, {}, io);
    expect(asked).toBe(1);
    expect(ds.data.length).toBe(80);
    expect(ds.metadata?.parsingStatistics.errorCount).toBe(1);
    expect(ds.metadata?.importIssues).toMatchObject({ rowCount: 1, excluded: false, sourceRowCount: 80 });
    expect(ds.metadata?.columns.find(c => c.name === "Rating")?.maximumValue).toBe(19);
  });

  it("exclude drops the problem rows before the columns are analysed", async () => {
    const text = readFileSync("tests/fixtures/messy/playstore.csv", "utf8");
    const file = new File([text], "playstore.csv");
    const { io } = recordingIO({ review: async () => ({ exclude: true }) });
    const ds = await runImport(file, file.name, {}, io);
    expect(ds.data.length).toBe(79);
    expect(ds.data.some(r => r.App === "Life Made WI-Fi Touchscreen Photo Frame")).toBe(false);
    expect(ds.metadata?.rowCount).toBe(79);
    expect(ds.metadata?.columns.find(c => c.name === "Rating")?.maximumValue).toBe(5);
    expect(ds.metadata?.importIssues).toMatchObject({ rowCount: 1, excluded: true, sourceRowCount: 80 });
  });

  it("a rejected review question rejects the import (cancel path)", async () => {
    const file = new File(["a,b\n1,2,3\n"], "bad.csv");
    const { io } = recordingIO({ review: () => Promise.reject(new Error("cancelled")) });
    await expect(runImport(file, file.name, {}, io)).rejects.toThrow("cancelled");
  });
});

function workbookFile(sheets: Record<string, unknown[][]>, date1904 = false): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  if (date1904) wb.Workbook = { ...(wb.Workbook ?? {}), WBProps: { date1904: true } };
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "book.xlsx");
}

describe("runImport, XLSX", () => {
  const twoSheets = {
    "Year 1": [["Invoice", "Qty"], ["A1", 3], ["A2", 4]],
    "Year 2": [["Invoice", "Qty"], ["B1", 5]],
  };

  it("one sheet imports directly, with the same result as the old sheet_to_json path", async () => {
    const sheet = [["Name", "", "Name", null, "Qty"], ["x", 1, "y", 7, 2], ["", "", "", "", ""], ["z", 3, "w", 8, 4]];
    const file = workbookFile({ Only: sheet });
    const ds = await runImport(file, file.name, { xlsxBlockRows: 1, dayFirstDefault: true }, recordingIO().io);
    const wb = readWorkbookWithCalendarDates(await file.arrayBuffer());
    const before = processRawData(XLSX.utils.sheet_to_json(wb.Sheets.Only, { defval: "" }), file.name, { dayFirstDefault: true });
    expect(ds.columns).toEqual(before.columns);
    expect(ds.columns).toEqual(["Name", "Unnamed: 1", "Name_1", "__EMPTY", "Qty"]);
    expect(ds.data).toEqual(before.data);
    expect(ds.data).toHaveLength(3); // "" cells are string cells to SheetJS, so that row is not blank
  });

  it("several sheets ask which one; the picked sheet is imported", async () => {
    const file = workbookFile(twoSheets);
    const { io } = recordingIO({
      chooseSheet: async (sheets, canAppend) => {
        expect(sheets).toEqual([
          { name: "Year 1", rowCount: 2, headers: ["Invoice", "Qty"] },
          { name: "Year 2", rowCount: 1, headers: ["Invoice", "Qty"] },
        ]);
        expect(canAppend).toBe(true);
        return { kind: "one", name: "Year 2" };
      },
    });
    const ds = await runImport(file, file.name, {}, io);
    expect(ds.data).toEqual([{ Invoice: "B1", Qty: 5 }]);
  });

  it("append all stacks sheets and adds a Source sheet column", async () => {
    const file = workbookFile(twoSheets);
    const { io } = recordingIO({ chooseSheet: async () => ({ kind: "append" }) });
    const ds = await runImport(file, file.name, {}, io);
    expect(ds.columns).toEqual(["Invoice", "Qty", SOURCE_SHEET_COLUMN]);
    expect(ds.data.map(r => r[SOURCE_SHEET_COLUMN])).toEqual(["Year 1", "Year 1", "Year 2"]);
  });

  it("append is not offered when headers differ", async () => {
    const file = workbookFile({ A: [["x"], [1]], B: [["y"], [2]] });
    let offered: boolean | null = null;
    const { io } = recordingIO({
      chooseSheet: async (_sheets, canAppend) => {
        offered = canAppend;
        return { kind: "one", name: "B" };
      },
    });
    await runImport(file, file.name, {}, io);
    expect(offered).toBe(false);
  });

  it("keeps xlsxDates behaviour: date serials become calendar dates", async () => {
    const ws: XLSX.WorkSheet = {
      "!ref": "A1:B2",
      A1: { t: "s", v: "InvoiceDate" },
      B1: { t: "s", v: "Qty" },
      A2: { t: "n", v: 40148.32, z: "yyyy-mm-dd hh:mm" },
      B2: { t: "n", v: 6 },
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    wb.Workbook = { ...(wb.Workbook ?? {}), WBProps: { date1904: true } };
    const file = new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "d.xlsx");
    const ds = await runImport(file, file.name, {}, recordingIO().io);
    expect(ds.columnTypes.InvoiceDate).toBe("date");
    expect(ds.data[0].InvoiceDate).toBe("2013-12-02T07:40:48");
  });
});
