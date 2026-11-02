import { defineConfig, devices } from "@playwright/test";

// Design screenshots (batch 6 redesign review), not a test gate: `npx playwright test
// --config scripts/design/playwright.design.config.ts`. Writes PNGs to docs/design/<phase>/.
export default defineConfig({
  testDir: ".",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: { baseURL: "http://localhost:8080", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: "npm run dev",
    cwd: "../..",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
