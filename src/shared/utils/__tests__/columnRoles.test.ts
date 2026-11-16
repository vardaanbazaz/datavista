import { describe, it, expect } from "vitest";
import { nameWords, columnAggregationFlag, aggregationNote, defaultMeasureColumn, aggregationsForColumn, defaultAggregationForColumn, isPerItemName } from "../columnRoles";
import type { ColumnMetadata, Dataset } from "@/shared/types";

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
    for (const name of ["Customer ID", "StockCode", "EmployeeNumber", "zip", "PIN", "phone", "Invoice No", "Invoice", "invoice_id"]) {
      expect(columnAggregationFlag(col(name)), name).toBe("id");
    }
  });

  it("never matches inside words: paid, valid, width, decode, phoneme", () => {
    for (const name of ["paid", "valid", "width", "decode", "Phoneme", "Ideal", "nominal", "Invoiced amount"]) {
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

function dataset(columns: ColumnMetadata[]): Dataset {
  const columnTypes: Record<string, "numeric" | "categorical" | "date"> = {};
  columns.forEach((c) => (columnTypes[c.name] = c.inferredDataType));
  return {
    id: "ds", name: "ds", data: [], columns: columns.map((c) => c.name), columnTypes,
    metadata: {
      datasetId: "ds", name: "ds", createdAt: 0, updatedAt: 0, rowCount: 10, columnCount: columns.length,
      originalFileName: "f.csv", originalFileType: "csv", parsingStatistics: { processingTimeMs: 0 }, version: 1, columns,
    },
  };
}

describe("KPI measure defaults", () => {
  const retail = dataset([
    col("Invoice", { inferredDataType: "categorical", minimumValue: undefined, maximumValue: undefined }),
    col("CustomerID"),
    col("order_year", { minimumValue: 2010, maximumValue: 2011 }),
    col("Currency", { minimumValue: 1, maximumValue: 1 }),
    col("Quantity", { minimumValue: -80, maximumValue: 900 }),
    col("Price", { allIntegerValues: false }),
  ]);

  it("skips categorical, ID, year and constant columns: first plain numeric measure, with Sum", () => {
    expect(defaultMeasureColumn(retail)).toBe("Quantity");
    expect(defaultAggregationForColumn(retail, "Quantity")).toBe("sum");
  });
  it("falls back to the first numeric column (counted) when there is no plain measure", () => {
    const ds = dataset([col("Invoice", { inferredDataType: "categorical" }), col("CustomerID")]);
    expect(defaultMeasureColumn(ds)).toBe("CustomerID");
    expect(defaultAggregationForColumn(ds, "CustomerID")).toBe("count");
  });
  it("falls back to the first column when nothing is numeric; null without a dataset", () => {
    expect(defaultMeasureColumn(dataset([col("Country", { inferredDataType: "categorical" })]))).toBe("Country");
    expect(defaultMeasureColumn(null)).toBeNull();
  });
  it("never offers Sum or Average for a categorical column", () => {
    const ops = aggregationsForColumn(retail, "Invoice");
    expect(ops).not.toContain("sum");
    expect(ops).not.toContain("avg");
    expect(ops).toEqual(["count", "count_rows", "count_distinct"]);
    expect(defaultAggregationForColumn(retail, "Invoice")).toBe("count");
    expect(aggregationsForColumn(retail, "Quantity")).toEqual(expect.arrayContaining(["sum", "avg", "median"]));
  });
});

describe("per-item names default to Average", () => {
  it("matches whole words, case-insensitive, plurals and %", () => {
    for (const name of [
      "Rating", "rating", "Ratings", "user_score", "CreditScore", "interest rate", "DailyRate", "MonthlyRate",
      "PercentSalaryHike", "pct_change", "Win %", "growth%", "Price", "Unit Price", "unit_prices", "Age", "AgeYears",
      "avg_temp", "Average Order", "mean value", "Debt Ratio",
    ]) {
      expect(isPerItemName(name), name).toBe(true);
    }
  });
  it("does not match the words inside other words", () => {
    for (const name of [
      "Stage", "Usage", "Corporate", "Generated", "Total Spent", "Reviews", "Quantity", "Revenue", "Accurate",
      "Priceless", "Percentile", "Meaning", "Rated",
    ]) {
      expect(isPerItemName(name), name).toBe(false);
    }
  });
  it("Average for a per-item measure, Sum for other measures, Count for ID / year / constant", () => {
    const ds = dataset([
      col("Rating", { allIntegerValues: false, minimumValue: 1, maximumValue: 5 }),
      col("Reviews", { minimumValue: 0, maximumValue: 9000 }),
      col("Price", { allIntegerValues: false, minimumValue: 0, maximumValue: 400 }),
      col("price_code"),
      col("rate_year", { minimumValue: 2001, maximumValue: 2020 }),
      col("Score", { minimumValue: 3, maximumValue: 3 }),
    ]);
    expect(defaultAggregationForColumn(ds, "Rating")).toBe("avg");
    expect(defaultAggregationForColumn(ds, "Price")).toBe("avg");
    expect(defaultAggregationForColumn(ds, "Reviews")).toBe("sum");
    expect(defaultAggregationForColumn(ds, "price_code")).toBe("count");
    expect(defaultAggregationForColumn(ds, "rate_year")).toBe("count");
    expect(defaultAggregationForColumn(ds, "Score")).toBe("count");
  });
});
