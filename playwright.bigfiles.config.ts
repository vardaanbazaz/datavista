import { defineConfig, devices } from "@playwright/test";

// Local-only big-file checks (npm run test:bigfiles), never in CI: the files live in the
// git-ignored test-data-local/. One worker, and scripts/bigfiles/run.mjs starts a separate
// Playwright run per file, so each file gets a fresh dev server and browser.
export default defineConfig({
  testDir: "./tests/bigfiles",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 12 * 60 * 1000,
  use: {
    baseURL: "http://localhost:8080",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
