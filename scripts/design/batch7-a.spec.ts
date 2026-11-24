import { test, devices, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { logoSvg } from "../../src/shared/brand/logoGeometry";
import { THEME_BY_ID } from "../../src/shared/theme/themes";

/**
 * Batch 7 phase A screenshots (glass frame, solid data): Overview with the HR fixture in six
 * themes, the Charts view (grouped bar + line) in three, the empty state in two, Overview in
 * Dark + high contrast, Light with transparency off, Light at 390px, the Appearance panel, and
 * the logo sheet. `npx playwright test --config scripts/design/playwright.design.config.ts batch7-a`
 * (dev server on :8080). Writes docs/design/batch7-a/*.png (git-ignored).
 */

const OUT = process.env.DESIGN_OUT || "docs/design/batch7-a";
mkdirSync(OUT, { recursive: true });

type Variant = { theme: string; highContrast?: boolean; transparency?: boolean; mobile?: boolean };

async function openApp(browser: Browser, v: Variant): Promise<Page> {
  const scheme = THEME_BY_ID[v.theme as keyof typeof THEME_BY_ID].scheme;
  const context = await browser.newContext({
    ...(v.mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 1000 } }),
    colorScheme: scheme,
    // Screenshots must be deterministic: the ribbon is drawn still (its paused first frame).
    reducedMotion: "reduce",
    baseURL: "http://localhost:8080",
  });
  const page = await context.newPage();
  const ui = {
    state: {
      hasSeenTour: true,
      themeSetting: { mode: "fixed", theme: v.theme, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
      appearance: { textSize: "default", highContrast: !!v.highContrast, motion: "system", transparency: v.transparency ?? true },
    },
    version: 2,
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
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 2, size.height - 2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 });
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

for (const theme of ["light", "dark", "mist", "clay", "dusk", "midnight"]) {
  test(`overview hr ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { theme });
    await loadHr(page);
    await page.screenshot({ path: `${OUT}/overview-hr-${theme}.png`, fullPage: true });
    await page.context().close();
  });
}

test("overview hr dark + high contrast", async ({ browser }) => {
  const page = await openApp(browser, { theme: "dark", highContrast: true });
  await loadHr(page);
  await page.screenshot({ path: `${OUT}/overview-hr-dark-hc.png`, fullPage: true });
  await page.context().close();
});

test("overview hr light, transparency off", async ({ browser }) => {
  const page = await openApp(browser, { theme: "light", transparency: false });
  await loadHr(page);
  await page.screenshot({ path: `${OUT}/overview-hr-light-no-transparency.png`, fullPage: true });
  await page.context().close();
});

test("overview hr light 390px", async ({ browser }) => {
  const page = await openApp(browser, { theme: "light", mobile: true });
  await loadHr(page);
  await page.screenshot({ path: `${OUT}/overview-hr-light-390-first-screen.png` });
  await page.screenshot({ path: `${OUT}/overview-hr-light-390.png`, fullPage: true });
  await page.context().close();
});

for (const theme of ["light", "midnight"]) {
  test(`empty ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { theme });
    await page.getByTestId("overview-empty").waitFor();
    await settle(page);
    await page.screenshot({ path: `${OUT}/empty-${theme}.png`, fullPage: true });
    await page.context().close();
  });
}

for (const theme of ["light", "clay", "dark"]) {
  test(`charts ${theme}`, async ({ browser }) => {
    const page = await openApp(browser, { theme });
    await loadHr(page);
    await page.getByTestId("sidebar-nav-charts").click();
    const pick = async (label: string, option: string) => {
      await page.getByRole("combobox", { name: label }).click();
      await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
    };
    // Grouped bar: average monthly income by job level, one bar per department.
    await page.getByLabel("Chart Title").fill("Monthly income by job level and department");
    await pick("X axis column", "JobLevel");
    await pick("Y axis column", "MonthlyIncome");
    await pick("Aggregation", "Average");
    await pick("Group by column", "Department");
    await page.getByRole("button", { name: "Create Chart" }).click();
    await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    // Line: average monthly income by years at the company, one line per department.
    await page.getByRole("button", { name: /^Line/ }).first().click();
    await page.getByLabel("Chart Title").fill("Monthly income by years at company");
    await pick("X axis column", "YearsAtCompany");
    await pick("Y axis column", "MonthlyIncome");
    await pick("Aggregation", "Average");
    await pick("Group by column", "Department");
    await page.getByRole("button", { name: "Create Chart" }).click();
    await page.getByTestId("chart-card").nth(1).waitFor();
    await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    await settle(page);
    await page.screenshot({ path: `${OUT}/charts-${theme}.png`, fullPage: true });
    await page.context().close();
  });
}

test("appearance panel", async ({ browser }) => {
  const page = await openApp(browser, { theme: "light" });
  await page.getByTestId("open-appearance").click();
  await page.getByTestId("appearance-panel").waitFor();
  await page.locator("label", { has: page.getByTestId("theme-auto") }).click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/appearance-panel-light.png` });
  await page.getByTestId("appearance-panel").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await settle(page);
  await page.screenshot({ path: `${OUT}/appearance-panel-light-options.png` });
  await page.context().close();
});

test("logo sheet", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 980, height: 520 }, deviceScaleFactor: 2 });
  const bgs = [
    { name: "Light", color: THEME_BY_ID.light.tokens.background },
    { name: "Clay (mid)", color: THEME_BY_ID.clay.tokens.background },
    { name: "Dusk (mid)", color: THEME_BY_ID.dusk.tokens.background },
    { name: "Dark", color: THEME_BY_ID.dark.tokens.background },
  ];
  const row = (mono: boolean) =>
    bgs
      .map(
        (b) => `<div class="cell" style="background:${b.color};color:${mono ? (b.name === "Light" || b.name === "Clay (mid)" ? "#3730A3" : "#C7D2FE") : "inherit"}">
          <div class="marks">${[16, 32, 128].map((s) => logoSvg({ size: s, mono, color: mono ? (b.name === "Light" || b.name === "Clay (mid)" ? "#3730A3" : "#C7D2FE") : undefined })).join("")}</div>
          <span style="color:${b.name === "Light" || b.name === "Clay (mid)" ? "#111" : "#eee"}">${b.name}${mono ? ", mono" : ""}</span></div>`
      )
      .join("");
  const html = `<!doctype html><html><head><style>
    body{margin:0;font:13px system-ui;background:#fff}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0}
    .cell{padding:20px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}
    .marks{display:flex;align-items:flex-end;gap:18px}
  </style></head><body><div class="grid">${row(false)}${row(true)}</div></body></html>`;
  await page.setContent(html);
  await page.screenshot({ path: `${OUT}/logo-16-32-128.png`, fullPage: true });
  await page.close();
});
