import { describe, it, expect } from "vitest";
import { detectImportConversion, detectSentinel, findDuplicateRows, findMisalignedRows, columnQuality, labelKey, misalignedNoticeText, suffixOfferText } from "../dataQuality";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseCsvText } from "../csvParse";
import { misalignedRowsOf } from "../columnFixes";
import { processRawData } from "../parsingService";

const counts = (entries: [number, number][]) => new Map(entries);

describe("detectSentinel", () => {
  it("offers a lone negative value above 5% of the numbers", () => {
    expect(detectSentinel(counts([[-1, 6], [3, 50], [4, 44]]))).toEqual({ value: -1, count: 6, reason: "negative" });
    expect(detectSentinel(counts([[-99, 20], [10, 80]]))?.value).toBe(-99);
    expect(detectSentinel(counts([[-999, 20], [10, 80]]))?.value).toBe(-999);
  });

  it("ignores it at or below 5%, or when the column has other negatives", () => {
    expect(detectSentinel(counts([[-1, 5], [3, 95]]))).toBeUndefined();
    expect(detectSentinel(counts([[-1, 20], [-2, 20], [3, 60]]))).toBeUndefined();
  });

  it("offers -1 in a year column at any share", () => {
    expect(detectSentinel(counts([[-1, 1], [1990, 50], [2005, 49]]))).toEqual({ value: -1, count: 1, reason: "year" });
    expect(detectSentinel(counts([[-1, 1], [1990, 50], [12, 49]]))).toBeUndefined();
  });

  it("offers an all-nines maximum above 5%", () => {
    expect(detectSentinel(counts([[9999, 10], [100, 45], [9998, 45]]))).toEqual({ value: 9999, count: 10, reason: "nines" });
    expect(detectSentinel(counts([[9999, 2], [100, 98]]))).toBeUndefined();
    expect(detectSentinel(counts([[9999, 100]]))).toBeUndefined(); // the only value
  });
});

describe("detectImportConversion", () => {
  it("converts one currency when ≥80% of non-blank cells match (plain numbers count)", () => {
    const values = ["$0.99", "$2.99", 0, 0, 0, 0, 0, 0, null, "Everyone"];
    expect(detectImportConversion(values)).toEqual({ conversion: { kind: "currency", currency: { code: "USD", symbol: "$" } } });
  });

  it("does not convert below 80%", () => {
    expect(detectImportConversion(["$1", "$2", "x", "y", "z", 3]).conversion).toBeUndefined();
  });

  it("warns on mixed currencies and converts nothing", () => {
    expect(detectImportConversion(["$1", "€2", "₹3", 4, 5])).toEqual({ currencyWarning: ["EUR", "INR", "USD"] });
  });

  it("reads ksh/KES and Rs/INR as one currency each", () => {
    expect(detectImportConversion(["ksh 10", "KES 20", 5]).conversion?.currency?.code).toBe("KES");
    expect(detectImportConversion(["Rs 10", "Rs. 20", "INR 5", "₹6"]).conversion?.currency?.code).toBe("INR");
  });

  it("converts consistent western or Indian grouping", () => {
    expect(detectImportConversion(["1,234,567", "12", "1,000"]).conversion).toEqual({ kind: "thousands", grouping: "western" });
    expect(detectImportConversion(["12,34,567", "1,000", 5]).conversion).toEqual({ kind: "thousands", grouping: "indian" });
  });

  it("leaves comma decimals next to comma grouping as text, with a warning", () => {
    const r = detectImportConversion(["1,234", "2,345", "3,456", "4,567", "12,5"]);
    expect(r.conversion).toBeUndefined();
    expect(r.groupingWarning).toMatch(/decimal mark/);
  });

  it("warns on western and Indian grouping in one column", () => {
    expect(detectImportConversion(["1,234,567", "12,34,567", 5]).groupingWarning).toMatch(/western/);
  });

  it("does nothing for plain number or text columns", () => {
    expect(detectImportConversion([1, 2, 3])).toEqual({});
    expect(detectImportConversion(["a", "b"])).toEqual({});
  });
});

describe("findDuplicateRows", () => {
  it("returns every repeat after the first, comparing as text", () => {
    const rows = [
      { a: "1", b: "x" },
      { a: "1", b: "x" },
      { a: "1", b: "y" },
      { a: "1", b: "x" },
      { a: "1.0", b: "x" },
      { a: null, b: "x" },
      { a: "", b: "x" },
    ];
    expect(findDuplicateRows(rows, ["a", "b"])).toEqual([1, 3]);
  });
});

describe("columnQuality", () => {
  it("groups label variants by case and whitespace, most common first", () => {
    const q = columnQuality("categorical", new Map([["Lab A", 1203], ["lab a", 412], ["Lab  B", 3], ["lab b", 7], ["Other", 9]]), new Map(), 1634);
    expect(q.labelVariants).toEqual([
      [{ value: "Lab A", count: 1203 }, { value: "lab a", count: 412 }],
      [{ value: "lab b", count: 7 }, { value: "Lab  B", count: 3 }],
    ]);
    expect(q.topValues![0]).toEqual({ value: "Lab A", count: 1203 });
    expect(labelKey("  Routine  ")).toBe("routine");
  });

  it("offers Convert to number for suffix/plus text", () => {
    const q = columnQuality("categorical", new Map([["10,000+", 5], ["19M", 3], ["Varies with device", 2]]), new Map(), 10);
    expect(q.suffixCandidate).toEqual({ convertible: 8, total: 10, examples: ["10,000+", "19M"] });
    expect(columnQuality("categorical", new Map([["a", 5]]), new Map(), 5).suffixCandidate).toBeUndefined();
  });

  it("Convert to number examples: two of the column's own values, the second of another shape when there is one", () => {
    const ex = (counts: [string, number][]) =>
      columnQuality("categorical", new Map(counts), new Map(), counts.reduce((n, [, c]) => n + c, 0)).suffixCandidate?.examples;
    // Plain numbers ("0") don't need the reader, so they are never an example.
    expect(ex([["0", 4], ["19M", 3], ["14M", 2], ["201k", 1]])).toEqual(["19M", "201k"]);
    expect(ex([["10,000+", 3], ["500,000+", 2], ["0", 1]])).toEqual(["10,000+", "500,000+"]);
    expect(ex([["5M", 5], ["1", 5]])).toEqual(["5M"]);
  });

  it("Convert to number examples on the real Play Store columns", () => {
    const file = resolve(__dirname, "../../../../tests/fixtures/playstore-insights.csv");
    const ds = processRawData(parseCsvText(readFileSync(file, "utf8")).rows, "playstore-insights.csv");
    const examples = (name: string) => ds.metadata!.columns.find((c) => c.name === name)!.quality!.suffixCandidate!.examples;
    expect(examples("Size")).toEqual(["19M", "201k"]);
    expect(examples("Installs")).toEqual(["10,000+", "500,000+"]);
    expect(suffixOfferText("Size", examples("Size"))).toBe('Size is text like "19M" or "201k"');
    expect(suffixOfferText("Installs", examples("Installs"))).toBe('Installs is text like "10,000+" or "500,000+"');
  });

  it("Convert to number text: one example, and none on datasets imported before examples were kept", () => {
    expect(suffixOfferText("Size", ["19M"])).toBe('Size is text like "19M"');
    expect(suffixOfferText("Size", undefined)).not.toMatch(/10,000\+|19M/);
  });

  it("misaligned notice wording covers shifted rows and junk tokens alike", () => {
    expect(misalignedNoticeText(1, false)).toBe(
      "1 row with 2+ values that don't fit their column (often a row shifted by a column). It is kept and counted unless you exclude it."
    );
    expect(misalignedNoticeText(3, false)).toMatch(/^3 rows with 2\+ values .* They are kept and counted unless you exclude them\.$/);
    expect(misalignedNoticeText(2, true)).toBe("2 rows with 2+ values that don't fit their column excluded.");
  });
});

describe("processRawData: invalid values, conversions and duplicates", () => {
  it("counts invalid numeric values with samples", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ n: i < 18 ? String(i) : i === 18 ? "ERROR" : "UNKNOWN" }));
    rows.push({ n: "ERROR" });
    const ds = processRawData(rows, "t.csv", { dayFirstDefault: true });
    const q = ds.metadata!.columns[0].quality!;
    expect(q.invalidCount).toBe(3);
    expect(q.invalidSamples).toEqual([{ value: "ERROR", count: 2 }, { value: "UNKNOWN", count: 1 }]);
  });

  it("converts a currency column, keeps the originals and records the fix", () => {
    const ds = processRawData([{ p: "$1.50" }, { p: "0" }, { p: "$400" }, { p: "" }], "t.csv", { dayFirstDefault: true });
    expect(ds.columnTypes.p).toBe("numeric");
    expect(ds.data.map(r => r.p)).toEqual([1.5, 0, 400, null]);
    expect(ds.fixSourceValues!.p).toEqual(["$1.50", 0, "$400", null]);
    expect(ds.metadata!.columnFixes).toEqual([
      expect.objectContaining({ kind: "currency", column: "p", auto: true, changedCount: 2, currency: { code: "USD", symbol: "$" } }),
    ]);
  });

  it("counts exact duplicate rows", () => {
    const ds = processRawData([{ a: "1", b: "2" }, { a: "1", b: "2" }, { a: "1", b: "3" }], "t.csv", { dayFirstDefault: true });
    expect(ds.metadata!.quality).toMatchObject({ duplicateRowCount: 1, duplicateIndices: [1] });
  });
});

describe("summarizeCategoricalColumns (Overview tiles)", () => {
  it("counts distinct, missing and the top 5 from the rows; the same from metadata for the whole dataset", async () => {
    const { summarizeCategoricalColumns } = await import("../stats/columnSummary");
    const rows = ["a", "b", "a", "c", "a", "b", "", "a", "b", "a", "a"].map(c => ({ c, id: `id${Math.random()}` }));
    const ds = processRawData(rows, "t.csv", { dayFirstDefault: true });
    const fromRows = summarizeCategoricalColumns(ds.data.slice(0, 10), ["c"])[0];
    expect(fromRows).toMatchObject({ distinct: 3, missing: 1, rows: 10, highCardinality: false });
    expect(fromRows.top).toEqual([{ value: "a", count: 5 }, { value: "b", count: 3 }, { value: "c", count: 1 }]);
    const whole = summarizeCategoricalColumns(ds.data, ["c", "id"], ds);
    expect(whole[0]).toMatchObject({ distinct: 3, missing: 1, rows: 11, highCardinality: false });
    expect(whole[0].top[0]).toEqual({ value: "a", count: 6 });
    expect(whole[0]).toEqual(summarizeCategoricalColumns(ds.data, ["c"])[0]);
    // Every value distinct: a compact tile, no top list.
    expect(whole[1]).toMatchObject({ distinct: 11, highCardinality: true, top: [] });
  });
});

describe("ID columns with letter codes", () => {
  const rows = (name: string, values: string[]) => values.map(v => ({ [name]: v }));
  const nums = Array.from({ length: 40 }, (_, i) => String(489434 + i));

  it("an ID-named column whose non-numbers are letter codes is categorical", () => {
    expect(processRawData(rows("Invoice", [...nums, "C489449"]), "t.csv").columnTypes.Invoice).toBe("categorical");
    expect(processRawData(rows("StockCode", [...nums, "85123A"]), "t.csv").columnTypes.StockCode).toBe("categorical");
  });

  it("pure-number ID columns, and non-ID names with codes, stay numeric", () => {
    expect(processRawData(rows("EmployeeNumber", nums), "t.csv").columnTypes.EmployeeNumber).toBe("numeric");
    expect(processRawData(rows("Customer ID", [...nums, ""]), "t.csv").columnTypes["Customer ID"]).toBe("numeric");
    // Junk that isn't a code (no digit, or punctuation) doesn't count.
    expect(processRawData(rows("Invoice", [...nums, "ERROR", "N/A", "12-34"]), "t.csv").columnTypes.Invoice).toBe("numeric");
    expect(processRawData(rows("Amount", [...nums, "C489449"]), "t.csv").columnTypes.Amount).toBe("numeric");
  });
});

describe("findMisalignedRows", () => {
  const types = { n: "numeric", m: "numeric", d: "date", t: "categorical" };

  it("flags a row with 2+ non-blank cells that fail their column's type", () => {
    const rows = [
      { n: 1, m: 2, d: "2024-01-02", t: "a" },
      { n: "x", m: "y", d: "2024-01-02", t: "a" }, // two numbers fail
      { n: "x", m: 2, d: "1.0.19", t: "a" }, // number + date fail
      { n: "x", m: 2, d: "2024-01-02", t: "1.9" }, // one failure only; text never fails
      { n: null, m: "", d: "  ", t: "a" }, // blanks never fail
      { n: "x", m: null, d: null, t: "b" },
    ];
    expect(findMisalignedRows(rows, types)).toEqual([1, 2]);
  });

  it("needs at least two checkable columns", () => {
    expect(findMisalignedRows([{ n: "x", t: "y" }], { n: "numeric", t: "categorical" })).toEqual([]);
  });

  it("finds the shifted Play Store row in the messy fixture", () => {
    const dir = resolve(__dirname, "../../../../tests/fixtures/messy");
    const ds = processRawData(parseCsvText(readFileSync(resolve(dir, "playstore.csv"), "utf8")).rows, "playstore.csv");
    const found = misalignedRowsOf(ds);
    expect(found.length).toBe(1);
    expect(ds.data[found[0]].App).toBe("Life Made WI-Fi Touchscreen Photo Frame");
    expect(ds.data[found[0]].Rating).toBe(19);
  });
});
