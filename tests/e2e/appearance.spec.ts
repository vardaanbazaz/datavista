import { test, expect } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

// Appearance applies at once and is kept in this browser across a reload (the pre-paint boot
// script reads it back, so it is on <html> before the app runs).
test("appearance settings apply immediately and persist after reload", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-text-size", "default");
  await expect(html).toHaveAttribute("data-transparency", "on");

  await page.getByTestId("open-appearance").click();
  const panel = page.getByTestId("appearance-panel");
  await panel.getByTestId("text-size-xlarge").check();
  await panel.getByTestId("motion-reduce").check();
  await panel.locator("label", { has: page.getByTestId("theme-clay") }).click();

  await expect(html).toHaveAttribute("data-theme", "clay");
  await expect(html).toHaveClass(/light/);
  await expect(html).toHaveAttribute("data-text-size", "xlarge");
  await expect(panel.getByTestId("background-animation")).toHaveCount(0);

  // High contrast forces glass off and says why.
  await panel.getByTestId("high-contrast").check();
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-transparency", "off");
  await expect(panel.getByTestId("transparency-blocked")).toContainText("High contrast");

  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId("sidebar").waitFor();

  await expect(html).toHaveAttribute("data-theme", "clay");
  await expect(html).toHaveAttribute("data-text-size", "xlarge");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-motion", "reduce");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("22px");
  await expect(page.getByTestId("aurora-ribbon")).toBeHidden();

  // Reset returns every setting to the default (Automatic, following the device).
  await page.getByTestId("open-appearance").click();
  await page.getByTestId("appearance-reset").click();
  await expect(html).toHaveAttribute("data-text-size", "default");
  await expect(html).not.toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-transparency", "on");
  await expect(page.getByTestId("automatic-options")).toBeVisible();
});

test("Automatic follows the device's light / dark setting live", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveClass(/dark/);
});

test("Automatic on a schedule shows the night theme outside day hours", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.clock.setFixedTime(new Date(2026, 10, 2, 22, 30));
  await page.goto("/");
  await page.getByTestId("open-appearance").click();
  const panel = page.getByTestId("appearance-panel");
  await panel.getByTestId("auto-night").selectOption("midnight");
  await panel.getByTestId("auto-trigger-schedule").check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await panel.getByTestId("night-start").fill("23:30");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
