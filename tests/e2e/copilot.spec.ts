import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

/**
 * The copilot panel with a mocked provider (OpenAI routes): open/close (button, close, Esc,
 * Ctrl+J), docked panel shrinking the main column, the phone-width sheet, the Connect card
 * without a key, a streamed answer, and a local-query round trip on the Play Store fixture
 * whose numbers come from the app's own query engine (unit-checked in copilotTools.test.ts).
 */

const KEY = "sk-e2e-copilot-123456";

async function connectOpenAi(page: Page) {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem("copilot-key-seeded")) return;
    sessionStorage.setItem("copilot-key-seeded", "1");
    sessionStorage.setItem("datavista-ai-keys", JSON.stringify({ openai: key }));
    localStorage.setItem(
      "datavista-ai-settings",
      JSON.stringify({ state: { providerId: "openai", models: {}, baseUrls: {}, privacy: { level: "queries", sampleRows: 50, unmasked: [] } }, version: 1 })
    );
  }, KEY);
}

async function importPlaystore(page: Page) {
  await page.goto("/");
  if ((await page.getByTestId("file-upload-input").count()) === 0) await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/playstore-insights.csv");
  const keep = page.getByTestId("issues-keep");
  await expect(async () => {
    if (await keep.isVisible()) await keep.click();
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  }).toPass({ timeout: 60_000 });
  await page.getByTestId("overview-add-kpi").waitFor();
}

const THEMES = [
  { name: "light", theme: "light", highContrast: false },
  { name: "dark", theme: "dark", highContrast: false },
  { name: "light high contrast", theme: "light", highContrast: true },
] as const;

/** Theme and high contrast through the Appearance panel (as in a11y.spec.ts). */
async function switchTheme(page: Page, t: (typeof THEMES)[number]) {
  await page.getByTestId("open-appearance").click();
  const panel = page.getByTestId("appearance-panel");
  await panel.waitFor();
  await panel.locator("label", { has: page.getByTestId(`theme-${t.theme}`) }).click();
  const hc = panel.getByTestId("high-contrast");
  if ((await hc.isChecked()) !== t.highContrast) await hc.setChecked(t.highContrast);
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", t.theme);
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function sse(events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
}

const textChunks = (text: string) => text.match(/.{1,12}/gs)!.map((t) => ({ choices: [{ delta: { content: t } }] }));

async function fulfillSse(route: Route, events: unknown[]) {
  await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: sse(events) });
}

/** Routes OpenAI chat requests to `handler`; returns the parsed request bodies. */
async function mockOpenAi(page: Page, handler: (body: Record<string, unknown>, route: Route, n: number) => Promise<void>) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("https://api.openai.com/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    const body = JSON.parse(route.request().postData() ?? "{}");
    bodies.push(body);
    await handler(body, route, bodies.length);
  });
  return bodies;
}

test("hidden without a dataset; button, close, Esc and Ctrl+J; the docked panel shrinks the main column", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await page.goto("/");
  await page.getByTestId("sidebar").waitFor();
  await expect(page.getByTestId("copilot-fab")).toHaveCount(0);
  await page.keyboard.press("Control+j");
  await expect(page.getByTestId("copilot-panel")).toHaveCount(0);

  await importPlaystore(page);
  const fab = page.getByTestId("copilot-fab");
  await expect(fab).toBeVisible();
  const mainBefore = (await page.locator("#main-content").boundingBox())!.width;

  await fab.click();
  const panel = page.getByTestId("copilot-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("copilot-input")).toBeFocused();
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.width).toBeGreaterThanOrEqual(320);
  expect(panelBox.width).toBeLessThanOrEqual(560);
  const mainAfter = (await page.locator("#main-content").boundingBox())!.width;
  expect(mainBefore - mainAfter).toBeGreaterThan(300);
  await expect(fab).toHaveCount(0);

  await page.getByTestId("copilot-close").click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("copilot-fab")).toBeFocused();

  await page.keyboard.press("Control+j");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+j");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Control+j");
  await expect(panel).toHaveCount(0);
});

test("resizing is kept between 320 and 560 px and remembered after a reload", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  const handle = page.getByTestId("copilot-resize");
  await handle.focus();
  await page.keyboard.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "560");
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "544");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 200, { steps: 4 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "320");
  await page.reload();
  await page.getByTestId("copilot-fab").click();
  await expect(page.getByTestId("copilot-resize")).toHaveAttribute("aria-valuenow", "320");
});

test("the button stays clear of the Data Explorer table's horizontal scrollbar", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await importPlaystore(page);
  await page.getByTestId("sidebar-nav-data").click();
  const scroller = page.locator(".scroll-container").first();
  await scroller.waitFor();
  // Scrolled to the end of the page, the table's bottom edge (its horizontal scrollbar) sits
  // above the button: the main column leaves room for it.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const main = document.querySelector("#main-content");
    main?.scrollTo(0, main.scrollHeight);
  });
  const fab = (await page.getByTestId("copilot-fab").boundingBox())!;
  const table = (await scroller.boundingBox())!;
  const scrollbarTop = table.y + table.height - 16;
  const overlaps = fab.x < table.x + table.width && fab.x + fab.width > table.x && fab.y < table.y + table.height && fab.y + fab.height > scrollbarTop;
  expect(overlaps).toBe(false);
});

test("the button sits above toasts without covering them: toasts move up while it shows", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await importPlaystore(page);
  const toast = page.getByText("Dataset uploaded successfully").first();
  await expect(toast).toBeVisible();
  const toastItem = page.locator("li", { has: toast }).first();
  const fab = (await page.getByTestId("copilot-fab").boundingBox())!;
  const box = (await toastItem.boundingBox())!;
  expect(intersects(fab, box)).toBe(false);
  expect(box.y + box.height).toBeLessThanOrEqual(fab.y);
});

test("no key: the Connect a provider card inside the panel, nothing sent", async ({ page }) => {
  const hits: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://api.openai.com")) hits.push(r.url());
  });
  await startFreshSessionWithoutTour(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  const panel = page.getByTestId("copilot-panel");
  await expect(panel.getByTestId("connect-provider-card")).toBeVisible();
  await expect(panel.getByTestId("copilot-input")).toBeDisabled();
  await expect(panel.getByTestId("copilot-starter").first()).toBeDisabled();
  await expect(panel.getByTestId("copilot-privacy")).toHaveText("Privacy: Queries");
  await expect(panel.getByTestId("connect-provider-open")).toBeFocused();
  await panel.getByTestId("connect-provider-open").click();
  await expect(page.getByTestId("ai-settings-dialog")).toBeVisible();
  expect(hits).toEqual([]);
});

test("a streamed answer with Markdown; stop, copy and retry are there", async ({ page }) => {
  const answer = "The **highest** average rating is in:\n\n- COMICS\n- COMMUNICATION";
  const bodies = await mockOpenAi(page, async (_b, route) => fulfillSse(route, textChunks(answer)));
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await expect(page.getByTestId("copilot-starter").first()).toHaveText("What is the average Rating by Category?");
  await page.getByTestId("copilot-input").fill("Which categories rate best?");
  await page.keyboard.press("Enter");
  const reply = page.getByTestId("copilot-answer").last();
  await expect(reply.locator("strong")).toHaveText("highest");
  await expect(reply.locator("li")).toHaveText(["COMICS", "COMMUNICATION"]);
  await expect(reply.getByTestId("copilot-copy")).toBeVisible();
  await expect(reply.getByTestId("copilot-retry")).toBeVisible();
  expect(bodies[0].stream).toBe(true);
  // The context: dataset, view, filters and the privacy level, with the tools at "Queries".
  const system = (bodies[0].messages as { role: string; content: string }[])[0].content;
  expect(system).toContain('privacy level "queries"');
  expect(system).toContain('on the "Overview" view');
  expect(system).toContain("Active filters: none");
  expect((bodies[0].tools as { function: { name: string } }[]).map((t) => t.function.name)).toEqual(["describe_column", "aggregate", "value_counts"]);
  expect(JSON.stringify(bodies[0])).not.toContain(KEY);
});

test("busy provider: retried with a visible note, then answered", async ({ page }) => {
  await mockOpenAi(page, async (_b, route, n) => {
    if (n === 1) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*", "retry-after": "1" }, body: "overloaded" });
    await fulfillSse(route, textChunks("Back now."));
  });
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await page.getByTestId("copilot-input").fill("hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("copilot-retrying")).toHaveText("Provider busy, retrying…");
  await expect(page.getByTestId("copilot-answer").last()).toContainText("Back now.");
  await expect(page.getByTestId("copilot-retrying")).toHaveCount(0);
});

test("local query round trip: the collapsed step shows the query and the right numbers", async ({ page }) => {
  const args = { groupBy: { column: "Category" }, aggregations: [{ op: "avg", column: "Rating" }] };
  const bodies = await mockOpenAi(page, async (body, route) => {
    const msgs = body.messages as { role: string; content: string }[];
    const toolMsg = msgs.find((m) => m.role === "tool");
    if (!toolMsg) {
      return fulfillSse(route, [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "aggregate", arguments: JSON.stringify(args) } }] } }] }]);
    }
    const top = JSON.parse(toolMsg.content).rows[0];
    await fulfillSse(route, textChunks(`${top.Category} has the highest average rating (**${top.avg_Rating}**).`));
  });
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await page.getByTestId("copilot-starter").first().click();

  const step = page.getByTestId("copilot-step");
  await expect(step).toHaveCount(1);
  await expect(step.locator("summary")).toHaveText("Ran: average Rating by Category · 8 rows");
  await expect(page.getByTestId("copilot-answer").last()).toContainText("COMICS has the highest average rating (4.6).");
  // Collapsed until opened; then the arguments and result are there to check.
  await expect(step.getByTestId("copilot-step-result")).toBeHidden();
  await step.locator("summary").click();
  await expect(step.getByTestId("copilot-step-args")).toContainText('"column": "Category"');
  await expect(step.getByTestId("copilot-step-result")).toContainText('"Category": "COMICS"');
  await expect(step.getByTestId("copilot-step-result")).toContainText('"avg_Rating": 4.6');
  await expect(step.getByTestId("copilot-step-result")).toContainText('"groups": 8');

  // What went back to the provider is the aggregate, not rows.
  const toolMsg = (bodies[1].messages as { role: string; tool_call_id?: string; content: string }[]).find((m) => m.role === "tool")!;
  expect(toolMsg.tool_call_id).toBe("call_1");
  const sent = JSON.parse(toolMsg.content);
  expect(sent).toMatchObject({ matchedRows: 309, groups: 8 });
  expect(sent.rows).toHaveLength(8);
  expect(sent.rows[0]).toEqual({ Category: "COMICS", avg_Rating: 4.6 });

  // axe on the panel with a full conversation (question bubble, open step, Markdown) in Light, Dark and high contrast.
  const found: string[] = [];
  for (const t of THEMES) {
    await switchTheme(page, t);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).include("[data-testid='copilot-panel']").analyze();
    found.push(...result.violations.map((v) => `${t.name} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
  }
  expect(found).toEqual([]);
});

test("axe on the panel (dark, no key)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("dark-seeded")) return;
    sessionStorage.setItem("dark-seeded", "1");
    localStorage.clear();
    localStorage.setItem(
      "datavista-ui-storage",
      JSON.stringify({
        state: {
          hasSeenTour: true,
          hasCompletedSetup: true,
          themeSetting: { mode: "fixed", theme: "dark", day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
          appearance: { textSize: "default", highContrast: false, motion: "reduce", transparency: true },
        },
        version: 3,
      })
    );
    localStorage.setItem("datavista-visited", "true");
  });
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await page.getByTestId("copilot-input").waitFor();
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).include("[data-testid='copilot-panel']").analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("phone width: a full-screen sheet that Esc closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await page.goto("/");
  await loadSampleData(page);
  await page.getByTestId("copilot-fab").click();
  const panel = page.getByTestId("copilot-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("role", "dialog");
  const box = (await panel.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(390);
  expect(box.height).toBe(844);
  await expect(page.getByTestId("copilot-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("copilot-fab")).toBeVisible();
});
