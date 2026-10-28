import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression test for: deleteDataset never cleaned up the dataset's per-id rows in
// IndexedDB (db.filters, db.uiState's `pivotConfig::<id>`) — they accumulated forever
// and could leak into a reused dataset id.

const deleteFilters = vi.fn((..._args: unknown[]) => Promise.resolve());
const deleteUiState = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock("@/shared/lib/db", () => ({
  db: {
    filters: { delete: (...args: unknown[]) => deleteFilters(...args) },
    uiState: { delete: (...args: unknown[]) => deleteUiState(...args) },
  },
}));

import { useDatasetStore } from "@/store/datasetStore";
import { useChartStore } from "@/store/chartStore";
import { useFilterStore } from "@/store/filterStore";
import { Dataset } from "@/shared/types";

function makeDataset(id: string): Dataset {
  return {
    id,
    name: id,
    data: [{ a: 1 }],
    columns: ["a"],
    columnTypes: { a: "numeric" },
  };
}

describe("deleteDataset cleans up orphaned db rows", () => {
  beforeEach(() => {
    deleteFilters.mockClear();
    deleteUiState.mockClear();
    const ds1 = makeDataset("ds-1");
    const ds2 = makeDataset("ds-2");
    useDatasetStore.setState({ datasets: [ds1, ds2], activeDataset: ds1 });
    useChartStore.setState({ charts: [] });
    useFilterStore.setState({ activeFilters: { categoricalFilters: {}, dateRangeFilters: {} }, filteredData: [] });
  });

  it("deletes the filters row for the deleted dataset", () => {
    useDatasetStore.getState().deleteDataset("ds-1");
    expect(deleteFilters).toHaveBeenCalledWith("ds-1");
  });

  it("deletes the pivotConfig uiState row for the deleted dataset", () => {
    useDatasetStore.getState().deleteDataset("ds-1");
    expect(deleteUiState).toHaveBeenCalledWith("pivotConfig::ds-1");
  });

  it("does not touch the remaining dataset's rows", () => {
    useDatasetStore.getState().deleteDataset("ds-1");
    expect(deleteFilters).not.toHaveBeenCalledWith("ds-2");
    expect(deleteUiState).not.toHaveBeenCalledWith("pivotConfig::ds-2");
  });
});
