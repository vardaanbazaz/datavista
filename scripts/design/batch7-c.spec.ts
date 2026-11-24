import { test, devices, type Browser, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { THEME_BY_ID } from "../../src/shared/theme/themes";

/**
 * Batch 7 phase B fix-up screenshots: the tour step on Charts (desktop: beside the sidebar
 * item; 390 px: bottom sheet), the import dialog while online_retail_II.xlsx is read and its
 * sheet picker, the Play Store import summary, and Overview with googleplaystore.csv in Light
 * and Dusk. The XLSX and Play Store shots need the local files in test-data-local/ (not in Git;
 * skipped without them). `npx playwright test --config scripts/design/playwright.design.config.ts batch7-c`
 * (dev server on :8080). Writes docs/design/batch7-c/*.png (git-ignored).
 */

const OUT = process.env.DESIGN_OUT || "docs/design/batch7-c";
mkdirSync(OUT, { recursive: true });
const RETAIL = "test-data-local/online_retail_II.xlsx";
const PLAYSTORE = "test-data-local/googleplaystore.csv";

type Variant = { theme: string; mobile?: boolean; motion?: boolean };

async function openApp(browser: Browser, v: Variant): Promise<Page> {
  const scheme = THEME_BY_ID[v.theme as keyof typeof THEME_BY_ID].scheme;
  const context = await browser.newContext({
    ...(v.mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 1000 } }),
    colorScheme: scheme,
    reducedMotion: v.motion ? "no-preference" : "reduce",
    baseURL: "http://localhost:8080",
  });
  const page = await context.newPage();
  const ui = {
    state: {
      hasSeenTour: true,
      hasCompletedSetup: true,
      themeSetting: { mode: "fixed", theme: v.theme, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
      appearance: { textSize: "default", highContrast: false, motion: "system", transparency: true },
    },
    version: 3,
  };
  await page.addInitScript((value) => {
    if (sessionStorage.getItem("design-seeded")) return;
    sessionStorage.setItem("design-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", value);
    localStorage.setItem("datavista-visited", "true");
  }, JSON.stringify(ui));
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

async function openUpload(page: Page) {
  const toggle = page.getByTestId("mobile-menu-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").waitFor({ state: "attached" });
}

async function loadFile(page: Page, file: string) {
  await openUpload(page);
  await page.getByTestId("file-upload-input").setInputFiles(file);
  const keep = page.getByTestId("issues-keep");
  const summary = page.getByTestId("category-summary");
  await keep.or(summary).first().waitFor({ timeout: 60_000 });
  if (await keep.isVisible()) await keep.click();
  await summary.waitFor({ timeout: 60_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
}

async function tourToCharts(page: Page) {
  const toggle = page.getByTestId("mobile-menu-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.getByTestId("restart-tour").click();
  const tooltip = page.locator(".react-joyride__tooltip");
  for (let i = 0; i < 3; i++) {
    await tooltip.waitFor();
    await page.getByTestId("button-primary").click();
  }
  await tooltip.filter({ hasText: "Charts" }).waitFor();
  await settle(page);
}

test("tour step on Charts, desktop and 390px", async ({ browser }) => {
  for (const mobile of [false, true]) {
    const page = await openApp(browser, { theme: "light", mobile });
    await loadFile(page, "tests/fixtures/hr-attrition.csv");
    await tourToCharts(page);
    await page.screenshot({ path: `${OUT}/tour-charts-light${mobile ? "-390" : ""}.png` });
    await page.context().close();
  }
});

test("import dialog: XLSX read, sheet picker", async ({ browser }) => {
  test.skip(!existsSync(RETAIL), "needs test-data-local/online_retail_II.xlsx");
  test.setTimeout(240_000);
  for (const v of [{ theme: "light", motion: true }, { theme: "light", mobile: true }] as Variant[]) {
    const page = await openApp(browser, v);
    const suffix = v.mobile ? "-390-reduced-motion" : "";
    await openUpload(page);
    await page.getByTestId("file-upload-input").setInputFiles(RETAIL);
    const text = page.getByTestId("import-progress-text");
    await text.filter({ hasText: "you'll choose a sheet next" }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/import-xlsx-reading${suffix}.png` });
    await page.getByTestId("sheet-picker").waitFor({ timeout: 90_000 });
    await settle(page);
    await page.screenshot({ path: `${OUT}/import-xlsx-sheet-picker${suffix}.png` });
    await page.context().close();
  }
});

test("import summary and Overview with googleplaystore", async ({ browser }) => {
  test.skip(!existsSync(PLAYSTORE), "needs test-data-local/googleplaystore.csv");
  test.setTimeout(180_000);
  for (const theme of ["light", "dusk"]) {
    const page = await openApp(browser, { theme });
    if (theme === "light") {
      await openUpload(page);
      await page.getByTestId("file-upload-input").setInputFiles(PLAYSTORE);
      await page.getByTestId("issues-keep").waitFor({ timeout: 60_000 });
      await settle(page);
      await page.screenshot({ path: `${OUT}/import-summary-playstore.png` });
      await page.getByTestId("issues-keep").click();
      await page.getByTestId("category-summary").waitFor({ timeout: 60_000 });
      await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
      await settle(page);
    } else {
      await loadFile(page, PLAYSTORE);
    }
    await page.screenshot({ path: `${OUT}/overview-googleplaystore-${theme}.png`, fullPage: true });
    await page.context().close();
  }
});
