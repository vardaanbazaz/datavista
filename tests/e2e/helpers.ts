import type { Page } from "@playwright/test";

/**
 * Starts each test from an empty workspace with the first-visit onboarding tour and
 * welcome dialog already dismissed. The tour's full-screen overlay intercepts every click,
 * so tests that are not about onboarding must not trigger it.
 */
export async function startFreshSessionWithoutTour(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    window.localStorage.clear();
    window.localStorage.setItem(
      "datavista-ui-storage",
      JSON.stringify({ state: { hasSeenTour: true }, version: 1 })
    );
    window.localStorage.setItem("datavista-visited", "true");
  });
}

export async function loadSampleData(page: Page) {
  await page.getByTestId("sample-data-button").click();
  await page.getByText("Sample Sales Data").first().waitFor({ state: "visible" });
}

const NUMERIC_STATS = ["Count", "Average", "Min", "Max", "Sum", "Missing", "Invalid"] as const;

/**
 * One cell of the numeric-columns table (NumericSummaryTable, on Overview and Data Explorer),
 * e.g. numericStat(page, "Rating", "Max"). Values are formatted as shown: "1,339.58", "400".
 */
export function numericStat(page: Page, column: string, stat: (typeof NUMERIC_STATS)[number]) {
  return page.getByTestId(`numeric-row-${column}`).locator("td").nth(NUMERIC_STATS.indexOf(stat));
}
