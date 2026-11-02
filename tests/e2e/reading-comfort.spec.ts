import { test, expect } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

// Reading comfort applies at once and is kept in this browser across a reload.
test("reading comfort settings apply immediately and persist after reload", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-text-size", "default");

  await page.getByTestId("open-reading-comfort").click();
  const panel = page.getByTestId("reading-comfort-panel");
  await panel.getByTestId("text-size-xlarge").check();
  await panel.getByTestId("high-contrast").check();
  await panel.getByTestId("simple-frames").check();
  await panel.getByTestId("motion-reduce").check();
  await panel.getByTestId("theme-light").check();

  await expect(html).toHaveAttribute("data-text-size", "xlarge");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveClass(/light/);

  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId("sidebar").waitFor();

  await expect(html).toHaveAttribute("data-text-size", "xlarge");
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-frames", "simple");
  await expect(html).toHaveAttribute("data-motion", "reduce");
  await expect(html).toHaveClass(/light/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("22px");
  const ornament = page.locator(".ornament").first();
  await expect(ornament).toBeAttached();
  expect(await ornament.evaluate((el) => getComputedStyle(el).display)).toBe("none");

  // Reset returns every setting to the default.
  await page.getByTestId("open-reading-comfort").click();
  await page.getByTestId("reading-comfort-reset").click();
  await expect(html).toHaveAttribute("data-text-size", "default");
  await expect(html).not.toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-frames", "ornate");
});
