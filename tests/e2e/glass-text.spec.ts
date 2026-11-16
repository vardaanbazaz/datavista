import { test, expect, type Page } from "@playwright/test";

/**
 * Surface rule guard (batch 7 phase B). The contrast audit (tokens.contrast.test.ts) proves a
 * fixed set of text colours on glass composited over the ribbon: foreground, frameMuted,
 * primaryInk and the status colours. This walks every view and fails on text drawn straight on
 * glass (nearest painted surface is .surface-glass / .surface-float) in any other colour, e.g.
 * data-only muted text, or text faded with an opacity modifier, which the audit cannot vouch for.
 * Light, a mid-tone (Clay) and a dark mid-tone (Dusk), with the HR fixture. Also fails on any
 * endless animation running at idle.
 */

const VIEWS = ["overview", "upload", "filters", "charts", "data", "pivot", "stats", "window-builder", "export"] as const;
const THEMES = ["light", "clay", "dusk"] as const;

async function open(page: Page, theme: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((t) => {
    if (sessionStorage.getItem("gt-seeded")) return;
    sessionStorage.setItem("gt-seeded", "1");
    localStorage.clear();
    localStorage.setItem(
      "datavista-ui-storage",
      JSON.stringify({
        state: {
          hasSeenTour: true,
          hasCompletedSetup: true,
          themeSetting: { mode: "fixed", theme: t, day: "light", night: "dark", trigger: "device", dayStart: "07:00", nightStart: "19:00" },
          appearance: { textSize: "default", highContrast: false, motion: "reduce", transparency: true },
        },
        version: 3,
      })
    );
    localStorage.setItem("datavista-visited", "true");
  }, theme);
  await page.goto("/");
  await page.getByTestId("sidebar").waitFor();
}

/** Off-palette text on glass: [selector-ish, text, colour]. */
async function offPaletteText(page: Page) {
  return page.evaluate(() => {
    // One probe per colour, outside any surface (so no remapped tokens).
    const allowed = new Set(
      ["--foreground", "--frame-muted", "--primary-ink", "--destructive", "--success", "--warning", "--tertiary"].map((v) => {
        const probe = document.createElement("span");
        probe.setAttribute("style", `color: hsl(var(${v}))`);
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      })
    );
    const alphaOf = (c: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : [];
      return parts.length === 4 ? Number(parts[3]) : 1;
    };
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.querySelector("#main-content") ?? document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (!el.getClientRects().length || el.closest("[aria-hidden='true'], .sr-only, [inert]")) continue;
      // Nearest painted background: a surface class or an opaque-ish fill.
      let surface: "glass" | "other" | null = null;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const cl = a.classList;
        if (cl.contains("surface-glass") || cl.contains("surface-float")) {
          surface = "glass";
          break;
        }
        if (cl.contains("surface-solid")) {
          surface = "other";
          break;
        }
        const bg = getComputedStyle(a).backgroundColor;
        if (bg && alphaOf(bg) > 0.5) {
          surface = "other";
          break;
        }
      }
      if (surface !== "glass") continue;
      const style = getComputedStyle(el);
      if (Number(style.opacity) < 1 && !el.closest("button:disabled, [aria-disabled='true']")) {
        bad.push(`${el.tagName.toLowerCase()} "${n.textContent.trim().slice(0, 40)}" opacity ${style.opacity}`);
        continue;
      }
      if (el.closest("button:disabled, [aria-disabled='true']")) continue;
      if (!allowed.has(style.color)) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 4).join(".")} "${n.textContent.trim().slice(0, 40)}" ${style.color}`);
    }
    return [...new Set(bad)];
  });
}

for (const theme of THEMES) {
  test(`text on glass uses audited colours (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, theme);
    const found: string[] = [];
    for (const view of VIEWS) {
      await page.getByTestId(`sidebar-nav-${view}`).click();
      await page.waitForTimeout(150);
      found.push(...(await offPaletteText(page)).map((b) => `${view} (empty): ${b}`));
    }
    await page.getByTestId("sidebar-nav-upload").click();
    await page.getByTestId("file-upload-input").setInputFiles("tests/fixtures/hr-attrition.csv");
    await page.getByTestId("numeric-summary").waitFor({ timeout: 30_000 });
    for (const view of VIEWS) {
      await page.getByTestId(`sidebar-nav-${view}`).click();
      await page.waitForTimeout(400);
      found.push(...(await offPaletteText(page)).map((b) => `${view}: ${b}`));
      // Idle means still: an endless decorative animation (a pulsing icon) inside or under glass
      // makes the compositor re-blur that glass every frame (measured: ~35% of a GPU core).
      const endless = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity)
          .map((a) => `${(a as CSSAnimation).animationName ?? "animation"} on ${String((a.effect as KeyframeEffect | null)?.target?.getAttribute("class") ?? "").slice(0, 60)}`)
      );
      found.push(...endless.map((e) => `${view}: endless animation at idle: ${e}`));
    }
    expect(found).toEqual([]);
  });
}
