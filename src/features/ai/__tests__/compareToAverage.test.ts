import { describe, expect, it } from "vitest";
import { compareToAverage } from "../anomalyDetector";

describe("compareToAverage", () => {
  it("large positives read as a multiple, never thousands of percent", () => {
    expect(compareToAverage(78_158_306, 444_153)).toBe("×176 the average");
    expect(compareToAverage(20, 8)).toBe("×2.5 the average");
    expect(compareToAverage(16, 8)).toBe("×2 the average");
  });
  it("moderate differences keep a percentage", () => {
    expect(compareToAverage(12, 8)).toBe("50% above average");
    expect(compareToAverage(5, 8)).toBe("38% below average");
    expect(compareToAverage(0, 8)).toBe("100% below average");
  });
  it("far below (a negative value with a positive average) is the plain difference, never over 100% below", () => {
    expect(compareToAverage(-53_589.31, 4.69)).toBe("−53,594 vs average 4.69");
    for (const v of [-1, -10, -1e6]) expect(compareToAverage(v, 4.69)).not.toMatch(/%/);
  });
  it("zero or negative averages use the plain difference", () => {
    expect(compareToAverage(12, 0)).toBe("+12 vs average 0");
    expect(compareToAverage(-30, -10)).toBe("−20 vs average −10");
    expect(compareToAverage(5, -10)).toBe("+15 vs average −10");
  });
  it("never says more than 100% below average", () => {
    for (const [v, m] of [[-0.5, 1], [0.001, 1000], [-5, 0.1]] as const) {
      const pct = /(\d+)% below/.exec(compareToAverage(v, m));
      if (pct) expect(Number(pct[1])).toBeLessThanOrEqual(100);
    }
  });
});
