import { describe, it, expect } from "vitest";
import type { Dataset, DataRow } from "@/shared/types";
import { createToolEnv, runCopilotTool } from "../copilot/tools";
import { MAX_PROPOSALS, type Proposal } from "../copilot/actions";
import type { PrivacySettings } from "../privacy/levels";

/** The copilot's action tools (copilot/actions.ts via tools.ts:runCopilotTool): argument checks, descriptions, privacy. */

const CATS = ["GAME", "FAMILY", "ART_AND_DESIGN"];

function makeDataset(): Dataset {
  const data: DataRow[] = Array.from({ length: 30 }, (_, i) => ({
    App: `App ${i}`,
    Category: CATS[i % 3],
    Rating: (i % 5) + 1,
    Reviews: i * 10,
    Contact: `dev${i}@example.com`,
    Updated: `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
  }));
  return {
    id: "ds-actions",
    name: "apps",
    data,
    columns: ["App", "Category", "Rating", "Reviews", "Contact", "Updated"],
    columnTypes: { App: "categorical", Category: "categorical", Rating: "numeric", Reviews: "numeric", Contact: "categorical", Updated: "date" },
  };
}

const privacy = (level: PrivacySettings["level"]): PrivacySettings => ({ level, sampleRows: 50, unmasked: [] });
const env = (question = "", level: PrivacySettings["level"] = "queries") => createToolEnv(makeDataset(), privacy(level), question);
const call = (name: string, args: unknown, question = "", level: PrivacySettings["level"] = "queries") => runCopilotTool(env(question, level), name, JSON.stringify(args));
const errorOf = (r: ReturnType<typeof call>) => (r.result as { error: string }).error;

describe("propose_chart", () => {
  it("a valid bar chart: Average by default for a per-item column, a one-line description and the columns used", () => {
    const r = call("propose_chart", { type: "bar", x: "Category", y: "Rating", topN: 10, title: "Rating by category" });
    expect(r.ok).toBe(true);
    const p = r.proposal as Proposal;
    expect(p).toMatchObject({ kind: "chart", status: "pending", columns: ["Category", "Rating"] });
    expect(p.description).toBe("Bar chart: average Rating by Category, top 10");
    expect(p.chart).toEqual({ type: "bar", title: "Rating by category", xAxis: "Category", yAxis: "Rating", aggregation: "avg", topN: 10 });
  });

  it("the result back to the model holds no data: only its own proposal, not applied", () => {
    const r = call("propose_chart", { type: "bar", x: "Category", y: "Reviews", title: "Reviews" });
    expect(JSON.parse(r.content)).toEqual({ proposed: "Bar chart: total Reviews by Category", status: expect.stringMatching(/Not applied yet/) });
    expect(r.content).not.toMatch(/GAME|FAMILY|\d{2,}/);
  });

  it("case-insensitive columns, groupBy and filters (described, columns listed)", () => {
    const p = call("propose_chart", {
      type: "line",
      x: "updated",
      y: "Reviews",
      aggregation: "max",
      groupBy: "Category",
      filters: [{ column: "Rating", operator: "between", start: "4" }],
      title: "Max reviews",
    }).proposal!;
    expect(p.description).toBe("Line chart: maximum Reviews by Updated, split by Category, filtered to Rating ≥ 4");
    expect(p.columns).toEqual(["Updated", "Reviews", "Category", "Rating"]);
    expect(p.filters).toEqual({ numeric: { Rating: { min: 4, max: undefined } } });
  });

  it("no Sum of a per-item column unless the user asked for a total", () => {
    const bad = call("propose_chart", { type: "bar", x: "Category", y: "Rating", aggregation: "sum", title: "t" }, "rating by category");
    expect(bad.ok).toBe(false);
    expect(errorOf(bad)).toMatch(/Sum of "Rating" adds up per-item values.*use "avg"/);
    const asked = call("propose_chart", { type: "bar", x: "Category", y: "Rating", aggregation: "sum", title: "t" }, "What is the total rating per category?");
    expect(asked.ok).toBe(true);
    expect(asked.proposal?.chart?.aggregation).toBe("sum");
  });

  it.each([
    [{ type: "donut", x: "Category", y: "Rating", title: "t" }, /"type" must be one of bar, line, area, pie, scatter, histogram/],
    [{ type: "bar", x: "Nope", y: "Rating", title: "t" }, /Unknown column "Nope". Columns are: App, Category/],
    [{ type: "bar", x: "Category", title: "t" }, /needs "y".*count_rows/],
    [{ type: "bar", x: "Category", y: "App", aggregation: "avg", title: "t" }, /"avg" needs a numeric column; "App" is categorical/],
    [{ type: "bar", x: "Category", y: "Rating", aggregation: "mode", title: "t" }, /"aggregation" must be one of/],
    [{ type: "scatter", x: "Category", y: "Rating", title: "t" }, /needs numeric x and y/],
    [{ type: "scatter", x: "Reviews", y: "Rating", aggregation: "avg", title: "t" }, /applies to bar, line, area and pie charts only/],
    [{ type: "histogram", x: "Category", title: "t" }, /histogram needs a numeric x/],
    [{ type: "bar", x: "Category", y: "Rating", groupBy: "Reviews", title: "t" }, /"groupBy" needs a category column/],
    [{ type: "bar", x: "Category", y: "Rating", groupBy: "Category", title: "t" }, /must differ from x/],
    [{ type: "line", x: "Updated", y: "Rating", topN: 5, title: "t" }, /"topN" applies to a bar chart over a category/],
    [{ type: "bar", x: "Category", y: "Rating", topN: 0, title: "t" }, /whole number from 1 to 50/],
    [{ type: "bar", x: "Category", y: "Rating", title: "x".repeat(81) }, /at most 80 characters/],
    [{ type: "bar", x: "Category", y: "Rating", title: "t", filters: [{ column: "Category", operator: "startsWith", value: "G" }] }, /operator must be one of equals, in, contains, between/],
  ])("rejects %j", (args, message) => {
    const r = call("propose_chart", args);
    expect(r.ok).toBe(false);
    expect(r.proposal).toBeUndefined();
    expect(errorOf(r)).toMatch(message);
  });
});

describe("propose_kpi", () => {
  it("default aggregation and title from the column", () => {
    const p = call("propose_kpi", { column: "Rating" }).proposal!;
    expect(p).toMatchObject({ kind: "kpi", description: "KPI card: average Rating", columns: ["Rating"], kpi: { column: "Rating", aggregation: "avg", title: "Average Rating" } });
    expect(call("propose_kpi", { column: "Category" }).proposal?.kpi).toEqual({ column: "Category", aggregation: "count", title: "Count of Category" });
    expect(call("propose_kpi", { column: "Reviews", aggregation: "median", title: "Typical reviews" }).proposal?.kpi).toEqual({ column: "Reviews", aggregation: "median", title: "Typical reviews" });
  });

  it.each([
    [{ column: "Ghost" }, /Unknown column "Ghost"/],
    [{ column: "Category", aggregation: "sum" }, /"sum" needs a numeric column; "Category" is categorical/],
    [{ column: "Rating", aggregation: "sum" }, /Sum of "Rating"/],
    [{}, /"column" must be a column name/],
  ])("rejects %j", (args, message) => {
    const r = call("propose_kpi", args);
    expect(r.ok).toBe(false);
    expect(errorOf(r)).toMatch(message);
  });
});

describe("propose_filter", () => {
  it("categories, a date range and text become FilterState pieces, by column type", () => {
    const p = call("propose_filter", {
      conditions: [
        { column: "Category", operator: "in", values: ["GAME", "FAMILY"] },
        { column: "Updated", operator: "between", start: "2024-03-01", end: "2024-06-30" },
        { column: "App", operator: "contains", value: "App 1" },
        { column: "Rating", operator: "equals", value: "5" },
      ],
    }).proposal!;
    expect(p.kind).toBe("filter");
    expect(p.description).toBe('Filter: Category in [GAME, FAMILY]; Updated 2024-03-01 to 2024-06-30; App contains "App 1"; Rating = 5');
    expect(p.filters).toEqual({
      categorical: { Category: ["GAME", "FAMILY"] },
      date: { Updated: { start: "2024-03-01", end: "2024-06-30" } },
      text: { App: "App 1" },
      numeric: { Rating: { min: 5, max: 5 } },
    });
  });

  it("values are not checked against the data (that would leak whether a value exists)", () => {
    const r = call("propose_filter", { conditions: [{ column: "Category", operator: "equals", value: "NOT_A_CATEGORY" }] });
    expect(r.ok).toBe(true);
    expect(r.content).not.toMatch(/rows|match/i);
  });

  it.each([
    [{ conditions: [] }, /non-empty array/],
    [{ conditions: [{ column: "Rating", operator: "greaterThan", value: "4" }] }, /use "between" with start/],
    [{ conditions: [{ column: "Category", operator: "between", start: "A" }] }, /"between" needs a numeric or date column/],
    [{ conditions: [{ column: "Updated", operator: "between", start: "March" }] }, /must be a date as YYYY-MM-DD/],
    [{ conditions: [{ column: "Rating", operator: "between", start: "5", end: "1" }] }, /start is after end/],
    [{ conditions: [{ column: "Rating", operator: "contains", value: "4" }] }, /"contains" needs a text column/],
    [{ conditions: [{ column: "Contact", operator: "equals", value: "dev1@example.com" }] }, /personal data and is masked/],
  ])("rejects %j", (args, message) => {
    const r = call("propose_filter", args);
    expect(r.ok).toBe(false);
    expect(errorOf(r)).toMatch(message);
  });
});

describe("actions: privacy levels and the per-answer cap", () => {
  it("work at Schema and Summaries, where query tools are refused", () => {
    expect(call("propose_kpi", { column: "Rating" }, "", "schema").ok).toBe(true);
    expect(call("propose_filter", { conditions: [{ column: "Category", operator: "equals", value: "GAME" }] }, "", "summaries").ok).toBe(true);
    expect(call("describe_column", { column: "Rating" }, "", "schema").ok).toBe(false);
  });

  it(`at most ${MAX_PROPOSALS} proposals per answer; invalid ones don't count`, () => {
    const e = env();
    const kpi = () => runCopilotTool(e, "propose_kpi", JSON.stringify({ column: "Rating" }));
    expect(runCopilotTool(e, "propose_kpi", JSON.stringify({ column: "Ghost" })).ok).toBe(false);
    expect([kpi(), kpi(), kpi()].map((r) => r.ok)).toEqual([true, true, true]);
    const fourth = kpi();
    expect(fourth.ok).toBe(false);
    expect(errorOf(fourth)).toMatch(/At most 3 proposals per answer/);
    // A query still runs after the cap.
    expect(runCopilotTool(e, "value_counts", JSON.stringify({ column: "Category" })).ok).toBe(true);
  });

  it("proposal ids are unique", () => {
    const e = env();
    const ids = [1, 2, 3].map(() => runCopilotTool(e, "propose_kpi", JSON.stringify({ column: "Reviews" })).proposal!.id);
    expect(new Set(ids).size).toBe(3);
  });
});
