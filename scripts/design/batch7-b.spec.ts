import { test, devices, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { THEME_BY_ID } from "../../src/shared/theme/themes";

/**
 * Batch 7 phase B screenshots: first-run setup (3 screens) in Light and Midnight, a tour step on
 * Charts, the Upload view (glass panel) in Light, Clay and Midnight, Data Explorer, Pivot and
 * Statistics in Light and Dark, and Overview at 390px. The logo sheet is
 * scripts/brand/logo-options.ts. `npx playwright test --config scripts/design/playwright.design.config.ts batch7-b`
 * (dev server on :8080). Writes docs/design/batch7-b/*.png.
 */

const OUT = process.env.DESIGN_OUT || "docs/design/batch7-b";
mkdirSync(OUT, { recursive: true });

type Variant = { theme: string; mobile?: boolean; firstVisit?: boolean };

async function openApp(browser: Browser, v: Variant): Promise<Page> {
  const scheme = THEME_BY_ID[v.theme as keyof typeof THEME_BY_ID].scheme;
  const context = await browser.newContext({
    ...(v.mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 1000 } }),
    colorScheme: scheme,
    reducedMotion: "reduce",
    baseURL: "http://localhost:8080",
  });
  const page = await context.newPage();
  const ui = {
    state: {
      hasSeenTour: !v.firstVisit,
      hasCompletedSetup: !v.firstVisit,
      themeSetting: { mode: "fixed", theme: v.theme, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
      appearance: { textSize: "default", highContrast: false, motion: "system", transparency: true },
    },
    version: 3,
  };
  await page.addInitScript(
    ([value, first]) => {
      if (sessionStorage.getItem("design-seeded")) return;
      sessionStorage.setItem("design-seeded", "1");
      localStorage.clear();
      localStorage.setItem("datavista-ui-storage", value);
      if (!first) localStorage.setItem("datavista-visited", "true");
    },
    [JSON.stringify(ui), !!v.firstVisit] as const
  );
  await page.goto("/");
  await page.getByTestId("sidebar").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function settle(page: Page) {
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 2, size.height - 2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(600);
}

async function loadHr(page: Page) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    const toggle = page.getByTestId("mobile-menu-toggle");
    if (await toggle.isVisible()) await toggle.click();
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByTestId("category-summary").waitFor({ timeout: 30_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
}

for (const theme of ["light", "midnight"]) {
  test(`setup ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { theme, firstVisit: true });
    const setup = page.getByTestId("setup-flow");
    await setup.waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/setup-1-look-${theme}.png` });
    await page.getByTestId("setup-next").click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/setup-2-effects-${theme}.png` });
    await page.getByTestId("setup-next").click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/setup-3-ai-${theme}.png` });
    await page.getByTestId("setup-skip-ai").click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/setup-4-done-${theme}.png` });
    await page.context().close();
  });
}

test("tour step on Charts", async ({ browser }) => {
  const page = await openApp(browser, { theme: "light" });
  await loadHr(page);
  await page.getByTestId("restart-tour").click();
  const tooltip = page.locator(".react-joyride__tooltip");
  for (let i = 0; i < 3; i++) {
    await tooltip.waitFor();
    await page.getByTestId("button-primary").click();
  }
  await tooltip.filter({ hasText: "Charts" }).waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/tour-charts-light.png` });
  await page.context().close();
});

for (const theme of ["light", "clay", "midnight"]) {
  test(`upload ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { theme });
    await page.getByTestId("sidebar-nav-upload").click();
    await page.getByTestId("upload-panel").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/upload-${theme}.png`, fullPage: true });
    await page.context().close();
  });
}

for (const theme of ["light", "dark"]) {
  test(`data, pivot, stats ${theme}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await openApp(browser, { theme });
    await loadHr(page);
    await page.getByTestId("sidebar-nav-data").click();
    await page.getByTestId("data-table-container").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/data-explorer-${theme}.png` });

    await page.getByTestId("sidebar-nav-pivot").click();
    const fields = page.getByRole("region", { name: "Fields (scrollable)" });
    await fields.waitFor();
    const department = fields.locator("> div").filter({ has: page.getByText("Department", { exact: true }) });
    await department.getByRole("button", { name: "Col", exact: true }).click({ timeout: 10_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/pivot-${theme}.png` });

    await page.getByTestId("sidebar-nav-stats").click();
    await page.getByTestId("stats-column-picker").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/statistics-${theme}.png` });
    await page.context().close();
  });
}

test("overview 390px", async ({ browser }) => {
  const page = await openApp(browser, { theme: "light", mobile: true });
  await loadHr(page);
  await page.screenshot({ path: `${OUT}/overview-light-390-first-screen.png` });
  await page.screenshot({ path: `${OUT}/overview-light-390.png`, fullPage: true });
  await page.context().close();
});
