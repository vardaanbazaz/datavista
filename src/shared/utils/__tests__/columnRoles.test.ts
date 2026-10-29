import { describe, it, expect } from "vitest";
import { nameWords, columnAggregationFlag, aggregationNote } from "../columnRoles";
import type { ColumnMetadata } from "@/shared/types";

function col(name: string, over: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return {
    id: name, name, displayName: name, originalHeader: name, inferredDataType: "numeric",
    nullableStatus: false, uniqueValueCount: 10, missingValueCount: 0, minimumValue: 1,
    maximumValue: 10, role: "measure", allIntegerValues: true, ...over,
  };
}

describe("nameWords", () => {
  it.each([
    ["release_year", ["release", "year"]],
    ["CustomerID", ["customer", "id"]],
    ["Customer ID", ["customer", "id"]],
    ["StockCode", ["stock", "code"]],
    ["EmployeeNumber", ["employee", "number"]],
    ["YearsAtCompany", ["years", "at", "company"]],
    ["fiscalYr2024", ["fiscal", "yr", "2024"]],
    ["zip-code", ["zip", "code"]],
  ])("%s → %j", (name, words) => {
    expect(nameWords(name)).toEqual(words);
  });
});

describe("columnAggregationFlag", () => {
  it("year: name word + whole numbers 1800–2100", () => {
    expect(columnAggregationFlag(col("release_year", { minimumValue: 1925, maximumValue: 2021 }))).toBe("year");
    expect(columnAggregationFlag(col("Yr", { minimumValue: 1990, maximumValue: 2000 }))).toBe("year");
  });

  it("not year: out of range, decimals, or no year word", () => {
    expect(columnAggregationFlag(col("YearsAtCompany", { minimumValue: 0, maximumValue: 40 }))).toBe(null);
    expect(columnAggregationFlag(col("year", { minimumValue: 1, maximumValue: 12 }))).toBe(null);
    expect(columnAggregationFlag(col("year", { minimumValue: 1990, maximumValue: 2000, allIntegerValues: false }))).toBe(null);
    expect(columnAggregationFlag(col("Amount", { minimumValue: 1990, maximumValue: 2000 }))).toBe(null);
  });

  it("id: an id-like name word", () => {
    for (const name of ["Customer ID", "StockCode", "EmployeeNumber", "zip", "PIN", "phone", "Invoice No"]) {
      expect(columnAggregationFlag(col(name)), name).toBe("id");
    }
  });

  it("never matches inside words: paid, valid, width, decode, phoneme", () => {
    for (const name of ["paid", "valid", "width", "decode", "Phoneme", "Ideal", "nominal"]) {
      expect(columnAggregationFlag(col(name)), name).toBe(null);
    }
  });

  it("id: index and pandas' unnamed index column", () => {
    expect(columnAggregationFlag(col("index"))).toBe("id");
    expect(columnAggregationFlag(col("Unnamed: 0"))).toBe("id");
    expect(columnAggregationFlag(col("Unnamed: 12"))).toBe("id");
    expect(columnAggregationFlag(col("Unnamed"))).toBe(null);
  });

  it("never by distinctness alone: amounts that are almost all distinct integers stay unflagged", () => {
    for (const name of ["MonthlyRate", "DailyRate", "HourlyRate", "MonthlyIncome", "Serial", "Sales"]) {
      expect(columnAggregationFlag(col(name, { uniqueValueCount: 1427 })), name).toBe(null);
    }
  });
});

describe("aggregationNote", () => {
  it("notes sum/avg (and the default) on flagged columns only", () => {
    expect(aggregationNote("year", "sum")).toMatch(/Adding up years is rarely meaningful/);
    expect(aggregationNote("year", undefined)).toMatch(/years/);
    expect(aggregationNote("id", "avg")).toMatch(/ID numbers/);
    expect(aggregationNote("year", "count")).toBe(null);
    expect(aggregationNote("id", "count_distinct")).toBe(null);
    expect(aggregationNote(null, "sum")).toBe(null);
  });
});
