import { test, devices, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Batch 6 phase A screenshots: Overview with the HR fixture and the empty Overview
 * (upload entry), each in dark / light / dark + Extra large / dark + high contrast /
 * 390px dark (touch); one bar and one line chart in both themes.
 */

const OUT = process.env.DESIGN_OUT || "docs/design/phase-a";
mkdirSync(OUT, { recursive: true });

type Variant = {
  name: string;
  theme: "light" | "dark";
  textSize?: "default" | "large" | "xlarge";
  highContrast?: boolean;
  mobile?: boolean;
};

const VARIANTS: Variant[] = [
  { name: "dark", theme: "dark" },
  { name: "light", theme: "light" },
  { name: "dark-xl", theme: "dark", textSize: "xlarge" },
  { name: "dark-hc", theme: "dark", highContrast: true },
  { name: "mobile-dark", theme: "dark", mobile: true },
];

async function openApp(browser: Browser, v: Variant): Promise<Page> {
  const context = await browser.newContext({
    ...(v.mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 1000 } }),
    colorScheme: v.theme,
    reducedMotion: "reduce",
    baseURL: "http://localhost:8080",
  });
  const page = await context.newPage();
  const ui = {
    state: {
      hasSeenTour: true,
      theme: v.theme,
      readingComfort: { textSize: v.textSize ?? "default", highContrast: !!v.highContrast, motion: "system", simpleFrames: false },
    },
    version: 1,
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

/** framer-motion keeps opacity fades under reduced motion; wait for every animation to end. */
async function settle(page: Page) {
  // Park the pointer away from the controls so no hover state is captured.
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 2, size.height - 2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 });
  await page.waitForTimeout(3500);
}

async function loadHr(page: Page) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    const toggle = page.getByTestId("mobile-menu-toggle");
    if (await toggle.isVisible()) await toggle.click();
    await page.getByTestId("sidebar-nav-upload").click();
  }
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByText("hr-attrition").first().waitFor();
  await page.getByTestId("category-tiles").waitFor({ timeout: 30_000 });
  // The "Dataset uploaded" toast covers part of the page; let it go.
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await settle(page);
}

for (const v of VARIANTS) {
  test(`empty overview ${v.name}`, async ({ browser }) => {
    const page = await openApp(browser, v);
    await page.getByTestId("overview-empty").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/empty-${v.name}.png`, fullPage: true });
    if (v.mobile) await page.screenshot({ path: `${OUT}/empty-${v.name}-first-screen.png` });
    await page.context().close();
  });

  test(`overview hr ${v.name}`, async ({ browser }) => {
    const page = await openApp(browser, v);
    await loadHr(page);
    await page.screenshot({ path: `${OUT}/overview-hr-${v.name}.png`, fullPage: true });
    if (v.mobile) await page.screenshot({ path: `${OUT}/overview-hr-${v.name}-first-screen.png` });
    await page.context().close();
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`dialogs ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { name: theme, theme });
    await page.getByTestId("open-privacy").click();
    await page.getByTestId("privacy-dialog").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/dialog-privacy-${theme}.png` });
    await page.keyboard.press("Escape");
    await page.getByTestId("open-reading-comfort").click();
    await page.getByTestId("reading-comfort-panel").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/dialog-reading-comfort-${theme}.png` });
    await page.context().close();
  });

  test(`charts ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { name: theme, theme });
    await loadHr(page);
    await page.getByTestId("sidebar-nav-charts").click();
    const pick = async (label: string, option: string) => {
      await page.getByRole("combobox", { name: label }).click();
      await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
    };
    // Bar: count of employees per job role, coloured by department (uses the categorical palette).
    await page.getByLabel("Chart Title").fill("Monthly income by job level and department");
    await pick("X axis column", "JobLevel");
    await pick("Y axis column", "MonthlyIncome");
    await pick("Group by column", "Department");
    await page.getByRole("button", { name: "Create Chart" }).click();
    await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    // Line: average monthly income by age.
    await page.getByRole("button", { name: /^Line/ }).first().click();
    await page.getByLabel("Chart Title").fill("Monthly income by age");
    await pick("X axis column", "Age");
    await pick("Y axis column", "MonthlyIncome");
    await pick("Aggregation", "Average");
    await page.getByRole("button", { name: "Create Chart" }).click();
    const cards = page.getByTestId("chart-card");
    await cards.nth(1).waitFor();
    await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    await settle(page);
    await cards.nth(0).screenshot({ path: `${OUT}/chart-bar-${theme}.png` });
    await cards.nth(1).screenshot({ path: `${OUT}/chart-line-${theme}.png` });
    await page.context().close();
  });
}
