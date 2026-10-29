import { test, expect, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

const CSV = [
  "Region,Sales,Units",
  "North,10,1",
  "South,20,2",
  "North,5,3",
  "East,7,4",
].join("\n");

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

async function createChart(page: Page, title: string, x: string, y: string) {
  await page.getByLabel("Chart Title").fill(title);
  await pickOption(page, "X axis column", x);
  await pickOption(page, "Y axis column", y);
  await page.getByRole("button", { name: "Create Chart" }).click();
}

/** What IndexedDB holds right now: dataset names and chart titles (no app code involved). */
async function readSaved(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ datasets: string[]; charts: string[] }>((resolve, reject) => {
        const open = indexedDB.open("DataVistaDatabase");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(["datasets", "charts"], "readonly");
          const datasets = tx.objectStore("datasets").getAll();
          const charts = tx.objectStore("charts").getAll();
          tx.oncomplete = () => {
            resolve({
              datasets: datasets.result.map((d: { name: string }) => d.name),
              charts: charts.result.map((c: { title: string }) => c.title).sort(),
            });
            idb.close();
          };
          tx.onerror = () => reject(tx.error);
        };
      })
  );
}

async function barTitles(page: Page, chartTitle: string) {
  const svg = page.getByRole("img", { name: `Chart: ${chartTitle}` });
  await expect(svg.locator("rect.bar").first()).toBeVisible();
  return svg.locator("rect.bar title").allTextContents();
}

test("a renamed dataset and its charts survive a reload", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles({
    name: "regions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await expect(page.getByTestId("import-dialog")).toHaveCount(0, { timeout: 30_000 });
  await page.getByText("regions").first().waitFor();

  await page.getByTestId("sidebar-nav-charts").click();
  await createChart(page, "Sales by region", "Region", "Sales");
  await createChart(page, "Units by region", "Region", "Units");
  await expect(page.getByTestId("chart-card")).toHaveCount(2);

  page.once("dialog", (dialog) => dialog.accept("Regional sales"));
  await page.getByRole("button", { name: "Dataset options (rename, delete)" }).first().click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByText("Regional sales").first()).toBeVisible();

  // Wait until the writes are on disk; a reload doesn't wait for them.
  await expect
    .poll(() => readSaved(page), { timeout: 10_000 })
    .toEqual({ datasets: ["Regional sales"], charts: ["Sales by region", "Units by region"] });

  await page.reload();
  await page.getByTestId("sidebar-nav-charts").click();
  await expect(page.getByText("Regional sales").first()).toBeVisible();
  await expect(page.getByTestId("chart-card")).toHaveCount(2);

  const sales = await barTitles(page, "Sales by region");
  expect(sales.find((t) => t.startsWith("Region: North\n"))).toContain("Sum of Sales: 15");
  expect(sales.find((t) => t.startsWith("Region: South\n"))).toContain("Sum of Sales: 20");
  expect(sales.find((t) => t.startsWith("Region: East\n"))).toContain("Sum of Sales: 7");
  const units = await barTitles(page, "Units by region");
  expect(units.find((t) => t.startsWith("Region: North\n"))).toContain("Sum of Units: 4");
  expect(units.find((t) => t.startsWith("Region: East\n"))).toContain("Sum of Units: 4");
});

/** Row chunks on disk per dataset name. */
async function savedRowCounts(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const open = indexedDB.open("DataVistaDatabase");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(["datasets", "datasetRows"], "readonly");
          const datasets = tx.objectStore("datasets").getAll();
          const chunks = tx.objectStore("datasetRows").getAll();
          tx.oncomplete = () => {
            const out: Record<string, number> = {};
            for (const d of datasets.result as { id: string; name: string }[]) {
              out[d.name] = (chunks.result as { datasetId: string; rows: unknown[] }[])
                .filter((c) => c.datasetId === d.id)
                .reduce((n, c) => n + c.rows.length, 0);
            }
            resolve(out);
            idb.close();
          };
          tx.onerror = () => reject(tx.error);
        };
      })
  );
}

// Startup reads only the active dataset's rows; the other loads when picked, and renaming
// it before that must not lose its rows.
test("a dataset not open at startup keeps its rows through a rename and loads when selected", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  for (const [name, csv] of [["regions", CSV], ["other", "Name,Value\nAda,1\nGrace,2\n"]] as const) {
    if ((await page.getByTestId("file-upload-input").count()) === 0) {
      await page.getByTestId("sidebar-nav-upload").click();
    }
    await page.getByTestId("file-upload-input").setInputFiles({ name: `${name}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByTestId("import-dialog")).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId("sidebar").getByText(name, { exact: true }).waitFor();
    await page.waitForTimeout(1500); // uploadDataset switches to Overview after a short delay
  }
  await expect.poll(() => savedRowCounts(page), { timeout: 10_000 }).toEqual({ regions: 4, other: 2 });

  // "other" is active; "regions" stays on disk at startup.
  await page.reload();
  const sidebar = page.getByTestId("sidebar");
  const regions = sidebar.getByRole("button", { name: /regions/ });
  await expect(regions).toContainText("4 rows");
  page.once("dialog", (dialog) => dialog.accept("Regions renamed"));
  // The sidebar lists datasets in stored-id order: use the options button of the "regions" row.
  const rows = await sidebar.getByRole("button", { name: / rows, / }).allTextContents();
  const index = rows.findIndex((text) => text.startsWith("regions"));
  expect(index).toBeGreaterThanOrEqual(0);
  await sidebar.getByRole("button", { name: "Dataset options (rename, delete)" }).nth(index).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect.poll(() => savedRowCounts(page), { timeout: 10_000 }).toEqual({ "Regions renamed": 4, other: 2 });

  await page.reload();
  await sidebar.getByRole("button", { name: /Regions renamed/ }).click();
  await page.getByTestId("sidebar-nav-data").click();
  const table = page.getByTestId("data-table-container");
  await expect(table.getByRole("cell", { name: "South" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "East" })).toBeVisible();
});
