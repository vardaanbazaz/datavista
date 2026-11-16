import { describe, expect, it } from "vitest";
import { bootScript, readStoredPrefs, resolveThemeId, type ThemeSetting } from "../boot";
import { THEMES } from "../themes";

/**
 * The inline <head> script (serialised from boot.ts by vite.config.ts) must put exactly what the
 * app would put on <html>: run the real script text against a fake window and compare.
 */

const ids: string[] = THEMES.map((t) => t.id);
const darkIds: string[] = THEMES.filter((t) => t.scheme === "dark").map((t) => t.id);

function fakeWindow(stored: unknown, prefersDark: boolean, now: Date) {
  const classes = new Set<string>();
  const root = {
    dataset: {} as Record<string, string>,
    classList: { add: (c: string) => classes.add(c), remove: (...c: string[]) => c.forEach((x) => classes.delete(x)) },
  };
  const win = {
    localStorage: { getItem: () => (stored === undefined ? null : JSON.stringify(stored)) },
    matchMedia: (q: string) => ({ matches: q.includes("dark") && prefersDark }),
    document: { documentElement: root },
  };
  return { win, root, classes, now };
}

function runBoot(stored: unknown, prefersDark: boolean, now: Date) {
  const f = fakeWindow(stored, prefersDark, now);
  const RealDate = Date;
  // The script reads the clock with `new Date()`.
  const FakeDate = function () {
    return now;
  } as unknown as DateConstructor;
  globalThis.Date = FakeDate;
  try {
    new Function("window", bootScript(ids, darkIds))(f.win);
  } finally {
    globalThis.Date = RealDate;
  }
  return { theme: f.root.dataset.theme, dark: f.classes.has("dark"), dataset: { ...f.root.dataset } };
}

const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m);

describe("resolveThemeId", () => {
  const s = (over: Partial<ThemeSetting>): ThemeSetting => ({
    mode: "auto",
    theme: "light",
    day: "mist",
    night: "midnight",
    trigger: "schedule",
    dayStart: "07:00",
    nightStart: "19:00",
    ...over,
  });
  it("fixed ignores device and clock", () => {
    expect(resolveThemeId(s({ mode: "fixed", theme: "clay" }), true, 23 * 60)).toBe("clay");
  });
  it("follows the device", () => {
    expect(resolveThemeId(s({ trigger: "device" }), true, 600)).toBe("midnight");
    expect(resolveThemeId(s({ trigger: "device" }), false, 1300)).toBe("mist");
  });
  it("schedule: day is [dayStart, nightStart)", () => {
    expect(resolveThemeId(s({}), false, 7 * 60)).toBe("mist");
    expect(resolveThemeId(s({}), false, 7 * 60 - 1)).toBe("midnight");
    expect(resolveThemeId(s({}), false, 19 * 60 - 1)).toBe("mist");
    expect(resolveThemeId(s({}), false, 19 * 60)).toBe("midnight");
  });
  it("schedule crossing midnight (day starts after night in the clock)", () => {
    const x = s({ dayStart: "20:00", nightStart: "04:00" });
    expect(resolveThemeId(x, false, 21 * 60)).toBe("mist");
    expect(resolveThemeId(x, false, 2 * 60)).toBe("mist");
    expect(resolveThemeId(x, false, 4 * 60)).toBe("midnight");
    expect(resolveThemeId(x, false, 12 * 60)).toBe("midnight");
  });
  it("equal times mean always day; bad times fall back to 07:00 / 19:00", () => {
    expect(resolveThemeId(s({ dayStart: "09:00", nightStart: "09:00" }), true, 3 * 60)).toBe("mist");
    expect(resolveThemeId(s({ dayStart: "nope", nightStart: "25:00" }), false, 20 * 60)).toBe("midnight");
  });
});

describe("readStoredPrefs migrates version 1", () => {
  it("theme light/dark → fixed; system or nothing → Automatic following the device", () => {
    expect(readStoredPrefs(JSON.stringify({ state: { theme: "dark" }, version: 1 }), ids).setting).toMatchObject({ mode: "fixed", theme: "dark" });
    expect(readStoredPrefs(JSON.stringify({ state: { theme: "system" }, version: 1 }), ids).setting).toMatchObject({ mode: "auto", trigger: "device", day: "light", night: "dark" });
    expect(readStoredPrefs(null, ids).setting.mode).toBe("auto");
  });
  it("readingComfort → appearance (simpleFrames dropped, transparency on)", () => {
    const { appearance } = readStoredPrefs(
      JSON.stringify({ state: { readingComfort: { textSize: "xlarge", highContrast: true, motion: "reduce", simpleFrames: true } } }),
      ids
    );
    expect(appearance).toEqual({ textSize: "xlarge", highContrast: true, motion: "reduce", transparency: true });
  });
  it("Background animation (removed in v4): a stored v2/v3 key is dropped, the rest kept", () => {
    for (const version of [2, 3]) {
      const { appearance } = readStoredPrefs(JSON.stringify({ state: { appearance: { backgroundAnimation: true, transparency: false } }, version }), ids);
      expect(appearance).not.toHaveProperty("backgroundAnimation");
      expect(appearance.transparency).toBe(false);
    }
  });
  it("unknown theme ids and junk fall back to defaults", () => {
    expect(readStoredPrefs(JSON.stringify({ state: { themeSetting: { mode: "fixed", theme: "parchment" } } }), ids).setting.theme).toBe("light");
    expect(readStoredPrefs("{not json", ids).setting.mode).toBe("auto");
  });
});

describe("inline boot script matches the app", () => {
  const cases: [string, unknown, boolean, Date][] = [
    ["nothing stored, light device", undefined, false, at(12)],
    ["nothing stored, dark device", undefined, true, at(12)],
    ["v1 dark + high contrast", { state: { theme: "dark", readingComfort: { highContrast: true, textSize: "large" } }, version: 1 }, false, at(12)],
    ["fixed Dusk", { state: { themeSetting: { mode: "fixed", theme: "dusk" } }, version: 2 }, false, at(12)],
    ["schedule night", { state: { themeSetting: { mode: "auto", day: "clay", night: "carbon", trigger: "schedule", dayStart: "07:00", nightStart: "19:00" } }, version: 2 }, false, at(23, 30)],
    ["schedule over midnight, day", { state: { themeSetting: { mode: "auto", day: "mint", night: "graphite", trigger: "schedule", dayStart: "22:00", nightStart: "03:00" } }, version: 2 }, true, at(1)],
    ["transparency off", { state: { appearance: { transparency: false, motion: "full" } }, version: 2 }, false, at(9)],
    ["v3 with the removed animation key", { state: { appearance: { backgroundAnimation: true } }, version: 3 }, false, at(9)],
  ];
  it.each(cases)("%s", (_name, stored, prefersDark, now) => {
    const boot = runBoot(stored, prefersDark, now);
    const { setting, appearance } = readStoredPrefs(stored === undefined ? null : JSON.stringify(stored), ids);
    const expected = resolveThemeId(setting, prefersDark, now.getHours() * 60 + now.getMinutes());
    expect(boot.theme).toBe(expected);
    expect(boot.dark).toBe((darkIds as string[]).includes(expected));
    expect(boot.dataset.textSize).toBe(appearance.textSize);
    expect(boot.dataset.contrast).toBe(appearance.highContrast ? "high" : undefined);
    expect(boot.dataset.transparency).toBe(appearance.transparency && !appearance.highContrast ? "on" : "off");
    expect(boot.dataset.animation).toBeUndefined();
  });
  it("never throws, even when storage access throws", () => {
    const win = { localStorage: { getItem: () => { throw new Error("blocked"); } }, matchMedia: undefined, document: { documentElement: { dataset: {}, classList: { add() {}, remove() {} } } } };
    expect(() => new Function("window", bootScript(ids, darkIds))(win)).not.toThrow();
    expect((win.document.documentElement.dataset as Record<string, string>).theme).toBe("light");
  });
});
