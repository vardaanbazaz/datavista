import { describe, it, expect } from "vitest";
import { computeDescriptive } from "../descriptive";
import { ColumnMetadata } from "@/shared/types";

const makeMetadata = (overrides: Partial<ColumnMetadata> = {}): ColumnMetadata => ({
  id: "age",
  name: "age",
  displayName: "Age",
  originalHeader: "Age",
  inferredDataType: "numeric",
  nullableStatus: false,
  uniqueValueCount: 999, // deliberately wrong/stale, stands in for unfiltered-dataset cache
  missingValueCount: 999,
  minimumValue: 18, // stale minimum from the full unfiltered dataset
  maximumValue: 90, // stale maximum from the full unfiltered dataset
  role: "measure",
  allIntegerValues: true,
  ...overrides
});

describe("computeDescriptive isFullDataset flag", () => {
  it("ignores stale cached metadata (min/max/uniqueCount/missingCount) for a filtered subset", () => {
    // Simulates: dataset filtered to Age > 50, all values in [51, 90]
    const filteredSubset = Array.from({ length: 50 }, (_, i) => 51 + i);
    const metadata = makeMetadata();

    const stats = computeDescriptive(filteredSubset, metadata, /* isFullDataset */ false);

    expect(stats.count).toBe(50);
    expect(stats.min).toBe(51); // freshly computed, NOT the stale cached 18
    expect(stats.max).toBe(100);
    expect(stats.uniqueCount).toBe(50); // NOT the stale cached 999
    expect(stats.missingCount).toBe(0); // NOT the stale cached 999
    expect(stats.nullPercentage).toBe(0);
  });

  it("still uses cached metadata when isFullDataset is true", () => {
    const values = [1, 2, 3, 4, 5];
    const metadata = makeMetadata({ minimumValue: 1, maximumValue: 5, uniqueValueCount: 5, missingValueCount: 2 });

    const stats = computeDescriptive(values, metadata, true);

    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.uniqueCount).toBe(5);
    expect(stats.missingCount).toBe(2);
  });

  it("falls back to fresh computation when isFullDataset is undefined (unknown)", () => {
    const values = [10, 20, 30];
    const metadata = makeMetadata({ minimumValue: 0, maximumValue: 999 });

    const stats = computeDescriptive(values, metadata);

    expect(stats.min).toBe(10);
    expect(stats.max).toBe(30);
  });

  it("does not regress sum/mean/median/variance on a filtered subset", () => {
    const filteredSubset = [51, 52, 53, 54, 55];
    const metadata = makeMetadata();

    const stats = computeDescriptive(filteredSubset, metadata, false);

    expect(stats.sum).toBe(265);
    expect(stats.mean).toBe(53);
    expect(stats.median).toBe(53);
    expect(stats.variance).toBeCloseTo(2, 5);
  });
});
