import { describe, it, expect } from "vitest";
import * as d3 from "d3";
import type { DataRow } from "@/shared/types";
import { aggregateValuesOrNull, lineSeries, LinePoint, sortAxisKeys } from "../chartAggregation";

/** Number of separate segments ("M" commands) in an SVG path. */
const segments = (d: string | null) => (d ?? "").split("M").length - 1;

const rows: DataRow[] = [
  { day: "2024-01-01", sales: 10 },
  { day: "2024-01-02", sales: 12 },
  { day: "2024-01-03", sales: null }, // blank cell
  { day: "2024-01-04", sales: "NaN" }, // junk text
  { day: "2024-01-05", sales: 15 },
  { day: "2024-01-06", sales: 9 },
];

describe("line/area series: blanks are gaps, not 0", () => {
  it("keeps blank and junk y values in the series as null", () => {
    const series = lineSeries(rows, "day", "sales", "date");
    expect(series.map(p => p.y)).toEqual([10, 12, null, null, 15, 9]);
  });

  it("the d3 line and area break at null points instead of dropping to 0 or joining", () => {
    const series = lineSeries(rows, "day", "sales", "date");
    const x = d3.scaleUtc().domain(d3.extent(series, p => p.x as number) as [number, number]).range([0, 500]);
    const y = d3.scaleLinear().domain([0, 20]).range([200, 0]);
    const line = d3.line<LinePoint<DataRow>>().defined(p => p.y !== null).x(p => x(p.x as number)).y(p => y(p.y as number));
    const area = d3.area<LinePoint<DataRow>>().defined(p => p.y !== null).x(p => x(p.x as number)).y0(200).y1(p => y(p.y as number));
    const d = line(series);
    expect(segments(d)).toBe(2);
    expect(segments(area(series))).toBe(2);
    // No point sits on the zero line (y pixel 200) for the line.
    expect(d).not.toMatch(/,200(?=[LMZ]|$)/);
  });

  it("a group with no valid numbers aggregates to null for sum/avg/min/max, but counts stay numbers", () => {
    const blank: DataRow[] = [{ v: null }, { v: "" }, { v: "ERROR" }];
    expect(aggregateValuesOrNull(blank, "v", "sum")).toBeNull();
    expect(aggregateValuesOrNull(blank, "v", "avg")).toBeNull();
    expect(aggregateValuesOrNull(blank, "v", "max")).toBeNull();
    expect(aggregateValuesOrNull(blank, "v", "count_rows")).toBe(3);
    expect(aggregateValuesOrNull([{ v: 2 }, { v: null }], "v", "avg")).toBe(2);
  });
});

describe("date axes are time-zone free", () => {
  it("x positions are the date parts as UTC-ms", () => {
    const series = lineSeries([{ d: "2008-01-01", v: 1 }, { d: "2007-12-31", v: 2 }], "d", "v", "date");
    expect(series.map(p => p.x)).toEqual([Date.UTC(2007, 11, 31), Date.UTC(2008, 0, 1)]);
    expect(d3.utcFormat("%Y-%m-%d")(new Date(series[1].x as number))).toBe("2008-01-01");
  });

  it("drops points whose x isn't a date (invalid text) but keeps them for null y", () => {
    const series = lineSeries([{ d: "invalid", v: 1 }, { d: "2023-02-30", v: 1 }, { d: "2024-01-01", v: null }], "d", "v", "date");
    expect(series).toHaveLength(1);
    expect(series[0].y).toBeNull();
  });

  it("sorts period keys and datetimes chronologically", () => {
    expect(sortAxisKeys(["2008-Q2", "2007-Q4", "2008-Q1"], "date")).toEqual(["2007-Q4", "2008-Q1", "2008-Q2"]);
    expect(sortAxisKeys(["2008-W02", "2008-W01", "2007-W52"], "date")).toEqual(["2007-W52", "2008-W01", "2008-W02"]);
    expect(sortAxisKeys(["2024-01-05T10:00", "2024-01-05", "(Blank)", "2023-12-31"], "date")).toEqual([
      "2023-12-31",
      "2024-01-05",
      "2024-01-05T10:00",
      "(Blank)",
    ]);
  });
});
