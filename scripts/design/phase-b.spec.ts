import { test, devices, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Batch 6 phase B screenshots: Overview with the HR fixture (dark, light, dark + Extra large,
 * 390px dark), the Charts view, Data Explorer, Pivot, one dialog, both themes for the views.
 * (compare-categories-tiles/ledger.png were shot once, before the ledger was chosen; the
 * tiles layout no longer exists.)
 */

const OUT = process.env.DESIGN_OUT || "docs/design/phase-b";
mkdirSync(OUT, { recursive: true });

type Variant = { name: string; theme: "light" | "dark"; textSize?: "default" | "large" | "xlarge"; mobile?: boolean; extra?: Record<string, string> };

async function openApp(browser: Browser, v: Variant): Promise<Page> {
  const context = await browser.newContext({
    ...(v.mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 1000 } }),
    colorScheme: v.theme,
    reducedMotion: "reduce",
    baseURL: "http://localhost:8080",
  });
  const page = await context.newPage();
  const ui = {
    state: { hasSeenTour: true, theme: v.theme, readingComfort: { textSize: v.textSize ?? "default", highContrast: false, motion: "system", simpleFrames: false } },
    version: 1,
  };
  await page.addInitScript(
    ([value, extra]) => {
      if (sessionStorage.getItem("design-seeded")) return;
      sessionStorage.setItem("design-seeded", "1");
      localStorage.clear();
      localStorage.setItem("datavista-ui-storage", value);
      localStorage.setItem("datavista-visited", "true");
      for (const [k, val] of Object.entries(JSON.parse(extra))) localStorage.setItem(k, val as string);
    },
    [JSON.stringify(ui), JSON.stringify(v.extra ?? {})] as const
  );
  await page.goto("/");
  await page.getByTestId("sidebar").waitFor();
  return page;
}

async function settle(page: Page) {
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 2, size.height - 2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 });
  await page.waitForTimeout(3000);
}

async function nav(page: Page, view: string) {
  const toggle = page.getByTestId("mobile-menu-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.getByTestId(`sidebar-nav-${view}`).click();
}

async function loadHr(page: Page) {
  await nav(page, "upload");
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByTestId("numeric-ledger").waitFor({ timeout: 30_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
}

const OVERVIEW: Variant[] = [
  { name: "dark", theme: "dark" },
  { name: "light", theme: "light" },
  { name: "dark-xl", theme: "dark", textSize: "xlarge" },
  { name: "mobile-dark", theme: "dark", mobile: true },
];

for (const v of OVERVIEW) {
  test(`overview ${v.name}`, async ({ browser }) => {
    const page = await openApp(browser, v);
    await loadHr(page);
    await page.screenshot({ path: `${OUT}/overview-hr-${v.name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/overview-hr-${v.name}-first-screen.png` });
    await page.context().close();
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`views ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { name: theme, theme });
    await loadHr(page);

    // Charts: a grouped bar (legend) and a line chart.
    await nav(page, "charts");
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
    await page.screenshot({ path: `${OUT}/charts-${theme}.png`, fullPage: true });
    await page.getByTestId("chart-card").nth(0).screenshot({ path: `${OUT}/chart-bar-${theme}.png` });
    await page.getByTestId("chart-card").nth(1).screenshot({ path: `${OUT}/chart-line-${theme}.png` });

    await nav(page, "data");
    await settle(page);
    await page.screenshot({ path: `${OUT}/data-explorer-${theme}.png` });

    await nav(page, "pivot");
    await settle(page);
    await page.screenshot({ path: `${OUT}/pivot-${theme}.png`, fullPage: true });

    await nav(page, "upload");
    await settle(page);
    await page.screenshot({ path: `${OUT}/upload-${theme}.png` });

    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Command Palette" }).waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/dialog-command-palette-${theme}.png` });
    await page.context().close();
  });
}
