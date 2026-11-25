/**
 * README / portfolio screenshots in the Taupe theme with every Effects setting off
 * (Transparency off, Reduce motion), from the production build.
 *
 *   npx vite-node scripts/screenshots/capture.ts              # npm run build, then capture
 *   npx vite-node scripts/screenshots/capture.ts --skip-build # reuse the existing dist/
 *
 * Serves dist/ with `vite preview` on :4173 (as playwright.prod.config.ts does), opens one
 * Chromium, and for each image a fresh context (1440x900, deviceScaleFactor 2, reduced motion)
 * whose storage is seeded before the app boots. Writes PNGs to PNG_DIR (default: a temp folder)
 * and converts them with ImageMagick (`magick`, quality 82) to docs/images/<name>.webp, the
 * names README.md references. KEEP_PNG=1 keeps the PNGs for review.
 *
 * Images (same set as scripts/design/portfolio.spec.ts, which still makes the older Dark/Light set):
 * - overview         Overview: KPI tiles, insights, numeric columns (Play Store fixture)
 * - data-quality     Data Explorer with the data-quality panel (messy Play Store fixture)
 * - pivot            Pivot, average Rating by Category x Type (Play Store fixture)
 * - dashboard-light  Overview dashboard widgets, three KPI cards (Play Store fixture), main column
 *                    from the Dashboard Filters bar to below the cards
 *
 * The AI copilot is not captured: it needs a real provider and API key. Its floating round
 * button (CopilotHost.tsx, `data-testid="copilot-fab"`) is hidden by a style injected into the
 * page before each shot, so it cannot cover content; the app's own CSS is unchanged.
 * The aurora ribbon (AuroraRibbon.tsx) still shows: no Effects setting turns it off.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "../..");
const PORT = 4173;
const BASE = `http://localhost:${PORT}/datavista/`;
const OUT = join(ROOT, "docs/images");
const PNG_DIR = process.env.PNG_DIR || mkdtempSync(join(tmpdir(), "datavista-shots-"));
const VIEWPORT = { width: 1440, height: 900 };

const UI_STATE = {
  state: {
    hasSeenTour: true,
    hasCompletedSetup: true,
    themeSetting: { mode: "fixed", theme: "taupe", day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
    appearance: { textSize: "default", highContrast: false, motion: "reduce", transparency: false },
  },
  version: 4,
};

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
}

async function isUp(): Promise<boolean> {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function startPreview(): Promise<ChildProcess> {
  if (await isUp()) throw new Error(`Port ${PORT} is already serving; stop that server first.`);
  // vite's own binary, in its own process group, so the whole group can be killed afterwards.
  const server = spawn(join(ROOT, "node_modules/.bin/vite"), ["preview", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    if (await isUp()) return server;
    if (server.exitCode !== null) throw new Error(`vite preview exited with ${server.exitCode}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  stopPreview(server);
  throw new Error("vite preview did not start within 60 s");
}

function stopPreview(server: ChildProcess) {
  if (server.pid === undefined || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

async function open(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.addInitScript((ui) => {
    // Seed once per context, so an in-app reload keeps the imported data.
    if (sessionStorage.getItem("screenshots-seeded")) return;
    sessionStorage.setItem("screenshots-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", ui);
    localStorage.setItem("datavista-visited", "true");
  }, JSON.stringify(UI_STATE));
  await page.goto(BASE);
  const attrs = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  if (attrs.theme !== "taupe" || attrs.transparency !== "off" || attrs.motion !== "reduce") {
    throw new Error(`Appearance not applied: ${JSON.stringify(attrs)}`);
  }
  return page;
}

async function importFile(page: Page, file: string) {
  if ((await page.getByTestId("file-upload-input").count()) === 0) await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles(join(ROOT, file));
  const keep = page.getByTestId("issues-keep");
  for (let i = 0; i < 120; i++) {
    if (await keep.isVisible().catch(() => false)) await keep.click();
    if ((await page.getByTestId("import-dialog").count()) === 0) break;
    await page.waitForTimeout(500);
  }
  await page.getByTestId("numeric-summary").waitFor({ timeout: 60_000 });
}

// Injected into the page before each shot (this script only, not the app): toasts (sonner and
// Radix) and the floating Co-Pilot button would otherwise cover parts of the views.
const HIDE_OVERLAYS =
  '[aria-label^="Notifications"], [data-sonner-toaster], [data-testid="copilot-fab"] { display: none !important; }';

async function settle(page: Page) {
  await page.addStyleTag({ content: HIDE_OVERLAYS });
  // Pointer to the bottom-right corner: no hover state, and any open tooltip closes.
  await page.mouse.move(VIEWPORT.width - 2, VIEWPORT.height - 2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 15_000 })
    .catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[role="tooltip"], [aria-busy="true"], .animate-spin'), null, { timeout: 15_000 });
  await page.waitForTimeout(800);
}

async function shoot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
  if (await page.getByTestId("copilot-fab").isVisible()) throw new Error(`Co-Pilot button still visible before ${name}`);
  const png = join(PNG_DIR, `${name}.png`);
  await page.screenshot({ path: png, type: "png", animations: "disabled", caret: "hide", scale: "device", clip });
  const webp = join(OUT, `${name}.webp`);
  run("magick", [png, "-quality", "82", "-define", "webp:method=6", webp]);
  console.log(`${name}.webp ${Math.round(statSync(webp).size / 1024)} KB`);
}

async function pick(page: Page, trigger: string, option: string) {
  await page.locator(trigger).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addKpi(page: Page, measure?: string) {
  await page.getByTestId("overview-add-kpi").click();
  await page.getByTestId("kpi-builder").waitFor();
  if (measure) await pick(page, "#metric-col", measure);
  await page.getByTestId("kpi-builder-save").click();
  await page.getByTestId("kpi-builder").waitFor({ state: "detached" });
}

async function overviewAndPivot(browser: Browser) {
  const page = await open(browser);
  await importFile(page, "tests/fixtures/playstore-insights.csv");
  await settle(page);
  await shoot(page, "overview");

  await page.getByTestId("sidebar-nav-pivot").click();
  const fields = page.getByRole("region", { name: "Fields (scrollable)" });
  await fields.waitFor();
  const type = fields.locator("> div").filter({ has: page.getByText("Type", { exact: true }) });
  await type.getByRole("button", { name: "Col", exact: true }).click({ timeout: 10_000 });
  // Values: Average Rating (a sum of ratings means nothing).
  await page.getByRole("combobox").filter({ hasText: /^Sum$/ }).last().click();
  await page.getByRole("option", { name: "Average", exact: true }).click();
  // Drop the focus ring the Average select keeps after the pick.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page);
  await shoot(page, "pivot");
  await page.context().close();
}

async function dataQuality(browser: Browser) {
  const page = await open(browser);
  await importFile(page, "tests/fixtures/messy/playstore.csv");
  await page.getByTestId("sidebar-nav-data").click();
  await page.getByTestId("data-quality-panel").waitFor();
  await settle(page);
  await shoot(page, "data-quality");
  await page.context().close();
}

async function dashboardKpis(browser: Browser) {
  const page = await open(browser);
  await importFile(page, "tests/fixtures/playstore-insights.csv");
  await addKpi(page); // Average Rating
  await addKpi(page, "Reviews"); // Total Reviews
  await addKpi(page, "Price"); // Average Price
  // Scrolling the heading to the top hits the end of the page, and the categorical table's
  // tail still sits above the Dashboard Filters bar. Clip to the main column from just above
  // that bar to below the cards, so no cut-off table or half sidebar shows.
  await page.getByText(/^Dashboard Widgets/).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await settle(page);
  const filters = await page.getByText(/^Dashboard Filters/).boundingBox();
  const main = await page.locator("#main-content").boundingBox();
  if (!filters || !main) throw new Error("Dashboard Filters bar or #main-content not found");
  const y = Math.max(0, Math.round(filters.y - 36));
  const x = Math.round(main.x);
  await shoot(page, "dashboard-light", { x, y, width: VIEWPORT.width - x, height: Math.min(380, VIEWPORT.height - y) });
  await page.context().close();
}

async function main() {
  if (!process.argv.includes("--skip-build")) run("npm", ["run", "build"]);
  const server = await startPreview();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    await overviewAndPivot(browser);
    await dataQuality(browser);
    await dashboardKpis(browser);
  } finally {
    await browser?.close();
    stopPreview(server);
    if (process.env.KEEP_PNG) console.log(`PNGs kept in ${PNG_DIR}`);
    else if (!process.env.PNG_DIR) rmSync(PNG_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
