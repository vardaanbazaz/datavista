import { describe, it, expect } from "vitest";
import { initialKpiTitle, kpiAutoTitle, kpiTitleReducer, type KpiTitleState } from "../lib/kpiTitle";

describe("kpiAutoTitle", () => {
  it("names the aggregation and the column", () => {
    expect(kpiAutoTitle("avg", "Rating")).toBe("Average Rating");
    expect(kpiAutoTitle("sum", "Revenue")).toBe("Total Revenue");
    expect(kpiAutoTitle("count", "Invoice")).toBe("Count of Invoice");
    expect(kpiAutoTitle("count_distinct", "Customer ID")).toBe("Distinct Customer ID");
    expect(kpiAutoTitle("median", "Price")).toBe("Median Price");
  });
  it("Count of rows names no column", () => {
    expect(kpiAutoTitle("count_rows", "Rating")).toBe("Row count");
  });
});

describe("KPI title follows the settings until edited", () => {
  const run = (state: KpiTitleState, ...actions: Parameters<typeof kpiTitleReducer>[1][]) => actions.reduce(kpiTitleReducer, state);

  it("updates on every aggregation or column change while untouched", () => {
    let s = run(initialKpiTitle(), { type: "auto", aggregation: "avg", column: "Rating" });
    expect(s).toEqual({ title: "Average Rating", edited: false });
    s = run(s, { type: "auto", aggregation: "max", column: "Rating" });
    expect(s.title).toBe("Maximum Rating");
    s = run(s, { type: "auto", aggregation: "sum", column: "Reviews" });
    expect(s.title).toBe("Total Reviews");
  });

  it("never overwrites a title the user typed, even an empty one", () => {
    let s = run(initialKpiTitle(), { type: "auto", aggregation: "avg", column: "Rating" }, { type: "edit", title: "Mean app rating" });
    s = run(s, { type: "auto", aggregation: "max", column: "Price" });
    expect(s).toEqual({ title: "Mean app rating", edited: true });
    s = run(s, { type: "edit", title: "" }, { type: "auto", aggregation: "sum", column: "Reviews" });
    expect(s.title).toBe("");
  });

  it("a saved card keeps its own title; one still equal to the suggestion keeps following", () => {
    expect(run(initialKpiTitle({ title: "Revenue (net)", aggregation: "sum", column: "Revenue" }), { type: "auto", aggregation: "avg", column: "Revenue" }).title).toBe("Revenue (net)");
    expect(run(initialKpiTitle({ title: "Total Revenue", aggregation: "sum", column: "Revenue" }), { type: "auto", aggregation: "avg", column: "Revenue" }).title).toBe("Average Revenue");
  });
});
