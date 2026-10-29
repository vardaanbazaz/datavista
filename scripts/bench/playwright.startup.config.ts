import { defineConfig, devices } from "@playwright/test";

// Local-only startup and save timing (never in CI): the production build served by
// `vite preview`, real Chromium IndexedDB. Run `npm run build` first, then
// `npx playwright test --config scripts/bench/playwright.startup.config.ts [-g <scenario>]`.
// Results go to bench-results/*.json (git-ignored). One worker: the scenarios hold up to 1M rows.
export default defineConfig({
  testDir: "./startup",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 20 * 60 * 1000,
  use: {
    baseURL: "http://localhost:4173/datavista/",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    cwd: "../..",
    url: "http://localhost:4173/datavista/",
    reuseExistingServer: false,
    timeout: 60 * 1000,
  },
});
