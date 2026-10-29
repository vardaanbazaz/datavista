import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { startFreshSessionWithoutTour, loadSampleData } from "../e2e/helpers";

// One file per run (BIGFILE=name, see scripts/bigfiles/run.mjs). Measures the import of a
// big local file and writes test-results/bigfiles/<file>.json.

const FILE = process.env.BIGFILE ?? "";
const PATH = `test-data-local/${FILE}`;
const result: Record<string, unknown> = { file: FILE };

test.skip(!FILE || !existsSync(PATH), `test-data-local/${FILE} not found`);

test.afterAll(() => {
  mkdirSync("test-results/bigfiles", { recursive: true });
  writeFileSync(`test-results/bigfiles/${FILE}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
});

/** 50 ms heartbeat; gaps over 100 ms are kept with their start time. */
async function startHeartbeat(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hb: { last: number; gaps: [number, number][]; timer: number } };
    w.__hb = { last: performance.now(), gaps: [], timer: 0 };
    w.__hb.timer = window.setInterval(() => {
      const now = performance.now();
      const gap = now - w.__hb.last;
      if (gap > 100) w.__hb.gaps.push([w.__hb.last, gap]);
      w.__hb.last = now;
    }, 50);
  });
}

/** Every distinct progress text, with the time it appeared. */
async function watchProgress(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __progress: [number, string][] };
    w.__progress = [];
    const read = () => {
      const el = document.querySelector('[data-testid="import-progress-text"]');
      const text = el?.textContent ?? "";
      if (text && w.__progress[w.__progress.length - 1]?.[1] !== text) w.__progress.push([performance.now(), text]);
    };
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

async function heapMB(cdp: CDPSession, gc: boolean) {
  if (gc) await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Math.round((metrics.find(m => m.name === "JSHeapUsedSize")?.value ?? 0) / 1e6);
}

/** Peak resident memory of Playwright's browser processes (renderer, worker, GPU...), sampled every 500 ms. */
function sampleBrowserRss() {
  let peak = 0;
  const timer = setInterval(() => {
    try {
      const out = execSync("ps -eo rss,args", { encoding: "utf8" });
      const kb = out.split("\n").filter(l => l.includes("ms-playwright")).reduce((n, l) => n + (parseInt(l.trim(), 10) || 0), 0);
      peak = Math.max(peak, kb);
    } catch { /* ps unavailable */ }
  }, 500);
  return { stop: () => { clearInterval(timer); return Math.round(peak / 1024); } };
}

async function openUpload(page: Page) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) await page.getByTestId("sidebar-nav-upload").click();
}

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

test("big file import", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", err => errors.push(`${err.name}: ${err.message}`));
  page.on("crash", () => errors.push("page crashed"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await startFreshSessionWithoutTour(page);
  await page.goto("/");

  if (FILE === "creditcard.csv") {
    // Rejection on every input, with the real 150.8 MB file (Playwright hands the browser the path).
    const rejections: Record<string, unknown> = {};
    const expectRejected = async (input: string) => {
      const toast = page.getByText(/This file is [\d.]+ MB\. The maximum supported size is [\d.]+ MB/).first();
      await expect(toast).toBeVisible();
      rejections[input] = { message: await toast.textContent(), importDialogOpened: (await page.getByTestId("import-dialog").count()) > 0 };
      await page.reload();
    };
    const heap0 = await heapMB(cdp, true);
    // Replace data first: it needs a dataset, and after a reload the app reopens on Upload.
    await loadSampleData(page);
    await page.waitForTimeout(1500);
    await page.getByTestId("sidebar-nav-data").click();
    let t = Date.now();
    await page.getByTestId("replace-data-input").setInputFiles(PATH);
    await expectRejected("DataTable replace data");
    (rejections["DataTable replace data"] as Record<string, unknown>).ms = Date.now() - t;

    await openUpload(page);
    t = Date.now();
    await page.getByTestId("file-upload-input").setInputFiles(PATH);
    await expectRejected("upload panel");
    (rejections["upload panel"] as Record<string, unknown>).ms = Date.now() - t;

    await openUpload(page);
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.type = "file";
      i.id = "bigfile-staging";
      i.style.display = "none";
      document.body.appendChild(i);
    });
    await page.locator("#bigfile-staging").setInputFiles(PATH);
    t = Date.now();
    await page.getByTestId("file-drop-zone").evaluate(zone => {
      const dt = new DataTransfer();
      dt.items.add((document.getElementById("bigfile-staging") as HTMLInputElement).files![0]);
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expectRejected("drag and drop");
    (rejections["drag and drop"] as Record<string, unknown>).ms = Date.now() - t;
    result.rejections = rejections;
    result.heapGrowthMB = (await heapMB(cdp, true)) - heap0;
    result.pageErrors = errors;
    expect(errors).toEqual([]);
    return;
  }

  await openUpload(page);

  {
    // Cancel first: start the import, cancel while parsing (for XLSX: inside SheetJS's
    // synchronous workbook read), and check nothing was imported.
    const heapBefore = await heapMB(cdp, true);
    await page.getByTestId("file-upload-input").setInputFiles(PATH);
    await expect(page.getByTestId("import-stage-parsing")).toHaveAttribute("data-state", "active", { timeout: 60_000 });
    const t = Date.now();
    await page.getByTestId("import-cancel").click();
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
    result.cancel = {
      closedMs: Date.now() - t,
      toast: await page.getByText("Import cancelled").first().isVisible(),
      heapBeforeMB: heapBefore,
      heapAfterCancelMB: await heapMB(cdp, true),
      datasetCreated: (await page.getByText("Dataset uploaded successfully").count()) > 0,
    };
    await page.waitForTimeout(1000);
    await openUpload(page);
  }

  await startHeartbeat(page);
  await watchProgress(page);
  const rss = sampleBrowserRss();
  const t0 = await page.evaluate(() => performance.now());
  const wall0 = Date.now();
  await page.getByTestId("file-upload-input").setInputFiles(PATH);

  if (FILE.endsWith(".xlsx")) {
    const picker = page.getByTestId("sheet-picker");
    await expect(picker).toBeVisible({ timeout: 5 * 60_000 });
    const pickerAt = await page.evaluate(() => performance.now());
    result.sheetPicker = {
      shownAfterMs: Math.round(pickerAt - t0),
      sheets: await picker.locator("label").allInnerTexts(),
      appendOffered: (await page.getByTestId("sheet-append").count()) > 0,
    };
    // One sheet only on this 7.6 GB machine; "append all" is covered by the small e2e workbook.
    await page.getByRole("radio", { name: "Year 2009-2010" }).check();
    await page.getByTestId("sheet-import").click();
  }

  if (FILE === "googleplaystore.csv") {
    const row = page.getByTestId("import-issue-row").first();
    await expect(row).toBeVisible();
    result.issueRow = await row.locator("td").allInnerTexts();
    await page.getByTestId("issues-exclude").click();
  }

  const toast = page.getByText(/Dataset uploaded successfully/).first();
  await expect(toast).toBeVisible({ timeout: 8 * 60_000 });
  const wall1 = Date.now();
  await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  await page.waitForTimeout(1000);

  const timing = await page.evaluate(() => {
    const w = window as unknown as { __hb: { gaps: [number, number][]; timer: number }; __progress: [number, string][] };
    clearInterval(w.__hb.timer);
    const mark = performance.getEntriesByName("datavista-import-done")[0] as PerformanceMark | undefined;
    return { gaps: w.__hb.gaps, progress: w.__progress, doneAt: mark?.startTime ?? null, detail: mark?.detail ?? null };
  });
  const doneAt = timing.doneAt ?? Infinity;
  const transferMs = (timing.detail as { transferMs?: number } | null)?.transferMs ?? null;
  const parseGaps = timing.gaps.filter(([start, gap]) => start + gap <= doneAt - (transferMs ?? 0) - 100);
  const transferGaps = timing.gaps.filter(([start, gap]) => start + gap > doneAt - (transferMs ?? 0) - 100 && start <= doneAt + 50);
  const afterGaps = timing.gaps.filter(([start]) => start > doneAt + 50);
  const max = (g: [number, number][]) => Math.round(Math.max(0, ...g.map(x => x[1])));
  const progressByStage: Record<string, number> = {};
  for (const [, text] of timing.progress) {
    const stage = text.split(":")[0];
    progressByStage[stage] = (progressByStage[stage] ?? 0) + 1;
  }

  Object.assign(result, {
    loadMs: wall1 - wall0,
    workerDoneAfterMs: timing.doneAt === null ? null : Math.round(timing.doneAt - t0),
    longestGapWhileParsingMs: max(parseGaps),
    transferMs: transferMs === null ? null : Math.round(transferMs),
    longestGapAroundTransferMs: max(transferGaps),
    longestGapWhileSavingMs: max(afterGaps),
    longestGapWholeImportMs: max(timing.gaps),
    progressUpdatesByStage: progressByStage,
    progressSample: timing.progress.slice(0, 6).map(p => p[1]).concat(["…"], timing.progress.slice(-4).map(p => p[1])),
    toast: await toast.textContent(),
    heapAfterLoadMB: await heapMB(cdp, false),
    heapAfterLoadGcMB: await heapMB(cdp, true),
    peakBrowserRssMB: rss.stop(),
    rowsImported: (timing.detail as { rows?: number } | null)?.rows ?? null,
  });

  if (FILE === "googleplaystore.csv") {
    await page.getByTestId("sidebar-nav-data").click();
    result.ratingStats = await page.getByTestId("column-stats-Rating").innerText();
  }

  if (FILE === "online_retail_II.csv") {
    // Search across all columns on the 1M-row table (used to crash: Maximum call stack size exceeded).
    await page.getByTestId("sidebar-nav-data").click();
    const s0 = Date.now();
    await page.getByPlaceholder("Search across all columns...").fill("United Kingdom");
    await expect(page.getByTestId("data-table-container").getByRole("cell", { name: "United Kingdom" }).first()).toBeVisible({ timeout: 120_000 });
    result.search = { ms: Date.now() - s0, pageErrors: [...errors] };
    await page.getByPlaceholder("Search across all columns...").fill("");

    await page.getByTestId("sidebar-nav-charts").click();
    await page.getByLabel("Chart Title").fill("Quantity by country");
    await pickOption(page, "X axis column", "Country");
    await pickOption(page, "Y axis column", "Quantity");
    const c0 = Date.now();
    await page.getByRole("button", { name: "Create Chart" }).click();
    const bars = page.getByTestId("chart-card").locator("svg[role='img'] rect.bar");
    await expect(bars.first()).toBeVisible({ timeout: 180_000 });
    const titles = await page.getByTestId("chart-card").locator("svg[role='img'] rect.bar title").allTextContents();
    result.chart = {
      ms: Date.now() - c0,
      bars: await bars.count(),
      unitedKingdom: titles.find(t => t.startsWith("Country: United Kingdom\n")) ?? null,
    };
  }

  result.pageErrors = errors;
  expect(errors).toEqual([]);
});
