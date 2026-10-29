import { describe, it, expect } from "vitest";
import { processRawData } from "../parsingService";
import { addColumnFix, previewNumberConversion, removeColumnFix, removeDuplicateRows, restoreDuplicateRows } from "../columnFixes";
import { columnNumbers, mean } from "@/shared/utils/numeric";

const load = (rows: Record<string, string>[]) => processRawData(rows, "t.csv", { dayFirstDefault: true });

describe("column fixes", () => {
  it("sentinel: -1 becomes missing for the column, and undo restores it exactly", () => {
    const ds = load([{ y: "1990" }, { y: "-1" }, { y: "2000" }, { y: "-1" }, { y: "" }]);
    expect(ds.metadata!.columns[0].quality!.sentinel).toEqual({ value: -1, count: 2, reason: "negative" });
    const fixed = addColumnFix(ds, { id: "s", column: "y", kind: "sentinel", auto: false, sentinel: -1 });
    expect(fixed.data.map(r => r.y)).toEqual([1990, null, 2000, null, null]);
    expect(mean(columnNumbers(fixed.data, "y"))).toBe(1995);
    const meta = fixed.metadata!.columns[0];
    expect([meta.missingValueCount, meta.minimumValue, meta.quality!.sentinel]).toEqual([3, 1990, undefined]);
    expect(fixed.metadata!.columnFixes).toEqual([expect.objectContaining({ id: "s", previousType: "numeric", changedCount: 2 })]);

    const undone = removeColumnFix(fixed, "s");
    expect(undone.data).toEqual(ds.data);
    expect(undone.fixSourceValues).toBeUndefined();
    expect(undone.metadata!.columns[0].minimumValue).toBe(-1);
    expect(undone.metadata!.columnFixes).toEqual([]);
  });

  it("undo of an import currency fix gives back the original text and type", () => {
    const ds = load([{ p: "ksh 6976" }, { p: "100" }, { p: "ksh 0" }, { p: "NaN" }, { p: "50" }]);
    expect(ds.columnTypes.p).toBe("numeric");
    const fix = ds.metadata!.columnFixes![0];
    expect(fix).toMatchObject({ kind: "currency", currency: { code: "KES", symbol: "ksh" }, previousType: "categorical" });
    const undone = removeColumnFix(ds, fix.id);
    expect(undone.data.map(r => r.p)).toEqual(["ksh 6976", 100, "ksh 0", "NaN", 50]);
    expect(undone.columnTypes.p).toBe("categorical");
    expect(undone.metadata!.columns[0].inferredDataType).toBe("categorical");
  });

  it("stacked fixes replay in order; undoing the first keeps the second", () => {
    const ds = load([{ p: "$5" }, { p: "$-1" }, { p: "-1" }, { p: "$7" }, { p: "$-1" }]);
    const withSentinel = addColumnFix(ds, { id: "s", column: "p", kind: "sentinel", auto: false, sentinel: -1 });
    expect(withSentinel.data.map(r => r.p)).toEqual([5, null, null, 7, null]);
    const noCurrency = removeColumnFix(withSentinel, ds.metadata!.columnFixes![0].id);
    // Without the currency fix only the plain "-1" is a number -1.
    expect(noCurrency.data.map(r => r.p)).toEqual(["$5", "$-1", null, "$7", "$-1"]);
    expect(removeColumnFix(noCurrency, "s").data).toEqual(load([{ p: "$5" }, { p: "$-1" }, { p: "-1" }, { p: "$7" }, { p: "$-1" }]).fixSourceValues!.p.map(v => ({ p: v })));
  });

  it("Convert to number: preview, unreadable cells become missing, undo restores text", () => {
    const ds = load([{ i: "10,000+" }, { i: "19M" }, { i: "512k" }, { i: "Varies with device" }, { i: "0" }]);
    expect(ds.metadata!.columns[0].quality!.suffixCandidate).toEqual({ convertible: 4, total: 5 });
    const preview = previewNumberConversion(ds, "i");
    expect(preview.samples).toEqual([
      { before: "10,000+", after: 10000 },
      { before: "19M", after: 19e6 },
      { before: "512k", after: 512e3 },
      { before: "Varies with device", after: null },
      { before: "0", after: 0 },
    ]);
    expect([preview.unconvertible, preview.lowerBound]).toEqual([1, true]);
    const fixed = addColumnFix(ds, { id: "n", column: "i", kind: "numberSuffix", auto: false });
    expect(fixed.columnTypes.i).toBe("numeric");
    expect(fixed.data.map(r => r.i)).toEqual([10000, 19e6, 512e3, null, 0]);
    expect(fixed.metadata!.columnFixes![0]).toMatchObject({ unconvertible: 1 });
    expect(removeColumnFix(fixed, "n").data).toEqual(ds.data);
  });

  it("label merge maps the chosen spellings to the target", () => {
    const ds = load([{ c: "Lab A" }, { c: "lab a" }, { c: "Lab A" }, { c: "LAB A" }, { c: "B" }]);
    const fixed = addColumnFix(ds, { id: "m", column: "c", kind: "mergeLabels", auto: false, merge: { from: ["lab a", "LAB A"], to: "Lab A" } });
    expect(fixed.data.map(r => r.c)).toEqual(["Lab A", "Lab A", "Lab A", "Lab A", "B"]);
    expect(fixed.metadata!.columns[0].uniqueValueCount).toBe(2);
    expect(fixed.metadata!.columns[0].quality!.labelVariants).toBeUndefined();
    expect(removeColumnFix(fixed, "m").data).toEqual(ds.data);
  });

  it("duplicates: remove keeps first occurrences; undo after later fixes round-trips exactly", () => {
    const rows = [
      { a: "x", p: "$1", d: "05/06/2024" },
      { a: "x", p: "$1", d: "05/06/2024" },
      { a: "y", p: "-1", d: "07/08/2024" },
      { a: "y", p: "$2", d: "13/08/2024" },
      { a: "x", p: "$1", d: "05/06/2024" },
      { a: "z", p: "-1", d: "07/08/2024" },
    ];
    const ds = load(rows);
    expect(ds.metadata!.quality!.duplicateIndices).toEqual([1, 4]);
    const removed = removeDuplicateRows(ds);
    expect(removed.data.length).toBe(4);
    expect(removed.dateSourceValues!.d).toEqual(["05/06/2024", "07/08/2024", "13/08/2024", "07/08/2024"]);
    expect(removed.fixSourceValues!.p.length).toBe(4);
    expect(removed.metadata!.rowCount).toBe(4);
    expect(removed.metadata!.removedDuplicateCount).toBe(2);
    expect(removed.removedDuplicates!.map(r => r.index)).toEqual([1, 4]);

    const withSentinel = addColumnFix(removed, { id: "s", column: "p", kind: "sentinel", auto: false, sentinel: -1 });
    const restored = restoreDuplicateRows(withSentinel);
    expect(restored.data.map(r => r.p)).toEqual([1, 1, null, 2, 1, null]);
    expect(restored.removedDuplicates).toBeUndefined();
    expect(restored.metadata!.removedDuplicateCount).toBeUndefined();

    const back = removeColumnFix(restored, "s");
    expect(back.data).toEqual(ds.data);
    expect(back.dateSourceValues).toEqual(ds.dateSourceValues);
    expect(back.fixSourceValues).toEqual(ds.fixSourceValues);
    expect(back.metadata!.columns).toEqual(ds.metadata!.columns);
  });
});
