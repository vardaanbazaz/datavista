import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "fs";
import { startFreshSessionWithoutTour } from "./helpers";

async function openUpload(page: Page) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
}

/** Imports a file; answers "Keep all rows" if the parse summary shows. */
async function importFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, name: string) {
  await openUpload(page);
  await page.getByTestId("file-upload-input").setInputFiles(file);
  const keep = page.getByTestId("issues-keep");
  const dialog = page.getByTestId("import-dialog");
  await expect(async () => {
    if (await keep.isVisible()) await keep.click();
    await expect(dialog).toHaveCount(0);
  }).toPass({ timeout: 60_000 });
  await page.getByTestId("sidebar").getByText(name, { exact: true }).waitFor();
  await page.waitForTimeout(1500); // uploadDataset switches to Overview after a short delay
}

async function openData(page: Page) {
  await page.getByTestId("sidebar-nav-data").click();
  await page.getByTestId("data-table-container").waitFor();
}

test("sentinel prompt: Yes makes -1 missing in Founded (Glassdoor fixture)", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await importFile(page, "tests/fixtures/messy/glassdoor.csv", "glassdoor");
  await openData(page);
  await expect(page.getByTestId("column-stats-Founded")).toContainText("Mean: 1339.58");
  const prompt = page.getByTestId("sentinel-prompt-Founded");
  await expect(prompt).toHaveText(/-1 appears 10 times in Founded\. Treat -1 as missing\?/);
  await page.getByTestId("sentinel-yes-Founded").click();
  // pandas, -1 as NaN: mean 1977.952381 (messy.golden.json fixedStats)
  await expect(page.getByTestId("column-stats-Founded")).toContainText("Mean: 1977.95");
  await expect(page.getByTestId("column-stats-Founded")).toContainText("Count: 21");
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("fix-badge-Founded")).toContainText("-1 treated as missing");

  // Survives a reload (rows rewritten with the fix, originals kept)…
  await page.waitForTimeout(1500);
  await page.reload();
  await openData(page);
  await expect(page.getByTestId("column-stats-Founded")).toContainText("Mean: 1977.95");
  // …and undo restores the original values exactly.
  await page.getByTestId("fix-badge-Founded").click();
  await page.getByTestId("undo-fix-sentinel:Founded:-1").click();
  await expect(page.getByTestId("column-stats-Founded")).toContainText("Mean: 1339.58");
});

test("full Glassdoor file: Founded mean 1984.10 and Rating 3.88 after Yes (local file only)", async ({ page }) => {
  const file = "test-data-local/Uncleaned_DS_jobs.csv";
  test.skip(!existsSync(file), "git-ignored local file not present");
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await importFile(page, file, "Uncleaned_DS_jobs");
  await openData(page);
  await expect(page.getByTestId("sentinel-prompt-Founded")).toHaveText(/-1 appears 118 times in Founded/);
  await page.getByTestId("sentinel-yes-Founded").click();
  await page.getByTestId("sentinel-yes-Rating").click();
  await expect(page.getByTestId("column-stats-Founded")).toContainText("Mean: 1984.10");
  await expect(page.getByTestId("column-stats-Rating")).toContainText("Mean: 3.88");
});

test("currency: Price converts from $ on import, with a badge and undo; duplicates remove and come back", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await importFile(page, "tests/fixtures/messy/playstore.csv", "playstore");
  await openData(page);

  // Price: pandas with "$" stripped, the shifted row's "Everyone" excluded: 79 values, mean 20.896709, max 400.
  await expect(page.getByTestId("column-stats-Price")).toContainText("Count: 79");
  await expect(page.getByTestId("column-stats-Price")).toContainText("Mean: 20.90");
  await expect(page.getByTestId("column-stats-Price")).toContainText("Max: 400.00");
  const badge = page.getByTestId("fix-badge-Price");
  await expect(badge).toContainText("converted from $");
  // Converted values are shown with the symbol from the file (first rows are free apps: "0").
  await expect(page.getByTestId("data-table-container").getByRole("cell", { name: "$0", exact: true }).first()).toBeVisible();
  await badge.click();
  await page.getByTestId("undo-fix-currency:Price").click();
  await expect(page.getByTestId("fix-badge-Price")).toHaveCount(0);
  await expect(page.getByTestId("column-stats-Price")).toHaveCount(0); // back to text
  await expect(page.getByTestId("data-table-container").getByRole("cell", { name: "$0", exact: true })).toHaveCount(0);

  // 8 exact duplicate rows in this subset (pandas duplicated()).
  await expect(page.getByTestId("duplicates-notice")).toContainText("8 duplicate rows");
  await expect(page.getByText(/Showing \d+ of 80 rows/)).toBeVisible();
  await page.getByTestId("remove-duplicates").click();
  await expect(page.getByTestId("duplicates-notice")).toContainText("8 duplicate rows removed");
  await expect(page.getByText(/Showing \d+ of 72 rows/)).toBeVisible();
  await page.getByTestId("restore-duplicates").click();
  await expect(page.getByText(/Showing \d+ of 80 rows/)).toBeVisible();
});

test("full Play Store file: 483 duplicate rows (local file only)", async ({ page }) => {
  const file = "test-data-local/googleplaystore.csv";
  test.skip(!existsSync(file), "git-ignored local file not present");
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await importFile(page, file, "googleplaystore");
  await openData(page);
  await expect(page.getByTestId("duplicates-notice")).toContainText("483 duplicate rows");
  await expect(page.getByTestId("column-stats-Price")).toContainText("Max: 400.00");
});

const LABS = ["Lab,Value", ...Array.from({ length: 12 }, (_, i) => `${i % 3 === 0 ? "lab a" : i % 3 === 1 ? "Lab A" : "Lab B"},${i}`), "Lab A,99"].join("\n");

test("label variants: merge 'lab a' into 'Lab A', then undo; categorical tiles show top values", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await importFile(page, { name: "labs.csv", mimeType: "text/csv", buffer: Buffer.from(LABS) }, "labs");

  // Overview tile: distinct 3, missing 0, top values with counts and shares.
  const tile = page.getByTestId("category-tile-Lab");
  await expect(tile).toContainText("Distinct:3");
  await expect(tile).toContainText("Missing:0");
  await expect(tile).toContainText("Lab A5 · 38.5%");

  await openData(page);
  const suggestion = page.getByTestId("variant-suggestion-Lab");
  await expect(suggestion).toContainText("Merge 'lab a' (4) into 'Lab A' (5)?");
  await page.getByTestId("merge-Lab").click();
  await expect(suggestion).toHaveCount(0);
  await expect(page.getByTestId("fix-badge-Lab")).toContainText("merged 'lab a' into 'Lab A'");

  await page.getByTestId("sidebar-nav-overview").click();
  await expect(page.getByTestId("category-tile-Lab")).toContainText("Distinct:2");
  await expect(page.getByTestId("category-tile-Lab")).toContainText("Lab A9 · 69.2%");

  await openData(page);
  await page.getByTestId("fix-badge-Lab").click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("variant-suggestion-Lab")).toBeVisible();
});

test("clear all local data: nothing of the workspace is left after a reload", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await importFile(page, { name: "labs.csv", mimeType: "text/csv", buffer: Buffer.from(LABS) }, "labs");
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("datavista-ui-storage")!);
    raw.state.llmApiKey = "sk-test-key";
    localStorage.setItem("datavista-ui-storage", JSON.stringify(raw));
  });
  await page.waitForTimeout(1000);

  await page.getByTestId("open-privacy").click();
  await page.getByTestId("clear-local-data").click();
  await expect(page.getByRole("alertdialog")).toContainText("Every dataset and all its rows");
  await expect(page.getByRole("alertdialog")).toContainText("The AI provider choice and the AI API key");
  await Promise.all([page.waitForEvent("load"), page.getByTestId("clear-local-data-confirm").click()]);
  await page.reload();

  const left = await page.evaluate(
    () =>
      new Promise<{ datasets: number; rows: number; charts: number; dashboards: number; filters: number; keys: string[]; apiKey: unknown }>((resolve, reject) => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("datavista"));
        const ui = JSON.parse(localStorage.getItem("datavista-ui-storage") ?? "{}");
        const open = indexedDB.open("DataVistaDatabase");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const stores = ["datasets", "datasetRows", "charts", "dashboards", "filters"].filter((s) => idb.objectStoreNames.contains(s));
          const counts: Record<string, number> = { datasets: 0, datasetRows: 0, charts: 0, dashboards: 0, filters: 0 };
          if (stores.length === 0) {
            idb.close();
            resolve({ datasets: 0, rows: 0, charts: 0, dashboards: 0, filters: 0, keys, apiKey: ui.state?.llmApiKey });
            return;
          }
          const tx = idb.transaction(stores, "readonly");
          for (const s of stores) {
            const req = tx.objectStore(s).count();
            req.onsuccess = () => (counts[s] = req.result);
          }
          tx.oncomplete = () => {
            idb.close();
            resolve({ datasets: counts.datasets, rows: counts.datasetRows, charts: counts.charts, dashboards: counts.dashboards, filters: counts.filters, keys, apiKey: ui.state?.llmApiKey });
          };
          tx.onerror = () => reject(tx.error);
        };
      })
  );
  expect({ ...left, keys: undefined }).toEqual({ datasets: 0, rows: 0, charts: 0, dashboards: 0, filters: 0, keys: undefined, apiKey: "" });
  // Only what the app writes on a fresh start (default UI state) may exist.
  expect(left.keys.every((k) => k === "datavista-ui-storage")).toBe(true);
  await expect(page.getByTestId("sidebar").getByText("labs", { exact: true })).toHaveCount(0);
});
