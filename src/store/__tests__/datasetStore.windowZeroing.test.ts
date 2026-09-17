// Regression coverage for the item-6 fix (comprehensive audit 2026-09-14, confirmed root
// cause in docs/INVESTIGATION-item3-window-pivot-zeroing-2026-09-14.md): addCalculatedField/
// deleteCalculatedField/addWindowQuery/deleteWindowQuery wrote the raw, unevaluated dataset
// into datasets[] while only activeDataset got the evaluated copy — a one-word copy-paste
// bug repeated across all four actions. Anything that later re-selected activeDataset from
// the raw datasets[] array (persistenceService.hydrate, dashboardStore.loadDashboard /
// restoreExternalContext, snapshotStore) inherited the staleness and silently zeroed out
// window/calculated columns.
//
// This file replaces the earlier scratch investigation test
// (window/__tests__/navigation-repro.investigation.test.ts, now deleted) that proved the
// bug existed — these versions assert the bug is FIXED, using the same real stores
// end-to-end (not mocked).
import { describe, it, expect, beforeEach } from "vitest";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { pivotEngine, PivotConfig } from "@/shared/services/pivot";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { windowEngine } from "@/shared/services/window";
import { Dataset, DatasetMetadata, ColumnMetadata } from "@/shared/types";

// windowEngine.evaluate's pruning of a deleted window query's stale column relies on
// dataset.metadata.columns' role tracking (see window/__tests__/evaluate.test.ts) — real
// datasets always carry this (parsingService populates it), so the fixture needs it too for
// the delete-path assertions below to actually exercise that pruning rather than mask it.
function makeMetadataColumn(name: string, role: ColumnMetadata["role"]): ColumnMetadata {
  return {
    id: `emp1_${name}`,
    name,
    displayName: name,
    originalHeader: name,
    inferredDataType: name === "Age" ? "numeric" : "categorical",
    nullableStatus: false,
    uniqueValueCount: 0,
    missingValueCount: 0,
    role,
  };
}

function makeBaseDataset(): Dataset {
  const metadata: DatasetMetadata = {
    datasetId: "emp1",
    name: "employees",
    createdAt: 0,
    updatedAt: 0,
    rowCount: 4,
    columnCount: 3,
    originalFileName: "employees.csv",
    originalFileType: "csv",
    parsingStatistics: { processingTimeMs: 0 } as DatasetMetadata["parsingStatistics"],
    columns: [
      makeMetadataColumn("BusinessTravel", "dimension"),
      makeMetadataColumn("Attrition", "dimension"),
      makeMetadataColumn("Age", "measure"),
    ],
  };

  return {
    id: "emp1",
    name: "employees",
    data: [
      { BusinessTravel: "Rarely", Attrition: "No", Age: 30 },
      { BusinessTravel: "Rarely", Attrition: "Yes", Age: 40 },
      { BusinessTravel: "Frequently", Attrition: "No", Age: 25 },
      { BusinessTravel: "Frequently", Attrition: "Yes", Age: 35 },
    ],
    columns: ["BusinessTravel", "Attrition", "Age"],
    columnTypes: { BusinessTravel: "categorical", Attrition: "categorical", Age: "numeric" },
    metadata,
  };
}

const pivotConfig: PivotConfig = {
  rowDimensions: ["Attrition"],
  columnDimensions: ["BusinessTravel"],
  valueFields: [{ column: "running_total", operator: "sum", displayName: "Sum of running_total" }],
  displayOptions: { showRowTotals: true, showColumnTotals: true, showGrandTotals: true },
};

function grandTotal(result: ReturnType<typeof pivotEngine.execute>): number | null {
  return result.getCell([], [], "sum_running_total") as number | null;
}

describe("datasetStore - window/calculated column materialization (item 6 fix)", () => {
  beforeEach(() => {
    useDatasetStore.setState({ datasets: [], activeDataset: null });
    useFilterStore.setState({ filteredData: [], activeFilters: { categoricalFilters: {}, dateRangeFilters: {} } });
    useDashboardStore.setState({ dashboards: [], activeDashboardId: null, past: [], future: [] });
  });

  it("addWindowQuery writes the evaluated dataset to datasets[], not just activeDataset", () => {
    useDatasetStore.setState({ datasets: [makeBaseDataset()], activeDataset: makeBaseDataset() });
    useDatasetStore.getState().addWindowQuery({
      alias: "running_total",
      functionType: "MOVING_AVG",
      targetColumn: "Age",
      partitionBy: ["BusinessTravel"],
      orderBy: [{ column: "Attrition", direction: "asc" }],
    });

    const { datasets, activeDataset } = useDatasetStore.getState();
    const rawArrayEntry = datasets.find((d) => d.id === "emp1")!;

    // This is the exact bug: datasets[] used to keep the pre-evaluation object while
    // activeDataset got the evaluated one. They must now be the same reference/value.
    expect(rawArrayEntry).toBe(activeDataset);
    expect(rawArrayEntry.data.every((row) => "running_total" in row)).toBe(true);
  });

  it("addCalculatedField writes the evaluated dataset to datasets[] too", () => {
    useDatasetStore.setState({ datasets: [makeBaseDataset()], activeDataset: makeBaseDataset() });
    useDatasetStore.getState().addCalculatedField("AgePlusOne", "[Age] + 1");

    const { datasets, activeDataset } = useDatasetStore.getState();
    const rawArrayEntry = datasets.find((d) => d.id === "emp1")!;

    expect(rawArrayEntry).toBe(activeDataset);
    expect(rawArrayEntry.data.every((row) => row.AgePlusOne === (row.Age as number) + 1)).toBe(true);
  });

  it("deleteWindowQuery and deleteCalculatedField also keep datasets[] in sync", () => {
    useDatasetStore.setState({ datasets: [makeBaseDataset()], activeDataset: makeBaseDataset() });
    useDatasetStore.getState().addWindowQuery({
      alias: "running_total",
      functionType: "MOVING_AVG",
      targetColumn: "Age",
      partitionBy: ["BusinessTravel"],
      orderBy: [{ column: "Attrition", direction: "asc" }],
    });
    useDatasetStore.getState().addCalculatedField("AgePlusOne", "[Age] + 1");

    useDatasetStore.getState().deleteWindowQuery("running_total");
    useDatasetStore.getState().deleteCalculatedField("AgePlusOne");

    const { datasets, activeDataset } = useDatasetStore.getState();
    const rawArrayEntry = datasets.find((d) => d.id === "emp1")!;

    // datasets[] and activeDataset must stay identical after every mutation — that's the
    // actual item-6 invariant this file is regression-testing.
    expect(rawArrayEntry).toBe(activeDataset);

    // windowEngine's stale-alias pruning (driven by metadata role tracking) correctly
    // removes running_total once its windowQuery is deleted.
    expect(rawArrayEntry.data.every((row) => !("running_total" in row))).toBe(true);

    // NOT asserting AgePlusOne is gone here: formulaEngine.evaluateCalculatedFields
    // (formulaEngine.ts:705-708) early-returns unchanged whenever calculatedFields.length
    // is 0, which means deleting the LAST calculated field never strips its stale column
    // from `data`. That's a real, separate, pre-existing bug (unrelated to item 6's
    // datasets[]/activeDataset sync issue — it reproduces identically against
    // formulaEngine.evaluateCalculatedFields alone, with no datasetStore involvement) that
    // this test incidentally surfaced. Flagged separately rather than silently fixed here,
    // since it's out of item 6's scope.
  });

  it("mechanism B (fixed): loadDashboard no longer zeroes the pivot", () => {
    useDatasetStore.setState({ datasets: [makeBaseDataset()], activeDataset: makeBaseDataset() });
    useDatasetStore.getState().addWindowQuery({
      alias: "running_total",
      functionType: "MOVING_AVG",
      targetColumn: "Age",
      partitionBy: ["BusinessTravel"],
      orderBy: [{ column: "Attrition", direction: "asc" }],
    });

    const active1 = useDatasetStore.getState().activeDataset!;
    const filtered1 = useFilterStore.getState().filteredData;
    const sum1 = grandTotal(pivotEngine.execute({ ...active1, data: filtered1 }, pivotConfig));
    expect(sum1).not.toBe(0); // sanity: genuinely non-zero before the dashboard load

    useDashboardStore.getState().createDashboard("Dash1", active1.id);
    const dashId = useDashboardStore.getState().dashboards[0].id;
    useDashboardStore.getState().loadDashboard(dashId);

    const active2 = useDatasetStore.getState().activeDataset!;
    expect(active2.data.every((row) => "running_total" in row)).toBe(true);

    const filtered2 = useFilterStore.getState().filteredData;
    const sum2 = grandTotal(pivotEngine.execute({ ...active2, data: filtered2 }, pivotConfig));
    expect(sum2).toBe(sum1); // identical config, identical (non-zero) result after reload
  });

  it("mechanism A (fixed): hydrate's re-evaluation now includes windowEngine, not just formulaEngine", () => {
    useDatasetStore.setState({ datasets: [makeBaseDataset()], activeDataset: makeBaseDataset() });
    useDatasetStore.getState().addWindowQuery({
      alias: "running_total",
      functionType: "MOVING_AVG",
      targetColumn: "Age",
      partitionBy: ["BusinessTravel"],
      orderBy: [{ column: "Attrition", direction: "asc" }],
    });

    // Simulate the pre-fix persisted shape: strip the materialized column back out, the
    // way an IndexedDB entry saved before this fix (or by some other future bypass) would
    // look — calculatedFields/windowQueries defined, but the data rows don't carry them.
    const rawFromArray = useDatasetStore.getState().datasets[0];
    const staleAsIfPersisted: Dataset = {
      ...rawFromArray,
      data: rawFromArray.data.map(({ running_total, ...rest }) => rest),
    };
    expect(staleAsIfPersisted.data.every((row) => !("running_total" in row))).toBe(true);

    // persistenceService.hydrate():109's exact current line (windowEngine.evaluate +
    // formulaEngine.evaluateCalculatedFields), reproduced inline since hydrate() itself
    // needs IndexedDB.
    const rehydrated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(staleAsIfPersisted));
    expect(rehydrated.data.every((row) => "running_total" in row)).toBe(true);

    const result = pivotEngine.execute({ ...rehydrated, data: rehydrated.data }, pivotConfig);
    expect(grandTotal(result)).not.toBe(0);
  });
});
