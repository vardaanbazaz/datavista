import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import type { ChartConfig, Dataset } from "@/shared/types";

// What persistence writes for each action. Every test loads fresh modules (stores, the
// service, the Dexie instance) over the in-memory IndexedDB from fake-indexeddb, hydrates
// from a seeded database the way a reload does, then spies on the Dexie tables.

vi.mock("@/shared/hooks/use-toast", () => ({ toast: vi.fn() }));

/** Generated rows: id, a category, a number, and a numeric D/M date with its source text. */
function makeDataset(id: string, rows: number, opts: { withDates?: boolean } = {}): Dataset {
  const data = Array.from({ length: rows }, (_, i) => ({
    id: i,
    Region: ["North", "South", "East"][i % 3],
    Sales: (i % 50) * 10,
    ...(opts.withDates ? { Day: `2024-06-0${(i % 9) + 1}` } : {}),
  }));
  const columns = ["id", "Region", "Sales", ...(opts.withDates ? ["Day"] : [])];
  const dataset: Dataset = {
    id,
    name: `Dataset ${id}`,
    data,
    columns,
    columnTypes: { id: "numeric", Region: "categorical", Sales: "numeric", ...(opts.withDates ? { Day: "date" as const } : {}) },
    metadata: {
      datasetId: id, name: id, createdAt: 0, updatedAt: 0, rowCount: rows, columnCount: columns.length,
      originalFileName: `${id}.csv`, originalFileType: "csv", parsingStatistics: { processingTimeMs: 0 }, version: 1,
      dateParserVersion: 2,
      columns: columns.map((name) => ({
        id: `${id}_${name}`, name, displayName: name, originalHeader: name,
        inferredDataType: name === "Region" ? "categorical" as const : name === "Day" ? "date" as const : "numeric" as const,
        nullableStatus: false, uniqueValueCount: 0, missingValueCount: 0, categoryCardinality: {},
        role: name === "Day" ? "date" as const : name === "Region" ? "dimension" as const : "measure" as const,
        allIntegerValues: name === "id" || name === "Sales",
        ...(name === "Day" ? { dayFirst: false, dayFirstSource: "data" as const } : {}),
      })),
    },
  };
  if (opts.withDates) {
    // "06/0d/2024" read month-first is 2024-06-0d; the toggle reads it day-first instead.
    dataset.dateSourceValues = { Day: data.map((_, i) => `06/0${(i % 9) + 1}/2024`) };
  }
  return dataset;
}

const chart = (id: string, datasetId: string): ChartConfig => ({
  id, type: "bar", title: `Chart ${id}`, xAxis: "Region", yAxis: "Sales", datasetId,
});

async function setup({ datasets = [], charts = [], active, keepDb = false }: {
  datasets?: Dataset[]; charts?: ChartConfig[]; active?: string; keepDb?: boolean;
}) {
  vi.resetModules();
  const { db } = await import("@/shared/lib/db");
  const { resetDb, seedDataset } = await import("@/test/fakeDb");
  if (!keepDb) {
    await resetDb();
    for (const d of datasets) await seedDataset(d);
    if (charts.length) await db.charts.bulkPut(charts);
    if (active) await db.uiState.put({ key: "activeDatasetId", value: active });
  }

  const { persistenceService } = await import("../persistenceService");
  const { useDatasetStore } = await import("@/store/datasetStore");
  const { useChartStore } = await import("@/store/chartStore");
  const { useFilterStore } = await import("@/store/filterStore");
  const { toast } = await import("@/shared/hooks/use-toast");
  await persistenceService.hydrate();
  persistenceService.subscribeToStoreUpdates();

  const spies = {
    rowPut: vi.spyOn(db.datasetRows, "put"),
    rowBulkPut: vi.spyOn(db.datasetRows, "bulkPut"),
    rowBulkAdd: vi.spyOn(db.datasetRows, "bulkAdd"),
    metaPut: vi.spyOn(db.datasets, "put"),
    metaBulkPut: vi.spyOn(db.datasets, "bulkPut"),
    metaClear: vi.spyOn(db.datasets, "clear"),
    chartPut: vi.spyOn(db.charts, "bulkPut"),
    chartDelete: vi.spyOn(db.charts, "bulkDelete"),
    chartClear: vi.spyOn(db.charts, "clear"),
  };
  /** Datasets whose rows were written, one entry per chunk put. */
  const rowWrites = () => spies.rowPut.mock.calls.map(([c]) => c.datasetId);
  const noRowWrites = () => {
    expect(spies.rowPut).not.toHaveBeenCalled();
    expect(spies.rowBulkPut).not.toHaveBeenCalled();
    expect(spies.rowBulkAdd).not.toHaveBeenCalled();
  };
  return {
    db, persistenceService, useDatasetStore, useChartStore, useFilterStore,
    toast: toast as unknown as MockInstance, spies, rowWrites, noRowWrites,
  };
}

type App = Awaited<ReturnType<typeof setup>>;
let app: App | null = null;

beforeEach(() => {
  app = null;
});

afterEach(async () => {
  if (app) {
    await app.persistenceService.whenIdle();
    app.db.close();
  }
  vi.restoreAllMocks();
});

describe("persistence writes only what an action changed", () => {
  it("rename writes the dataset's metadata record only, no rows", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 100)], active: "ds1" });
    app.useDatasetStore.getState().renameDataset("ds1", "Renamed");
    await app.persistenceService.whenIdle();

    app.noRowWrites();
    expect(app.spies.metaClear).not.toHaveBeenCalled();
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    const record = app.spies.metaPut.mock.calls[0][0] as Record<string, unknown>;
    expect(record.id).toBe("ds1");
    expect(record.name).toBe("Renamed");
    expect(record).not.toHaveProperty("data");
    expect((await app.db.datasets.get("ds1"))?.name).toBe("Renamed");
  });

  it("type override writes no rows, even with a calculated column whose values get recomputed", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100)], active: "ds1" });
    app.useDatasetStore.getState().addCalculatedField("Double", "[Sales] * 2");
    await app.persistenceService.whenIdle();
    app.spies.rowPut.mockClear();
    app.spies.metaPut.mockClear();

    const before = app.useDatasetStore.getState().datasets[0].data;
    app.useDatasetStore.getState().setColumnTypeOverride("Sales", "categorical");
    await app.persistenceService.whenIdle();

    // The calculated column was re-materialized in memory (new array)...
    expect(app.useDatasetStore.getState().datasets[0].data).not.toBe(before);
    // ...but no cell value changed, so only metadata is written.
    app.noRowWrites();
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    const stored = await app.db.datasets.get("ds1");
    expect(stored?.metadata?.columns.find((c) => c.name === "Sales")?.userOverrideType).toBe("categorical");
  });

  it("dismissing the date re-import notice writes no rows", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100)], active: "ds1" });
    app.useDatasetStore.getState().dismissDateReimportNotice("ds1");
    await app.persistenceService.whenIdle();

    app.noRowWrites();
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    expect((await app.db.datasets.get("ds1"))?.metadata?.dateReimportNoticeDismissed).toBe(true);
  });

  it("selecting another dataset writes no rows and no dataset records", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 100)], active: "ds1" });
    // ds2 wasn't active, so its rows are still on disk: selecting reads them, writes nothing back.
    expect(app.useDatasetStore.getState().datasets[1].rowsPending).toBeDefined();
    app.useDatasetStore.getState().selectDataset(app.useDatasetStore.getState().datasets[1]);
    await app.useDatasetStore.getState().loadRows("ds2");
    await app.persistenceService.whenIdle();

    expect(app.useDatasetStore.getState().activeDataset?.data).toHaveLength(100);
    app.noRowWrites();
    expect(app.spies.metaPut).not.toHaveBeenCalled();
    expect((await app.db.uiState.get("activeDatasetId"))?.value).toBe("ds2");
  });

  it("creating a chart writes that chart only, without rows", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100)], charts: [chart("c1", "ds1")], active: "ds1" });
    app.useChartStore.getState().createChart(chart("c2", "ds1"));
    await app.persistenceService.whenIdle();

    app.noRowWrites();
    expect(app.spies.metaPut).not.toHaveBeenCalled();
    expect(app.spies.chartClear).not.toHaveBeenCalled();
    expect(app.spies.chartPut).toHaveBeenCalledTimes(1);
    expect((app.spies.chartPut.mock.calls[0][0] as ChartConfig[]).map((c) => c.id)).toEqual(["c2"]);
    expect(await app.db.charts.get("c2")).not.toHaveProperty("data");
  });

  it("deleting one of three charts deletes that record and rewrites nothing else", async () => {
    app = await setup({
      datasets: [makeDataset("ds1", 100)],
      charts: [chart("c1", "ds1"), chart("c2", "ds1"), chart("c3", "ds1")],
      active: "ds1",
    });
    app.useChartStore.getState().deleteChart("c2");
    await app.persistenceService.whenIdle();

    app.noRowWrites();
    expect(app.spies.chartClear).not.toHaveBeenCalled();
    expect(app.spies.chartPut).not.toHaveBeenCalled();
    expect(app.spies.chartDelete).toHaveBeenCalledWith(["c2"]);
    expect((await app.db.charts.toArray()).map((c) => c.id).sort()).toEqual(["c1", "c3"]);
  });

  it("adding a filter writes no rows and no dataset records", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100)], active: "ds1" });
    app.useFilterStore.getState().setActiveFilters({ categoricalFilters: { Region: ["North"] }, dateRangeFilters: {} });
    await app.persistenceService.whenIdle();

    app.noRowWrites();
    expect(app.spies.metaPut).not.toHaveBeenCalled();
    expect((await app.db.filters.get("ds1"))?.state.categoricalFilters).toEqual({ Region: ["North"] });
  });

  it("a calculated column rewrites that dataset's rows once, and no other dataset's", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 100)], active: "ds1" });
    app.useDatasetStore.getState().addCalculatedField("Double", "[Sales] * 2");
    await app.persistenceService.whenIdle();

    expect(app.rowWrites()).toEqual(["ds1"]); // 100 rows = one chunk
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    const chunk = await app.db.datasetRows.get(["ds1", 0]);
    expect(chunk?.rows[3]).toMatchObject({ Sales: 30, Double: 60 });
  });

  it("the day/month toggle rewrites that dataset's rows once", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100, { withDates: true }), makeDataset("ds2", 100)], active: "ds1" });
    app.useDatasetStore.getState().setDateDayFirst("Day", true);
    await app.persistenceService.whenIdle();

    expect(app.rowWrites()).toEqual(["ds1"]);
    const chunk = await app.db.datasetRows.get(["ds1", 0]);
    expect(chunk?.rows[2].Day).toBe("2024-03-06");
    expect(chunk?.dateSourceValues?.Day[2]).toBe("06/03/2024");
    expect((await app.db.datasets.get("ds1"))?.metadata?.columns.find((c) => c.name === "Day")?.dayFirst).toBe(true);
  });

  it("two quick toggles are written once, with the final state", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100, { withDates: true })], active: "ds1" });
    app.useDatasetStore.getState().setDateDayFirst("Day", true);
    app.useDatasetStore.getState().setDateDayFirst("Day", false);
    await app.persistenceService.whenIdle();

    expect(app.rowWrites()).toEqual(["ds1"]);
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    expect((await app.db.datasetRows.get(["ds1", 0]))?.rows[2].Day).toBe("2024-06-03");
    expect((await app.db.datasets.get("ds1"))?.metadata?.columns.find((c) => c.name === "Day")?.dayFirst).toBe(false);
  });

  it("a rename while a row save is waiting is written with that save, not before it", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100, { withDates: true })], active: "ds1" });
    app.useDatasetStore.getState().setDateDayFirst("Day", true);
    app.useDatasetStore.getState().renameDataset("ds1", "Renamed");
    // Nothing reaches the metadata table before the rows: a reload now must still load the
    // old version whole (old name, old rows, old day/month order).
    expect(app.spies.metaPut).not.toHaveBeenCalled();
    await app.persistenceService.whenIdle();

    expect(app.rowWrites()).toEqual(["ds1"]);
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    const stored = await app.db.datasets.get("ds1");
    expect(stored?.name).toBe("Renamed");
    expect(stored?.metadata?.columns.find((c) => c.name === "Day")?.dayFirst).toBe(true);
  });

  it("deleting a dataset removes its record and all its row chunks", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 45_000), makeDataset("ds2", 100)], active: "ds2" });
    expect(await app.db.datasetRows.where("datasetId").equals("ds1").count()).toBe(3);
    app.useDatasetStore.getState().deleteDataset("ds1");
    await app.persistenceService.whenIdle();

    app.noRowWrites();
    expect(await app.db.datasets.get("ds1")).toBeUndefined();
    expect(await app.db.datasetRows.where("datasetId").equals("ds1").count()).toBe(0);
    expect(await app.db.datasetRows.where("datasetId").equals("ds2").count()).toBe(1);
  });
});

describe("row saves are chunked and all-or-nothing", () => {
  it("writes a large dataset in chunks and loads it back equal", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 45_000, { withDates: true })], active: "ds1" });
    app.useDatasetStore.getState().setDateDayFirst("Day", true);
    await app.persistenceService.whenIdle();
    expect(app.rowWrites()).toEqual(["ds1", "ds1", "ds1"]);
    const inMemory = app.useDatasetStore.getState().datasets[0];
    app.db.close();

    // Reload: fresh modules over the same database.
    app = await setup({ keepDb: true });
    const loaded = app.useDatasetStore.getState().datasets[0];
    expect(loaded.data).toEqual(inMemory.data);
    expect(loaded.dateSourceValues).toEqual(inMemory.dateSourceValues);
    expect(loaded.metadata).toEqual(inMemory.metadata);
    expect(loaded.rowsRevision).toBe(inMemory.rowsRevision);
  });

  it("a save that fails part-way leaves the previous version whole", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 45_000, { withDates: true })], active: "ds1" });
    const original = await readBack(app);

    let puts = 0;
    const table = app.db.datasetRows;
    const realPut = Object.getPrototypeOf(table).put as typeof table.put;
    app.spies.rowPut.mockImplementation((...args: Parameters<typeof table.put>) => {
      puts += 1;
      if (puts === 2) throw new Error("simulated crash during the second chunk");
      return realPut.apply(table, args);
    });
    app.useDatasetStore.getState().setDateDayFirst("Day", true);
    await app.persistenceService.whenIdle();

    expect(puts).toBe(2);
    expect(await readBack(app)).toEqual(original);
  });

  it("storage full shows what failed and that the work is not saved", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100)], active: "ds1" });
    app.spies.rowPut.mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    app.useDatasetStore.getState().addCalculatedField("Double", "[Sales] * 2");
    await app.persistenceService.whenIdle();

    const calls = app.toast.mock.calls.map(([t]) => t as { title: string; description: string; variant?: string });
    const full = calls.find((t) => /storage full/i.test(t.title));
    expect(full).toBeDefined();
    expect(full!.variant).toBe("destructive");
    expect(full!.description).toContain('Dataset "Dataset ds1"');
    expect(full!.description).toMatch(/not saved/);
    expect(full!.description).toMatch(/delete datasets or charts/i);
    // The old rows are still on disk, and the next change retries the row save.
    expect((await app.db.datasetRows.get(["ds1", 0]))?.rows[0]).not.toHaveProperty("Double");
    app.spies.rowPut.mockRestore();
    app.useDatasetStore.getState().renameDataset("ds1", "Retry");
    await app.persistenceService.whenIdle();
    expect((await app.db.datasetRows.get(["ds1", 0]))?.rows[0]).toHaveProperty("Double");
  });
});

/** The dataset exactly as IndexedDB holds it: metadata record + chunks in order. */
async function readBack(a: App) {
  const meta = await a.db.datasets.get("ds1");
  const chunks = await a.db.datasetRows.where("datasetId").equals("ds1").sortBy("index");
  return { meta, chunks };
}

describe("datasets left on disk at startup (rowsPending)", () => {
  it("only the active dataset's rows are read; the others keep their stored row count", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 45_000)], active: "ds1" });
    const [ds1, ds2] = app.useDatasetStore.getState().datasets;
    expect(ds1.data).toHaveLength(100);
    expect(ds1.rowsPending).toBeUndefined();
    expect(ds2.data).toHaveLength(0);
    expect(ds2.rowsPending).toEqual({ rowCount: 45_000, chunkCount: 3 });
  });

  it("renaming an unloaded dataset writes its metadata with the stored counts, and its rows survive a reload", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 45_000)], active: "ds1" });
    app.useDatasetStore.getState().renameDataset("ds2", "Renamed");
    await app.persistenceService.whenIdle();
    app.noRowWrites();
    expect(app.spies.metaPut).toHaveBeenCalledTimes(1);
    const record = await app.db.datasets.get("ds2");
    expect(record).toMatchObject({ name: "Renamed", rowCount: 45_000, chunkCount: 3 });
    expect(record).not.toHaveProperty("rowsPending");
    app.db.close();

    app = await setup({ keepDb: true });
    const loaded = await app.useDatasetStore.getState().loadRows("ds2");
    expect(loaded?.name).toBe("Renamed");
    expect(loaded?.data).toEqual(makeDataset("ds2", 45_000).data);
  });

  it("deleting an unloaded dataset removes its metadata and every chunk", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 45_000)], active: "ds1" });
    app.useDatasetStore.getState().deleteDataset("ds2");
    await app.persistenceService.whenIdle();
    expect(await app.db.datasets.get("ds2")).toBeUndefined();
    expect(await app.db.datasetRows.where("datasetId").equals("ds2").count()).toBe(0);
    expect(await app.db.datasetRows.where("datasetId").equals("ds1").count()).toBe(1);
  });

  it("a rename made while the rows load is kept", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 45_000)], active: "ds1" });
    const load = app.useDatasetStore.getState().loadRows("ds2");
    app.useDatasetStore.getState().renameDataset("ds2", "Renamed meanwhile");
    const loaded = await load;
    await app.persistenceService.whenIdle();
    expect(loaded?.name).toBe("Renamed meanwhile");
    expect(app.useDatasetStore.getState().datasets[1].name).toBe("Renamed meanwhile");
    app.noRowWrites();
    expect((await app.db.datasets.get("ds2"))?.name).toBe("Renamed meanwhile");
  });

  it("deleting the active dataset moves to an unloaded one only after its rows are in", async () => {
    app = await setup({ datasets: [makeDataset("ds1", 100), makeDataset("ds2", 300)], active: "ds1" });
    app.useDatasetStore.getState().deleteDataset("ds1");
    expect(app.useDatasetStore.getState().activeDataset).toBeNull();
    await app.useDatasetStore.getState().loadRows("ds2");
    expect(app.useDatasetStore.getState().activeDataset?.id).toBe("ds2");
    expect(app.useDatasetStore.getState().activeDataset?.data).toHaveLength(300);
  });
});
