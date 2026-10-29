import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Startup and day/month-toggle timing in a real browser (see ../playwright.startup.config.ts).
 *
 * A 50-row CSV is imported through the UI so the stored records are exactly what the app
 * writes; bigger datasets are clones of that record whose row chunks are generated inside
 * the page (20,000 rows at a time) and written with the raw IndexedDB API. Each scenario
 * then reloads and reads the app's own User Timing measures (src/shared/lib/perfMarks.ts)
 * plus the longest `longtask`.
 *
 * Scenarios: -g small | -g "1M inactive" | -g "1M active" | -g "toggle 300k" | -g "toggle 600k"
 */

const LABEL = process.env.BENCH_LABEL || "run";
const RELOADS = Number(process.env.BENCH_RELOADS || 3);
const CHUNK = 20_000;

const header = "id,order_date,region,category,amount,qty,status,note";
const TEMPLATE_CSV = [
  header,
  ...Array.from({ length: 50 }, (_, i) => {
    const day = (i % 12) + 1;
    const month = ((i * 5) % 12) + 1;
    return `${i + 1},${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/2024,R${i % 4},C${i % 7},${(i * 13.37).toFixed(2)},${i % 9},${i % 2 ? "open" : "closed"},note ${i}`;
  }),
].join("\n");

function out(name: string, data: unknown) {
  // Not under test-results/: Playwright empties that folder at the start of every run.
  mkdirSync("bench-results", { recursive: true });
  writeFileSync(`bench-results/${LABEL}-${name}.json`, JSON.stringify(data, null, 2));
  console.log(name, JSON.stringify(data, null, 2));
}

async function observeLongTasks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: { start: number; duration: number }[] };
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // no longtask support
    }
  });
}

async function freshWorkspace(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("bench-seeded")) return;
    sessionStorage.setItem("bench-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true }, version: 1 }));
    localStorage.setItem("datavista-visited", "true");
  });
  await observeLongTasks(page);
  // Each test gets a new browser context, so IndexedDB starts empty.
  await page.goto("./");
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles({ name: "template.csv", mimeType: "text/csv", buffer: Buffer.from(TEMPLATE_CSV) });
  await expect(page.getByTestId("sidebar-nav-charts")).toBeVisible({ timeout: 60_000 });
  // Wait until the template's rows are on disk.
  await expect.poll(() => storedCount(page), { timeout: 30_000 }).toBe(1);
}

function storedCount(page: Page) {
  return page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open("DataVistaDatabase");
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(["datasets", "datasetRows"], "readonly");
      const c = tx.objectStore("datasets").getAll();
      c.onsuccess = () => {
        const rows = tx.objectStore("datasetRows").count();
        rows.onsuccess = () => { db.close(); res(rows.result > 0 ? c.result.length : 0); };
      };
    };
  }));
}

/** Clones the template dataset as `id` with `rowCount` generated rows (and optional calculated field). */
async function seedClone(page: Page, id: string, name: string, rowCount: number, calculated = false) {
  await page.evaluate(async ({ id, name, rowCount, calculated, CHUNK }) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("DataVistaDatabase");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    const all = await req(db.transaction("datasets").objectStore("datasets").getAll()) as Record<string, unknown>[];
    const template = all.find((d) => d.name === "template")!;
    const chunkCount = Math.ceil(rowCount / CHUNK);
    for (let c = 0; c < chunkCount; c++) {
      const rows: Record<string, unknown>[] = [];
      const src: (string | null)[] = [];
      const n = Math.min(CHUNK, rowCount - c * CHUNK);
      for (let j = 0; j < n; j++) {
        const i = c * CHUNK + j;
        const day = (i % 12) + 1;
        const month = ((i * 5) % 12) + 1;
        const dd = String(day).padStart(2, "0");
        const mm = String(month).padStart(2, "0");
        rows.push({ id: i + 1, order_date: `2024-${mm}-${dd}`, region: `R${i % 4}`, category: `C${i % 7}`, amount: Math.round(i * 13.37) / 100, qty: i % 9, status: i % 2 ? "open" : "closed", note: `note ${i % 1000}` });
        src.push(`${dd}/${mm}/2024`);
      }
      const tx = db.transaction("datasetRows", "readwrite");
      tx.objectStore("datasetRows").put({ datasetId: id, index: c, rows, dateSourceValues: { order_date: src } });
      await done(tx);
    }
    const record = {
      ...template,
      id,
      name,
      rowCount,
      chunkCount,
      dateSourceColumns: ["order_date"],
      calculatedFields: calculated ? [{ name: "amount_x2", expression: "[amount] * 2" }] : [],
    };
    const tx = db.transaction("datasets", "readwrite");
    tx.objectStore("datasets").put(record);
    await done(tx);
    db.close();
  }, { id, name, rowCount, calculated, CHUNK });
}

async function setActive(page: Page, id: string) {
  await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open("DataVistaDatabase"); r.onsuccess = () => res(r.result); });
    const tx = db.transaction("uiState", "readwrite");
    tx.objectStore("uiState").put({ key: "activeDatasetId", value: id });
    tx.objectStore("uiState").put({ key: "activeView", value: "overview" });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  }, id);
}

async function measureReload(page: Page) {
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName("dv:startup:first-render").length > 0, null, { timeout: 5 * 60_000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const measures = Object.fromEntries(performance.getEntriesByType("measure").filter((m) => m.name.startsWith("dv:startup")).map((m) => [m.name.replace("dv:startup:", ""), Math.round(m.duration)]));
    const firstRender = performance.getEntriesByName("dv:startup:first-render")[0].startTime;
    const tasks = (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks.filter((t) => t.start < firstRender + 500);
    return {
      readyMs: Math.round(firstRender),
      ...measures,
      longestBlockMs: Math.round(Math.max(0, ...tasks.map((t) => t.duration))),
      heapMB: Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6),
    };
  });
}

async function runReloads(page: Page, name: string) {
  const runs = [];
  for (let i = 0; i < RELOADS; i++) runs.push(await measureReload(page));
  out(name, runs);
}

test("small: only small datasets stored", async ({ page }) => {
  await freshWorkspace(page);
  await seedClone(page, "small-a", "small a", 5_000);
  await seedClone(page, "small-b", "small b", 5_000);
  await runReloads(page, "small");
});

test("1M inactive: a 1M-row dataset stored but not active", async ({ page }) => {
  await freshWorkspace(page);
  await seedClone(page, "small-a", "small a", 5_000);
  await seedClone(page, "big", "big 1M", 1_000_000);
  await setActive(page, "small-a");
  await runReloads(page, "1M-inactive");
});

test("1M active: a 1M-row dataset active", async ({ page }) => {
  await freshWorkspace(page);
  await seedClone(page, "small-a", "small a", 5_000);
  await seedClone(page, "big", "big 1M", 1_000_000);
  await setActive(page, "big");
  await runReloads(page, "1M-active");
});

for (const rows of [300_000, 600_000]) {
  test(`toggle ${rows / 1000}k: day/month toggle with a calculated column`, async ({ page }) => {
    const t0 = Date.now();
    const step = (what: string) => console.log(`[toggle ${rows}] ${((Date.now() - t0) / 1000).toFixed(1)}s ${what}`);
    await freshWorkspace(page);
    step("template imported");
    await seedClone(page, "toggle", "toggle set", rows, true);
    step("seeded");
    await setActive(page, "toggle");
    await page.reload();
    await page.waitForFunction(() => performance.getEntriesByName("dv:startup:first-render").length > 0, null, { timeout: 5 * 60_000 });
    step("reloaded");
    await page.getByTestId("sidebar-nav-data").click();
    step("data view");
    const table = page.getByTestId("data-table-container");
    // The column's "date" type badge opens the day/month popover.
    await table.locator("th").filter({ hasText: "order_date" }).getByText(/^date/).first().click();
    const popover = page.getByTestId("date-column-popover-order_date");
    const button = popover.getByRole("button", { name: /Read as (month\/day|day\/month)/ });
    await button.waitFor();
    const clickAt = await page.evaluate(() => performance.now());
    step("popover open");
    await button.click();
    step("clicked");
    await page.waitForFunction(() => performance.getEntriesByName("dv:rows-save", "measure").length > 0, null, { timeout: 10 * 60_000 });
    const result = await page.evaluate((clickAt) => {
      const toggle = performance.getEntriesByName("dv:date-toggle", "measure")[0];
      const save = performance.getEntriesByName("dv:rows-save", "measure")[0];
      const tasks = (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks.filter((t) => t.start >= clickAt - 50);
      const blocks = tasks.map((t) => Math.round(t.duration)).sort((a, b) => b - a);
      return {
        toggleSyncMs: Math.round(toggle.duration),
        saveMs: Math.round(save.duration),
        clickToSavedMs: Math.round(save.startTime + save.duration - clickAt),
        longestBlockMs: blocks[0] ?? 0,
        longestBlocksMs: blocks.slice(0, 5),
        heapMB: Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6),
      };
    }, clickAt);
    out(`toggle-${rows / 1000}k`, result);
  });
}

test("select 1M: picking a 1M-row dataset left on disk at startup", async ({ page }) => {
  await freshWorkspace(page);
  await seedClone(page, "small-a", "small a", 5_000);
  await seedClone(page, "big", "big 1M", 1_000_000);
  await setActive(page, "small-a");
  await page.reload();
  await page.waitForFunction(() => performance.getEntriesByName("dv:startup:first-render").length > 0, null, { timeout: 5 * 60_000 });
  const entry = page.getByTestId("sidebar").getByRole("button", { name: /big 1M/ });
  // The count shows before the rows are read (stored rowCount).
  await expect(entry).toContainText("1,000,000 rows");
  const clickAt = await page.evaluate(() => performance.now());
  await entry.click();
  const progress = page.getByTestId("loading-progress");
  await expect(progress).toContainText("big 1M");
  const sawRowCount = /of 1,000,000 rows/.test((await progress.textContent()) || "");
  await expect(progress).toHaveCount(0, { timeout: 5 * 60_000 });
  const doneAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(500);
  const result = await page.evaluate(([clickAt, doneAt]) => {
    const tasks = (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks.filter((t) => t.start >= clickAt - 50);
    const blocks = tasks.map((t) => Math.round(t.duration)).sort((a, b) => b - a);
    return { clickToUsableMs: Math.round(doneAt - clickAt), longestBlockMs: blocks[0] ?? 0, longestBlocksMs: blocks.slice(0, 5) };
  }, [clickAt, doneAt]);
  out("select-1M", { ...result, progressShowedRowCount: sawRowCount });
});
