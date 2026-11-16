import { test, expect, type Page } from "@playwright/test";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";
import { readFileSync } from "fs";

const registry = JSON.parse(readFileSync("src/features/ai/providers/registry.json", "utf8")) as { providers: { baseUrl: string }[] };

/** Hosts of every provider in the registry (hosted and local). */
const PROVIDER_HOSTS = registry.providers
  .map((p) => p.baseUrl)
  .filter(Boolean)
  .map((u) => new URL(u).host);

function watchProviderRequests(page: Page) {
  const hits: string[] = [];
  page.on("request", (req) => {
    const host = new URL(req.url()).host;
    if (PROVIDER_HOSTS.includes(host)) hits.push(req.url());
  });
  return hits;
}

async function openAiSettingsFromPalette(page: Page) {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/search|ask/i).first().fill("/ai top regions");
  await page.getByTestId("connect-provider-open").click();
  await expect(page.getByTestId("ai-settings-dialog")).toBeVisible();
}

async function openUpload(page: Page) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) {
    await page.getByTestId("sidebar-nav-upload").click();
  }
}

test("no key: AI features show Connect a provider, and no request goes to any provider", async ({ page }) => {
  const hits = watchProviderRequests(page);
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await loadSampleData(page);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/search|ask/i).first().fill("/ai top 5 regions by sales");
  await expect(page.getByTestId("connect-provider-card")).toBeVisible();
  // The offline estimate still runs locally.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();

  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByTestId("connect-provider-open").click();
  await expect(page.getByTestId("ai-settings-dialog")).toBeVisible();
  await expect(page.getByTestId("ai-status")).toContainText("Not connected");
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
});

test("key kept for the session survives a reload but not a new tab; a remembered key survives both", async ({ page, context }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await openAiSettingsFromPalette(page);
  await page.getByTestId("ai-provider").selectOption("openai");
  await page.getByTestId("ai-api-key").fill("sk-session-key-123456");
  await expect(page.getByTestId("ai-remember-key")).not.toBeChecked();
  await page.getByTestId("ai-save").click();

  const stored = await page.evaluate(() => ({ session: sessionStorage.getItem("datavista-ai-keys"), local: localStorage.getItem("datavista-ai-keys"), settings: localStorage.getItem("datavista-ai-settings") }));
  expect(stored.session).toContain("sk-session-key-123456");
  expect(stored.local).toBeNull();
  expect(stored.settings).not.toContain("sk-session-key");

  await page.reload();
  await openAiSettingsFromPaletteConnected(page);
  await expect(page.getByTestId("ai-status")).toContainText("Connected — OpenAI");

  // A new tab has a fresh sessionStorage: the session key is gone.
  const tab2 = await context.newPage();
  await tab2.goto("/");
  await openAiSettingsFromPalette(tab2);
  await expect(tab2.getByTestId("ai-status")).toContainText("Not connected");
  await tab2.close();

  // Remember it on this device.
  await page.getByTestId("ai-remember-key").check();
  await expect(page.getByText(/Stored unencrypted/)).toBeVisible();
  await page.getByTestId("ai-save").click();
  expect(await page.evaluate(() => localStorage.getItem("datavista-ai-keys"))).toContain("sk-session-key-123456");

  const tab3 = await context.newPage();
  await tab3.goto("/");
  await openAiSettingsFromPaletteConnected(tab3);
  await expect(tab3.getByTestId("ai-status")).toContainText("Connected — OpenAI");

  // Forget key removes it everywhere.
  await tab3.getByTestId("ai-forget-key").click();
  expect(await tab3.evaluate(() => [localStorage.getItem("datavista-ai-keys"), sessionStorage.getItem("datavista-ai-keys")])).toEqual([null, null]);
  await tab3.close();
});

/** With a provider connected the palette shows no card: open settings with its gear button. */
async function openAiSettingsFromPaletteConnected(page: Page) {
  await page.keyboard.press("Control+k");
  await page.getByRole("button", { name: /AI Co-Pilot settings/i }).click();
  await expect(page.getByTestId("ai-settings-dialog")).toBeVisible();
}

test("preview shows the exact payload with the email column masked", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  const csv = ["Email,Region,Sales", ...Array.from({ length: 40 }, (_, i) => `person${i}@mail.example,${["North", "South"][i % 2]},${100 + i}`)].join("\n");
  await openUpload(page);
  await page.getByTestId("file-upload-input").setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(async () => {
    const keep = page.getByTestId("issues-keep");
    if (await keep.isVisible()) await keep.click();
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  }).toPass({ timeout: 60_000 });
  await page.getByTestId("sidebar").getByText("people", { exact: true }).waitFor();
  await page.waitForTimeout(1500);

  await openAiSettingsFromPalette(page);
  await expect(page.getByTestId("ai-pii-Email")).toContainText("masked");
  await page.getByTestId("ai-level-samples").check();
  await page.getByTestId("ai-preview-button").click();
  const preview = page.getByTestId("ai-preview");
  await expect(preview).toContainText("generativelanguage.googleapis.com");
  await expect(preview).toContainText("[masked email]");
  await expect(preview).toContainText("North");
  await expect(preview).not.toContainText("@mail.example");

  // Unmasking the column sends it as-is.
  await page.getByTestId("ai-pii-Email").getByRole("checkbox").check();
  await page.getByTestId("ai-preview-button").click();
  await expect(preview).toContainText("person0@mail.example");
});

test("Test connection shows a bad-key message in plain words, without the key", async ({ page }) => {
  await page.route("https://api.openai.com/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: { message: "Incorrect API key provided: sk-wrong-key-999999.", type: "invalid_request_error" } }),
    })
  );
  await startFreshSessionWithoutTour(page);
  await page.goto("/");
  await openAiSettingsFromPalette(page);
  await page.getByTestId("ai-provider").selectOption("openai");
  await page.getByTestId("ai-api-key").fill("sk-wrong-key-999999");
  await page.getByTestId("ai-test-connection").click();
  const result = page.getByTestId("ai-test-result");
  await expect(result).toContainText("rejected the API key");
  await expect(result).not.toContainText("sk-wrong-key-999999");
});
