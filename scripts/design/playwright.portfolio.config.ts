import { defineConfig, devices } from "@playwright/test";

// README screenshots from the production build, not a test gate. `npm run build`, then
// `npx playwright test --config scripts/design/playwright.portfolio.config.ts`.
// Writes PNGs to docs/images/; scripts/design/to-webp.sh converts them.
export default defineConfig({
  testDir: ".",
  testMatch: "portfolio.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 180_000,
  use: { baseURL: "http://localhost:4173/datavista/", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    cwd: "../..",
    url: "http://localhost:4173/datavista/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
