import { test, expect, devices } from "@playwright/test";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

// iPhone 13 viewport/touch/UA on the configured Chromium project. defaultBrowserType is
// dropped because it cannot be switched per-describe (it forces a different browser).
const { defaultBrowserType: _defaultBrowserType, ...iPhone13 } = devices["iPhone 13"];
test.use(iPhone13);

test.describe("Mobile section menu", () => {
  test.beforeEach(async ({ page }) => {
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
    await loadSampleData(page);
  });

  test("closes after picking a section and shows the new section", async ({ page }) => {
    const toggle = page.getByTestId("mobile-menu-toggle");
    const menu = page.getByTestId("sidebar-menu");

    await expect(menu).toBeHidden();
    await toggle.tap();
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await page.getByTestId("sidebar-nav-charts").tap();

    await expect(menu).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("mobile-menu-current")).toHaveText("Charts");
    const heading = page.getByRole("heading", { name: "Chart Builder" });
    await expect(heading).toBeInViewport();

    // Reopening shows the picked section as the current one.
    await toggle.tap();
    await expect(page.getByTestId("sidebar-nav-charts")).toHaveAttribute("aria-current", "page");
  });

  test("closes on Escape", async ({ page }) => {
    await page.getByTestId("mobile-menu-toggle").tap();
    await expect(page.getByTestId("sidebar-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sidebar-menu")).toBeHidden();
  });

  test("closes on a tap outside the menu", async ({ page }) => {
    await page.getByTestId("mobile-menu-toggle").tap();
    const menu = page.getByTestId("sidebar-menu");
    await expect(menu).toBeVisible();
    // The main content sits below the expanded menu; tap it.
    const main = page.locator("#main-content");
    await main.scrollIntoViewIfNeeded();
    await main.tap({ position: { x: 10, y: 10 } });
    await expect(menu).toBeHidden();
  });

  test("closes when the view changes from another source (command palette)", async ({ page }) => {
    await page.getByTestId("mobile-menu-toggle").tap();
    await expect(page.getByTestId("sidebar-menu")).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await expect(palette).toBeVisible();
    await palette.getByRole("textbox").fill("Go to Data Explorer");
    await palette.getByText("Go to Data Explorer", { exact: true }).click();
    await expect(page.getByTestId("sidebar-menu")).toBeHidden();
    await expect(page.getByTestId("mobile-menu-current")).toHaveText("Data Explorer");
  });
});
