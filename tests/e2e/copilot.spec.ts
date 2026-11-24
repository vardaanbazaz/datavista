import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startFreshSessionWithoutTour, loadSampleData } from "./helpers";

/**
 * The copilot panel with a mocked provider (OpenAI routes): open/close (button, close, Esc,
 * Ctrl+J), Ctrl+J and the sidebar button without a dataset (empty state, browser default
 * prevented), docked panel shrinking the main column, the phone-width sheet, the Connect card
 * without a key, a streamed answer, a local-query round trip on the Play Store fixture whose
 * numbers come from the app's own query engine (unit-checked in copilotTools.test.ts), Ctrl+K
 * "/ai ..." routed into the panel, the "Still waiting" note for a slow provider, a proposed
 * chart (card, Apply, Undo, also after a reload), and the saved chat (reload, Clear chat).
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

/** Records, in the bubble phase, whether the last Ctrl/Cmd+J keydown had its default prevented. */
async function watchCtrlJ(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __ctrlJ: boolean[] };
    w.__ctrlJ = [];
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") w.__ctrlJ.push(e.defaultPrevented);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __ctrlJ: boolean[] }).__ctrlJ);
}

test("no dataset: Ctrl+J opens the empty state (browser default prevented); Try sample loads one", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await page.goto("/");
  await page.getByTestId("sidebar").waitFor();
  await expect(page.getByTestId("copilot-fab")).toHaveCount(0);
  const prevented = await watchCtrlJ(page);

  await page.keyboard.press("Control+j");
  const panel = page.getByTestId("copilot-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("copilot-empty")).toContainText("Load a dataset to start");
  await expect(panel.getByTestId("copilot-empty-upload")).toBeVisible();
  await expect(panel.getByTestId("copilot-empty-sample")).toBeFocused();
  expect(await prevented()).toEqual([true]);
  // The round button stays hidden without a dataset.
  await expect(page.getByTestId("copilot-fab")).toHaveCount(0);

  await page.keyboard.press("Control+j");
  await expect(panel).toHaveCount(0);
  expect(await prevented()).toEqual([true, true]);

  // The sidebar's Co-Pilot button does the same; Upload goes to the upload view and closes it.
  await page.getByTestId("sidebar").getByRole("button", { name: "Co-Pilot" }).click();
  await expect(panel.getByTestId("copilot-empty")).toBeVisible();
  await panel.getByTestId("copilot-empty-upload").click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("file-upload-input")).toHaveCount(1);

  // Try sample: the dataset loads and the panel turns into the chat.
  await page.keyboard.press("Control+j");
  await panel.getByTestId("copilot-empty-sample").click();
  await expect(panel.getByTestId("copilot-input")).toBeVisible();
  await expect(panel.getByTestId("copilot-empty")).toHaveCount(0);
});

test("button, close, Esc and Ctrl+J; the docked panel shrinks the main column", async ({ page }) => {
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
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
  expect((bodies[0].tools as { function: { name: string } }[]).map((t) => t.function.name)).toEqual(["describe_column", "aggregate", "value_counts", "propose_chart", "propose_kpi", "propose_filter"]);
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

test('Ctrl+K "/ai <question>" with a provider: sent in the copilot panel (one AI path), with the exact steps', async ({ page }) => {
  const QUESTION = "Which category has the highest average rating?";
  const args = { groupBy: { column: "Category" }, aggregations: [{ op: "avg", column: "Rating" }], sort: { by: "avg_Rating", direction: "desc" } };
  const bodies = await mockOpenAi(page, async (body, route) => {
    const toolMsg = (body.messages as { role: string; content: string }[]).find((m) => m.role === "tool");
    if (!toolMsg) {
      return fulfillSse(route, [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "aggregate", arguments: JSON.stringify(args) } }] } }] }]);
    }
    const top = JSON.parse(toolMsg.content).rows[0];
    await fulfillSse(route, textChunks(`**${top.Category}** has the highest average rating: ${top.avg_Rating}.`));
  });
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/search|ask/i).first().fill(`/ai ${QUESTION}`);
  await expect(page.getByText(`Ask the copilot: "${QUESTION}"`)).toBeVisible();
  await page.keyboard.press("Enter");

  // The palette closes; no offline guess anywhere; the panel shows the question and the answer.
  const panel = page.getByTestId("copilot-panel");
  await expect(panel.getByTestId("copilot-question")).toHaveText(QUESTION);
  await expect(page.getByTestId("offline-guess-label")).toHaveCount(0);
  await expect(page.getByText(/Offline AI Heuristic|Offline guess/)).toHaveCount(0);
  const step = panel.getByTestId("copilot-step");
  await expect(step).toHaveCount(1);
  await expect(step.locator("summary")).toHaveText("Ran: average Rating by Category · 8 rows");
  const answer = panel.getByTestId("copilot-answer").last();
  await expect(answer).toContainText("COMICS has the highest average rating: 4.6.");
  await expect(answer.locator("strong")).toHaveText("COMICS");

  // Sent: the question with the tools; then the tool result (an aggregate, not rows).
  expect(bodies).toHaveLength(2);
  const first = bodies[0].messages as { role: string; content: string }[];
  expect(first[first.length - 1]).toEqual({ role: "user", content: QUESTION });
  expect(bodies[0].stream).toBe(true);
  const second = bodies[1].messages as { role: string; content: string; tool_call_id?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }[];
  const call = second.find((m) => m.role === "assistant" && m.tool_calls)!.tool_calls![0];
  expect(call.id).toBe("call_1");
  expect(call.function.name).toBe("aggregate");
  expect(JSON.parse(call.function.arguments)).toEqual(args);
  const result = JSON.parse(second.find((m) => m.role === "tool")!.content);
  expect(result).toMatchObject({ matchedRows: 309, groups: 8 });
  expect(result.rows[0]).toEqual({ Category: "COMICS", avg_Rating: 4.6 });
  // Sorted highest first.
  const avgs = (result.rows as { avg_Rating: number }[]).map((r) => r.avg_Rating);
  expect(avgs).toEqual([...avgs].sort((a, b) => b - a));
});

test("slow provider: after the still-waiting delay with no output, \"Still waiting for OpenAI…\" with Stop", async ({ page }) => {
  // The app waits 15 s (CopilotPanel.tsx:STILL_WAITING_MS); this test injects 2 s (features/ai/timeouts.ts).
  await page.addInitScript(() => {
    (window as unknown as { __DATAVISTA_AI_TIMEOUTS__: object }).__DATAVISTA_AI_TIMEOUTS__ = { stillWaitingMs: 2000 };
  });
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await mockOpenAi(page, async (_b, route) => {
    await held;
    await fulfillSse(route, textChunks("Finally."));
  });
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await page.getByTestId("copilot-input").fill("hello");
  await page.keyboard.press("Enter");

  const waiting = page.getByTestId("copilot-still-waiting");
  await expect(page.getByText("Thinking…")).toBeVisible();
  const sent = Date.now();
  await page.waitForTimeout(1000);
  await expect(waiting).toHaveCount(0);
  await expect(waiting).toContainText("Still waiting for OpenAI…", { timeout: 5000 });
  // Not before the delay.
  expect(Date.now() - sent).toBeGreaterThanOrEqual(2000);
  await expect(waiting.getByTestId("copilot-waiting-stop")).toBeVisible();
  await expect(page.getByTestId("copilot-stop")).toBeVisible();

  // Stop ends it; nothing more is waited for.
  await waiting.getByTestId("copilot-waiting-stop").click();
  await expect(page.getByTestId("copilot-answer").last()).toContainText("Stopped.");
  await expect(waiting).toHaveCount(0);
  release();
});

/** Rows in the copilotChats table (IndexedDB), read in the page. */
async function savedChats(page: Page): Promise<{ datasetId: string; messages: { text: string }[] }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("DataVistaDatabase");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const idb = req.result;
          if (!idb.objectStoreNames.contains("copilotChats")) return resolve([]);
          const all = idb.transaction("copilotChats").objectStore("copilotChats").getAll();
          all.onsuccess = () => {
            resolve(all.result);
            idb.close();
          };
          all.onerror = () => reject(all.error);
        };
      })
  );
}

test("a proposed chart: a card with what it does; Apply adds it to Charts, Undo removes it (also after a reload)", async ({ page }) => {
  const args = { type: "bar", x: "Category", y: "Rating", title: "Average rating by category" };
  const bodies = await mockOpenAi(page, async (body, route) => {
    const msgs = body.messages as { role: string }[];
    if (!msgs.some((m) => m.role === "tool")) {
      return fulfillSse(route, [{ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "propose_chart", arguments: JSON.stringify(args) } }] } }] }]);
    }
    await fulfillSse(route, textChunks("Here is a chart you can add."));
  });
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await page.getByTestId("copilot-input").fill("Chart the average rating by category");
  await page.keyboard.press("Enter");

  const card = page.getByTestId("copilot-proposal");
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("copilot-proposal-description")).toHaveText("Bar chart: average Rating by Category");
  await expect(card).toContainText("Columns: Category, Rating");
  await expect(page.getByTestId("copilot-answer").last()).toContainText("Here is a chart you can add.");
  // The model was told it's a pending card, with no data in the result; the tools went in the request.
  const toolMsg = (bodies[1].messages as { role: string; content: string }[]).find((m) => m.role === "tool")!;
  expect(JSON.parse(toolMsg.content)).toEqual({ proposed: "Bar chart: average Rating by Category", status: expect.stringContaining("Not applied yet") });
  expect((bodies[0].tools as { function: { name: string } }[]).map((t) => t.function.name)).toContain("propose_chart");

  // Nothing changes until Apply.
  await page.getByTestId("sidebar-nav-charts").click();
  await expect(page.getByTestId("chart-card")).toHaveCount(0);
  await card.getByTestId("copilot-proposal-apply").click();
  await expect(card).toHaveAttribute("data-status", "applied");
  await expect(card).toContainText("Applied");
  await expect(page.getByTestId("chart-card")).toHaveCount(1);
  await expect(page.getByTestId("chart-card")).toContainText("Average rating by category");

  // Undo removes it; Apply again puts it back.
  await card.getByTestId("copilot-proposal-undo").click();
  await expect(page.getByTestId("chart-card")).toHaveCount(0);
  await card.getByTestId("copilot-proposal-apply").click();
  await expect(page.getByTestId("chart-card")).toHaveCount(1);

  // After a reload the card still knows what it applied: Undo works.
  await expect.poll(async () => JSON.stringify(await savedChats(page))).toContain('"status":"applied"');
  await page.reload();
  await page.getByTestId("sidebar-nav-charts").click();
  await expect(page.getByTestId("chart-card")).toHaveCount(1);
  await page.getByTestId("copilot-fab").click();
  await expect(card).toHaveAttribute("data-status", "applied");
  await card.getByTestId("copilot-proposal-go").click();
  await card.getByTestId("copilot-proposal-undo").click();
  await expect(page.getByTestId("chart-card")).toHaveCount(0);
});

test("the chat is saved: it survives a reload; Clear chat empties it (also after a reload)", async ({ page }) => {
  await mockOpenAi(page, async (_b, route) => fulfillSse(route, textChunks("Top category: **ART_AND_DESIGN** wins.")));
  await startFreshSessionWithoutTour(page);
  await connectOpenAi(page);
  await importPlaystore(page);
  await page.getByTestId("copilot-fab").click();
  await page.getByTestId("copilot-input").fill("Which category is first?");
  await page.keyboard.press("Enter");
  const answer = page.getByTestId("copilot-answer").last();
  // Underscores inside a word stay literal (no italics).
  await expect(answer).toContainText("Top category: ART_AND_DESIGN wins.");
  await expect(answer.locator("em")).toHaveCount(0);
  await expect.poll(async () => (await savedChats(page)).flatMap((c) => c.messages.map((m) => m.text))).toEqual(["Which category is first?", "Top category: **ART_AND_DESIGN** wins."]);

  await page.reload();
  await page.getByTestId("copilot-fab").click();
  await expect(page.getByTestId("copilot-question")).toHaveText(["Which category is first?"]);
  await expect(page.getByTestId("copilot-answer")).toContainText("Top category: ART_AND_DESIGN wins.");

  await page.getByTestId("copilot-clear").click();
  await expect(page.getByTestId("copilot-question")).toHaveCount(0);
  await expect(page.getByTestId("copilot-starter").first()).toBeVisible();
  await expect.poll(() => savedChats(page)).toEqual([]);
  await page.reload();
  await page.getByTestId("copilot-fab").click();
  await expect(page.getByTestId("copilot-starter").first()).toBeVisible();
  await expect(page.getByTestId("copilot-question")).toHaveCount(0);
});
