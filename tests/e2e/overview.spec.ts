import { test, expect } from "@playwright/test";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

/** Overview: the KPI builder entry point and the bento tile subtitles. */

test.beforeEach(async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await loadSampleData(page);
});

test("Add KPI opens the builder from the plain Overview; saving creates a dashboard with the card", async ({ page }) => {
  await page.getByTestId("overview-add-kpi").click();
  const builder = page.getByTestId("kpi-builder");
  await expect(builder).toBeVisible();
  await expect(page.getByTestId("kpi-builder-note")).toContainText("new dashboard");

  // Cancel creates nothing.
  await builder.getByRole("button", { name: "Cancel" }).click();
  await expect(builder).toBeHidden();
  await expect(page.getByText("Dashboard Widgets")).toHaveCount(0);

  await page.getByTestId("overview-add-kpi").click();
  await page.locator("#kpi-title").fill("Total of first column");
  await page.getByTestId("kpi-builder-save").click();
  await expect(builder).toBeHidden();
  await expect(page.getByText("Sample Sales Data KPIs").first()).toBeVisible();
  await expect(page.getByText("Total of first column").first()).toBeVisible();

  // With the dashboard open, a second card goes on the same dashboard.
  await page.getByTestId("overview-add-kpi").click();
  await expect(page.getByTestId("kpi-builder-note")).toHaveCount(0);
  await page.locator("#kpi-title").fill("Second card");
  await page.getByTestId("kpi-builder-save").click();
  await expect(page.getByText("Second card").first()).toBeVisible();
  await expect(page.getByText("Dashboard Widgets (2)")).toBeVisible();
});

test("bento tiles: one row on desktop, subtitles describe their own tile", async ({ page }) => {
  const tiles = ["rows", "columns", "charts", "missing"].map((t) => page.getByTestId(`tile-${t}`));
  const boxes = await Promise.all(tiles.map((t) => t.boundingBox()));
  const tops = boxes.map((b) => Math.round(b!.y));
  expect(new Set(tops).size).toBe(1);
  const heights = boxes.map((b) => Math.round(b!.height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

  await expect(page.getByTestId("tile-rows-subtitle")).toHaveText("All rows shown · no filters");
  await expect(page.getByTestId("tile-charts-subtitle")).toHaveText("None yet: build one in Charts");
  await expect(page.getByTestId("tile-missing-subtitle")).toContainText("no invalid numbers");
  await expect(page.getByTestId("tile-columns-subtitle")).toContainText("numeric");
});
