import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Big-file interaction timing on the production build (see ../playwright.startup.config.ts;
 * `npm run build` first). Fresh browser profile per run (Playwright's default context).
 *
 *   BENCH_BIGFILE=test-data-local/online_retail_II.xlsx  (default; sheet "Year 2009-2010", 525,461 rows)
 *   BENCH_BIGFILE=test-data-local/online_retail_II.csv   (both years, 1,067,371 rows)
 *
 * Records: sheet-picker time (XLSX), import time (file chosen / sheet picked → success toast),
 * peak main-thread JS heap (CDP, sampled every 500 ms; the import worker's heap is not
 * included), peak RSS of all browser processes, then per step the time until the view is up
 * and the main thread has been quiet for 500 ms, and the longest long task: Data Explorer
 * first render, scrolling the table top → bottom, Filters, Pivot, adding a KPI, and a reload
 * (rows read back from IndexedDB). Writes bench-results/<label>-bigfile-<file>.json.
 */

const FILE = process.env.BENCH_BIGFILE || "test-data-local/online_retail_II.xlsx";
const LABEL = process.env.BENCH_LABEL || "run";
const SHEET = process.env.BENCH_SHEET || "Year 2009-2010";

async function freshWorkspace(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("bench-seeded")) return;
    sessionStorage.setItem("bench-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true, hasCompletedSetup: true }, version: 3 }));
    localStorage.setItem("datavista-visited", "true");
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: { start: number; end: number }[] };
    w.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push({ start: e.startTime, end: e.startTime + e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // unsupported
    }
  });
  await page.goto("./");
}

/** Runs `act` in the page, then waits until `ready()` holds and no long task for 500 ms. */
async function measure(page: Page, act: string, ready: string, limitMs = 180_000) {
  return page.evaluate(async ({ act, ready, limitMs }) => {
    const w = window as unknown as { __lt: { start: number; end: number }[] };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const isReady = new Function(`return (${ready})`) as () => boolean;
    const t0 = performance.now();
    await (new Function(`return (async () => { ${act} })()`) as () => Promise<void>)();
    let readyAt = 0;
    while (performance.now() < t0 + limitMs) {
      await sleep(16);
      if (!readyAt && isReady()) readyAt = performance.now();
      if (!readyAt) continue;
      const lastEnd = Math.max(0, ...w.__lt.filter((t) => t.start >= t0).map((t) => t.end));
      if (performance.now() - Math.max(lastEnd, readyAt) > 500) break;
    }
    const tasks = w.__lt.filter((t) => t.start >= t0);
    const lastEnd = Math.max(0, ...tasks.map((t) => t.end));
    return {
      readyMs: readyAt ? Math.round(readyAt - t0) : null,
      quietMs: Math.round(Math.max(readyAt, lastEnd) - t0),
      longestBlockMs: Math.round(Math.max(0, ...tasks.map((t) => t.end - t.start))),
    };
  }, { act, ready, limitMs });
}

const visible = (testId: string) => `!!document.querySelector('[data-testid="${testId}"]') && !document.querySelector('[data-testid="view-skeleton"],[data-testid="loading-progress"]')`;
const click = (testId: string) => `document.querySelector('[data-testid="${testId}"]').click();`;

/** Peak main-thread heap and browser RSS while `run` is going. */
async function sampleMemory<T>(cdp: CDPSession, run: () => Promise<T>) {
  let heap = 0;
  let rss = 0;
  const timer = setInterval(async () => {
    try {
      const { metrics } = await cdp.send("Performance.getMetrics");
      heap = Math.max(heap, metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0);
      const kb = execSync("ps -eo rss,args", { encoding: "utf8" })
        .split("\n")
        .filter((l) => l.includes("ms-playwright"))
        .reduce((n, l) => n + (parseInt(l.trim(), 10) || 0), 0);
      rss = Math.max(rss, kb);
    } catch {
      // page gone or ps unavailable
    }
  }, 500);
  try {
    const value = await run();
    return { value, peakHeapMB: Math.round(heap / 1e6), peakBrowserRssMB: Math.round(rss / 1024) };
  } finally {
    clearInterval(timer);
  }
}

test("big file: import, views, KPI, reload", async ({ page }) => {
  test.skip(!existsSync(FILE), `missing ${FILE}`);
  const result: Record<string, unknown> = { file: FILE };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.name}: ${e.message}`));
  page.on("crash", () => errors.push("page crashed"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await freshWorkspace(page);
  await page.getByTestId("sidebar-nav-upload").click();

  const imported = await sampleMemory(cdp, async () => {
    const t0 = Date.now();
    await page.getByTestId("file-upload-input").setInputFiles(FILE);
    let pickedAt = t0;
    if (FILE.endsWith(".xlsx")) {
      await expect(page.getByTestId("sheet-picker")).toBeVisible({ timeout: 5 * 60_000 });
      result.sheetPickerMs = Date.now() - t0;
      result.sheets = await page.getByTestId("sheet-picker").locator("label").allInnerTexts();
      await page.getByRole("radio", { name: SHEET }).check();
      pickedAt = Date.now();
      await page.getByTestId("sheet-import").click();
    }
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      if (await page.getByTestId("issues-keep").isVisible().catch(() => false)) await page.getByTestId("issues-keep").click();
      if (await page.getByText(/Dataset uploaded successfully/).first().isVisible().catch(() => false)) break;
      await page.waitForTimeout(100);
    }
    const doneAt = Date.now();
    result.importMs = { fromFileChosen: doneAt - t0, fromSheetPicked: doneAt - pickedAt };
    result.toast = await page.getByText(/Dataset uploaded successfully/).first().textContent();
    // Let the debounced row save finish before measuring views.
    await page.waitForTimeout(8000);
  });
  result.importPeakHeapMB = imported.peakHeapMB;
  result.importPeakBrowserRssMB = imported.peakBrowserRssMB;
  result.rows = await page.getByTestId("kpi-rows").textContent();
  const longest = await page.evaluate(() => {
    const w = window as unknown as { __lt: { start: number; end: number }[] };
    return Math.round(Math.max(0, ...w.__lt.map((t) => t.end - t.start)));
  });
  result.importLongestBlockMs = longest;
  console.log("import", JSON.stringify(result));

  const steps: Record<string, unknown> = {};
  const step = async (name: string, act: string, ready: string) => {
    const r = await measure(page, act, ready);
    steps[name] = r;
    console.log(name, JSON.stringify(r));
  };

  await step("dataExplorerFirstRender", click("sidebar-nav-data"), `${visible("data-table-container")} && !!document.querySelector('[data-testid="data-table-container"] tbody tr')`);
  steps.misalignedNotice = await page.getByTestId("misaligned-notice").count();
  await step(
    "dataExplorerScroll",
    `const box = document.querySelector('[data-testid="data-table-container"] .scroll-container') || document.querySelector('.scroll-container');
     for (let i = 1; i <= 30; i++) { box.scrollTop = (box.scrollHeight - box.clientHeight) * i / 30; await new Promise((r) => requestAnimationFrame(() => r(null))); }`,
    "true"
  );
  await step("filtersOpen", click("sidebar-nav-filters"), visible("filter-panel"));
  await step("pivotOpen", click("sidebar-nav-pivot"), visible("pivot-settings"));
  await step("overview", click("sidebar-nav-overview"), visible("overview-bento"));
  await step("kpiBuilderOpen", click("overview-add-kpi"), visible("kpi-builder"));
  steps.kpiDefaults = {
    title: await page.locator("#kpi-title").inputValue(),
    aggregation: await page.locator("#aggregation").textContent(),
  };
  const kpiTitle = (steps.kpiDefaults as { title: string }).title;
  await step(
    "kpiSave",
    click("kpi-builder-save"),
    `!document.querySelector('[data-testid="kpi-builder"]') && [...document.querySelectorAll("main span")].some((s) => s.textContent === ${JSON.stringify(kpiTitle)})`
  );
  await page.waitForTimeout(3000);

  const t0 = Date.now();
  const reloaded = await sampleMemory(cdp, async () => {
    await page.reload();
    await expect(page.getByText(kpiTitle).first()).toBeVisible({ timeout: 5 * 60_000 });
    const r = await measure(page, "", "true");
    return { visibleMs: Date.now() - t0 - r.quietMs, quietMs: Date.now() - t0, longestBlockMs: r.longestBlockMs };
  });
  steps.reload = { ...reloaded.value, peakHeapMB: reloaded.peakHeapMB };
  const reloadLongest = await page.evaluate(() => {
    const w = window as unknown as { __lt: { start: number; end: number }[] };
    return Math.round(Math.max(0, ...w.__lt.map((t) => t.end - t.start)));
  });
  (steps.reload as Record<string, unknown>).longestBlockSinceLoadMs = reloadLongest;
  console.log("reload", JSON.stringify(steps.reload));

  result.steps = steps;
  result.heapAfterMB = Math.round(((await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0) / 1e6);
  result.pageErrors = errors;
  mkdirSync("bench-results", { recursive: true });
  writeFileSync(`bench-results/${LABEL}-bigfile-${FILE.split("/").pop()}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
});
