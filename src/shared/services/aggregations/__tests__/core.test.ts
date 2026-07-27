import { describe, it, expect } from "vitest";
import { weightedAverage, percentile, countDistinct } from "../core";

describe("Advanced Aggregations", () => {
  describe("weightedAverage", () => {
    it("should calculate correct weighted average for known values and weights", () => {
      const values = [10, 20, 30];
      const weights = [1, 2, 3];
      // (10*1 + 20*2 + 30*3) / (1 + 2 + 3) = (10 + 40 + 90) / 6 = 140 / 6 ≈ 23.3333
      const result = weightedAverage(values, weights);
      expect(result).toBeCloseTo(23.3333, 4);
    });

    it("should safely skip NaN, null, and undefined values or weights", () => {
      const values = [10, null, 20, "invalid", 30, undefined];
      const weights = [1, 5, 2, 10, 3, 4];
      // Valid pairs: (10, 1), (20, 2), (30, 3)
      // Weighted avg: 140 / 6 ≈ 23.3333
      const result = weightedAverage(values, weights);
      expect(result).toBeCloseTo(23.3333, 4);
    });

    it("should return null for empty arrays or zero total weight", () => {
      expect(weightedAverage([], [])).toBeNull();
      expect(weightedAverage([10, 20], [0, 0])).toBeNull();
      expect(weightedAverage([null, NaN], [1, 2])).toBeNull();
    });
  });

  describe("percentile", () => {
    it("should calculate NIST-compliant linear interpolation for 90th percentile", () => {
      // 10 values: 1 to 10
      // 90th percentile: index = (90/100) * (10 - 1) = 8.1
      // low = 8 (val 9), high = 9 (val 10)
      // val = 9 + 0.1 * (10 - 9) = 9.1
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const p90 = percentile(values, 90);
      expect(p90).toBeCloseTo(9.1, 4);
    });

    it("should calculate 50th percentile (median) correctly", () => {
      const values = [15, 20, 35, 40, 50];
      // index = (50/100) * 4 = 2 -> value = 35
      expect(percentile(values, 50)).toBe(35);
    });

    it("should handle boundary percentiles (0th and 100th)", () => {
      const values = [10, 20, 30, 40, 50];
      expect(percentile(values, 0)).toBe(10);
      expect(percentile(values, 100)).toBe(50);
    });

    it("should return null for empty arrays or non-numeric arrays", () => {
      expect(percentile([], 90)).toBeNull();
      expect(percentile([null, undefined, "abc"], 50)).toBeNull();
    });

    it("should filter out non-numeric values before computing percentile", () => {
      const values = [1, null, 2, NaN, 3, 4, 5, "invalid", 6, 7, 8, 9, 10];
      const p90 = percentile(values, 90);
      expect(p90).toBeCloseTo(9.1, 4);
    });
  });

  describe("countDistinct", () => {
    it("should count unique non-null, non-undefined, non-empty string values", () => {
      const values = ["A", "B", "A", null, undefined, "", "C", "B"];
      expect(countDistinct(values)).toBe(3); // 'A', 'B', 'C'
    });
  });
});
