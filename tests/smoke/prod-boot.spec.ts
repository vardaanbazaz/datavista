import { test, expect } from "@playwright/test";

// Production boot gate: the built bundle must mount the app shell without any uncaught
// error. A chunk cycle (e.g. a TDZ ReferenceError at module evaluation) leaves #root
// empty and throws a pageerror, which this test turns into a CI failure.
test("production build boots and renders the app shell with zero errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.name}: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("./");

  const sidebar = page.getByTestId("sidebar");
  // Give the shell time to mount, but check errors before visibility so a boot crash
  // reports the real exception (e.g. the TDZ ReferenceError) instead of a locator timeout.
  await sidebar.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  expect(errors, "uncaught errors while booting the production build").toEqual([]);

  await expect(sidebar).toBeVisible();
  await expect(page.getByText("DataVista").first()).toBeVisible();
});
