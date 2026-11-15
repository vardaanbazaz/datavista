import { test, expect, type Page, type Browser } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Batch 7: cost of the glass surfaces and the aurora ribbon, on the production build (see
 * ../playwright.startup.config.ts). Each scenario runs with Transparency + Background animation
 * on, then both off:
 * - "glass table": a generated 1M-row retail dataset, Data Explorer, wheel-scrolling the grid;
 * - "glass charts": four charts on the Charts view, wheel-scrolling the page;
 * - "glass idle": Overview with the ribbon in view, 10 s idle, CPU time of every Chromium
 *   process (renderer, GPU, browser) from CDP SystemInfo.getProcessInfo.
 * Frames are measured in the page with requestAnimationFrame: longest frame and dropped frames
 * (a gap of n vsyncs counts n-1). GPU: set BENCH_GPU=1 to pass Chromium's GPU flags; the
 * report states which rasteriser was active (chrome://gpu "Rasterization" status).
 *
 * `npm run build`, then `npx playwright test --config scripts/bench/playwright.startup.config.ts -g glass`.
 * Output: bench-results/<label>-glass-*.json (git-ignored).
 */

const LABEL = process.env.BENCH_LABEL || "run";
const CHUNK = 20_000;

// Same template and generated rows as startup.spec.ts (a stored dataset cloned with 1M rows).
const header = "id,order_date,region,category,amount,qty,status,note";
const TEMPLATE_CSV = [
  header,
  ...Array.from({ length: 50 }, (_, i) => {
    const day = (i % 12) + 1;
    const month = ((i * 5) % 12) + 1;
    return `${i + 1},${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/2024,R${i % 4},C${i % 7},${(i * 13.37).toFixed(2)},${i % 9},${i % 2 ? "open" : "closed"},note ${i}`;
  }),
].join("\n");

function out(name: string, data: unknown) {
  mkdirSync("bench-results", { recursive: true });
  writeFileSync(`bench-results/${LABEL}-${name}.json`, JSON.stringify(data, null, 2));
  console.log(name, JSON.stringify(data, null, 2));
}

const MODES = [
  { name: "glass+animation on", transparency: true, backgroundAnimation: true },
  { name: "glass+animation off", transparency: false, backgroundAnimation: false },
] as const;

function seedPrefs(transparency: boolean, backgroundAnimation: boolean) {
  return JSON.stringify({
    state: {
      hasSeenTour: true,
      hasCompletedSetup: true,
      themeSetting: { mode: "fixed", theme: "light", day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
      appearance: { textSize: "default", highContrast: false, motion: "full", transparency, backgroundAnimation },
    },
    version: 3,
  });
}

async function setPrefs(page: Page, transparency: boolean, backgroundAnimation: boolean) {
  await page.evaluate((v) => localStorage.setItem("datavista-ui-storage", v), seedPrefs(transparency, backgroundAnimation));
  await page.reload();
  await page.getByTestId("sidebar").waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-transparency", transparency ? "on" : "off");
}

async function freshWorkspace(page: Page) {
  await page.addInitScript((prefs) => {
    if (sessionStorage.getItem("bench-seeded")) return;
    sessionStorage.setItem("bench-seeded", "1");
    localStorage.clear();
    localStorage.setItem("datavista-ui-storage", prefs);
    localStorage.setItem("datavista-visited", "true");
  }, seedPrefs(true, true));
  await page.goto("./");
  await page.getByTestId("sidebar-nav-upload").click();
  await page.getByTestId("file-upload-input").setInputFiles({ name: "template.csv", mimeType: "text/csv", buffer: Buffer.from(TEMPLATE_CSV) });
  await expect(page.getByTestId("sidebar-nav-charts")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

async function seedBig(page: Page, rowCount: number) {
  // Wait until the template's rows are on disk, then clone it (as startup.spec.ts:seedClone).
  await expect
    .poll(() => page.evaluate(() => new Promise<number>((res) => {
      const r = indexedDB.open("DataVistaDatabase");
      r.onsuccess = () => {
        const c = r.result.transaction("datasetRows").objectStore("datasetRows").count();
        c.onsuccess = () => { r.result.close(); res(c.result); };
      };
    })), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.evaluate(async ({ rowCount, CHUNK }) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("DataVistaDatabase");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    const all: Record<string, unknown>[] = await new Promise((res) => { const r = db.transaction("datasets").objectStore("datasets").getAll(); r.onsuccess = () => res(r.result); });
    const template = all.find((d) => d.name === "template")!;
    const chunkCount = Math.ceil(rowCount / CHUNK);
    for (let c = 0; c < chunkCount; c++) {
      const rows: Record<string, unknown>[] = [];
      const src: string[] = [];
      for (let j = 0; j < Math.min(CHUNK, rowCount - c * CHUNK); j++) {
        const i = c * CHUNK + j;
        const dd = String((i % 12) + 1).padStart(2, "0");
        const mm = String(((i * 5) % 12) + 1).padStart(2, "0");
        rows.push({ id: i + 1, order_date: `2024-${mm}-${dd}`, region: `R${i % 4}`, category: `C${i % 7}`, amount: Math.round(i * 13.37) / 100, qty: i % 9, status: i % 2 ? "open" : "closed", note: `note ${i % 1000}` });
        src.push(`${dd}/${mm}/2024`);
      }
      const tx = db.transaction("datasetRows", "readwrite");
      tx.objectStore("datasetRows").put({ datasetId: "big", index: c, rows, dateSourceValues: { order_date: src } });
      await done(tx);
    }
    let tx = db.transaction("datasets", "readwrite");
    tx.objectStore("datasets").put({ ...template, id: "big", name: "retail 1M", rowCount, chunkCount, dateSourceColumns: ["order_date"], calculatedFields: [] });
    await done(tx);
    tx = db.transaction("uiState", "readwrite");
    tx.objectStore("uiState").put({ key: "activeDatasetId", value: "big" });
    tx.objectStore("uiState").put({ key: "activeView", value: "data" });
    await done(tx);
    db.close();
  }, { rowCount, CHUNK });
}

/** Records rAF frame gaps while `drive` runs; returns longest frame and dropped frames. */
async function frames(page: Page, drive: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __run: boolean };
    w.__f = [];
    w.__run = true;
    let last = performance.now();
    const tick = (t: number) => {
      w.__f.push(t - last);
      last = t;
      if (w.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(tick);
    });
  });
  await drive();
  return page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __run: boolean };
    w.__run = false;
    const f = w.__f.slice(1);
    const vsync = [...f].sort((a, b) => a - b)[Math.floor(f.length * 0.1)] || 16.7;
    const dropped = f.reduce((n, d) => n + Math.max(0, Math.round(d / vsync) - 1), 0);
    const sorted = [...f].sort((a, b) => a - b);
    return {
      frames: f.length,
      vsyncMs: +vsync.toFixed(2),
      longestFrameMs: +Math.max(...f).toFixed(1),
      p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
      droppedFrames: dropped,
    };
  });
}

async function wheel(page: Page, x: number, y: number, steps: number, dy: number) {
  await page.mouse.move(x, y);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(16);
  }
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -dy);
    await page.waitForTimeout(16);
  }
}

async function gpuStatus(browser: Browser) {
  const page = await browser.newPage();
  try {
    await page.goto("chrome://gpu");
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      const text = (document.querySelector("info-view") as HTMLElement | null)?.shadowRoot?.textContent ?? document.body.innerText;
      const pick = (label: string) => new RegExp(`${label}:\\s*([^\\n]+?)(?=\\s{2,}|\\n|[A-Z][a-z]+:)`).exec(text)?.[1]?.trim() ?? "unknown";
      return { rasterization: pick("Rasterization"), compositing: pick("Compositing"), gl: pick("GL_RENDERER") };
    });
  } catch {
    return { rasterization: "unknown", compositing: "unknown", gl: "unknown" };
  } finally {
    await page.close();
  }
}

test("glass table: wheel-scroll a 1M-row Data Explorer grid", async ({ page, browser }) => {
  test.setTimeout(15 * 60_000);
  await freshWorkspace(page);
  await seedBig(page, 1_000_000);
  const results: Record<string, unknown> = { gpu: await gpuStatus(browser) };
  for (const m of MODES) {
    await setPrefs(page, m.transparency, m.backgroundAnimation);
    await page.getByText("retail 1M").first().waitFor({ timeout: 5 * 60_000 });
    await page.getByTestId("sidebar-nav-data").click();
    await page.getByText(/1,000,000/).first().waitFor({ timeout: 5 * 60_000 });
    await page.waitForTimeout(2000);
    // The virtualised grid's scroller: the tallest scrollable element on the page.
    const box = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>("*")].filter((e) => e.scrollHeight > e.clientHeight + 200 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      el?.scrollIntoView({ block: "center" });
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 300) } : null;
    });
    expect(box).not.toBeNull();
    await page.waitForTimeout(500);
    results[m.name] = await frames(page, () => wheel(page, box!.x, box!.y, 120, 240));
  }
  out("glass-table", results);
});

test("glass charts: wheel-scroll a page with four charts", async ({ page, browser }) => {
  test.setTimeout(5 * 60_000);
  await freshWorkspace(page);
  await page.getByTestId("sidebar-nav-charts").click();
  const pick = async (label: string, option: string) => {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: new RegExp(`^${option}\\b`) }).click();
  };
  const specs = [
    { type: /^Bar/, x: "region", y: "amount", group: "status" },
    { type: /^Line/, x: "order_date", y: "amount" },
    { type: /^Bar/, x: "category", y: "qty", group: "region" },
    { type: /^Pie/, x: "category", y: "amount" },
  ];
  for (const [i, s] of specs.entries()) {
    await page.getByRole("button", { name: s.type }).first().click();
    await page.getByLabel("Chart Title").fill(`Chart ${i + 1}`);
    await pick("X axis column", s.x);
    await pick("Y axis column", s.y);
    if (s.group) await pick("Group by column", s.group);
    await page.getByRole("button", { name: "Create Chart" }).click();
    await page.getByTestId("chart-card").nth(i).waitFor();
  }
  const results: Record<string, unknown> = { gpu: await gpuStatus(browser) };
  for (const m of MODES) {
    await setPrefs(page, m.transparency, m.backgroundAnimation);
    await page.getByTestId("sidebar-nav-charts").click();
    await page.getByTestId("chart-card").nth(3).waitFor();
    await page.waitForTimeout(1500);
    results[m.name] = await frames(page, () => wheel(page, 900, 500, 90, 160));
  }
  out("glass-charts", results);
});

test("glass idle: CPU with the ribbon in view", async ({ page, browser }) => {
  test.setTimeout(5 * 60_000);
  await freshWorkspace(page);
  await page.getByTestId("sidebar-nav-overview").click();
  const cdp = await browser.newBrowserCDPSession();
  const cpu = async () => {
    const info = (await cdp.send("SystemInfo.getProcessInfo")) as { processInfo: { type: string; id: number; cpuTime: number }[] };
    const byType: Record<string, number> = {};
    for (const p of info.processInfo) byType[p.type] = (byType[p.type] ?? 0) + p.cpuTime;
    return byType;
  };
  const results: Record<string, unknown> = { gpu: await gpuStatus(browser) };
  for (const m of [
    ...MODES,
    { name: "glass on, animation off (default)", transparency: true, backgroundAnimation: false },
    { name: "animation on, glass off", transparency: false, backgroundAnimation: true },
  ]) {
    await setPrefs(page, m.transparency, m.backgroundAnimation);
    await expect(page.getByTestId("aurora-ribbon")).toBeVisible();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(3000);
    const a = await cpu();
    await page.waitForTimeout(10_000);
    const b = await cpu();
    const pct = Object.fromEntries(Object.keys(b).map((k) => [k, +(((b[k] - (a[k] ?? 0)) / 10) * 100).toFixed(1)]));
    results[m.name] = { cpuPercentOfOneCore: pct };
  }
  out("glass-idle", results);
});
