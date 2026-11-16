import { test, expect, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

/**
 * KPI builder defaults on a real file (Play Store). The default aggregation and the suggested
 * title come from unit-tested helpers; these tests open the real dialog, where Radix Select's
 * hidden native <select> once reported an empty value on opening and blanked both.
 */

async function importPlaystore(page: Page) {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/playstore-insights.csv");
  const keep = page.getByTestId("issues-keep");
  await expect(async () => {
    if (await keep.isVisible()) await keep.click();
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  }).toPass({ timeout: 60_000 });
  await page.getByTestId("overview-add-kpi").waitFor();
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const title = (page: Page) => page.locator("#kpi-title");
const measure = (page: Page) => page.locator("#metric-col");
const aggregation = (page: Page) => page.locator("#aggregation");

test("new card defaults to Average Rating and follows the measure until the title is typed", async ({ page }) => {
  await importPlaystore(page);
  await page.getByTestId("overview-add-kpi").click();
  await expect(page.getByTestId("kpi-builder")).toBeVisible();
  await expect(measure(page)).toHaveText("Rating");
  await expect(aggregation(page)).toHaveText("Average");
  await expect(title(page)).toHaveValue("Average Rating");

  // Changing the column moves both the aggregation and the title.
  await pick(page, "#metric-col", "Reviews");
  await expect(aggregation(page)).toHaveText("Sum");
  await expect(title(page)).toHaveValue("Total Reviews");
  await pick(page, "#metric-col", "Rating");
  await expect(aggregation(page)).toHaveText("Average");
  await expect(title(page)).toHaveValue("Average Rating");

  // A typed title stays when the column changes; the aggregation still follows.
  await title(page).fill("App quality");
  await pick(page, "#metric-col", "Reviews");
  await expect(aggregation(page)).toHaveText("Sum");
  await expect(title(page)).toHaveValue("App quality");
});

test("editing a saved card keeps its saved aggregation and title", async ({ page }) => {
  await importPlaystore(page);
  await page.getByTestId("overview-add-kpi").click();
  await expect(aggregation(page)).toHaveText("Average");
  await pick(page, "#aggregation", "Maximum");
  await expect(title(page)).toHaveValue("Maximum Rating");
  await title(page).fill("Best rating");
  await page.getByTestId("kpi-builder-save").click();
  await expect(page.getByTestId("kpi-builder")).toHaveCount(0);

  const card = page.getByText("Best rating", { exact: true }).first();
  await expect(card).toBeVisible();
  await card.hover();
  await page.getByRole("button", { name: "Edit this KPI card" }).first().click();
  await expect(page.getByTestId("kpi-builder")).toBeVisible();
  await expect(measure(page)).toHaveText("Rating");
  await expect(aggregation(page)).toHaveText("Maximum");
  await expect(title(page)).toHaveValue("Best rating");
});
