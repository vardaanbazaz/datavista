import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

/**
 * View-switch timing in a real browser (see ../playwright.startup.config.ts; build first).
 *
 * For each dataset the app is loaded with that dataset active, then every sidebar view is
 * opened in turn (cold: first visit, lazy chunks included), then each again (warm), then
 * "Back to Filters" from Pivot. Per switch:
 *   - ttiMs: click until the view's marker is in the DOM and the main thread has had no long
 *     task for 500 ms (end of the last long task that started after the click);
 *   - longestBlockMs: the longest `longtask` after the click;
 *   - cls: sum of `layout-shift` values after the click (no recent input).
 *
 * Scenarios: -g playstore (BENCH_PLAYSTORE, default test-data-local/googleplaystore.csv)
 *            -g retail    (BENCH_RETAIL: a CSV of one retail sheet, ~525k rows)
 *            -g 1M        (1,000,000 generated rows, seeded straight into IndexedDB)
 */

const LABEL = process.env.BENCH_LABEL || "run";
const CHUNK = 20_000;

const VIEWS = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"] as const;
type View = (typeof VIEWS)[number];

const MARKER: Record<View, string> = {
  overview: '[data-testid="overview-bento"]',
  upload: '[data-tour="view-upload"]',
  filters: '[data-testid="filter-panel"]',
  charts: '[data-testid="chart-builder"]',
  data: '[data-testid="data-table-container"]',
  pivot: '[data-testid="pivot-settings"]',
  stats: '[data-testid="stats-column-picker"]',
  "window-builder": '[data-testid="window-builder-form"]',
  export: '[data-tour="view-export"]',
};

function out(name: string, data: unknown) {
  mkdirSync("bench-results", { recursive: true });
  writeFileSync(`bench-results/${LABEL}-${name}.json`, JSON.stringify(data, null, 2));
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: { start: number; end: number }[]; __ls: { t: number; v: number; src: string[] }[] };
    w.__lt = [];
    w.__ls = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push({ start: e.startTime, end: e.startTime + e.duration });
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        type Shift = { startTime: number; value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] };
        const describe = (n?: Node | null) => {
          const el = n instanceof Element ? n : n?.parentElement;
          if (!el) return "?";
          const tid = el.closest("[data-testid]")?.getAttribute("data-testid");
          return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${tid ? " in " + tid : ""}`;
        };
        for (const e of list.getEntries() as unknown as Shift[]) {
          if (!e.hadRecentInput) w.__ls.push({ t: e.startTime, v: e.value, src: (e.sources ?? []).map((s) => describe(s.node)) });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // unsupported
    }
  });
}

async function freshWorkspace(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("bench-seeded")) return;
    sessionStorage.setItem("bench-seeded", "1");
    localStorage.clear();
    localStorage.setItem(
      "datavista-ui-storage",
      JSON.stringify({ state: { hasSeenTour: true, hasCompletedSetup: true }, version: 3 })
    );
    localStorage.setItem("datavista-visited", "true");
  });
  await instrument(page);
  await page.goto("./");
}

async function importFile(page: Page, path: string) {
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles(path);
  const deadline = Date.now() + 10 * 60_000;
  // Answer the import summary if it asks (parse problems: keep the rows).
  while (Date.now() < deadline) {
    if (await page.getByTestId("issues-keep").isVisible().catch(() => false)) await page.getByTestId("issues-keep").click();
    if ((await page.getByTestId("import-dialog").count()) === 0 && (await page.locator(MARKER.overview).count()) > 0) break;
    await page.waitForTimeout(250);
  }
  await expect(page.locator(MARKER.overview)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
}

async function seedGenerated(page: Page, rowCount: number) {
  const header = "id,order_date,region,category,amount,qty,status,note";
  const csv = [header, ...Array.from({ length: 50 }, (_, i) => `${i + 1},2024-0${(i % 9) + 1}-1${i % 9},R${i % 4},C${i % 7},${(i * 13.37).toFixed(2)},${i % 9},${i % 2 ? "open" : "closed"},note ${i}`)].join("\n");
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles({ name: "template.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator(MARKER.overview)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.evaluate(async ({ rowCount, CHUNK }) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("DataVistaDatabase");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    const all = (await req(db.transaction("datasets").objectStore("datasets").getAll())) as Record<string, unknown>[];
    const template = all.find((d) => d.name === "template")!;
    const id = "gen-1m";
    const chunkCount = Math.ceil(rowCount / CHUNK);
    for (let c = 0; c < chunkCount; c++) {
      const rows: Record<string, unknown>[] = [];
      const n = Math.min(CHUNK, rowCount - c * CHUNK);
      for (let j = 0; j < n; j++) {
        const i = c * CHUNK + j;
        const mm = String(((i * 5) % 12) + 1).padStart(2, "0");
        const dd = String((i % 28) + 1).padStart(2, "0");
        rows.push({ id: i + 1, order_date: `2024-${mm}-${dd}`, region: `R${i % 4}`, category: `C${i % 7}`, amount: Math.round(i * 13.37) / 100, qty: i % 9, status: i % 2 ? "open" : "closed", note: `note ${i % 1000}` });
      }
      const tx = db.transaction("datasetRows", "readwrite");
      tx.objectStore("datasetRows").put({ datasetId: id, index: c, rows });
      await done(tx);
    }
    const tx = db.transaction(["datasets", "uiState"], "readwrite");
    tx.objectStore("datasets").put({ ...template, id, name: "generated 1M", rowCount, chunkCount, dateSourceColumns: [] });
    tx.objectStore("uiState").put({ key: "activeDatasetId", value: id });
    tx.objectStore("uiState").put({ key: "activeView", value: "overview" });
    await done(tx);
    db.close();
  }, { rowCount, CHUNK });
  await page.reload();
  await expect(page.locator(MARKER.overview)).toBeVisible({ timeout: 5 * 60_000 });
  await expect(page.getByTestId("kpi-rows")).toContainText("1,000,000", { timeout: 60_000 });
  await page.waitForTimeout(3000);
}

/** Clicks `selector` and measures the switch until `marker` is present and the main thread is quiet. */
async function measure(page: Page, selector: string, marker: string) {
  return page.evaluate(async ({ selector, marker }) => {
    const w = window as unknown as { __lt: { start: number; end: number }[]; __ls: { t: number; v: number; src: string[] }[] };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const loading = () => !!document.querySelector('[data-testid="loading-state"],[data-testid="loading-progress"],[data-testid="view-skeleton"]');
    const t0 = performance.now();
    (document.querySelector(selector) as HTMLElement).click();
    let markerAt = 0;
    const limit = t0 + 180_000;
    while (performance.now() < limit) {
      await sleep(16);
      if (!markerAt && document.querySelector(marker) && !loading()) markerAt = performance.now();
      if (!markerAt) continue;
      const lastEnd = Math.max(0, ...w.__lt.filter((t) => t.start >= t0).map((t) => t.end));
      if (performance.now() - Math.max(lastEnd, markerAt) > 500) break;
    }
    const tasks = w.__lt.filter((t) => t.start >= t0);
    const lastEnd = Math.max(0, ...tasks.map((t) => t.end));
    return {
      ttiMs: Math.round(Math.max(markerAt, lastEnd) - t0),
      longestBlockMs: Math.round(Math.max(0, ...tasks.map((t) => t.end - t.start))),
      cls: Number(w.__ls.filter((s) => s.t >= t0).reduce((a, s) => a + s.v, 0).toFixed(3)),
      shifted: [...new Set(w.__ls.filter((s) => s.t >= t0).flatMap((s) => s.src))],
      domNodes: document.getElementsByTagName("*").length,
    };
  }, { selector, marker });
}

async function runViews(page: Page, name: string) {
  const result: Record<string, unknown> = {};
  for (const pass of ["cold", "warm"]) {
    for (const v of VIEWS) {
      // From Overview each time, so every switch has the same starting point.
      if (v !== "overview") await measure(page, '[data-testid="sidebar-nav-overview"]', MARKER.overview);
      else await measure(page, '[data-testid="sidebar-nav-upload"]', MARKER.upload);
      const r = await measure(page, `[data-testid="sidebar-nav-${v}"]`, MARKER[v]);
      result[`${pass}:${v}`] = r;
      console.log(`[${name}] ${pass} ${v}`, JSON.stringify(r));
    }
  }
  // Back to Filters (Pivot's header button).
  await measure(page, '[data-testid="sidebar-nav-pivot"]', MARKER.pivot);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("main button")].find((b) => b.textContent?.trim() === "Back to Filters") as HTMLElement;
    btn.setAttribute("data-bench", "back");
  });
  const back = await measure(page, '[data-bench="back"]', MARKER.filters);
  result["back-to-filters"] = back;
  console.log(`[${name}] back to filters`, JSON.stringify(back));
  out(`views-${name}`, result);
}

test("playstore: view switches at ~10k rows", async ({ page }) => {
  const file = process.env.BENCH_PLAYSTORE || "test-data-local/googleplaystore.csv";
  test.skip(!existsSync(file), `missing ${file}`);
  await freshWorkspace(page);
  await importFile(page, file);
  await runViews(page, "playstore");
});

/**
 * -g "pivot worst": Pivot with a saved config grouping rows by App (~9.7k groups), the case a
 * user who picked that column keeps hitting on every visit. Seeded through the persisted
 * `pivotConfig::<datasetId>` uiState entry, then the page is reloaded.
 */
test("playstore pivot worst case: rows by App", async ({ page }) => {
  const file = process.env.BENCH_PLAYSTORE || "test-data-local/googleplaystore.csv";
  test.skip(!existsSync(file), `missing ${file}`);
  await freshWorkspace(page);
  await importFile(page, file);
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("DataVistaDatabase");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const get = db.transaction("uiState").objectStore("uiState").get("activeDatasetId");
    const id = await new Promise<string>((res) => { get.onsuccess = () => res((get.result as { value: string }).value); });
    const tx = db.transaction("uiState", "readwrite");
    tx.objectStore("uiState").put({
      key: `pivotConfig::${id}`,
      value: {
        rowDimensions: ["App"],
        columnDimensions: [],
        valueFields: [{ column: "Rating", operator: "avg", displayName: "AVG of Rating" }],
        displayOptions: { showRowTotals: true, showColumnTotals: true, showGrandTotals: true },
      },
    });
    tx.objectStore("uiState").put({ key: "activeView", value: "overview" });
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  });
  await page.reload();
  await expect(page.locator(MARKER.overview)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const result: Record<string, unknown> = {};
  for (const pass of ["cold", "warm"]) {
    await measure(page, '[data-testid="sidebar-nav-overview"]', MARKER.overview);
    const r = await measure(page, '[data-testid="sidebar-nav-pivot"]', MARKER.pivot);
    const rows = await page.locator('[data-testid="pivot-scroll"] tbody tr').count();
    result[`${pass}:pivot`] = { ...r, renderedRows: rows };
    console.log(`[pivot-worst] ${pass}`, JSON.stringify(result[`${pass}:pivot`]));
  }
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("main button")].find((b) => b.textContent?.trim() === "Back to Filters") as HTMLElement;
    btn.setAttribute("data-bench", "back");
  });
  result["back-to-filters"] = await measure(page, '[data-bench="back"]', MARKER.filters);
  console.log("[pivot-worst] back to filters", JSON.stringify(result["back-to-filters"]));
  out("pivot-worst", result);
});

test("retail: view switches at ~525k rows", async ({ page }) => {
  const file = process.env.BENCH_RETAIL || "";
  test.skip(!file || !existsSync(file), "set BENCH_RETAIL to a one-sheet retail CSV");
  await freshWorkspace(page);
  await importFile(page, file);
  await runViews(page, "retail");
});

test("1M: view switches at 1,000,000 generated rows", async ({ page }) => {
  await freshWorkspace(page);
  await seedGenerated(page, 1_000_000);
  await runViews(page, "1M");
});

/**
 * -g trace: a Chrome performance trace of opening Filters and Pivot on the Play Store file,
 * with Transparency (glass) on and off, summarised by trace event (self time, main thread).
 */
test("trace: Filters and Pivot on playstore, glass on/off", async ({ page, browser }) => {
  const file = process.env.BENCH_PLAYSTORE || "test-data-local/googleplaystore.csv";
  test.skip(!existsSync(file), `missing ${file}`);
  await freshWorkspace(page);
  await importFile(page, file);
  const summary: Record<string, unknown> = {};
  for (const transparency of [true, false]) {
    await page.evaluate((t) => {
      const raw = JSON.parse(localStorage.getItem("datavista-ui-storage") || "{}");
      raw.state = { ...raw.state, appearance: { ...(raw.state?.appearance ?? {}), transparency: t } };
      localStorage.setItem("datavista-ui-storage", JSON.stringify(raw));
    }, transparency);
    await page.reload();
    await expect(page.getByTestId("sidebar-nav-overview")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("sidebar-nav-overview").click();
    await expect(page.locator(MARKER.overview)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    for (const v of ["filters", "pivot"] as const) {
      await measure(page, '[data-testid="sidebar-nav-overview"]', MARKER.overview);
      await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] });
      const r = await measure(page, `[data-testid="sidebar-nav-${v}"]`, MARKER[v]);
      const buf = await browser.stopTracing();
      const events = (JSON.parse(buf.toString()).traceEvents ?? []) as { name: string; ph: string; dur?: number; tid: number; pid: number }[];
      // Main thread: the renderer thread with the most RunTask time.
      const byThread = new Map<string, number>();
      for (const e of events) if (e.name === "RunTask" && e.dur) byThread.set(`${e.pid}:${e.tid}`, (byThread.get(`${e.pid}:${e.tid}`) ?? 0) + e.dur);
      const main = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const totals: Record<string, number> = {};
      for (const e of events) {
        if (`${e.pid}:${e.tid}` !== main || !e.dur || e.ph !== "X") continue;
        if (["FunctionCall", "EvaluateScript", "TimerFire", "EventDispatch", "RunMicrotasks", "UpdateLayoutTree", "Layout", "Paint", "PrePaint", "Layerize", "Commit", "ParseHTML", "HitTest", "MinorGC", "MajorGC", "V8.GC_SCAVENGER", "IntersectionObserverController::computeIntersections", "UpdateLayer", "CompositeLayers"].includes(e.name)) {
          totals[e.name] = (totals[e.name] ?? 0) + e.dur / 1000;
        }
      }
      for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k]);
      summary[`${v}:glass-${transparency ? "on" : "off"}`] = { ...r, eventMs: totals };
      writeFileSync(`bench-results/${LABEL}-trace-${v}-glass-${transparency ? "on" : "off"}.json`, buf);
      console.log(v, transparency ? "glass on" : "glass off", JSON.stringify(summary[`${v}:glass-${transparency ? "on" : "off"}`]));
    }
  }
  out("trace-summary", summary);
});
