import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { loadSampleData, startFreshSessionWithoutTour } from "./helpers";

async function openUpload(page: Page) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
}

/** Waits for uploadDataset to finish and switch to Overview. */
async function waitForImported(page: Page, name: string) {
  await expect(page.getByTestId("import-dialog")).toHaveCount(0, { timeout: 30_000 });
  await page.getByText(name).first().waitFor();
  await page.waitForTimeout(1500);
}

// A fake File claiming 150.8 MB with no real bytes; any read of its contents is counted.
const FAKE_BIG_FILE = () => {
  const w = window as unknown as { __bigFileReads: number; __bigFile: File };
  w.__bigFileReads = 0;
  const f = new File(["x"], "creditcard.csv", { type: "text/csv" });
  Object.defineProperty(f, "size", { value: 150_828_752 });
  for (const m of ["text", "arrayBuffer", "slice", "stream"]) {
    Object.defineProperty(f, m, { value: () => { w.__bigFileReads++; throw new Error("read"); } });
  }
  w.__bigFile = f;
};

async function expectRejected(page: Page) {
  const toast = page.getByText("File rejected").first();
  await expect(toast).toBeVisible();
  await expect(page.getByText("This file is 150.8 MB. The maximum supported size is 100.0 MB").first()).toBeVisible();
  await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __bigFileReads: number }).__bigFileReads)).toBe(0);
}

test.describe("size cap on every input", () => {
  test.beforeEach(async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
  });

  test("upload panel file input", async ({ page }) => {
    await openUpload(page);
    await page.evaluate(FAKE_BIG_FILE);
    await page.getByTestId("file-upload-input").evaluate(input => {
      Object.defineProperty(input, "files", { value: [(window as unknown as { __bigFile: File }).__bigFile], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expectRejected(page);
  });

  test("drag and drop onto the upload panel", async ({ page }) => {
    await openUpload(page);
    await page.evaluate(FAKE_BIG_FILE);
    await page.getByTestId("file-drop-zone").evaluate(zone => {
      const dt = new DataTransfer();
      Object.defineProperty(dt, "files", { value: [(window as unknown as { __bigFile: File }).__bigFile] });
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expectRejected(page);
  });

  test("DataTable replace-data input", async ({ page }) => {
    await loadSampleData(page);
    await page.waitForTimeout(1500);
    await page.getByTestId("sidebar-nav-data").click();
    await page.evaluate(FAKE_BIG_FILE);
    await page.getByTestId("replace-data-input").evaluate(input => {
      Object.defineProperty(input, "files", { value: [(window as unknown as { __bigFile: File }).__bigFile], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expectRejected(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("parse problems are listed; exclude removes Play Store's shifted row", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await openUpload(page);
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/messy/playstore.csv");

  const dialog = page.getByTestId("import-dialog");
  await expect(dialog.getByTestId("import-summary-counts")).toHaveText(
    /80 rows and 13 columns read from playstore\.csv\. 1 row has parse problems\. 8 duplicate rows/
  );
  const row = dialog.getByTestId("import-issue-row");
  await expect(row).toHaveCount(1);
  // Data row 80 of this 80-row fixture is row 10,473 of the full Play Store file.
  await expect(row.locator("td").nth(0)).toHaveText("80");
  await expect(row.locator("td").nth(1)).toHaveText("Too few fields: expected 13 fields but parsed 12");
  await expect(row.locator("td").nth(2)).toContainText("Life Made WI-Fi Touchscreen Photo Frame | 1.9 | 19 | 3.0M");
  await expect(dialog.getByTestId("issues-keep")).toBeFocused();

  await dialog.getByTestId("issues-exclude").click();
  await waitForImported(page, "playstore");
  await page.getByTestId("sidebar-nav-data").click();
  await expect(page.getByTestId("column-stats-Rating")).toContainText("Max: 5.00");
  await expect(page.getByTestId("import-issues-notice")).toContainText("1 row had parse problems at import and were excluded");
});

test("keeping problem rows is the default and the summary reopens from the Data view", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await openUpload(page);
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/messy/playstore.csv");
  await page.getByTestId("issues-keep").click();
  await waitForImported(page, "playstore");
  await page.getByTestId("sidebar-nav-data").click();
  await expect(page.getByTestId("column-stats-Rating")).toContainText("Max: 19.00");
  // The summary is stored with the dataset (IndexedDB), so it survives a reload.
  await page.reload();
  if ((await page.getByTestId("import-issues-notice").count()) === 0) await page.getByTestId("sidebar-nav-data").click();
  await expect(page.getByTestId("import-issues-notice")).toContainText("1 row had parse problems at import and were kept");
  await page.getByTestId("import-issues-open").click();
  const reopened = page.getByTestId("import-issues-dialog");
  await expect(reopened).toContainText("1 of 80 rows had parse problems and were kept");
  await expect(reopened.getByTestId("import-issue-row").locator("td").nth(0)).toHaveText("80");
  await expect(reopened.getByTestId("import-issue-row").locator("td").nth(2)).toContainText("Life Made WI-Fi Touchscreen Photo Frame");
});

function workbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test.describe("multi-sheet XLSX", () => {
  const book = workbookBuffer({
    "Year 2009-2010": [["Invoice", "Country", "Quantity"], ["489434", "United Kingdom", 12], ["489435", "France", 3]],
    "Year 2010-2011": [["Invoice", "Country", "Quantity"], ["536365", "Germany", 6]],
  });

  test.beforeEach(async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await openUpload(page);
    await page.getByTestId("file-upload-input").setInputFiles({
      name: "retail.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: book,
    });
  });

  test("shows each sheet's name, rows and headers and imports the picked sheet", async ({ page }) => {
    const picker = page.getByTestId("sheet-picker");
    await expect(picker).toContainText("Year 2009-2010");
    await expect(picker).toContainText("Year 2010-2011");
    await expect(picker.getByTestId("sheet-row-count")).toHaveText(["2 rows", "1 rows"]);
    await expect(picker).toContainText("Invoice, Country, Quantity");
    await page.getByRole("radio", { name: "Year 2010-2011" }).check();
    await page.getByTestId("sheet-import").click();
    await waitForImported(page, "retail");
    await page.getByTestId("sidebar-nav-data").click();
    const table = page.getByTestId("data-table-container");
    await expect(table.getByRole("cell", { name: "Germany" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "France" })).toHaveCount(0);
  });

  test("append all sheets adds a Source sheet column", async ({ page }) => {
    await page.getByTestId("sheet-append").check();
    await page.getByTestId("sheet-import").click();
    await waitForImported(page, "retail");
    await page.getByTestId("sidebar-nav-data").click();
    const table = page.getByTestId("data-table-container");
    await expect(table.getByRole("columnheader", { name: /Source sheet/ })).toBeVisible();
    await expect(table.getByRole("cell", { name: "Year 2010-2011" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "France" })).toBeVisible();
  });
});

test("cancel stops the import and leaves the current dataset untouched", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await loadSampleData(page);
  await page.waitForTimeout(1500);

  // ~25 MB generated in the test, big enough to still be importing when Cancel is clicked.
  const lines = ["id,region,amount"];
  for (let i = 0; i < 1_200_000; i++) lines.push(`${i},R${i % 7},${i % 1000}`);
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles({ name: "huge.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n")) });

  const dialog = page.getByTestId("import-dialog");
  await expect(dialog.getByTestId("import-progress-text")).toBeVisible();
  await dialog.getByTestId("import-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Import cancelled").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText("huge")).toHaveCount(0);
  await page.getByTestId("sidebar-nav-data").click();
  await expect(page.getByTestId("data-table-container").getByRole("cell", { name: "Laptop" })).toBeVisible();
});
