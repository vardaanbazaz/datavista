import { describe, it, expect } from "vitest";
import type { Dataset, DataRow } from "@/shared/types";
import { copilotTools, createToolEnv, runCopilotTool, AGGREGATE_LIMIT_MAX } from "../copilot/tools";
import type { PrivacySettings } from "../privacy/levels";

const CATS = ["GAME", "FAMILY", "TOOLS"];

/** 60 apps: Rating 1..5 cycling, Category cycling, an email column, a date column. */
function makeDataset(): Dataset {
  const data: DataRow[] = Array.from({ length: 60 }, (_, i) => ({
    App: `App ${i}`,
    Category: CATS[i % 3],
    Rating: (i % 5) + 1,
    Reviews: i * 10,
    Contact: `dev${i}@example.com`,
    Phone: 9876500000 + i,
    Updated: `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
  }));
  return {
    id: "ds-tools",
    name: "apps",
    data,
    columns: ["App", "Category", "Rating", "Reviews", "Contact", "Phone", "Updated"],
    columnTypes: { App: "categorical", Category: "categorical", Rating: "numeric", Reviews: "numeric", Contact: "categorical", Phone: "numeric", Updated: "date" },
  };
}

const privacy = (level: PrivacySettings["level"], unmasked: string[] = []): PrivacySettings => ({ level, sampleRows: 50, unmasked });
const run = (level: PrivacySettings["level"], name: string, args: unknown, unmasked: string[] = []) =>
  runCopilotTool(createToolEnv(makeDataset(), privacy(level, unmasked)), name, typeof args === "string" ? args : JSON.stringify(args));

describe("copilot tools: level gating", () => {
  it("offers no tools below Queries, three at Queries, get_rows only at Sample rows", () => {
    expect(copilotTools({ level: "schema" })).toEqual([]);
    expect(copilotTools({ level: "summaries" })).toEqual([]);
    expect(copilotTools({ level: "queries" }).map((t) => t.name)).toEqual(["describe_column", "aggregate", "value_counts"]);
    expect(copilotTools({ level: "samples" }).map((t) => t.name)).toEqual(["describe_column", "aggregate", "value_counts", "get_rows"]);
    for (const t of copilotTools({ level: "samples" })) expect(t.description).toMatch(/FULL dataset/);
  });

  it("refuses to run any tool below Queries, and get_rows below Sample rows (executor check)", () => {
    const r1 = run("summaries", "describe_column", { column: "Rating" });
    expect(r1.ok).toBe(false);
    expect(r1.content).toMatch(/off at the \\"Summaries\\" privacy level/);
    const r2 = run("queries", "get_rows", { limit: 5 });
    expect(r2.ok).toBe(false);
    expect(r2.content).toMatch(/needs the \\"Sample rows\\" privacy level/);
    expect(run("samples", "get_rows", { limit: 5 }).ok).toBe(true);
  });
});

describe("copilot tools: describe_column", () => {
  it("numeric stats on the full dataset", () => {
    const r = run("queries", "describe_column", { column: "Rating" });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ column: "Rating", type: "numeric", count: 60, min: 1, max: 5, mean: 3, median: 3, sum: 180 });
    expect(r.summary).toBe("described Rating · 60 rows");
  });

  it("text column: distinct and top values; a personal-data column is masked", () => {
    expect(run("queries", "describe_column", { column: "Category" }).result).toMatchObject({ distinct: 3, topValues: [{ value: "FAMILY", count: 20 }, { value: "GAME", count: 20 }, { value: "TOOLS", count: 20 }] });
    const masked = run("queries", "describe_column", { column: "Contact" });
    expect(masked.content).not.toContain("example.com");
    expect(masked.result).toMatchObject({ personalData: "masked (email)" });
    expect(masked.result).toMatchObject({ distinct: 60, missing: 0 });
    expect(masked.result).not.toHaveProperty("topValues");
    // Unmasked by the user: sent as-is.
    expect(run("queries", "describe_column", { column: "Contact" }, ["Contact"]).content).toContain("example.com");
  });

  it("date column: earliest and latest", () => {
    expect(run("queries", "describe_column", { column: "Updated" }).result).toMatchObject({ earliest: "2024-01-15", latest: "2024-12-15", validDates: 60 });
  });

  it("unknown column: an error naming the real columns; case-insensitive match is accepted", () => {
    const r = run("queries", "describe_column", { column: "Ratings" });
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Unknown column \\"Ratings\\". Columns are: App, Category, Rating/);
    expect(run("queries", "describe_column", { column: "rating" }).ok).toBe(true);
  });
});

describe("copilot tools: aggregate", () => {
  it("average Rating by Category, sorted desc, with the right numbers", () => {
    const r = run("queries", "aggregate", { groupBy: { column: "Category" }, aggregations: [{ op: "avg", column: "Rating" }, { op: "count_rows" }] });
    expect(r.ok).toBe(true);
    const res = r.result as { groups: number; matchedRows: number; rows: Record<string, unknown>[] };
    expect(res.groups).toBe(3);
    expect(res.matchedRows).toBe(60);
    // GAME: i%3==0 -> Rating (i%5)+1 over i=0,3,...,57; every residue mod 5 equally often -> 3.
    expect(res.rows.map((x) => x.avg_Rating)).toEqual([3, 3, 3]);
    expect(res.rows.every((x) => x.row_count === 20)).toBe(true);
    expect(r.summary).toBe("average Rating, row count by Category · 3 rows");
  });

  it("filters, sort by alias, and no groupBy", () => {
    const r = run("queries", "aggregate", {
      filters: [{ column: "Rating", operator: "greaterThan", value: 3 }],
      aggregations: [{ op: "count_rows" }, { op: "sum", column: "Reviews" }],
    });
    expect(r.ok).toBe(true);
    // Ratings 4 and 5: i%5 in {3,4} -> 24 rows.
    expect(r.result).toMatchObject({ matchedRows: 24, rows: [{ row_count: 24 }] });
    expect(r.summary).toBe("row count, sum Reviews (1 filter) · 1 row");
    const sorted = run("queries", "aggregate", { groupBy: { column: "Category" }, aggregations: [{ op: "sum", column: "Reviews" }], sort: { by: "sum_Reviews", direction: "asc" } });
    const sums = (sorted.result as { rows: { sum_Reviews: number }[] }).rows.map((x) => x.sum_Reviews);
    expect(sums).toEqual([...sums].sort((a, b) => a - b));
  });

  it("date period grouping (date columns only), sorted by period", () => {
    const r = run("queries", "aggregate", { groupBy: { column: "Updated", period: "quarter" }, aggregations: [{ op: "count_rows" }] });
    expect(r.ok).toBe(true);
    expect((r.result as { groups: number }).groups).toBe(4);
    expect(run("queries", "aggregate", { groupBy: { column: "Category", period: "month" }, aggregations: [{ op: "count_rows" }] }).content).toMatch(/only applies to a date column/);
    expect(run("queries", "aggregate", { groupBy: { column: "Updated", period: "decade" }, aggregations: [{ op: "count_rows" }] }).content).toMatch(/period must be one of/);
  });

  it("limit: clamped to 50, invalid values rejected", () => {
    const r = run("queries", "aggregate", { groupBy: { column: "App" }, aggregations: [{ op: "count_rows" }], limit: 500 });
    expect(r.ok).toBe(true);
    const res = r.result as { groups: number; rows: unknown[]; note: string };
    expect(res.groups).toBe(60);
    expect(res.rows).toHaveLength(AGGREGATE_LIMIT_MAX);
    expect(res.note).toBe("Showing 50 of 60 groups.");
    expect(run("queries", "aggregate", { aggregations: [{ op: "count_rows" }], limit: 0 }).ok).toBe(false);
    expect(run("queries", "aggregate", { aggregations: [{ op: "count_rows" }], limit: 2.5 }).ok).toBe(false);
  });

  it("rejects bad operators, numeric ops on text, unknown sort keys, empty aggregations", () => {
    expect(run("queries", "aggregate", { aggregations: [{ op: "sum_if", column: "Rating" }] }).content).toMatch(/op must be one of/);
    expect(run("queries", "aggregate", { aggregations: [{ op: "avg", column: "Category" }] }).content).toMatch(/needs a numeric column; \\"Category\\" is categorical/);
    expect(run("queries", "aggregate", { aggregations: [] }).content).toMatch(/non-empty array/);
    expect(run("queries", "aggregate", { groupBy: { column: "Category" }, aggregations: [{ op: "count_rows" }], sort: { by: "nope" } }).content).toMatch(/sort.by must be one of: Category, row_count/);
    expect(run("queries", "aggregate", { filters: [{ column: "Rating", operator: "like", value: 1 }], aggregations: [{ op: "count_rows" }] }).content).toMatch(/operator must be one of/);
    expect(run("queries", "aggregate", { filters: [{ column: "Rating", operator: "in", value: [] }], aggregations: [{ op: "count_rows" }] }).content).toMatch(/non-empty array/);
    expect(run("queries", "aggregate", "{not json").content).toMatch(/not valid JSON/);
    expect(run("queries", "nope", {}).content).toMatch(/Unknown tool/);
  });

  it("a numeric personal-data column (phone): counts only, no values or extremes", () => {
    const d = run("queries", "describe_column", { column: "Phone" });
    expect(d.ok).toBe(true);
    expect(d.content).not.toMatch(/98765/);
    expect(d.result).toMatchObject({ personalData: "masked (phone)", distinct: 60, missing: 0 });
    for (const op of ["max", "min", "median", "sum", "avg"]) {
      const r = run("queries", "aggregate", { aggregations: [{ op, column: "Phone" }] });
      expect(r.ok).toBe(false);
      expect(r.content).toMatch(/only count and count_distinct/);
    }
    expect(run("queries", "aggregate", { aggregations: [{ op: "count_distinct", column: "Phone" }] }).result).toMatchObject({ rows: [{ count_distinct_Phone: 60 }] });
  });

  it("filter values as text (the typed schema): numbers, values for in, start/end for between", () => {
    const gt = run("queries", "aggregate", { filters: [{ column: "Rating", operator: "greaterThan", value: "3" }], aggregations: [{ op: "count_rows" }] });
    expect(gt.result).toMatchObject({ matchedRows: 24 });
    const inn = run("queries", "aggregate", { filters: [{ column: "Category", operator: "in", values: ["GAME", "TOOLS"] }], aggregations: [{ op: "count_rows" }] });
    expect(inn.result).toMatchObject({ matchedRows: 40 });
    const btw = run("queries", "aggregate", { filters: [{ column: "Rating", operator: "between", start: "2", end: "3" }], aggregations: [{ op: "count_rows" }] });
    expect(btw.result).toMatchObject({ matchedRows: 24 });
    expect(run("queries", "aggregate", { filters: [{ column: "Rating", operator: "equals" }], aggregations: [{ op: "count_rows" }] }).content).toMatch(/needs a value/);
  });

  it("personal-data columns can't be grouped or filtered on", () => {
    expect(run("queries", "aggregate", { groupBy: { column: "Contact" }, aggregations: [{ op: "count_rows" }] }).content).toMatch(/personal data and is masked; it can't be grouped/);
    const f = run("queries", "aggregate", { filters: [{ column: "Contact", operator: "equals", value: "dev1@example.com" }], aggregations: [{ op: "count_rows" }] });
    expect(f.ok).toBe(false);
    expect(f.content).toMatch(/can't be filtered on/);
  });
});

describe("copilot tools: value_counts and get_rows", () => {
  it("value_counts: most common first, limit clamped to 20, masked values", () => {
    const r = run("queries", "value_counts", { column: "Rating", limit: 3 });
    expect(r.result).toMatchObject({ distinct: 5, values: [{ value: "1", count: 12 }, { value: "2", count: 12 }, { value: "3", count: 12 }] });
    expect((run("queries", "value_counts", { column: "App", limit: 99 }).result as { values: unknown[] }).values).toHaveLength(20);
    const masked = run("queries", "value_counts", { column: "Contact" });
    expect(masked.content).not.toContain("example.com");
    expect(masked.content).toContain("[masked email]");
  });

  it("get_rows: at most 20, chosen columns, personal data masked", () => {
    const r = run("samples", "get_rows", { columns: ["App", "Contact"], limit: 50, filters: [{ column: "Category", operator: "equals", value: "GAME" }] });
    expect(r.ok).toBe(true);
    const res = r.result as { matchedRows: number; rows: Record<string, unknown>[] };
    expect(res.matchedRows).toBe(20);
    expect(res.rows).toHaveLength(20);
    expect(Object.keys(res.rows[0])).toEqual(["App", "Contact"]);
    expect(res.rows.every((x) => x.Contact === "[masked email]")).toBe(true);
    expect(run("samples", "get_rows", { sort: { by: "Contact" } }).content).toMatch(/can't be sorted on/);
  });
});
