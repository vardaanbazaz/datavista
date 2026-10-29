import { describe, it, expect } from "vitest";
import {
  resolveDateGranularity,
  dateBucketKey,
  dateBucketLabel,
  dateBucketRange,
  topKeys,
  NO_DATE_KEY,
  AUTO_MAX_BUCKETS,
} from "../chartAggregation";
import { tickLayout, truncateLabel } from "../axisLabels";

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

describe("resolveDateGranularity", () => {
  it("keeps a fixed choice", () => {
    expect(resolveDateGranularity(["2024-01-01"], "month")).toBe("month");
  });

  it("auto: the finest period with at most 60 buckets", () => {
    expect(resolveDateGranularity(daysBetween("2024-01-01", "2024-02-15"), "auto")).toBe("day"); // 46 days
    expect(resolveDateGranularity(daysBetween("2024-01-01", "2024-06-30"), "auto")).toBe("week"); // 26 weeks
    expect(resolveDateGranularity(daysBetween("2020-01-01", "2023-12-31"), "auto")).toBe("month"); // 48
    expect(resolveDateGranularity(daysBetween("2008-01-01", "2021-12-31"), "auto")).toBe("quarter"); // 56
    expect(resolveDateGranularity(daysBetween("2000-01-01", "2020-12-31"), undefined)).toBe("year"); // 84 quarters
  });

  it("auto falls back to year when even years are more than the limit", () => {
    const years = Array.from({ length: AUTO_MAX_BUCKETS + 5 }, (_, i) => `${1900 + i}-01-01`);
    expect(resolveDateGranularity(years, "auto")).toBe("year");
  });

  it("ignores blanks and invalid dates", () => {
    expect(resolveDateGranularity([null, "", "not a date", "2024-03-01"], "auto")).toBe("day");
  });
});

describe("date buckets", () => {
  it("keys and labels", () => {
    expect(dateBucketKey("2008-07-04", "year")).toBe("2008");
    expect(dateBucketKey("2008-07-04T10:00", "quarter")).toBe("2008-Q3");
    expect(dateBucketKey(null, "year")).toBe(NO_DATE_KEY);
    expect(dateBucketLabel("date_added", "year")).toBe("date_added (Year)");
  });

  it("ranges are the first and last day of the bucket", () => {
    expect(dateBucketRange("2008")).toEqual({ start: "2008-01-01", end: "2008-12-31" });
    expect(dateBucketRange("2024-Q1")).toEqual({ start: "2024-01-01", end: "2024-03-31" });
    expect(dateBucketRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(dateBucketRange("2024-W01")).toEqual({ start: "2024-01-01", end: "2024-01-07" });
    expect(dateBucketRange("2024-02-29")).toEqual({ start: "2024-02-29", end: "2024-02-29" });
    expect(dateBucketRange(NO_DATE_KEY)).toBeNull();
  });
});

describe("topKeys", () => {
  it("keeps the n largest, null when nothing to fold", () => {
    const values = new Map([["a", 5], ["b", 9], ["c", 1], ["d", 7]]);
    expect(topKeys(values, 2)).toEqual(new Set(["b", "d"]));
    expect(topKeys(values, 4)).toBeNull();
  });
});

describe("tickLayout", () => {
  it("shows every label when they fit flat", () => {
    expect(tickLayout(60, 40, 12)).toEqual({ step: 1, rotate: false });
  });

  it("thins flat labels when they don't fit", () => {
    // 1,700 bars on ~400px: 0.24px apart, 60px labels.
    const { step, rotate } = tickLayout(0.24, 60, 12);
    expect(rotate).toBe(true);
    expect(step * 0.24).toBeGreaterThanOrEqual((60 + 12) * Math.SQRT1_2);
  });

  it("turns only when it fits more labels (wide labels)", () => {
    expect(tickLayout(20, 30, 12).rotate).toBe(false); // short labels: flat step 2, turned step 2
    expect(tickLayout(20, 90, 12).rotate).toBe(true); // long labels: flat step 5, turned step 4
  });

  it("truncates long labels", () => {
    expect(truncateLabel("Short")).toBe("Short");
    expect(truncateLabel("A very long category name")).toBe("A very long cat…");
  });
});
