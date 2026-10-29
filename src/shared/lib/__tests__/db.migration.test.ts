import { describe, it, expect, vi } from "vitest";
import Dexie from "dexie";
import type { ChartConfig, Dashboard, Dataset, FilterState } from "@/shared/types";

// Opens a database written by the old (v1) schema with the current code: datasets carried
// all their rows in one record and every chart carried a copy of the dataset's rows.

vi.mock("@/shared/hooks/use-toast", () => ({ toast: vi.fn() }));

function dataset(id: string, rows: number, withDates: boolean): Dataset {
  const data = Array.from({ length: rows }, (_, i) => ({
    Region: ["North", "South"][i % 2],
    Sales: i * 3,
    ...(withDates ? { Day: `2024-01-${String((i % 28) + 1).padStart(2, "0")}` } : {}),
  }));
  const columns = ["Region", "Sales", ...(withDates ? ["Day"] : [])];
  return {
    id,
    name: `Dataset ${id}`,
    data,
    columns,
    columnTypes: { Region: "categorical", Sales: "numeric", ...(withDates ? { Day: "date" as const } : {}) },
    metadata: {
      datasetId: id, name: id, createdAt: 1, updatedAt: 2, rowCount: rows, columnCount: columns.length,
      originalFileName: `${id}.csv`, originalFileType: "csv", parsingStatistics: { processingTimeMs: 5 }, version: 1,
      dateParserVersion: 2,
      columns: columns.map((name) => ({
        id: `${id}_${name}`, name, displayName: name, originalHeader: name,
        inferredDataType: name === "Region" ? "categorical" as const : name === "Day" ? "date" as const : "numeric" as const,
        nullableStatus: false, uniqueValueCount: 2, missingValueCount: 0, categoryCardinality: {},
        role: name === "Region" ? "dimension" as const : name === "Day" ? "date" as const : "measure" as const,
        allIntegerValues: name === "Sales",
      })),
    },
    version: 3,
    lastUpdated: 1700000000000,
    ...(withDates ? { dateSourceValues: { Day: data.map((_, i) => `01/${String((i % 28) + 1).padStart(2, "0")}/2024`) } } : {}),
  };
}

describe("Dexie v1 → v2 upgrade", () => {
  it("moves dataset rows into chunks, drops chart rows, and loads everything back equal", async () => {
    const ds1 = dataset("ds1", 45_000, true); // three chunks, with day/month source text
    const ds2 = dataset("ds2", 10, false);
    const charts: ChartConfig[] = [
      { id: "c1", type: "bar", title: "One", xAxis: "Region", yAxis: "Sales", datasetId: "ds1" },
      { id: "c2", type: "line", title: "Two", xAxis: "Day", yAxis: "Sales", aggregation: "avg", datasetId: "ds1" },
      { id: "c3", type: "pie", title: "Three", xAxis: "Region", yAxis: "Sales", datasetId: "ds2" },
    ];
    const filters: { datasetId: string; state: FilterState }[] = [
      { datasetId: "ds1", state: { categoricalFilters: { Region: ["North"] }, dateRangeFilters: {} } },
    ];
    const dashboards: Dashboard[] = [
      { id: "d1", name: "Board", chartIds: ["c1", "c2"], datasetId: "ds1", createdAt: 1, updatedAt: 2, layout: [{ i: "c1", x: 0, y: 0, w: 6, h: 4 }] },
    ];
    const uiState = [
      { key: "activeDatasetId", value: "ds1" },
      { key: "theme", value: "dark" },
      { key: "activeView", value: "charts" },
    ];

    // The old schema, exactly as v1 declared it, filled the way the old code wrote it.
    const old = new Dexie("DataVistaDatabase");
    old.version(1).stores({ datasets: "id", charts: "id, datasetId", filters: "datasetId", uiState: "key", dashboards: "id" });
    await old.table("datasets").bulkAdd([ds1, ds2]);
    await old.table("charts").bulkAdd(charts.map((c) => ({ ...c, data: (c.datasetId === "ds1" ? ds1 : ds2).data })));
    await old.table("filters").bulkAdd(filters);
    await old.table("dashboards").bulkAdd(dashboards);
    await old.table("uiState").bulkAdd(uiState);
    old.close();

    const { db } = await import("@/shared/lib/db");
    const { persistenceService } = await import("@/shared/services/persistenceService");
    const { useDatasetStore } = await import("@/store/datasetStore");
    const { useChartStore } = await import("@/store/chartStore");
    const { useDashboardStore } = await import("@/features/dashboards/store/dashboardStore");
    const { useFilterStore } = await import("@/store/filterStore");
    const { useUiStore } = await import("@/store/uiStore");

    // hydrate applies the saved theme to <html>; there is no DOM in this environment.
    vi.stubGlobal("document", { documentElement: { classList: { add: () => {}, remove: () => {} } } });
    await persistenceService.hydrate();
    vi.unstubAllGlobals();

    // On disk: v2, metadata records without rows, chunks, charts without rows.
    expect(db.verno).toBe(2);
    for (const record of await db.datasets.toArray()) expect(record).not.toHaveProperty("data");
    expect(await db.datasetRows.where("datasetId").equals("ds1").count()).toBe(3);
    expect(await db.datasetRows.where("datasetId").equals("ds2").count()).toBe(1);
    for (const record of await db.charts.toArray()) expect(record).not.toHaveProperty("data");

    // Loaded: equal to what was saved (charts minus their rows).
    const loaded = useDatasetStore.getState().datasets;
    expect(loaded).toEqual([ds1, ds2]);
    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds1");
    expect([...useChartStore.getState().charts].sort((a, b) => a.id.localeCompare(b.id))).toEqual(charts);
    expect(useDashboardStore.getState().dashboards).toEqual(dashboards);
    expect(useFilterStore.getState().activeFilters).toEqual(filters[0].state);
    expect(await db.filters.toArray()).toEqual(filters);
    expect(useUiStore.getState().theme).toBe("dark");
    expect(useUiStore.getState().activeView).toBe("charts");
    expect(await db.uiState.toArray()).toEqual(expect.arrayContaining(uiState));

    db.close();
  });
});
