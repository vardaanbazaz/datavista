/**
 * Theme and Appearance on <html>, before the first paint.
 *
 * vite.config.ts inlines these functions into index.html as a classic <script> in <head>
 * (`themeBootPlugin`), so the saved theme, text size and contrast are on <html> before the
 * stylesheet's first paint, not only after the deferred app bundle runs. The app calls the
 * same functions afterwards (displayPrefs.ts), so the boot script and the app cannot disagree.
 *
 * Every function here must stay self-contained (no imports, no outer variables, ES2017):
 * they are serialised with Function#toString.
 */

export type TextSize = "default" | "large" | "xlarge";
/** 'system' follows prefers-reduced-motion; 'reduce' / 'full' override it. */
export type MotionPreference = "system" | "reduce" | "full";

export interface Appearance {
  textSize: TextSize;
  highContrast: boolean;
  motion: MotionPreference;
  /** Glass (translucency + blur) on the frame. Off falls back to solid surfaces. */
  transparency: boolean;
  /** The aurora ribbon's slow drift. Off (the default since store v3) leaves it still. */
  backgroundAnimation: boolean;
}

export interface ThemeSetting {
  /** 'fixed': always `theme`. 'auto': `day` / `night`, switched by the device or a schedule. */
  mode: "fixed" | "auto";
  theme: string;
  day: string;
  night: string;
  trigger: "device" | "schedule";
  /** "HH:MM", local time. */
  dayStart: string;
  nightStart: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  textSize: "default",
  highContrast: false,
  motion: "system",
  transparency: true,
  backgroundAnimation: false,
};

export const DEFAULT_THEME_SETTING: ThemeSetting = {
  mode: "auto",
  theme: "light",
  day: "light",
  night: "dark",
  trigger: "device",
  dayStart: "07:00",
  nightStart: "19:00",
};

/**
 * The theme to show now. Schedule: day from `dayStart` (inclusive) until `nightStart`, wrapping
 * past midnight when night starts earlier in the clock than day; equal times mean always day.
 */
export function resolveThemeId(setting: ThemeSetting, prefersDark: boolean, minutesNow: number): string {
  if (setting.mode !== "auto") return setting.theme;
  const toMinutes = (v: string, fallback: number) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v || "");
    if (!m) return fallback;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : fallback;
  };
  let night: boolean;
  if (setting.trigger === "schedule") {
    const d = toMinutes(setting.dayStart, 420);
    const n = toMinutes(setting.nightStart, 1140);
    if (d === n) night = false;
    else if (d < n) night = !(minutesNow >= d && minutesNow < n);
    else night = minutesNow >= n && minutesNow < d;
  } else {
    night = prefersDark;
  }
  return night ? setting.night : setting.day;
}

/**
 * Reads the persisted UI state (zustand persist, `datavista-ui-storage`), version 1 to 3.
 * Version 1 had `theme: "light" | "dark" | "system"` and `readingComfort`; unknown theme ids
 * fall back to the defaults. Before version 3 Background animation was on by default, so a
 * stored `true` from version 1 or 2 is not a choice: it is read as off (the new default).
 */
export function readStoredPrefs(raw: string | null, knownIds: string[]): { setting: ThemeSetting; appearance: Appearance } {
  const defaultsSetting: ThemeSetting = {
    mode: "auto",
    theme: "light",
    day: "light",
    night: "dark",
    trigger: "device",
    dayStart: "07:00",
    nightStart: "19:00",
  };
  let state: Record<string, unknown> = {};
  let version = 0;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.state && typeof parsed.state === "object") state = parsed.state;
    if (parsed && typeof parsed === "object" && typeof parsed.version === "number") version = parsed.version;
  } catch {
    state = {};
  }
  const known = (v: unknown, fallback: string) => (typeof v === "string" && knownIds.indexOf(v) >= 0 ? v : fallback);

  let setting: ThemeSetting = { ...defaultsSetting };
  const saved = state.themeSetting as Partial<ThemeSetting> | undefined;
  if (saved && typeof saved === "object") {
    setting = {
      mode: saved.mode === "fixed" ? "fixed" : "auto",
      theme: known(saved.theme, "light"),
      day: known(saved.day, "light"),
      night: known(saved.night, "dark"),
      trigger: saved.trigger === "schedule" ? "schedule" : "device",
      dayStart: typeof saved.dayStart === "string" ? saved.dayStart : "07:00",
      nightStart: typeof saved.nightStart === "string" ? saved.nightStart : "19:00",
    };
  } else if (state.theme === "light" || state.theme === "dark") {
    setting = { ...defaultsSetting, mode: "fixed", theme: state.theme };
  }

  const a = ((state.appearance ?? state.readingComfort) || {}) as Partial<Appearance>;
  const appearance: Appearance = {
    textSize: a.textSize === "large" || a.textSize === "xlarge" ? a.textSize : "default",
    highContrast: a.highContrast === true,
    motion: a.motion === "reduce" || a.motion === "full" ? a.motion : "system",
    transparency: a.transparency !== false,
    backgroundAnimation: version >= 3 && a.backgroundAnimation === true,
  };
  return { setting, appearance };
}

/** Puts the theme and Appearance on <html>; index.css and themes.generated.css read them. */
export function applyAttributes(root: HTMLElement, themeId: string, dark: boolean, appearance: Appearance) {
  root.dataset.theme = themeId;
  root.classList.remove("light", "dark");
  root.classList.add(dark ? "dark" : "light");
  root.dataset.textSize = appearance.textSize;
  root.dataset.motion = appearance.motion;
  root.dataset.transparency = appearance.transparency && !appearance.highContrast ? "on" : "off";
  root.dataset.animation = appearance.backgroundAnimation ? "on" : "off";
  if (appearance.highContrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
}

/** The inline <head> script: read storage, resolve, apply. Never throws (the page must render). */
export function bootTheme(
  win: Window,
  knownIds: string[],
  darkIds: string[],
  resolve: typeof resolveThemeId,
  read: typeof readStoredPrefs,
  apply: typeof applyAttributes
) {
  try {
    let raw: string | null = null;
    try {
      raw = win.localStorage.getItem("datavista-ui-storage");
    } catch {
      raw = null;
    }
    const prefs = read(raw, knownIds);
    const prefersDark = !!(win.matchMedia && win.matchMedia("(prefers-color-scheme: dark)").matches);
    const now = new Date();
    const id = resolve(prefs.setting, prefersDark, now.getHours() * 60 + now.getMinutes());
    apply(win.document.documentElement, id, darkIds.indexOf(id) >= 0, prefs.appearance);
  } catch {
    /* defaults from CSS */
  }
}

/** The script body vite.config.ts puts in index.html. */
export function bootScript(knownIds: string[], darkIds: string[]): string {
  return `(${bootTheme.toString()})(window, ${JSON.stringify(knownIds)}, ${JSON.stringify(darkIds)}, ${resolveThemeId.toString()}, ${readStoredPrefs.toString()}, ${applyAttributes.toString()});`;
}
