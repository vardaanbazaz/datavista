import { describe, it, expect } from "vitest";
import { calculatePearson, computeCorrelationMatrix } from "../correlation";

describe("calculatePearson", () => {
  it("returns null (undefined), not 0, when one column has zero variance", () => {
    // x is constant - r is mathematically 0/0, undefined, not "no linear relationship"
    const x = [5, 5, 5];
    const y = [1, 2, 3];
    expect(calculatePearson(x, y)).toBeNull();
  });

  it("returns null when both columns have zero variance", () => {
    expect(calculatePearson([7, 7, 7], [2, 2, 2])).toBeNull();
  });

  it("still returns null for n<=1 (unchanged pre-existing behavior)", () => {
    expect(calculatePearson([], [])).toBeNull();
    expect(calculatePearson([1], [2])).toBeNull();
  });

  it("still computes a real coefficient for varying columns", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(calculatePearson(x, y)).toBeCloseTo(1, 10);
  });
});

describe("computeCorrelationMatrix", () => {
  it("propagates null for a zero-variance column pair instead of a misleading 0", () => {
    const data = [
      { A: 5, B: 1 },
      { A: 5, B: 2 },
      { A: 5, B: 3 },
    ];
    const result = computeCorrelationMatrix(data, ["A", "B"]);
    expect(result.matrix.A.B).toBeNull();
    expect(result.matrix.B.A).toBeNull();
    // self-correlation is always defined as 1, unaffected
    expect(result.matrix.A.A).toBe(1);
    expect(result.matrix.B.B).toBe(1);
  });
});
