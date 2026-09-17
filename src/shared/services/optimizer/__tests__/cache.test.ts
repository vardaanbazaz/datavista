import { describe, it, expect, beforeEach } from "vitest";
import { filterCache } from "../cache";

describe("Query Optimizer - LRU Cache (ADR-003)", () => {
  beforeEach(() => {
    filterCache.clear();
  });

  it("does not collapse to a single entry when multiple entries near the 100k row cap are added", () => {
    const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

    filterCache.set("q1", "ds1", makeRows(90000), 90000);
    filterCache.set("q2", "ds1", makeRows(90000), 90000);
    filterCache.set("q3", "ds1", makeRows(90000), 90000);

    // Per-entry cap (100k), not a cumulative budget — all three should
    // coexist since maxEntries (5) isn't breached either.
    expect(filterCache.getStats().size).toBe(3);
    expect(filterCache.get("q1")).toBeDefined();
    expect(filterCache.get("q2")).toBeDefined();
    expect(filterCache.get("q3")).toBeDefined();
  });

  it("rejects a single oversized entry (>100k rows) instead of admitting it whole", () => {
    filterCache.set("small", "ds1", [{ id: 1 }], 1);
    filterCache.set("huge", "ds1", [], 300000);

    expect(filterCache.get("huge")).toBeUndefined();
    // The pre-existing entry must survive the rejected oversized insert.
    expect(filterCache.get("small")).toBeDefined();
    expect(filterCache.getStats().size).toBe(1);
  });

  it("still evicts by entry count (maxEntries=5) once capacity is exceeded", () => {
    for (let i = 0; i < 6; i++) {
      filterCache.set(`k${i}`, "ds1", [{ id: i }], 1);
    }

    expect(filterCache.getStats().size).toBe(5);
    expect(filterCache.get("k0")).toBeUndefined(); // oldest evicted
    expect(filterCache.get("k5")).toBeDefined();
  });
});
