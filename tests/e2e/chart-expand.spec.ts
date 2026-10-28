import { test, expect, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

async function pickOption(page: Page, selectLabel: string, option: string) {
  await page.getByRole("combobox", { name: selectLabel }).click();
  await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
}

test.describe("Chart expand (full-screen viewer)", () => {
  test.beforeEach(async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
    await page.getByTestId("sidebar-nav-charts").click();

    await page.getByLabel("Chart Title").fill("Sales by Product");
    await pickOption(page, "X axis column", "Product");
    await pickOption(page, "Y axis column", "Sales");
    await page.getByRole("button", { name: "Create Chart" }).click();
    await expect(page.getByTestId("chart-card")).toHaveCount(1);
  });

  test("opens a larger, re-rendered chart and closes on Esc with focus restored", async ({ page }) => {
    const card = page.getByTestId("chart-card");
    const inlineSvg = card.locator("svg[role='img']");
    await expect(inlineSvg).toBeVisible();
    const inlineBox = (await inlineSvg.boundingBox())!;
    const inlineViewBox = await inlineSvg.getAttribute("viewBox");

    const expand = card.getByTestId("chart-expand-button");
    await expect(expand).toHaveAccessibleName("View full screen");
    await expand.click();

    const dialog = page.getByTestId("chart-expand-dialog");
    await expect(dialog).toBeVisible();
    const modalSvg = dialog.locator("svg[role='img']");
    await expect(modalSvg).toBeVisible();
    // Re-rendered at the modal's size: the drawing coordinates (viewBox) change, not just
    // the on-screen box.
    await expect(modalSvg).not.toHaveAttribute("viewBox", inlineViewBox!);
    const modalBox = (await modalSvg.boundingBox())!;
    expect(modalBox.width).toBeGreaterThan(inlineBox.width);
    expect(modalBox.height).toBeGreaterThan(inlineBox.height);
    // Still interactive: clicking a bar in the modal cross-filters, dimming the other bars.
    const bars = modalSvg.locator("rect.bar");
    await expect(bars.first()).toBeVisible();
    await bars.first().click();
    await expect(bars.nth(1)).toHaveAttribute("opacity", "0.25");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(expand).toBeFocused();
  });

  test("closes via the close button and via the backdrop", async ({ page }) => {
    const expand = page.getByTestId("chart-card").getByTestId("chart-expand-button");
    const dialog = page.getByTestId("chart-expand-dialog");

    await expand.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    await expand.click();
    await expect(dialog).toBeVisible();
    // The modal leaves a 1rem gutter of backdrop around it.
    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
  });

  test("the Expand tooltip also appears on keyboard focus", async ({ page }) => {
    const expand = page.getByTestId("chart-card").getByTestId("chart-expand-button");
    await page.getByLabel("Chart Title").focus();
    // Tab forward until the Expand button has focus (keyboard, not pointer).
    for (let i = 0; i < 40 && !(await expand.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(expand).toBeFocused();
    await expect(page.getByRole("tooltip", { name: "View full screen" })).toBeVisible();
  });
});
