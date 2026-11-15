/**
 * Logo options sheet: every variant in src/shared/brand/logoVariants.ts at 16, 32 and 128 px,
 * full colour and single colour, on the Light, Clay and Dark backgrounds. Rendered with
 * Playwright's Chromium at device scale 1 (16 px is drawn at its real pixel size, then the
 * sheet is shown at 1x so small sizes are judged as they really look).
 * Run: `npx vite-node scripts/brand/logo-options.ts` → docs/design/batch7-b/logo-options.png.
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { LOGO_VARIANTS, MONO_DARK_BG, MONO_LIGHT_BG, variantSvg } from "../../src/shared/brand/logoVariants";
import { THEME_BY_ID } from "../../src/shared/theme/themes";

const root = resolve(__dirname, "../..");
const outDir = join(root, "docs/design/batch7-b");
mkdirSync(outDir, { recursive: true });
const inter = pathToFileURL(join(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")).href;

const BACKS = [
  { name: "Light", bg: THEME_BY_ID.light.tokens.background, fg: THEME_BY_ID.light.tokens.foreground, mono: MONO_LIGHT_BG },
  { name: "Clay (mid)", bg: THEME_BY_ID.clay.tokens.background, fg: THEME_BY_ID.clay.tokens.foreground, mono: "#1E1B4B" },
  { name: "Dark", bg: THEME_BY_ID.dark.tokens.background, fg: THEME_BY_ID.dark.tokens.foreground, mono: MONO_DARK_BG },
];

function cell(svg: string) {
  return `<div class="cell">${svg}</div>`;
}

const rows = LOGO_VARIANTS.map((v) => {
  const panels = BACKS.map(
    (b) => `<div class="panel" style="background:${b.bg};color:${b.fg}">
      <div class="label">${b.name}</div>
      <div class="sizes">
        ${cell(variantSvg(v, { size: 16 }))}${cell(variantSvg(v, { size: 32 }))}${cell(variantSvg(v, { size: 128 }))}
        <div class="sep"></div>
        ${cell(variantSvg(v, { size: 16, mono: true, color: b.mono }))}${cell(variantSvg(v, { size: 32, mono: true, color: b.mono }))}${cell(variantSvg(v, { size: 128, mono: true, color: b.mono }))}
      </div>
      <div class="wordmark">${variantSvg(v, { size: 28 })}<span>DataVista</span></div>
    </div>`
  ).join("");
  return `<section><h2>${v.name}</h2><p>${v.summary}</p><div class="panels">${panels}</div></section>`;
}).join("");

const html = `<!doctype html><html><head><style>
  @font-face { font-family: Inter; src: url("${inter}") format("woff2"); font-weight: 100 900; }
  body { margin: 0; padding: 28px 32px; background: #FFFFFF; color: #0E1526; font-family: Inter, sans-serif; width: 1536px; }
  h1 { margin: 0 0 4px; font-size: 26px; font-weight: 650; letter-spacing: -0.02em; }
  .intro { margin: 0 0 20px; color: #3B4557; font-size: 15px; }
  section { margin-bottom: 22px; }
  h2 { margin: 0; font-size: 18px; font-weight: 600; }
  section > p { margin: 2px 0 10px; color: #3B4557; font-size: 14px; }
  .panels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .panel { border-radius: 14px; padding: 14px 16px; border: 1px solid #0000001a; }
  .label { font-size: 12px; font-weight: 600; opacity: 0.8; margin-bottom: 8px; }
  .sizes { display: flex; align-items: flex-end; gap: 14px; }
  .cell { display: flex; align-items: flex-end; }
  .cell svg { display: block; }
  .sep { width: 1px; align-self: stretch; background: currentColor; opacity: 0.2; }
  .wordmark { margin-top: 12px; display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 19px; letter-spacing: -0.01em; }
</style></head><body>
  <h1>DataVista mark: three options</h1>
  <p class="intro">Each panel: 16, 32, 128 px in full colour, then the single-colour version (favicon, high contrast, PDF), then with the wordmark. Option 1 was chosen and is the app's mark.</p>
  ${rows}
</body></html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1600, height: 900 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("body").screenshot({ path: join(outDir, "logo-options.png") });
  await browser.close();
  console.log("wrote docs/design/batch7-b/logo-options.png");
}

void main();
