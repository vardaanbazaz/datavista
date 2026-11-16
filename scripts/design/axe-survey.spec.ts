import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Local full axe survey (not in CI): every theme (AXE_THEMES, default all ten) × normal and high
 * contrast × every view, empty and with the HR fixture, plus the Appearance panel, the setup
 * dialog and the command palette. CI's tests/e2e/a11y.spec.ts runs Light, Dark and Light high
 * contrast; tokens.contrast.test.ts checks the colours of every theme.
 *
 *   npx playwright test --config scripts/design/playwright.design.config.ts axe-survey
 *
 * Prints violations per theme and view, and fails if there are any (AXE_REPORT_ONLY=1 to only print).
 */
const THEMES = (process.env.AXE_THEMES || "light,dark,mist,mint,clay,taupe,dusk,graphite,midnight,carbon").split(",");
const VIEWS = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function settle(page: Page) {
  await page.mouse.move(1, 1);
  await page.waitForFunction(
    () => {
      const running = document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity);
      const el = document.querySelector<HTMLElement>("#main-content > *");
      let o = 1;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return !running && o >= 0.999;
    },
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(100);
}

for (const theme of THEMES) {
  for (const highContrast of [false, true]) {
    const name = `${theme}${highContrast ? " high contrast" : ""}`;
    test(`axe survey ${name}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(
        ([t, hc]) => {
          if (sessionStorage.getItem("s")) return;
          sessionStorage.setItem("s", "1");
          localStorage.clear();
          localStorage.setItem(
            "datavista-ui-storage",
            JSON.stringify({
              state: {
                hasSeenTour: true,
                hasCompletedSetup: true,
                themeSetting: { mode: "fixed", theme: t, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
                appearance: { textSize: "default", highContrast: hc, motion: "reduce", transparency: true },
              },
              version: 3,
            })
          );
          localStorage.setItem("datavista-visited", "true");
        },
        [theme, highContrast] as const
      );
      await page.goto("/");
      await page.getByTestId("sidebar").waitFor();
      const violations: string[] = [];
      const report = async (label: string, include?: string) => {
        await settle(page);
        let b = new AxeBuilder({ page }).withTags(TAGS);
        if (include) b = b.include(include);
        const r = await b.analyze();
        for (const v of r.violations) violations.push(`${label}: ${v.id}×${v.nodes.length} (${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join("; ")})`);
        console.log(`[axe survey] ${name} ${label}: ${r.violations.length ? r.violations.map((v) => v.id).join(", ") : "none"}`);
      };
      for (const view of VIEWS) {
        await page.getByTestId(`sidebar-nav-${view}`).click();
        await report(`${view} (empty)`);
      }
      await page.getByTestId("open-appearance").click();
      await report("appearance panel", "[data-testid='appearance-panel']");
      await page.getByTestId("appearance-run-setup").click();
      await report("setup: look", "[data-testid='setup-flow']");
      await page.getByTestId("setup-next").click();
      await report("setup: effects", "[data-testid='setup-flow']");
      await page.getByTestId("setup-next").click();
      await report("setup: AI", "[data-testid='setup-flow']");
      await page.keyboard.press("Escape");

      await page.getByTestId("sidebar-nav-upload").click();
      await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
      await page.getByTestId("numeric-summary").waitFor({ timeout: 30_000 });
      await page.getByText("Dataset uploaded successfully").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
      for (const view of VIEWS) {
        await page.getByTestId(`sidebar-nav-${view}`).click();
        await report(view);
      }
      await page.keyboard.press("Control+k");
      await page.getByRole("dialog", { name: "Command Palette" }).waitFor();
      await page.keyboard.type("chart");
      await report("command palette", "[role='dialog']");
      await page.keyboard.press("Escape");
      if (!process.env.AXE_REPORT_ONLY) expect(violations).toEqual([]);
    });
  }
}
