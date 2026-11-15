/**
 * Writes the brand files from the mark's geometry (src/shared/brand/logoGeometry.ts, the active option):
 * - public/favicon.svg: single-colour mark, switching colour with prefers-color-scheme;
 * - public/logo.svg: full-colour mark;
 * - public/favicon.ico (16/32/48) and public/apple-touch-icon.png (180): rendered with
 *   Playwright's Chromium, packed with ImageMagick (`magick`);
 * - public/og-image.png (1200x630).
 * Run: `npm run brand:assets` (needs `npx playwright install chromium` and ImageMagick).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { logoSvg } from "../../src/shared/brand/logoGeometry";
import { THEME_BY_ID } from "../../src/shared/theme/themes";

const root = resolve(__dirname, "../..");
const pub = (f: string) => join(root, "public", f);

writeFileSync(pub("favicon.svg"), logoSvg({ size: 32, mono: true, color: "auto", detail: "small" }) + "\n");
writeFileSync(pub("logo.svg"), logoSvg({ size: 128 }) + "\n");

const inter = pathToFileURL(join(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).href;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const tmp = mkdtempSync(join(tmpdir(), "dv-brand-"));

  const pngs: string[] = [];
  for (const size of [16, 32, 48]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent">${logoSvg({ size, mono: true, color: "#3730A3" })}</body>`);
    const f = join(tmp, `fav-${size}.png`);
    await page.locator("svg").screenshot({ path: f, omitBackground: true });
    pngs.push(f);
  }
  execFileSync("magick", [...pngs, pub("favicon.ico")]);

  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(
    `<body style="margin:0"><div style="width:180px;height:180px;background:#0C0F16;display:flex;align-items:center;justify-content:center">${logoSvg({ size: 128 })}</div></body>`
  );
  await page.locator("div").screenshot({ path: pub("apple-touch-icon.png") });

  const d = THEME_BY_ID.dark.tokens;
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Inter; src: url("${inter}") format("woff2"); font-weight: 100 900; }
    body { margin: 0; }
    .og { position: relative; width: 1200px; height: 630px; overflow: hidden; background: ${d.background}; font-family: Inter, sans-serif; color: ${d.foreground}; }
    .ribbon { position: absolute; inset: 0; opacity: 0.85; filter: blur(40px);
      background: linear-gradient(160deg, transparent 30%, ${d.ribbon[0]} 46%, ${d.ribbon[1]} 58%, ${d.ribbon[2]} 70%, ${d.ribbon[3]} 82%, transparent 96%); }
    .content { position: absolute; left: 96px; top: 150px; display: flex; flex-direction: column; gap: 28px; }
    h1 { margin: 0; font-size: 88px; font-weight: 650; letter-spacing: -0.03em; }
    p { margin: 0; font-size: 34px; color: ${d.frameMuted}; max-width: 760px; line-height: 1.35; }
  </style></head><body><div class="og"><div class="ribbon"></div><div class="content">${logoSvg({ size: 120 })}<h1>DataVista</h1><p>Charts, pivots and statistics from your spreadsheets, in your browser.</p></div></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".og").screenshot({ path: pub("og-image.png") });

  await browser.close();
  console.log("wrote public/favicon.svg, logo.svg, favicon.ico, apple-touch-icon.png, og-image.png");
}

void main();
