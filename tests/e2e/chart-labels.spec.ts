import { test, expect, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

// The reported case on the real fixture: Bar chart X=Age, Y=Education plots SUM per age.
test("bar chart names its aggregation and orders numeric X ascending, inline and expanded", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByText("hr-attrition").first().waitFor();
  // uploadDataset switches to Overview after a short delay; navigate once it has.
  await expect(page.getByTestId("sidebar-nav-charts")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByTestId("sidebar-nav-charts").click();

  await page.getByLabel("Chart Title").fill("Education by age");
  await pickOption(page, "X axis column", "Age");
  await pickOption(page, "Y axis column", "Education");
  await page.getByRole("button", { name: "Create Chart" }).click();

  const card = page.getByTestId("chart-card");
  for (const root of [card, page.getByTestId("chart-expand-dialog")]) {
    if (root !== card) await card.getByTestId("chart-expand-button").click();
    const svg = root.locator("svg[role='img']");
    await expect(svg.locator("rect.bar").first()).toBeVisible();

    await expect(svg.locator("text", { hasText: /^Sum of Education$/ })).toHaveCount(1);
    const ticks = await svg.locator(".tick text").allTextContents();
    expect(ticks.slice(0, 5)).toEqual(["18", "19", "20", "21", "22"]);
    const titles = await svg.locator("rect.bar title").allTextContents();
    expect(titles.find(t => t.startsWith("Age: 35\n"))).toContain("Sum of Education: 251");
  }
});
