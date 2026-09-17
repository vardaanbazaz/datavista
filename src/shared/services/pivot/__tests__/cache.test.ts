import { describe, it, expect, vi, afterEach } from "vitest";
import { pivotEngine } from "../engine";
import { PivotConfig } from "../types";
import { queryEngine } from "@/shared/services/queryEngine";
import { Dataset, DataRow } from "@/shared/types";

function makeData(n: number): DataRow[] {
  return Array.from({ length: n }, (_, i) => ({
    Region: i % 2 === 0 ? "North" : "South",
    Sales: i * 10
  }));
}

function makeDataset(data: DataRow[]): Dataset {
  return {
    id: "ds1",
    name: "test",
    data,
    columns: ["Region", "Sales"],
    columnTypes: { Region: "categorical", Sales: "numeric" }
  };
}

function makeConfig(alias = "sum_Sales"): PivotConfig {
  return {
    rowDimensions: ["Region"],
    columnDimensions: [],
    valueFields: [{ column: "Sales", operator: "sum", displayName: alias }]
  };
}

describe("Pivot engine result cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hits cache for the same filtered-rows array + same config: zero aggregation calls on 2nd run", () => {
    const data = makeData(10);
    const dataset = makeDataset(data);
    const config = makeConfig();

    pivotEngine.execute(dataset, config);

    const spy = vi.spyOn(queryEngine, "computeAggregations");
    const second = pivotEngine.execute(dataset, config);

    expect(spy).not.toHaveBeenCalled();
    expect(second).toBe(pivotEngine.execute(dataset, config));
  });

  it("recomputes for the same array with a different config", () => {
    const data = makeData(10);
    const dataset = makeDataset(data);

    pivotEngine.execute(dataset, makeConfig("sum_Sales"));

    const spy = vi.spyOn(queryEngine, "computeAggregations");
    pivotEngine.execute(dataset, { ...makeConfig(), rowDimensions: [] });

    expect(spy).toHaveBeenCalled();
  });

  it("recomputes for a different array with the same config (catches a filters-identity-only key)", () => {
    const config = makeConfig();
    const datasetA = makeDataset(makeData(10));
    const datasetB = makeDataset(makeData(10)); // same shape, different array identity

    pivotEngine.execute(datasetA, config);

    const spy = vi.spyOn(queryEngine, "computeAggregations");
    pivotEngine.execute(datasetB, config);

    expect(spy).toHaveBeenCalled();
  });

  it("evicts the oldest config once more than 5 distinct configs are cached for one array, without collapsing to a single entry", () => {
    const data = makeData(10);
    const dataset = makeDataset(data);

    // Insert 6 distinct configs (distinguished by displayName, part of the hash input).
    for (let i = 0; i < 6; i++) {
      pivotEngine.execute(dataset, makeConfig(`alias${i}`));
    }

    const spy = vi.spyOn(queryEngine, "computeAggregations");

    // The most recent 5 (alias1..alias5) should still be cached.
    for (let i = 1; i < 6; i++) {
      pivotEngine.execute(dataset, makeConfig(`alias${i}`));
    }
    expect(spy).not.toHaveBeenCalled();

    // The oldest (alias0) should have been evicted and require recompute.
    pivotEngine.execute(dataset, makeConfig("alias0"));
    expect(spy).toHaveBeenCalled();
  });
});
