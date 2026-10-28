import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import Papa from "papaparse";
import * as d3 from "d3";
import { processRawData } from "@/shared/services/parsingService";
import {
  aggregateValues,
  aggregationLabel,
  chartYValueLabel,
  sortAxisKeys,
} from "../chartAggregation";

describe("aggregationLabel", () => {
  it("names the aggregation actually computed", () => {
    expect(aggregationLabel(undefined, "Education")).toBe("Sum of Education");
    expect(aggregationLabel("sum", "Education")).toBe("Sum of Education");
    expect(aggregationLabel("avg", "Education")).toBe("Average of Education");
    expect(aggregationLabel("min", "Age")).toBe("Minimum of Age");
    expect(aggregationLabel("max", "Age")).toBe("Maximum of Age");
    expect(aggregationLabel("median", "Age")).toBe("Median of Age");
    expect(aggregationLabel("stddev", "Age")).toBe("Std. deviation of Age");
    expect(aggregationLabel("count_distinct", "JobRole")).toBe("Distinct count of JobRole");
    expect(aggregationLabel("count", "Education")).toBe("Count of rows");
  });

  it("labels the operators charts can't compute as the sum they fall back to", () => {
    for (const op of ["sum_if", "count_if", "weighted_average", "percentile"] as const) {
      expect(aggregationLabel(op, "Sales")).toBe("Sum of Sales");
    }
  });
});

describe("chartYValueLabel", () => {
  it("prefixes the aggregation for bar and pie (which always reduce, default sum)", () => {
    expect(chartYValueLabel({ type: "bar", yAxis: "Education" })).toBe("Sum of Education");
    expect(chartYValueLabel({ type: "bar", yAxis: "Education", aggregation: "avg" })).toBe("Average of Education");
    expect(chartYValueLabel({ type: "pie", yAxis: "Sales", aggregation: "count" })).toBe("Count of rows");
  });

  it("prefixes line/area only when an aggregation is set (otherwise raw row values are plotted)", () => {
    expect(chartYValueLabel({ type: "line", yAxis: "Sales" })).toBe("Sales");
    expect(chartYValueLabel({ type: "area", yAxis: "Sales", aggregation: "max" })).toBe("Maximum of Sales");
  });

  it("keeps the column name for scatter, bubble and heatmap, and is empty without a Y column", () => {
    expect(chartYValueLabel({ type: "scatter", yAxis: "Sales", aggregation: "sum" })).toBe("Sales");
    expect(chartYValueLabel({ type: "bubble", yAxis: "Sales" })).toBe("Sales");
    expect(chartYValueLabel({ type: "heatmap", yAxis: "Region" })).toBe("Region");
    expect(chartYValueLabel({ type: "bar" })).toBe("");
  });
});

describe("sortAxisKeys", () => {
  it("sorts numeric keys ascending by value, not as strings or by first appearance", () => {
    expect(sortAxisKeys(["41", "49", "37", "9", "100", "28.5"], "numeric")).toEqual(["9", "28.5", "37", "41", "49", "100"]);
  });

  it("sorts date keys chronologically", () => {
    expect(sortAxisKeys(["2024-03-01", "2023-12-31", "2024-01-15"], "date")).toEqual([
      "2023-12-31",
      "2024-01-15",
      "2024-03-01",
    ]);
  });

  it("keeps categorical keys in the given order", () => {
    expect(sortAxisKeys(["Sales", "HR", "R&D"], "categorical")).toEqual(["Sales", "HR", "R&D"]);
  });

  it("puts unparseable keys last in their original order and does not mutate the input", () => {
    const keys = ["5", "(Blank)", "1", "", "3"];
    expect(sortAxisKeys(keys, "numeric")).toEqual(["1", "3", "5", "(Blank)", ""]);
    expect(keys).toEqual(["5", "(Blank)", "1", "", "3"]);
  });
});

// The user-reported case, end to end on the real fixture: Bar chart X=Age, Y=Education.
// Values are checked against the pandas golden file (scripts/golden/generate_hr_golden.py).
describe("bar chart reduction on the HR fixture (X=Age, Y=Education)", () => {
  const fixtures = resolve(__dirname, "../../../../../tests/fixtures");
  const golden = JSON.parse(readFileSync(resolve(fixtures, "hr-attrition.golden.json"), "utf8"));
  const csv = readFileSync(resolve(fixtures, "hr-attrition.csv"), "utf8");
  const ds = processRawData(
    Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: "greedy" }).data,
    "hr-attrition.csv"
  );
  const byAge = d3.group(ds.data, d => String(d.Age));

  it("x keys come out in ascending age order", () => {
    const keys = sortAxisKeys(Array.from(byAge.keys()), ds.columnTypes.Age);
    expect(keys.slice(0, 3)).toEqual(["18", "19", "20"]);
    expect(keys).toEqual([...keys].sort((a, b) => Number(a) - Number(b)));
  });

  for (const [op, key] of [["sum", "sum"], ["avg", "avg"], ["count", "count"], ["min", "min"], ["max", "max"]] as const) {
    it(`${op} matches the golden values`, () => {
      for (const [age, rows] of byAge) {
        const expected = golden.groupByAge[age].Education[key] as number;
        const actual = aggregateValues(rows, "Education", op);
        expect(Math.abs(actual - expected), `Age=${age}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)));
      }
    });
  }

  it("age 35 is the sum the user saw (251), labelled as a sum", () => {
    expect(aggregateValues(byAge.get("35")!, "Education", undefined)).toBe(251);
    expect(chartYValueLabel({ type: "bar", yAxis: "Education" })).toBe("Sum of Education");
  });
});
