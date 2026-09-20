/// <reference lib="dom" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";

test.describe("Regression: GlobalFilterBar savedViews selector infinite loop", () => {
  test.beforeEach(async ({ page }: { page: any }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      // Skip the onboarding Joyride overlay and first-visit welcome dialog, which
      // otherwise intercept pointer events before the app under test is reachable.
      window.localStorage.setItem(
        "datavista-ui-storage",
        JSON.stringify({ state: { hasSeenTour: true, runTour: false }, version: 1 })
      );
      window.localStorage.setItem("datavista-visited", "true");
    });
    await page.goto("/");
  });

  test("Creating a dashboard does not crash with Maximum update depth exceeded", async ({ page }: { page: any }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err: Error) => pageErrors.push(err.message));
    page.on("console", (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Load sample data so a dataset is active (required before dashboard creation).
    const sampleBtn = page.getByTestId("sample-data-button");
    await sampleBtn.click();
    await expect(page.getByText("Sample Sales Data").first()).toBeVisible({ timeout: 5000 });

    // Create a blank dashboard via the sidebar "+" control; it uses window.prompt.
    page.once("dialog", (dialog: any) => dialog.accept("Regression Test Dashboard"));
    await page.getByRole("button", { name: "Create new blank dashboard" }).click();

    // GlobalFilterBar mounts once a dashboard is active — this is exactly where the
    // savedViews selector used to run state.savedViews.filter(...) inline and loop forever,
    // which the app's ErrorBoundary then caught and rendered as "Something went wrong".
    await expect(page.getByText("Something went wrong")).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Dashboard Filters:")).toBeVisible({ timeout: 5000 });

    // Give React a beat to settle into (or blow past) the update-depth limit.
    await page.waitForTimeout(1500);

    const updateDepthHit = [...pageErrors, ...consoleErrors].some((m) =>
      m.includes("Maximum update depth exceeded")
    );
    expect(updateDepthHit, `Console/page errors:\n${[...pageErrors, ...consoleErrors].join("\n")}`).toBe(false);
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join("\n")}`).toHaveLength(0);

    // App must still be interactive, not stuck in a crash loop.
    await expect(page.getByText("Regression Test Dashboard").first()).toBeVisible();
  });
});
