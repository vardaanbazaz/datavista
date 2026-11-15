import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "fs";
import { startFreshSessionWithoutTour } from "./helpers";

/**
 * Regression guard for the Filters / Pivot freeze: with ~10.8k Play Store rows (App has a distinct
 * value per row), opening Filters, opening Pivot and Pivot's "Back to Filters" must each become
 * interactive within 1 s. Before the fix these took 2.4-3.4 s in a production build (more in dev).
 *
 * Interactive = the view's marker is in the DOM and the main thread then runs no long task for
 * 300 ms. Runs against the dev server (React dev mode), so the real production times are lower.
 *
 * Two sources: the real googleplaystore.csv when present (git-ignored, local only), and the
 * committed 80-row fixture repeated to 10,800 rows with a row number prefixed to App, so CI sees
 * the same row count and an App column with ~10.8k distinct values. The fixture's other columns
 * repeat, so they have fewer distinct values than the real file (Current Ver: ~60 vs 2,784).
 */

const LIMIT_MS = 1000;

const MARKER = {
  overview: '[data-testid="overview-bento"]',
  filters: '[data-testid="filter-panel"]',
  pivot: '[data-testid="pivot-settings"]',
};

function inflatedFixture(targetRows: number): Buffer {
  const lines = readFileSync("tests/fixtures/messy/playstore.csv", "utf8").split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;
  const out = [header];
  for (let i = 0; out.length <= targetRows; i++) {
    const line = rows[i % rows.length];
    // App is the first field; prefix inside its quotes when quoted so the CSV stays valid.
    out.push(line.startsWith('"') ? `"${i + 1} ${line.slice(1)}` : `${i + 1} ${line}`);
  }
  return Buffer.from(out.join("\n"));
}

async function importAndWait(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, name: string) {
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles(file);
  const keep = page.getByTestId("issues-keep");
  const dialog = page.getByTestId("import-dialog");
  await expect(async () => {
    if (await keep.isVisible()) await keep.click();
    await expect(dialog).toHaveCount(0);
  }).toPass({ timeout: 120_000 });
  await page.getByTestId("sidebar").getByText(name, { exact: true }).waitFor();
  await expect(page.locator(MARKER.overview)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: { start: number; end: number }[] };
    w.__lt = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push({ start: e.startTime, end: e.startTime + e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // longtask unsupported: only the marker time is measured
    }
  });
}

/** Clicks `selector`; ms until `marker` is present and no long task has run for 300 ms. */
async function timeToInteractive(page: Page, selector: string, marker: string): Promise<number> {
  return page.evaluate(
    async ({ selector, marker }) => {
      const w = window as unknown as { __lt: { start: number; end: number }[] };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const t0 = performance.now();
      (document.querySelector(selector) as HTMLElement).click();
      let markerAt = 0;
      while (performance.now() < t0 + 60_000) {
        await sleep(16);
        if (!markerAt && document.querySelector(marker)) markerAt = performance.now();
        if (!markerAt) continue;
        const lastEnd = Math.max(0, ...w.__lt.filter((t) => t.start >= t0).map((t) => t.end));
        if (performance.now() - Math.max(lastEnd, markerAt) > 300) break;
      }
      const lastEnd = Math.max(0, ...w.__lt.filter((t) => t.start >= t0).map((t) => t.end));
      return Math.round(Math.max(markerAt, lastEnd) - t0);
    },
    { selector, marker }
  );
}

async function checkSwitches(page: Page) {
  const times: Record<string, number> = {};
  for (const view of ["filters", "pivot"] as const) {
    await timeToInteractive(page, '[data-testid="sidebar-nav-overview"]', MARKER.overview);
    times[view] = await timeToInteractive(page, `[data-testid="sidebar-nav-${view}"]`, MARKER[view]);
  }
  // Pivot is open: its header's "Back to Filters".
  await page.getByRole("button", { name: "Back to Filters" }).first().evaluate((b) => b.setAttribute("data-e2e", "back"));
  times["back-to-filters"] = await timeToInteractive(page, '[data-e2e="back"]', MARKER.filters);
  console.log("view switch ms", JSON.stringify(times));
  for (const [view, ms] of Object.entries(times)) expect(ms, `${view} took ${ms} ms`).toBeLessThan(LIMIT_MS);
}

test.describe("Filters and Pivot stay responsive at ~10.8k rows", () => {
  test.setTimeout(240_000);

  test("full googleplaystore.csv (local file only)", async ({ page }) => {
    const file = "test-data-local/googleplaystore.csv";
    test.skip(!existsSync(file), "git-ignored local file not present");
    await startFreshSessionWithoutTour(page);
    await instrument(page);
    await page.goto("/");
    await importAndWait(page, file, "googleplaystore");
    await checkSwitches(page);
  });

  test("committed playstore fixture repeated to 10,800 rows", async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await instrument(page);
    await page.goto("/");
    await importAndWait(page, { name: "playstore-10k.csv", mimeType: "text/csv", buffer: inflatedFixture(10_800) }, "playstore-10k");
    await checkSwitches(page);
  });
});
