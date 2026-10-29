import { describe, it, expect, beforeEach } from "vitest";
import type { Dataset } from "@/shared/types";

// Regression test for: pivotConfig (row/column dimensions, value fields, aggregation
// operators) was never restored on page reload. `hydrate()` restored datasets, filters,
// charts and dashboards, but only the post-hydration `datasetStore.subscribe` handler
// read `pivotConfig::<datasetId>` back from db.uiState - and that handler bails out
// while `isHydrating` is true, i.e. for the entire duration of hydrate(). So on reload
// pivotConfig stayed null, and PivotExplorer's zero-click default overwrote the saved
// config in IndexedDB.

const dataset = {
  id: "ds-1",
  name: "Sales",
  data: [{ region: "West", amount: 10 }],
  columns: ["region", "amount"],
  columnTypes: { region: "categorical", amount: "numeric" },
};

const savedPivotConfig = {
  rowDimensions: ["region"],
  columnDimensions: [],
  valueFields: [{ column: "amount", operator: "avg", displayName: "AVG of amount" }],
  displayOptions: { showRowTotals: true, showColumnTotals: true, showGrandTotals: true },
};

const uiStateRows = [
  { key: "activeDatasetId", value: "ds-1" },
  { key: `pivotConfig::ds-1`, value: savedPivotConfig },
];


import { persistenceService } from "../persistenceService";
import { db } from "@/shared/lib/db";
import { resetDb, seedDataset } from "@/test/fakeDb";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { usePivotStore } from "@/store/pivotStore";

describe("persistenceService.hydrate restores pivotConfig", () => {
  beforeEach(async () => {
    await resetDb();
    await seedDataset(dataset as Dataset);
    await db.uiState.bulkPut(uiStateRows);
    useUiStore.setState({ isDataHydrated: false });
    useDatasetStore.setState({ activeDataset: null, datasets: [] });
    usePivotStore.setState({ pivotConfig: null, pivotResult: null });
  });

  it("loads the saved pivotConfig for the dataset that becomes active on reload", async () => {
    await persistenceService.hydrate();

    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds-1");
    expect(usePivotStore.getState().pivotConfig).toEqual(savedPivotConfig);
  });
});
