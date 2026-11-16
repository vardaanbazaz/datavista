import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every view, with and without data, and on the
 * main dialogs. CI set: Light, Dark and Light with high contrast. Every theme and its
 * high-contrast variant is covered by the contrast audit (tokens.contrast.test.ts); the full
 * theme × view axe survey is local (scripts/design/axe-survey.spec.ts).
 *
 * Each test opens the app once (and imports the HR fixture once), then switches themes in the
 * page through the Appearance panel. The three tests are independent, so they run on separate
 * workers. Fails on any violation; `incomplete` results are printed.
 */

const THEMES = [
  { name: "light", theme: "light", highContrast: false },
  { name: "dark", theme: "dark", highContrast: false },
  { name: "light high contrast", theme: "light", highContrast: true },
] as const;
type ThemeCase = (typeof THEMES)[number];

const VIEWS = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"] as const;

async function open(page: Page) {
  const ui = {
    state: {
      hasSeenTour: true,
      hasCompletedSetup: true,
      themeSetting: { mode: "fixed", theme: "light", day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
      appearance: { textSize: "default", highContrast: false, motion: "reduce", transparency: true },
    },
    version: 3,
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((value) => {
    if (sessionStorage.getItem("a11y-seeded")) return;
    sessionStorage.setItem("a11y-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", value);
    localStorage.setItem("datavista-visited", "true");
  }, JSON.stringify(ui));
  await page.goto("/");
  await page.getByTestId("sidebar").waitFor();
}

/** Theme and high contrast through the Appearance panel (as a person would). */
async function switchTheme(page: Page, t: ThemeCase) {
  await page.getByTestId("open-appearance").click();
  const panel = page.getByTestId("appearance-panel");
  await panel.waitFor();
  await panel.locator("label", { has: page.getByTestId(`theme-${t.theme}`) }).click();
  const hc = panel.getByTestId("high-contrast");
  if ((await hc.isChecked()) !== t.highContrast) await hc.setChecked(t.highContrast);
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", t.theme);
}

/**
 * Wait until the view has stopped moving: fonts loaded, no finite CSS / Web animation running
 * (the ribbon's drift is infinite and is ignored), and the main column's first child at full
 * opacity with a stable position (framer-motion entrances) for two frames.
 */
async function settle(page: Page) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => {
      const running = document
        .getAnimations()
        .some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity);
      if (running) return false;
      const el = document.querySelector<HTMLElement>("#main-content > *");
      if (!el) return true;
      let o = 1;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      const r = el.getBoundingClientRect();
      const key = `${o.toFixed(3)}|${r.top.toFixed(1)}|${r.left.toFixed(1)}`;
      const w = window as unknown as { __settleKey?: string; __settleCount?: number };
      w.__settleCount = w.__settleKey === key ? (w.__settleCount ?? 0) + 1 : 0;
      w.__settleKey = key;
      return o >= 0.999 && w.__settleCount >= 2;
    },
    null,
    { timeout: 15_000, polling: "raf" }
  );
}

type Found = { where: string; id: string; impact?: string | null; nodes: string[] };

/** Scans and adds any violations to `found`; each test asserts `found` is empty at the end, so one run lists every problem. */
async function scan(page: Page, label: string, found: Found[], include?: string) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const incomplete = result.incomplete
    .filter((r) => r.id !== "color-contrast") // text on glass: axe cannot compute a translucent background; the contrast audit covers it
    .map((r) => `${r.id} (${r.nodes.length})`);
  if (incomplete.length) console.log(`[axe] ${label}: incomplete ${incomplete.join(", ")}`);
  for (const v of result.violations) {
    console.log(`[axe-violation] ${label} :: ${v.id} :: ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} — ${n.html.slice(0, 160)}`).join(" || ")}`);
    found.push({
      where: label,
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
    });
  }
}

async function loadHr(page: Page) {
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByTestId("numeric-summary").waitFor({ timeout: 30_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
}

async function scanViews(page: Page, suffix: string, found: Found[]) {
  for (const t of THEMES) {
    await switchTheme(page, t);
    for (const view of VIEWS) {
      await page.getByTestId(`sidebar-nav-${view}`).click();
      await settle(page);
      await scan(page, `${view}${suffix} ${t.name}`, found);
    }
  }
}

test("axe: every view without data (Light, Dark, high contrast)", async ({ page }) => {
  test.setTimeout(180_000);
  const found: Found[] = [];
  await open(page);
  await scanViews(page, " (empty)", found);
  expect(found).toEqual([]);
});

test("axe: every view with the HR fixture (Light, Dark, high contrast)", async ({ page }) => {
  test.setTimeout(240_000);
  const found: Found[] = [];
  await open(page);
  await loadHr(page);
  // A grouped bar chart so the Charts view has a plot, a legend and an outlier badge.
  await page.getByTestId("sidebar-nav-charts").click();
  await page.getByLabel("Chart Title").fill("Income by job level");
  await page.getByRole("combobox", { name: "X axis column" }).click();
  await page.getByRole("option", { name: /^JobLevel\b/ }).click();
  await page.getByRole("combobox", { name: "Y axis column" }).click();
  await page.getByRole("option", { name: /^MonthlyIncome\b/ }).click();
  await page.getByRole("combobox", { name: "Group by column" }).click();
  await page.getByRole("option", { name: /^Department\b/ }).click();
  await page.getByRole("button", { name: "Create Chart" }).click();
  await page.getByTestId("chart-legend").waitFor();
  await page.getByText("Chart created").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
  await scanViews(page, "", found);
  expect(found).toEqual([]);
});

test("axe: dialogs (Light, Dark, high contrast)", async ({ page }) => {
  test.setTimeout(180_000);
  const found: Found[] = [];
  await open(page);
  await loadHr(page);
  for (const t of THEMES) {
    await switchTheme(page, t);
    await page.getByTestId("open-privacy").click();
    await settle(page);
    await scan(page, `privacy dialog ${t.name}`, found, "[data-testid='privacy-dialog']");
    await page.keyboard.press("Escape");

    await page.getByTestId("open-appearance").click();
    await settle(page);
    await scan(page, `appearance ${t.name}`, found, "[data-testid='appearance-panel']");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await palette.waitFor();
    await page.keyboard.type("chart");
    await settle(page);
    await scan(page, `command palette ${t.name}`, found, "[role='dialog']");

    // AI settings (opened from the palette's Connect a provider card), with the request preview shown.
    await page.getByTestId("connect-provider-open").click();
    const aiSettings = page.getByTestId("ai-settings-dialog");
    await aiSettings.waitFor();
    await page.getByTestId("ai-preview-button").click();
    await page.getByTestId("ai-preview").waitFor();
    await settle(page);
    await scan(page, `AI settings ${t.name}`, found, "[data-testid='ai-settings-dialog']");
    await page.keyboard.press("Escape");
    await aiSettings.waitFor({ state: "hidden" });
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "hidden" });

    await page.getByTestId("sidebar-nav-overview").click();
    await page.getByRole("button", { name: /Snapshots/ }).click();
    await settle(page);
    await scan(page, `snapshots ${t.name}`, found, "[role='dialog']");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  expect(found).toEqual([]);
});
