import { test, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { ChartConfig, Dataset, DataRow } from "@/shared/types";

// Drives the real stores and persistenceService over fake-indexeddb with a 1M × 8 dataset
// and records, per action: time until every IndexedDB write is done, and the longest gap in
// a 1 ms heartbeat while saving (the longest main-thread block). Node + fake-indexeddb, not
// a browser: absolute numbers differ, but the structured-clone work is the same shape.
//
// Also runs against the pre-4c.1 code (one record per dataset with all rows, charts with
// rows) when the database module has no `datasetRows` table, for before/after numbers.

vi.mock("@/shared/hooks/use-toast", () => ({ toast: () => {} }));

const N = Number(process.env.BENCH_ROWS ?? 1_000_000);
const COUNTRIES = ["United Kingdom", "France", "Germany", "EIRE", "Spain", "Netherlands"];

function makeDataset(): Dataset {
  const data: DataRow[] = new Array(N);
  const daySource: string[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const d = (i % 12) + 1;
    daySource[i] = `0${(i % 9) + 1}/${String(d).padStart(2, "0")}/2010`;
    data[i] = {
      Invoice: String(489434 + (i >> 3)),
      StockCode: "8" + (5000 + (i % 4000)),
      Description: "WHITE HANGING HEART T-LIGHT HOLDER " + (i % 500),
      Quantity: (i % 24) + 1,
      InvoiceDate: `2010-${String(d).padStart(2, "0")}-0${(i % 9) + 1}`,
      Price: Math.round((i % 1000) * 1.37) / 100,
      "Customer ID": i % 7 === 0 ? null : 12000 + (i % 5000),
      Country: COUNTRIES[i % COUNTRIES.length],
    };
  }
  const columns = Object.keys(data[0]);
  const types: Record<string, "numeric" | "categorical" | "date"> = {
    Invoice: "categorical", StockCode: "categorical", Description: "categorical", Quantity: "numeric",
    InvoiceDate: "date", Price: "numeric", "Customer ID": "numeric", Country: "categorical",
  };
  return {
    id: "retail",
    name: "retail",
    data,
    columns,
    columnTypes: types,
    dateSourceValues: { InvoiceDate: daySource },
    version: 1,
    lastUpdated: 0,
    metadata: {
      datasetId: "retail", name: "retail", createdAt: 0, updatedAt: 0, rowCount: N, columnCount: columns.length,
      originalFileName: "retail.csv", originalFileType: "csv", parsingStatistics: { processingTimeMs: 0 }, version: 1,
      dateParserVersion: 2,
      columns: columns.map((name) => ({
        id: name, name, displayName: name, originalHeader: name, inferredDataType: types[name],
        nullableStatus: false, uniqueValueCount: 0, missingValueCount: 0, categoryCardinality: {},
        role: types[name] === "numeric" ? "measure" as const : types[name] === "date" ? "date" as const : "dimension" as const,
        allIntegerValues: name === "Quantity",
        ...(name === "InvoiceDate" ? { dayFirst: false, dayFirstSource: "data" as const } : {}),
      })),
    },
  };
}

/** Longest gap between 1 ms heartbeat ticks while `run` is in progress. */
async function withHeartbeat<T>(run: () => Promise<T>): Promise<{ result: T; longestBlockMs: number }> {
  let last = performance.now();
  let longest = 0;
  const iv = setInterval(() => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
  }, 1);
  try {
    const result = await run();
    longest = Math.max(longest, performance.now() - last);
    return { result, longestBlockMs: longest };
  } finally {
    clearInterval(iv);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("persistence bench", async () => {
  const dbModule = await import("@/shared/lib/db");
  const db = dbModule.db as unknown as import("dexie").default & Record<string, import("dexie").Table>;
  const split = "datasetRows" in db;
  const layout = split ? "split (4c.1)" : "legacy (before 4c.1)";

  // Every transaction's completion time, to know when the last write of an action ended.
  const pending = new Set<Promise<unknown>>();
  let lastDone = 0;
  const realTransaction = db.transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
  (db as unknown as { transaction: unknown }).transaction = (...args: unknown[]) => {
    const p = realTransaction(...args);
    pending.add(p);
    p.finally(() => { pending.delete(p); lastDone = performance.now(); }).catch(() => {});
    return p;
  };

  // Seed the database as a previous session would have left it.
  const dataset = makeDataset();
  const charts: ChartConfig[] = ["c1", "c2", "c3"].map((id) => ({
    id, type: "bar", title: id, xAxis: "Country", yAxis: "Quantity", datasetId: "retail",
    ...(split ? {} : { data: dataset.data }),
  }));
  if (split) {
    const { seedDataset } = await import("@/test/fakeDb");
    await seedDataset(dataset);
  } else {
    await db.table("datasets").put(dataset);
  }
  await db.table("charts").bulkPut(charts);
  await db.table("uiState").put({ key: "activeDatasetId", value: "retail" });

  const { persistenceService } = await import("@/shared/services/persistenceService");
  const { useDatasetStore } = await import("@/store/datasetStore");
  const { useChartStore } = await import("@/store/chartStore");
  const { useFilterStore } = await import("@/store/filterStore");
  const service = persistenceService as unknown as { flush?: () => void; whenIdle?: () => Promise<void> };

  const results: Record<string, { totalMs: number; longestBlockMs: number; actionMs?: number }> = {};

  // hydrate() replaces the stores' contents; clearing them first would be seen (correctly)
  // as deleting the dataset.
  async function reload(label: string) {
    const t0 = performance.now();
    const { longestBlockMs } = await withHeartbeat(() => persistenceService.hydrate());
    results[label] = { totalMs: performance.now() - t0, longestBlockMs };
  }

  /**
   * Runs `action`, then waits for its writes. Pre-4c.1 debounces charts by 300 ms with no
   * way to flush, so that wait is subtracted; 4c.1 is flushed right away.
   */
  async function measure(label: string, action: () => void, legacyDebounceMs = 0) {
    const t0 = performance.now();
    action();
    const actionMs = performance.now() - t0;
    const tSave = performance.now();
    const { longestBlockMs } = await withHeartbeat(async () => {
      if (service.flush) service.flush();
      else await sleep(legacyDebounceMs + 50);
      if (service.whenIdle) await service.whenIdle();
      while (pending.size > 0) await Promise.allSettled([...pending]);
    });
    // 4c.1: whenIdle() resolved when the last write finished. Before: the last transaction's
    // end, minus the debounce wait.
    const totalMs = service.whenIdle ? performance.now() - tSave : Math.max(0, lastDone - tSave - legacyDebounceMs);
    results[label] = { actionMs, totalMs, longestBlockMs };
    console.log(label, results[label], `heap ${(process.memoryUsage().heapUsed / 1e9).toFixed(2)} GB`);
  }

  await reload("reload (before actions)");
  persistenceService.subscribeToStoreUpdates();
  console.log(layout, "reload", results["reload (before actions)"]);

  await measure("rename", () => useDatasetStore.getState().renameDataset("retail", "retail 2"));
  await measure("type override", () => useDatasetStore.getState().setColumnTypeOverride("Customer ID", "categorical"));
  await measure("create chart", () => useChartStore.getState().createChart({
    id: "c4", type: "bar", title: "c4", xAxis: "Country", yAxis: "Price", datasetId: "retail",
    ...(split ? {} : { data: useFilterStore.getState().filteredData }),
  } as ChartConfig), 300);
  await measure("delete chart (of 4)", () => useChartStore.getState().deleteChart("c2"), 300);
  await measure("calculated column", () => useDatasetStore.getState().addCalculatedField("Total", "[Quantity] * [Price]"));
  await measure("date toggle", () => useDatasetStore.getState().setDateDayFirst("InvoiceDate", true));

  await reload("reload (after actions)");
  const loaded = useDatasetStore.getState().datasets[0];
  if (!loaded || loaded.data.length !== N || !("Total" in loaded.data[0])) {
    throw new Error(`reload lost data: ${loaded?.data.length} rows`);
  }

  mkdirSync("test-results/bench", { recursive: true });
  const out = `test-results/bench/persistence${split ? "" : ".legacy"}.json`;
  writeFileSync(out, JSON.stringify({ layout, rows: N, results }, null, 2));
  console.table(results);
});
