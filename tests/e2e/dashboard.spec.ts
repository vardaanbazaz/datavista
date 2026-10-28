/// <reference lib="dom" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";
import { startFreshSessionWithoutTour } from "./helpers";

test.describe("DataVista End-to-End Core User Journeys", () => {
  test.beforeEach(async ({ page }: { page: any }) => {
    // Clear localStorage to ensure predictable state across runs (tour marked as seen,
    // otherwise its overlay intercepts every click)
    await startFreshSessionWithoutTour(page);
    await page.goto("/");
  });

  test("1. Baseline Render: Header, Sidebar, and Dashboard Canvas mount", async ({ page }: { page: any }) => {
    // Verify Sidebar mounts
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toBeVisible();

    // Verify Main Brand Title
    await expect(page.getByText("DataVista").first()).toBeVisible();

    // Verify Sample Data Action Button
    const sampleBtn = page.getByTestId("sample-data-button");
    await expect(sampleBtn).toBeVisible();
  });

  test("2. Sample Data Load Flow", async ({ page }: { page: any }) => {
    // Click sample data button
    const sampleBtn = page.getByTestId("sample-data-button");
    await sampleBtn.click();

    // Verify summary or dataset view updates with sample dataset name
    await expect(page.getByText("Sample Sales Data").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. CSV File Upload & Data Explorer Flow", async ({ page }: { page: any }) => {
    // Navigate to Upload view via sidebar
    const uploadNav = page.getByTestId("sidebar-nav-upload");
    await uploadNav.click();

    // Create and upload mock CSV buffer
    const csvContent = "Product,Sales,Region\nAlpha,150,North\nBeta,300,South\nGamma,450,East";
    const fileInput = page.getByTestId("file-upload-input");

    await fileInput.setInputFiles({
      name: "test-sales-data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Verify dataset is created and displayed in sidebar/dataset list (dataset names drop
    // the file extension)
    await expect(page.getByText("test-sales-data").first()).toBeVisible({ timeout: 5000 });

    // Navigate to Data Explorer
    const dataNav = page.getByTestId("sidebar-nav-data");
    await dataNav.click();

    // Verify Data Table Container mounts and displays uploaded rows
    const dataTable = page.getByTestId("data-table-container");
    await expect(dataTable).toBeVisible();
    await expect(page.getByText("Alpha").first()).toBeVisible();
    await expect(page.getByText("Beta").first()).toBeVisible();
  });

  test("4. Navigation to Pivot, Stats, and Export views", async ({ page }: { page: any }) => {
    // Load sample data first
    const sampleBtn = page.getByTestId("sample-data-button");
    await sampleBtn.click();
    // uploadDataset switches to Overview when it finishes; wait for that before navigating
    await expect(page.getByText("Sample Sales Data").first()).toBeVisible({ timeout: 5000 });

    // Pivot Analyzer Navigation
    const pivotNav = page.getByTestId("sidebar-nav-pivot");
    await pivotNav.click();
    await expect(page.getByText("Pivot Analyzer").first()).toBeVisible();

    // Statistics Navigation
    const statsNav = page.getByTestId("sidebar-nav-stats");
    await statsNav.click();
    await expect(page.getByText("Statistical Summary").first()).toBeVisible();

    // Export View Navigation
    const exportNav = page.getByTestId("sidebar-nav-export");
    await exportNav.click();
    await expect(page.getByText("Export Dashboard").first()).toBeVisible();
  });
});
