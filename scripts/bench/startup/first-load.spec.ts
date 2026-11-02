import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * First-load cost of the production build (see ../playwright.startup.config.ts), cold cache:
 * every run uses a new browser context, so nothing is cached. Records every response's
 * bytes on the wire (CDP `encodedDataLength`) grouped as JS / CSS / font / other, and the
 * time from navigation start to the app shell (the sidebar) being visible, plus
 * `document.fonts.ready`. Runs unthrottled and on a throttled "Slow 4G" profile.
 *
 * `npm run build`, then
 * `BENCH_LABEL=before npx playwright test --config scripts/bench/playwright.startup.config.ts -g "first load"`.
 * Output: bench-results/<label>-first-load.json (git-ignored).
 */

const LABEL = process.env.BENCH_LABEL || "run";
const RUNS = Number(process.env.BENCH_RUNS || 5);

// Lighthouse's mobile "Slow 4G": 150 ms RTT, 1.6 Mbps down, 750 kbps up.
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

type Kind = "js" | "css" | "font" | "other";
const kindOf = (url: string, mime: string): Kind => {
  if (/\.woff2?($|\?)/.test(url) || mime.includes("font")) return "font";
  if (/\.css($|\?)/.test(url) || mime.includes("css")) return "css";
  if (/\.m?js($|\?)/.test(url) || mime.includes("javascript")) return "js";
  return "other";
};

async function oneRun(page: Page, throttle: boolean) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (throttle) await cdp.send("Network.emulateNetworkConditions", SLOW_4G);

  const mimes = new Map<string, { url: string; mime: string }>();
  const files: { url: string; kind: Kind; bytes: number }[] = [];
  cdp.on("Network.responseReceived", (e) => mimes.set(e.requestId, { url: e.response.url, mime: e.response.mimeType }));
  cdp.on("Network.loadingFinished", (e) => {
    const r = mimes.get(e.requestId);
    if (!r) return;
    files.push({ url: r.url.replace(/^.*\/datavista\//, ""), kind: kindOf(r.url, r.mime), bytes: e.encodedDataLength });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem("datavista-ui-storage", JSON.stringify({ state: { hasSeenTour: true, theme: "dark" }, version: 1 }));
    window.localStorage.setItem("datavista-visited", "true");
  });
  await page.goto("./", { waitUntil: "commit" });
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 120_000 });
  const shellMs = await page.evaluate(() => performance.now());
  const fontsMs = await page.evaluate(async () => {
    await document.fonts.ready;
    return performance.now();
  });
  await page.waitForLoadState("networkidle");

  const totals: Record<Kind, number> = { js: 0, css: 0, font: 0, other: 0 };
  for (const f of files) totals[f.kind] += f.bytes;
  return { shellMs: Math.round(shellMs), fontsReadyMs: Math.round(fontsMs), totals, files };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

test("first load: bytes and time to app shell, cold cache", async ({ browser }) => {
  test.setTimeout(15 * 60 * 1000);
  const result: Record<string, unknown> = {};
  for (const throttle of [false, true]) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      runs.push(await oneRun(page, throttle));
      await context.close();
    }
    const last = runs[runs.length - 1];
    result[throttle ? "slow4g" : "unthrottled"] = {
      runs: RUNS,
      medianShellMs: median(runs.map((r) => r.shellMs)),
      medianFontsReadyMs: median(runs.map((r) => r.fontsReadyMs)),
      bytes: { ...last.totals, jsCssFont: last.totals.js + last.totals.css + last.totals.font },
      files: last.files.filter((f) => f.kind !== "other").sort((a, b) => b.bytes - a.bytes),
    };
  }
  mkdirSync("bench-results", { recursive: true });
  writeFileSync(`bench-results/${LABEL}-first-load.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, (k, v) => (k === "files" ? undefined : v), 2));
});
