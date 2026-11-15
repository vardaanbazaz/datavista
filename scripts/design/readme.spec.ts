import { test, type Page } from "@playwright/test";

/**
 * The README screenshots, HR fixture, in Light and Dark (the README shows the one matching the
 * reader's GitHub theme): docs/screenshots/{dashboard,charts,pivot,ai}-{light,dark}.png.
 * `npx playwright test --config scripts/design/playwright.design.config.ts scripts/design/readme.spec.ts`.
 */

test.use({ viewport: { width: 1600, height: 1000 } });

async function settle(page: Page) {
  await page.mouse.move(1598, 998);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

for (const theme of ["light", "dark"] as const) {
test(`README screenshots ${theme}`, async ({ page }) => {
  test.setTimeout(180_000);
  const shot = (name: string) => `docs/screenshots/${name}-${theme}.png`;
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
  await page.addInitScript((t) => {
    if (sessionStorage.getItem("readme-seeded")) return;
    sessionStorage.setItem("readme-seeded", "1");
    localStorage.clear();
    localStorage.setItem(
      "datavista-ui-storage",
      JSON.stringify({ state: { hasSeenTour: true, hasCompletedSetup: true, themeSetting: { mode: "fixed", theme: t, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" } }, version: 3 })
    );
    localStorage.setItem("datavista-visited", "true");
  }, theme);
  await page.goto("/");
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByTestId("numeric-summary").waitFor({ timeout: 30_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
  await page.screenshot({ path: shot("dashboard") });

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
  await page.getByTestId("chart-card").nth(0).screenshot({ path: shot("charts") });

  // Pivot: Department across the columns.
  await page.getByTestId("sidebar-nav-pivot").click();
  const fields = page.getByRole("region", { name: "Fields (scrollable)" });
  await fields.waitFor();
  const department = fields.locator("> div").filter({ has: page.getByText("Department", { exact: true }) });
  await department.getByRole("button", { name: "Col", exact: true }).click({ timeout: 10_000 });
  await settle(page);
  await page.locator("#main-content").screenshot({ path: shot("pivot") });

  // AI Co-Pilot settings dialog, from the command palette.
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command Palette" }).waitFor();
  await page.getByRole("button", { name: /AI Co-Pilot settings/ }).click();
  const settings = page.getByRole("dialog").filter({ hasText: "AI Co-Pilot Settings" });
  await settings.waitFor();
  // Focus moves to the first button and opens its tooltip; not wanted in the README image.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page);
  await settings.screenshot({ path: shot("ai") });
});
}
