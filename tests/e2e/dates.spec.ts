import { test, expect, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

// An en-IN browser in IST: undecidable numeric dates read day-first, and nothing shifts a day.
test.use({ locale: "en-IN", timezoneId: "Asia/Kolkata" });

const CSV = [
  "d,sales",
  "05/06/2024,10",
  "06/06/2024,12",
  "07/06/2024,",
  "08/06/2024,15",
  "09/06/2024,9",
].join("\n");

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

async function upload(page: Page) {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles({ name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByText("orders").first().waitFor();
  await expect(page.getByTestId("sidebar-nav-charts")).toBeVisible();
  // uploadDataset switches to Overview after a short delay; navigate once it has.
  await page.waitForTimeout(1500);
}

test("a blank value breaks the line chart instead of plotting 0", async ({ page }) => {
  await upload(page);
  await page.getByTestId("sidebar-nav-charts").click();
  await page.getByLabel("Chart Title").fill("Sales by day");
  await page.getByRole("button", { name: /^Line/ }).click();
  await pickOption(page, "X axis column", "d");
  await pickOption(page, "Y axis column", "sales");
  await page.getByRole("button", { name: "Create Chart" }).click();

  const svg = page.getByTestId("chart-card").locator("svg[role='img']");
  const line = svg.locator('path[fill="none"][stroke="hsl(var(--chart-1))"]');
  await expect(line).toHaveCount(1);
  const d = (await line.getAttribute("d")) ?? "";
  expect(d.split("M").length - 1).toBe(2);
  // 4 valued points get a dot; the blank day gets none.
  await expect(svg.locator("circle.dot")).toHaveCount(4);
  // Date ticks are the calendar days as written (day-first), in IST.
  const ticks = await svg.locator(".tick text").allTextContents();
  expect(ticks).toContain("2024-06-05");
});

test("the day/month toggle re-reads a date column", async ({ page }) => {
  await upload(page);
  await page.getByTestId("sidebar-nav-data").click();
  const table = page.getByTestId("data-table-container");
  await expect(table.getByRole("cell", { name: "2024-06-05" })).toBeVisible();

  await table.getByText(/^date$/).first().click();
  const popover = page.getByTestId("date-column-popover-d");
  await expect(popover.getByTestId("date-order")).toContainText("day/month (DD/MM)");
  await expect(popover.getByTestId("date-order")).toContainText("browser's language settings");
  await popover.getByRole("button", { name: "Read as month/day (MM/DD)" }).click();

  await expect(table.getByRole("cell", { name: "2024-05-06" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "2024-06-05" })).toHaveCount(0);
});
