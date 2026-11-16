import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Tour step-to-step time on the production build (see ../playwright.startup.config.ts), with
 * test-data-local/googleplaystore.csv (local-only fixture, ~1.3 MB). A fresh browser context per
 * run, so lazy view chunks start cold as on a real first tour.
 *
 * Metric: from the "Next" click (performance.now() in the page) until the popover shows the
 * next step's "i of N" text, polled every animation frame in the page (no Playwright retry
 * backoff). Also records whether a spinner or a loading skeleton was painted in between.
 *
 * `npm run build`, then `npx playwright test --config scripts/bench/playwright.startup.config.ts -g tour`.
 * Output: bench-results/<label>-tour-steps.json (git-ignored).
 */

const LABEL = process.env.BENCH_LABEL || "run";
const RUNS = Number(process.env.BENCH_RUNS || 3);
const FIXTURE = "test-data-local/googleplaystore.csv";

test("tour step-to-step time", async ({ browser }) => {
  test.setTimeout(10 * 60 * 1000);
  const csv = readFileSync(FIXTURE);
  const runs: Record<string, number | string>[] = [];
  for (let r = 0; r < RUNS; r++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      if (sessionStorage.getItem("bench-seeded")) return;
      sessionStorage.setItem("bench-seeded", "1");
      window.localStorage.clear();
      window.localStorage.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true, hasCompletedSetup: true }, version: 4 }));
      window.localStorage.setItem("datavista-visited", "true");
    });
    await page.goto("./");
    await page.getByTestId("sidebar-nav-upload").click();
    await page.getByTestId("file-upload-input").setInputFiles({ name: "googleplaystore.csv", mimeType: "text/csv", buffer: csv });
    await expect(page.getByText("googleplaystore").first()).toBeVisible({ timeout: 60_000 });
    // An import summary dialog may open; close it so the tour can start.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    await page.getByTestId("restart-tour").click();
    const tooltip = page.locator(".react-joyride__tooltip");
    await expect(tooltip).toContainText("1 of 10", { timeout: 15_000 });
    const steps: Record<string, number | string> = {};
    const names = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export", "appearance"];
    for (let i = 1; i < names.length; i++) {
      await page.waitForTimeout(400); // let the current step settle, as a reader would
      const res = await page.evaluate(async (want: string) => {
        const btn = document.querySelector<HTMLElement>('[data-testid="button-primary"]');
        let spinner = false;
        let skeleton = false;
        const t0 = performance.now();
        btn?.click();
        await new Promise<void>((resolve) => {
          const tick = () => {
            if (document.querySelector('.border-t-primary.rounded-full, .animate-spin')) spinner = true;
            if (document.querySelector('[data-testid="view-skeleton"]')) skeleton = true;
            const t = document.querySelector(".react-joyride__tooltip");
            if (t && t.textContent?.includes(want)) return resolve();
            if (performance.now() - t0 > 15_000) return resolve();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return { ms: Math.round(performance.now() - t0), spinner, skeleton };
      }, i === names.length - 1 ? "Appearance" : `${i + 1} of 10`); // the last step has no "i of N" text
      steps[`${names[i - 1]}→${names[i]}`] = `${res.ms}${res.spinner ? " spinner" : ""}${res.skeleton ? " skeleton" : ""}`;
    }
    runs.push(steps);
    await context.close();
  }
  mkdirSync("bench-results", { recursive: true });
  writeFileSync(`bench-results/${LABEL}-tour-steps.json`, JSON.stringify(runs, null, 2));
  console.log(JSON.stringify(runs, null, 2));
});
