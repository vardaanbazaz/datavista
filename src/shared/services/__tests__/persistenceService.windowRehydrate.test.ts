import { describe, it, expect, beforeEach } from "vitest";
import { Dataset } from "@/shared/types";

// A dataset shaped exactly like the pre-item-6-fix persisted case: windowQueries defined,
// but the data rows never got the materialized "running_total" column (either because it
// was saved before this fix, or via some other bypass) — the raw shape mechanism A in
// docs/INVESTIGATION-item3-window-pivot-zeroing-2026-09-14.md describes.
const staleDataset: Dataset = {
  id: "ds1",
  name: "employees",
  data: [
    { BusinessTravel: "Rarely", Attrition: "No", Age: 30 },
    { BusinessTravel: "Rarely", Attrition: "Yes", Age: 40 },
  ],
  columns: ["BusinessTravel", "Attrition", "Age"],
  columnTypes: { BusinessTravel: "categorical", Attrition: "categorical", Age: "numeric" },
  windowQueries: [
    {
      alias: "running_total",
      functionType: "MOVING_AVG",
      targetColumn: "Age",
      partitionBy: ["BusinessTravel"],
      orderBy: [{ column: "Attrition", direction: "asc" }],
    },
  ],
};


import { persistenceService } from "../persistenceService";
import { resetDb, seedDataset } from "@/test/fakeDb";
import { useDatasetStore } from "@/store/datasetStore";
import { useUiStore } from "@/store/uiStore";

describe("persistenceService.hydrate - windowEngine re-evaluation (item 6 fix)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedDataset(staleDataset);
    useUiStore.setState({ isDataHydrated: false });
    useDatasetStore.setState({ datasets: [], activeDataset: null });
  });

  it("materializes a stale windowQuery's column on hydrate instead of leaving it missing", async () => {
    await persistenceService.hydrate();

    const hydratedDataset = useDatasetStore.getState().datasets.find((d) => d.id === "ds1");
    expect(hydratedDataset).toBeDefined();
    expect(hydratedDataset!.data.every((row) => "running_total" in row)).toBe(true);
  });
});
