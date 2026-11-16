import { test, expect, type Locator, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

/**
 * First-run setup (SetupFlow) and the product tour (OnboardingTour). The other specs seed a
 * returning user (helpers.ts), so setup never shows there; these start from an empty browser.
 */

async function firstVisit(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("onb-seeded")) return;
    sessionStorage.setItem("onb-seeded", "1");
    localStorage.clear();
  });
  await page.goto("/");
}

test.describe("first-run setup", () => {
  test("three screens, choices apply live and persist, then sample data", async ({ page }) => {
    await firstVisit(page);
    const setup = page.getByTestId("setup-flow");
    await expect(setup).toBeVisible();
    await expect(page.getByTestId("setup-progress")).toHaveText("Setup · step 1 of 3");

    // 1. Look: Dark, applied at once.
    await setup.locator("label", { has: page.getByTestId("setup-theme-dark") }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByTestId("setup-next").click();

    // 2. Effects: no background-animation option (removed); turn transparency off and text size up.
    await expect(page.getByTestId("setup-step-effects")).toBeVisible();
    await expect(page.getByTestId("setup-background-animation")).toHaveCount(0);
    await expect(page.getByTestId("setup-preview")).toBeVisible();
    await page.getByTestId("setup-transparency").uncheck();
    await expect(page.locator("html")).toHaveAttribute("data-transparency", "off");
    await setup.locator("label", { has: page.getByTestId("setup-text-size-large") }).click();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
    await page.getByTestId("setup-next").click();

    // 3. AI: privacy note; skip.
    await expect(page.getByTestId("setup-privacy-note")).toContainText("stays in this browser");
    await page.getByTestId("setup-skip-ai").click();

    await page.getByTestId("setup-sample-data").click();
    await expect(setup).toBeHidden();
    await expect(page.getByText("Sample Sales Data").first()).toBeVisible();

    // Kept after a reload, and setup does not come back.
    await page.reload();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
    await expect(page.locator("html")).toHaveAttribute("data-transparency", "off");
    await page.waitForTimeout(500);
    await expect(setup).toBeHidden();
  });

  test("“Use recommended settings” finishes from any screen; closing ends setup", async ({ page }) => {
    await firstVisit(page);
    await expect(page.getByTestId("setup-flow")).toBeVisible();
    await page.getByTestId("setup-recommended").click();
    await expect(page.getByTestId("setup-step-done")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-animation", /.*/);
    await page.getByTestId("setup-close").click();
    await expect(page.getByTestId("setup-flow")).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("setup-flow")).toBeHidden();
  });

  test("not shown when the browser already holds data, even with no saved preferences", async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
    // Keep IndexedDB (the dataset), drop every preference and the first-visit flag.
    await page.waitForTimeout(1000);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByText("Sample Sales Data").first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("setup-flow")).toBeHidden();
  });

  test("not shown to a returning user; reopened from Appearance", async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId("setup-flow")).toBeHidden();
    await page.getByTestId("open-appearance").click();
    await page.getByTestId("appearance-run-setup").click();
    await expect(page.getByTestId("setup-flow")).toBeVisible();
  });
});

type Box = { x: number; y: number; width: number; height: number };

/** The popover's box once it is fully shown and has stopped moving (two equal reads 100 ms apart). */
async function settledTooltipBox(page: Page): Promise<Box> {
  const floater = page.locator(".react-joyride__floater");
  await expect(floater).toHaveCSS("opacity", "1");
  const tooltip = page.locator(".react-joyride__tooltip");
  let last: Box | null = null;
  for (let i = 0; i < 30; i++) {
    const box = await tooltip.boundingBox();
    if (box && last && Math.abs(box.x - last.x) < 0.5 && Math.abs(box.y - last.y) < 0.5 && Math.abs(box.height - last.height) < 0.5) return box;
    last = box;
    await page.waitForTimeout(100);
  }
  throw new Error("tour popover kept moving");
}

/** The popover does not cover its target and is fully on screen. */
async function expectBesideTarget(page: Page, target: Locator, label: string) {
  const tip = await settledTooltipBox(page);
  const t = (await target.boundingBox())!;
  const overlaps = tip.x < t.x + t.width && t.x < tip.x + tip.width && tip.y < t.y + t.height && t.y < tip.y + tip.height;
  expect(overlaps, `${label}: popover ${JSON.stringify(tip)} covers target ${JSON.stringify(t)}`).toBe(false);
  const vp = page.viewportSize()!;
  expect(tip.x, `${label}: left edge`).toBeGreaterThanOrEqual(0);
  expect(tip.y, `${label}: top edge`).toBeGreaterThanOrEqual(0);
  expect(tip.x + tip.width, `${label}: right edge`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(tip.y + tip.height, `${label}: bottom edge`).toBeLessThanOrEqual(vp.height + 0.5);
  return tip;
}

test.describe("tour", () => {
  /** Section names in the sidebar's order, read from the page. */
  async function sidebarOrder(page: Page) {
    return page.locator('[data-testid^="sidebar-nav-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("sidebar-nav-", "")));
  }

  test("runs every step in sidebar order, each target on screen; ends cleanly", async ({ page }) => {
    test.setTimeout(90_000);
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
    const order = await sidebarOrder(page);
    expect(order).toEqual(["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"]);

    await page.getByTestId("restart-tour").click();
    const tooltip = page.locator(".react-joyride__tooltip");
    const seen: string[] = [];
    for (let i = 0; i < order.length; i++) {
      await expect(tooltip).toBeVisible({ timeout: 15_000 });
      await expect(tooltip).toContainText(`${i + 1} of ${order.length + 1}`);
      // The page behind is lightly dimmed (overlay path painted) with a cut-out around the sidebar item.
      await expect(page.getByTestId("spotlight").locator("path").first()).toHaveAttribute("fill", /rgba\(0, 0, 0, 0\.25\)/);
      const header = page.locator(`[data-tour="view-${order[i]}"]`).first();
      await expect(header).toBeVisible();
      await expect(header).toBeInViewport();
      // Anchored to the sidebar item, to its right, covering neither the item nor the view's header.
      const nav = page.getByTestId(`sidebar-nav-${order[i]}`);
      const tip = await expectBesideTarget(page, nav, order[i]);
      const navBox = (await nav.boundingBox())!;
      expect(tip.x, `${order[i]}: popover right of the sidebar item`).toBeGreaterThanOrEqual(navBox.x + navBox.width);
      const headerBox = (await header.boundingBox())!;
      const title = page.locator(`[data-tour="view-${order[i]}"] h1, [data-tour="view-${order[i]}"] h2`).first();
      const titleBox = (await title.count()) ? (await title.boundingBox())! : headerBox;
      const coversTitle = tip.x < titleBox.x + titleBox.width && titleBox.x < tip.x + tip.width && tip.y < titleBox.y + titleBox.height && titleBox.y < tip.y + tip.height;
      expect(coversTitle, `${order[i]}: popover covers the view title`).toBe(false);
      seen.push(order[i]);
      await page.getByTestId("button-primary").click();
    }
    await expect(tooltip).toBeVisible({ timeout: 15_000 });
    await expect(tooltip).toContainText("Appearance");
    await expect(page.locator('[data-tour="appearance"]:visible')).toHaveCount(1);
    await expectBesideTarget(page, page.locator('[data-tour="appearance"]:visible'), "appearance");
    await page.getByTestId("button-primary").click();

    expect(seen).toEqual(order);
    await expect(tooltip).toBeHidden();
    await expect(page.getByTestId("button-beacon")).toHaveCount(0);
    await expect(page.locator(".react-joyride__overlay")).toHaveCount(0);
  });

  test("phone (390 px): each step is a bottom sheet that leaves the view header uncovered", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
    await page.getByTestId("mobile-menu-toggle").click();
    await page.getByTestId("restart-tour").click();
    const tooltip = page.locator(".react-joyride__tooltip");
    const views = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"];
    for (let i = 0; i < views.length; i++) {
      await expect(tooltip).toBeVisible({ timeout: 15_000 });
      await expect(tooltip).toContainText(`${i + 1} of ${views.length + 1}`);
      const header = page.locator(`[data-tour="view-${views[i]}"]`).first();
      await expect(header).toBeInViewport();
      const tip = await expectBesideTarget(page, header, views[i]);
      // Pinned to the bottom edge, nearly full width.
      expect(844 - (tip.y + tip.height)).toBeLessThanOrEqual(12);
      expect(tip.width).toBeGreaterThanOrEqual(390 - 24);
      await page.getByTestId("button-primary").click();
    }
    await expect(tooltip).toContainText("Appearance");
    await expectBesideTarget(page, page.getByTestId("mobile-menu-toggle"), "appearance");
    await page.getByTestId("button-primary").click();
    await expect(tooltip).toBeHidden();
  });

  test("closing mid-way leaves no beacon or overlay; restart works", async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await page.getByTestId("restart-tour").click();
    const tooltip = page.locator(".react-joyride__tooltip");
    await expect(tooltip).toBeVisible();
    await page.getByTestId("button-primary").click();
    await page.getByTestId("button-primary").click();
    await expect(tooltip).toContainText("Filters");
    await page.getByTestId("button-close").click();
    await expect(tooltip).toBeHidden();
    await page.waitForTimeout(600);
    await expect(page.getByTestId("button-beacon")).toHaveCount(0);
    await expect(page.locator(".react-joyride__overlay, .react-joyride__spotlight")).toHaveCount(0);

    // Esc ends it too.
    await page.getByTestId("restart-tour").click();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Overview");
    // Joyride listens for Esc once the step is fully shown and still (the restart switches back to Overview first).
    await settledTooltipBox(page);
    await expect(page.getByTestId("button-primary")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await page.waitForTimeout(600);
    await expect(page.getByTestId("button-beacon")).toHaveCount(0);
  });
});
