import { useEffect, type ReactNode } from "react";

import { useUiStore } from "@/store/uiStore";
import { applyDisplayPrefs, msUntilNextSwitch } from "@/shared/theme/displayPrefs";

/**
 * Keeps <html> in step with the theme and Appearance settings. The first application happens
 * before the first paint (index.html's boot script, then src/main.tsx); this re-applies on
 * every settings change, and for Automatic: when the device switches light/dark ("Follow
 * device") or when the schedule reaches a day/night start ("Schedule"), and when the tab is
 * shown again (a sleeping laptop misses timers).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const setting = useUiStore((s) => s.themeSetting);
  const appearance = useUiStore((s) => s.appearance);
  const setResolvedTheme = useUiStore((s) => s.setResolvedTheme);

  useEffect(() => {
    const apply = () => setResolvedTheme(applyDisplayPrefs(setting, appearance));
    apply();
    if (setting.mode !== "auto") return;

    const cleanups: (() => void)[] = [];
    const onVisible = () => {
      if (document.visibilityState === "visible") apply();
    };
    document.addEventListener("visibilitychange", onVisible);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisible));

    if (setting.trigger === "device") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      cleanups.push(() => mq.removeEventListener("change", apply));
    } else {
      let timer: number;
      const schedule = () => {
        timer = window.setTimeout(() => {
          apply();
          schedule();
        }, msUntilNextSwitch(setting) + 500);
      };
      schedule();
      cleanups.push(() => window.clearTimeout(timer));
    }
    return () => cleanups.forEach((c) => c());
  }, [setting, appearance, setResolvedTheme]);

  return <>{children}</>;
}
