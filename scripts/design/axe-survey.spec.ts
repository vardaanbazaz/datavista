import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Report-only axe survey of the views not yet redesigned (phase B scope), dark theme, HR
 * fixture loaded. Prints violation counts per view; never fails.
 */
const VIEWS = ["filters", "charts", "data", "pivot", "stats", "window-builder", "export", "upload"] as const;

test("axe survey of the other views (report only)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("s")) return;
    sessionStorage.setItem("s", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true, theme: "dark" }, version: 1 }));
    localStorage.setItem("datavista-visited", "true");
  });
  await page.goto("/");
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
  await page.getByTestId("category-tiles").waitFor({ timeout: 30_000 });
  for (const view of VIEWS) {
    await page.getByTestId(`sidebar-nav-${view}`).click();
    await page.waitForTimeout(4000);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const summary = r.violations.map((v) => `${v.id}×${v.nodes.length}`).join(", ") || "none";
    console.log(`[axe survey] ${view}: ${r.violations.length} rules, ${r.violations.reduce((n, v) => n + v.nodes.length, 0)} nodes — ${summary}`);
  }
});
