import { describe, it, expect } from "vitest";
import { DataRow } from "@/shared/types";
import { PartitionItem } from "../partitioner";
import { resolveFrameBounds } from "../engine";
import {
  computeRunningTotal,
  computeMovingAvg,
  computeWindowMin,
  computeWindowMax,
  computeRunningTotals,
  computeMovingAvgs,
  computeWindowMins,
  computeWindowMaxs
} from "../functions";

const COL = "value";

function toPartition(values: (number | string | null)[]): PartitionItem[] {
  return values.map((v, i) => ({ row: { [COL]: v } as DataRow, originalIndex: i }));
}

/** Naive O(n^2) reference: calls the original per-row function for every index. */
function naiveRunningTotals(partition: PartitionItem[], bounds: { start: number; end: number }[]) {
  return bounds.map(b => computeRunningTotal(partition, COL, b.start, b.end));
}
function naiveMovingAvgs(partition: PartitionItem[], bounds: { start: number; end: number }[]) {
  return bounds.map(b => computeMovingAvg(partition, COL, b.start, b.end));
}
function naiveWindowMins(partition: PartitionItem[], bounds: { start: number; end: number }[]) {
  return bounds.map(b => computeWindowMin(partition, COL, b.start, b.end));
}
function naiveWindowMaxs(partition: PartitionItem[], bounds: { start: number; end: number }[]) {
  return bounds.map(b => computeWindowMax(partition, COL, b.start, b.end));
}

describe("O(n) cumulative/rolling window aggregates", () => {
  describe("correctness vs. the original O(n^2) per-row implementation", () => {
    const partition = toPartition([10, 5, null, 20, "not-a-number", 15, 0, -5, 8, 12, 30, 1]);
    const len = partition.length;

    it("matches on the default cumulative frame (UNBOUNDED PRECEDING .. CURRENT ROW)", () => {
      const bounds = partition.map((_, j) => resolveFrameBounds(j, len, undefined, true));

      expect(computeRunningTotals(partition, COL, bounds)).toEqual(naiveRunningTotals(partition, bounds));
      expect(computeMovingAvgs(partition, COL, bounds)).toEqual(naiveMovingAvgs(partition, bounds));
      expect(computeWindowMins(partition, COL, bounds)).toEqual(naiveWindowMins(partition, bounds));
      expect(computeWindowMaxs(partition, COL, bounds)).toEqual(naiveWindowMaxs(partition, bounds));
    });

    it("matches on a bounded sliding frame (2 PRECEDING .. CURRENT ROW), where old values leave the window", () => {
      const frame = {
        type: "ROWS" as const,
        start: { type: "PRECEDING" as const, value: 2 },
        end: { type: "CURRENT_ROW" as const }
      };
      const bounds = partition.map((_, j) => resolveFrameBounds(j, len, frame, true));

      expect(computeRunningTotals(partition, COL, bounds)).toEqual(naiveRunningTotals(partition, bounds));
      expect(computeMovingAvgs(partition, COL, bounds)).toEqual(naiveMovingAvgs(partition, bounds));
      expect(computeWindowMins(partition, COL, bounds)).toEqual(naiveWindowMins(partition, bounds));
      expect(computeWindowMaxs(partition, COL, bounds)).toEqual(naiveWindowMaxs(partition, bounds));
    });

    it("matches on a centered sliding frame (1 PRECEDING .. 1 FOLLOWING), a non-monotonic-looking shape", () => {
      const frame = {
        type: "ROWS" as const,
        start: { type: "PRECEDING" as const, value: 1 },
        end: { type: "FOLLOWING" as const, value: 1 }
      };
      const bounds = partition.map((_, j) => resolveFrameBounds(j, len, frame, true));

      expect(computeWindowMins(partition, COL, bounds)).toEqual(naiveWindowMins(partition, bounds));
      expect(computeWindowMaxs(partition, COL, bounds)).toEqual(naiveWindowMaxs(partition, bounds));
    });

    it("handles an all-non-numeric partition (every result null)", () => {
      const blank = toPartition(["a", null, "b", "", "c"]);
      const bounds = blank.map((_, j) => resolveFrameBounds(j, blank.length, undefined, true));

      expect(computeRunningTotals(blank, COL, bounds)).toEqual([null, null, null, null, null]);
      expect(computeMovingAvgs(blank, COL, bounds)).toEqual([null, null, null, null, null]);
      expect(computeWindowMins(blank, COL, bounds)).toEqual([null, null, null, null, null]);
      expect(computeWindowMaxs(blank, COL, bounds)).toEqual([null, null, null, null, null]);
    });
  });

  describe("performance at 20k+ rows", () => {
    it("computes cumulative RUNNING_TOTAL over 20,000 rows dramatically faster than the O(n^2) per-row baseline", () => {
      const n = 20000;
      const partition = toPartition(Array.from({ length: n }, (_, i) => (i % 7 === 0 ? null : i % 100)));
      const bounds = partition.map((_, j) => resolveFrameBounds(j, n, undefined, true));

      const naiveStart = performance.now();
      naiveRunningTotals(partition, bounds);
      const naiveMs = performance.now() - naiveStart;

      const batchStart = performance.now();
      computeRunningTotals(partition, COL, bounds);
      const batchMs = performance.now() - batchStart;

      // The O(n) sweep should be at least an order of magnitude faster than the O(n^2)
      // per-row baseline at this size (audit measured ~404ms naive vs ~1ms O(n) at n=20000).
      expect(batchMs).toBeLessThan(naiveMs / 10);
    }, 20000);

    it("computes a bounded sliding WINDOW_MAX over 20,000 rows dramatically faster than the O(n^2) baseline", () => {
      const n = 20000;
      const partition = toPartition(Array.from({ length: n }, (_, i) => Math.sin(i) * 1000));
      const frame = {
        type: "ROWS" as const,
        start: { type: "PRECEDING" as const, value: 50 },
        end: { type: "CURRENT_ROW" as const }
      };
      const bounds = partition.map((_, j) => resolveFrameBounds(j, n, frame, true));

      const naiveStart = performance.now();
      naiveWindowMaxs(partition, bounds);
      const naiveMs = performance.now() - naiveStart;

      const batchStart = performance.now();
      computeWindowMaxs(partition, COL, bounds);
      const batchMs = performance.now() - batchStart;

      expect(batchMs).toBeLessThan(naiveMs);
    }, 20000);
  });
});
