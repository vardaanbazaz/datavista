import { defineConfig, devices } from "@playwright/test";

// Boots the production build (`vite build` output served by `vite preview`) in a real
// browser. Unit tests and `vite build` cannot catch chunk-ordering failures such as the
// vendor-react ⇄ engine-core TDZ cycle fixed in 02a8ddc — only loading the bundle can.
export default defineConfig({
  testDir: "./tests/smoke",
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173/datavista/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/datavista/",
    reuseExistingServer: false,
    timeout: 60 * 1000,
  },
});
