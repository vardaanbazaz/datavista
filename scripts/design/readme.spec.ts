import { test, type Page } from "@playwright/test";

/**
 * The four README screenshots (docs/dashboard-, pivot-, ai-, charts-screenshot.png), dark
 * theme, HR fixture. `npx playwright test --config scripts/design/playwright.design.config.ts
 * scripts/design/readme.spec.ts`.
 */

test.use({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });

async function settle(page: Page) {
  await page.mouse.move(1598, 998);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

test("README screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("readme-seeded")) return;
    sessionStorage.setItem("readme-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true, theme: "dark" }, version: 1 }));
    localStorage.setItem("datavista-visited", "true");
  });
  await page.goto("/");
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByTestId("numeric-ledger").waitFor({ timeout: 30_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
  await page.screenshot({ path: "docs/dashboard-screenshot.png" });

  // Charts: grouped bar with legend + average line.
  await page.getByTestId("sidebar-nav-charts").click();
  const pick = async (label: string, option: string) => {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
  };
  await page.getByLabel("Chart Title").fill("Monthly income by job level and department");
  await pick("X axis column", "JobLevel");
  await pick("Y axis column", "MonthlyIncome");
  await pick("Group by column", "Department");
  await page.getByRole("button", { name: "Create Chart" }).click();
  await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await page.getByRole("button", { name: /^Line/ }).first().click();
  await page.getByLabel("Chart Title").fill("Average monthly income by age");
  await pick("X axis column", "Age");
  await pick("Y axis column", "MonthlyIncome");
  await pick("Aggregation", "Average");
  await page.getByRole("button", { name: "Create Chart" }).click();
  await page.getByTestId("chart-card").nth(1).waitFor();
  await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
  await page.getByTestId("chart-card").nth(0).screenshot({ path: "docs/charts-screenshot.png" });

  // Pivot: Department across the columns.
  await page.getByTestId("sidebar-nav-pivot").click();
  const fields = page.getByRole("region", { name: "Fields (scrollable)" });
  await fields.waitFor();
  const department = fields.locator("> div").filter({ has: page.getByText("Department", { exact: true }) });
  await department.getByRole("button", { name: "Col", exact: true }).click({ timeout: 10_000 });
  await settle(page);
  await page.locator("#main-content").screenshot({ path: "docs/pivot-screenshot.png" });

  // AI Co-Pilot settings dialog, from the command palette.
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command Palette" }).waitFor();
  await page.getByRole("button", { name: /AI Co-Pilot settings/ }).click();
  const settings = page.getByRole("dialog").filter({ hasText: "AI Co-Pilot Settings" });
  await settings.waitFor();
  // Focus moves to the first button and opens its tooltip; not wanted in the README image.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page);
  await settings.screenshot({ path: "docs/ai-screenshot.png" });
});
