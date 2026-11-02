import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe-core (WCAG 2.0/2.1/2.2 A + AA rules) on every view, with and without data, and on the
 * main dialogs, in light, dark and both high-contrast sets. Fails on any violation;
 * `incomplete` results (axe could not decide, e.g. text over a pseudo-element) are printed
 * so they are not silently passed.
 */

const THEMES = [
  { name: "dark", theme: "dark", highContrast: false },
  { name: "light", theme: "light", highContrast: false },
  { name: "dark high contrast", theme: "dark", highContrast: true },
  { name: "light high contrast", theme: "light", highContrast: true },
] as const;

const VIEWS = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"] as const;

async function open(page: Page, theme: "light" | "dark", highContrast: boolean) {
  const ui = {
    state: { hasSeenTour: true, theme, readingComfort: { textSize: "default", highContrast, motion: "reduce", simpleFrames: false } },
    version: 1,
  };
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
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

/** Opacity fades still run under reduced motion; contrast must be read once they end. */
async function settle(page: Page) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 });
  await page.waitForTimeout(1500);
}

type Found = { where: string; id: string; impact?: string | null; nodes: string[] };

/** Scans and adds any violations to `found`; each test asserts `found` is empty at the end, so one run lists every problem. */
async function scan(page: Page, label: string, found: Found[], include?: string) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const incomplete = result.incomplete.map(
    (r) => `${r.id} (${r.nodes.length}: ${r.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} [${n.any[0]?.message ?? ""}]`).join("; ")})`
  );
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
  await page.getByTestId("numeric-ledger").waitFor({ timeout: 30_000 });
  await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
}

for (const t of THEMES) {
  test.describe(`axe, ${t.name}`, () => {
    test("every view without data", async ({ page }) => {
      test.setTimeout(180_000);
      const found: Found[] = [];
      await open(page, t.theme, t.highContrast);
      for (const view of VIEWS) {
        await page.getByTestId(`sidebar-nav-${view}`).click();
        await settle(page);
        await scan(page, `${view} (empty) ${t.name}`, found);
      }
      expect(found).toEqual([]);
    });

    test("every view with the HR fixture", async ({ page }) => {
      test.setTimeout(240_000);
      const found: Found[] = [];
      await open(page, t.theme, t.highContrast);
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
      for (const view of VIEWS) {
        await page.getByTestId(`sidebar-nav-${view}`).click();
        await settle(page);
        await scan(page, `${view} ${t.name}`, found);
      }
      expect(found).toEqual([]);
    });

    test("dialogs", async ({ page }) => {
      test.setTimeout(180_000);
      const found: Found[] = [];
      await open(page, t.theme, t.highContrast);
      await page.getByTestId("open-privacy").click();
      await settle(page);
      await scan(page, `privacy dialog ${t.name}`, found, "[data-testid='privacy-dialog']");
      await page.keyboard.press("Escape");

      await page.getByTestId("open-reading-comfort").click();
      await settle(page);
      await scan(page, `reading comfort ${t.name}`, found, "[data-testid='reading-comfort-panel']");
      await page.keyboard.press("Escape");

      await page.keyboard.press("Control+k");
      const palette = page.getByRole("dialog", { name: "Command Palette" });
      await palette.waitFor();
      await page.keyboard.type("chart");
      await settle(page);
      await scan(page, `command palette ${t.name}`, found, "[role='dialog']");
      await page.keyboard.press("Escape");

      await loadHr(page);
      await page.getByRole("button", { name: /Snapshots/ }).click();
      await settle(page);
      await scan(page, `snapshots ${t.name}`, found, "[role='dialog']");
      expect(found).toEqual([]);
    });
  });
}
