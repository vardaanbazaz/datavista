import { describe, it, expect } from "vitest";
import { columnValueCounts, visibleValues } from "../valueCounts";
import type { DataRow } from "@/shared/types";

const rows: DataRow[] = [
  { c: "b" }, { c: "a" }, { c: "b" }, { c: "" }, { c: null }, { c: 3 }, { c: "b" }, { c: "a" }, { c: "Apple" },
];

describe("columnValueCounts", () => {
  it("counts String(cell), skips blanks, sorts by count then A to Z", () => {
    expect(columnValueCounts(rows, "c")).toEqual([
      { value: "b", count: 3 },
      { value: "a", count: 2 },
      { value: "3", count: 1 },
      { value: "Apple", count: 1 },
    ]);
  });

  it("is cached per rows array and recomputed for a new one", () => {
    expect(columnValueCounts(rows, "c")).toBe(columnValueCounts(rows, "c"));
    const edited = [...rows, { c: "z" }];
    expect(columnValueCounts(edited, "c")).not.toBe(columnValueCounts(rows, "c"));
    expect(columnValueCounts(edited, "c")).toContainEqual({ value: "z", count: 1 });
  });
});

describe("visibleValues", () => {
  const all = columnValueCounts(rows, "c");

  it("caps the list and reports how many are hidden", () => {
    expect(visibleValues(all, [], "", 2)).toEqual({
      shown: [{ value: "b", count: 3 }, { value: "a", count: 2 }],
      matching: 4,
      hidden: 2,
    });
  });

  it("keeps selected values first even when they do not match the search", () => {
    const r = visibleValues(all, ["3"], "a", 10);
    expect(r.shown.map((v) => v.value)).toEqual(["3", "a", "Apple"]);
    expect(r.matching).toBe(2);
    expect(r.hidden).toBe(0);
  });

  it("does not count a selected matching value as hidden", () => {
    const r = visibleValues(all, ["Apple"], "a", 1);
    expect(r.shown.map((v) => v.value)).toEqual(["Apple"]);
    // "a" and "Apple" match; Apple is shown (selected), "a" is cut by the limit.
    expect(r.hidden).toBe(1);
  });

  it("shows a selected value that no longer exists with count 0", () => {
    expect(visibleValues(all, ["gone"], "", 1).shown[0]).toEqual({ value: "gone", count: 0 });
  });
});
