import { test, type Page } from "@playwright/test";

/**
 * README screenshots from the production build (`npm run build` first), written to
 * docs/images/ as PNG; scripts/design/to-webp.sh converts them to WebP (≤ 300 KB each).
 * `npx playwright test --config scripts/design/playwright.portfolio.config.ts`.
 *
 * - overview.png        Overview: KPI tiles, insights, numeric columns (Play Store fixture, Dark)
 * - data-quality.png    Data Explorer with the data-quality panel (messy Play Store fixture, Dark)
 * - pivot.png           Pivot, average Rating by Category × Type (Play Store fixture, Dark)
 * - dashboard-light.png Dashboard widgets: three KPI cards (Play Store fixture, Light)
 *
 * The copilot screenshot is not made here: it must show a real provider's answer.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const OUT = process.env.DESIGN_OUT || "docs/images";

async function seed(page: Page, theme: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((t) => {
    if (sessionStorage.getItem("portfolio-seeded")) return;
    sessionStorage.setItem("portfolio-seeded", "1");
    localStorage.clear();
    localStorage.setItem(
      "datavista-ui-storage",
      JSON.stringify({
        state: {
          hasSeenTour: true,
          hasCompletedSetup: true,
          themeSetting: { mode: "fixed", theme: t, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
        },
        version: 3,
      })
    );
    localStorage.setItem("datavista-visited", "true");
  }, theme);
  await page.goto("./");
}

async function importFile(page: Page, file: string) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles(file);
  const keep = page.getByTestId("issues-keep");
  for (let i = 0; i < 120; i++) {
    if (await keep.isVisible().catch(() => false)) await keep.click();
    if ((await page.getByTestId("import-dialog").count()) === 0) break;
    await page.waitForTimeout(500);
  }
  await page.getByTestId("numeric-summary").waitFor({ timeout: 60_000 });
}

async function settle(page: Page) {
  // Toasts (sonner and Radix) are hidden so they don't cover the views.
  await page.addStyleTag({ content: '[aria-label^="Notifications"], [data-sonner-toaster] { display: none !important; }' });
  await page.mouse.move(1438, 898);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addKpi(page: Page, measure?: string) {
  await page.getByTestId("overview-add-kpi").click();
  await page.getByTestId("kpi-builder").waitFor();
  if (measure) await pick(page, "#metric-col", measure);
  await page.getByTestId("kpi-builder-save").click();
  await page.getByTestId("kpi-builder").waitFor({ state: "detached" });
}

test("overview, pivot (Dark)", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "dark");
  await importFile(page, "tests/fixtures/playstore-insights.csv");
  await settle(page);
  await page.screenshot({ path: `${OUT}/overview.png` });

  await page.getByTestId("sidebar-nav-pivot").click();
  const fields = page.getByRole("region", { name: "Fields (scrollable)" });
  await fields.waitFor();
  const type = fields.locator("> div").filter({ has: page.getByText("Type", { exact: true }) });
  await type.getByRole("button", { name: "Col", exact: true }).click({ timeout: 10_000 });
  // Values: Average Rating (a sum of ratings means nothing).
  await page.getByRole("combobox").filter({ hasText: /^Sum$/ }).last().click();
  await page.getByRole("option", { name: "Average", exact: true }).click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/pivot.png` });
});

test("data explorer with data quality (Dark)", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "dark");
  await importFile(page, "tests/fixtures/messy/playstore.csv");
  await page.getByTestId("sidebar-nav-data").click();
  await page.getByTestId("data-quality-panel").waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/data-quality.png` });
});

test("dashboard KPI cards (Light)", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "light");
  await importFile(page, "tests/fixtures/playstore-insights.csv");
  await addKpi(page); // Average Rating
  await addKpi(page, "Reviews"); // Total Reviews
  await addKpi(page, "Price"); // Average Price
  await page.getByText(/^Dashboard Widgets/).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.wheel(0, -80);
  await settle(page);
  await page.screenshot({ path: `${OUT}/dashboard-light.png` });
});
