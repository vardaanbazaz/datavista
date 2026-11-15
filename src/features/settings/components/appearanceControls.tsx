/* eslint-disable react-refresh/only-export-components */
import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { THEMES, THEME_BY_ID, isThemeId, type ThemeDef, type ThemeId } from "@/shared/theme/themes";

/*
 * Controls shared by the Appearance panel and the first-run setup (SetupFlow): theme cards with
 * a swatch, the Automatic options, radio rows and checkbox toggles. Native inputs throughout,
 * so keyboard and screen readers work without extra wiring.
 */

export type Option<T extends string> = { value: T; label: string; hint?: string };

export const THEME_GROUPS: { id: "light" | "neutral" | "dark"; label: string; themes: ThemeDef[] }[] = [
  { id: "light", label: "Light", themes: THEMES.filter((t) => t.group === "light") },
  { id: "neutral", label: "Neutral & warm", themes: THEMES.filter((t) => t.group === "neutral") },
  { id: "dark", label: "Dark", themes: THEMES.filter((t) => t.group === "dark") },
];

/** A picture of a theme in its own colours: ribbon over the background, a glass chip with text lines, the accent. */
export function Swatch({ theme, half, className }: { theme: ThemeDef; half?: ThemeDef; className?: string }) {
  const paint = (t: ThemeDef) => {
    const k = t.tokens;
    const a = Math.round(k.ribbonOpacity * 255).toString(16).padStart(2, "0");
    return {
      backgroundColor: k.background,
      backgroundImage: `linear-gradient(160deg, transparent 18%, ${k.ribbon[0]}${a} 38%, ${k.ribbon[1]}${a} 52%, ${k.ribbon[2]}${a} 66%, ${k.ribbon[3]}${a} 80%, transparent 96%)`,
    };
  };
  const chip = (t: ThemeDef) => {
    const k = t.tokens;
    const a = Math.round(k.glassAlpha * 255).toString(16).padStart(2, "0");
    return (
      <div className="absolute bottom-2 left-2 right-6 rounded-md p-1.5" style={{ backgroundColor: `${k.glass}${a}`, border: `1px solid ${k.glassBorder}55` }}>
        <div className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: k.foreground }} />
        <div className="mt-1 h-1.5 w-1/2 rounded-full" style={{ backgroundColor: k.frameMuted, opacity: 0.8 }} />
        <div className="absolute -right-4 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full" style={{ backgroundColor: k.primary }} />
      </div>
    );
  };
  return (
    <div className={cn("relative h-16 w-full overflow-hidden rounded-lg border border-border", className)} aria-hidden>
      <div className="absolute inset-0" style={paint(theme)}>
        {chip(theme)}
      </div>
      {half && (
        <div className="absolute inset-0 [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]" style={paint(half)}>
          {chip(half)}
        </div>
      )}
    </div>
  );
}

export function ThemeCard({
  name = "theme",
  value,
  label,
  hint,
  checked,
  onSelect,
  swatch,
  testId,
}: {
  name?: string;
  value: string;
  label: string;
  hint?: string;
  checked: boolean;
  onSelect: () => void;
  swatch: ReactNode;
  testId?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-2 rounded-xl border p-2 transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked ? "border-2 border-primary-ink p-[7px]" : "border-borderStrong hover:bg-accent"
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" data-testid={testId ?? `theme-${value}`} />
      {swatch}
      <span className="flex items-center justify-between gap-2 px-0.5">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          {hint && <span className="block truncate text-xs text-frame-muted">{hint}</span>}
        </span>
        {checked && <Check className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden />}
      </span>
    </label>
  );
}

/** A row of radio buttons inside a fieldset. */
export function Choice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  columns = 3,
}: {
  legend: string;
  name: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className={cn("grid gap-2", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              value === o.value ? "border-primary-ink bg-primary/10 font-medium" : "border-borderStrong hover:bg-accent"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              data-testid={`${name}-${o.value}`}
            />
            <span>
              {o.label}
              {o.hint && <span className="block text-xs font-normal text-frame-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
  blockedReason,
}: {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  blockedReason?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
        aria-describedby={`${id}-desc`}
        data-testid={id}
      />
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold">
          {label}
        </label>
        <p id={`${id}-desc`} className="text-sm text-frame-muted">
          {description}
          {checked && blockedReason && (
            <span className="mt-0.5 block font-medium text-foreground" data-testid={`${id}-blocked`}>
              {blockedReason}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export function ThemeSelect({ label, value, onChange, testId }: { label: string; value: ThemeId; onChange: (id: ThemeId) => void; testId: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => isThemeId(e.target.value) && onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={testId}
      >
        {[{ label: "Default", themes: THEMES.filter((t) => t.group === "default") }, ...THEME_GROUPS].map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Light / Dark / Automatic cards. */
export function ModeCards({ name = "theme" }: { name?: string }) {
  const setting = useUiStore((s) => s.themeSetting);
  const setSetting = useUiStore((s) => s.setThemeSetting);
  const selected = setting.mode === "auto" ? "auto" : setting.theme;
  const day = THEME_BY_ID[setting.day as ThemeId] ?? THEME_BY_ID.light;
  const night = THEME_BY_ID[setting.night as ThemeId] ?? THEME_BY_ID.dark;
  const prefix = name === "theme" ? "theme" : name;
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
      <ThemeCard name={name} testId={`${prefix}-light`} value="light" label="Light" hint={THEME_BY_ID.light.description} checked={selected === "light"} onSelect={() => setSetting({ mode: "fixed", theme: "light" })} swatch={<Swatch theme={THEME_BY_ID.light} />} />
      <ThemeCard name={name} testId={`${prefix}-dark`} value="dark" label="Dark" hint={THEME_BY_ID.dark.description} checked={selected === "dark"} onSelect={() => setSetting({ mode: "fixed", theme: "dark" })} swatch={<Swatch theme={THEME_BY_ID.dark} />} />
      <ThemeCard
        name={name}
        testId={`${prefix}-auto`}
        value="auto"
        label="Automatic"
        hint={`${day.label} by day, ${night.label} by night`}
        checked={selected === "auto"}
        onSelect={() => setSetting({ mode: "auto" })}
        swatch={<Swatch theme={day} half={night} />}
      />
    </div>
  );
}

/** Day / night theme pickers and the switch trigger (device or schedule). Shown when the mode is Automatic. */
export function AutomaticOptions({ idPrefix = "" }: { idPrefix?: string }) {
  const setting = useUiStore((s) => s.themeSetting);
  const setSetting = useUiStore((s) => s.setThemeSetting);
  const resolved = useUiStore((s) => s.resolvedTheme);
  if (setting.mode !== "auto") return null;
  return (
    <div className="space-y-4 rounded-xl border border-border p-4" data-testid={`${idPrefix}automatic-options`}>
      <p className="text-sm text-frame-muted" aria-live="polite">
        Showing <span className="font-medium text-foreground">{THEME_BY_ID[resolved].label}</span> now.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ThemeSelect label="Day theme" value={setting.day as ThemeId} onChange={(day) => setSetting({ day })} testId={`${idPrefix}auto-day`} />
        <ThemeSelect label="Night theme" value={setting.night as ThemeId} onChange={(night) => setSetting({ night })} testId={`${idPrefix}auto-night`} />
      </div>
      <Choice
        legend="Switch"
        name={`${idPrefix}auto-trigger`}
        columns={2}
        options={[
          { value: "device", label: "Follow device", hint: "Your system's light / dark setting" },
          { value: "schedule", label: "Schedule", hint: "At the times below" },
        ]}
        value={setting.trigger}
        onChange={(trigger) => setSetting({ trigger })}
      />
      {setting.trigger === "schedule" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["dayStart", "Day starts at", `${idPrefix}day-start`],
              ["nightStart", "Night starts at", `${idPrefix}night-start`],
            ] as const
          ).map(([key, label, testId]) => (
            <div key={key} className="space-y-1">
              <label htmlFor={testId} className="text-sm font-medium">
                {label}
              </label>
              <input
                id={testId}
                type="time"
                value={setting[key]}
                onChange={(e) => e.target.value && setSetting({ [key]: e.target.value })}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={testId}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every theme, by group, as swatch cards. */
export function ThemeGroups({ name = "theme", groups = THEME_GROUPS }: { name?: string; groups?: typeof THEME_GROUPS }) {
  const setting = useUiStore((s) => s.themeSetting);
  const setSetting = useUiStore((s) => s.setThemeSetting);
  const selected = setting.mode === "auto" ? "auto" : setting.theme;
  const prefix = name === "theme" ? "theme" : name;
  return (
    <>
      {groups.map((g) => (
        <div key={g.id}>
          <p className="mb-2 text-sm font-semibold" id={`${prefix}-group-${g.id}`}>
            {g.label}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="group" aria-labelledby={`${prefix}-group-${g.id}`}>
            {g.themes.map((t) => (
              <ThemeCard
                key={t.id}
                name={name}
                testId={`${prefix}-${t.id}`}
                value={t.id}
                label={t.label}
                hint={t.description}
                checked={selected === t.id}
                onSelect={() => setSetting({ mode: "fixed", theme: t.id })}
                swatch={<Swatch theme={t} />}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
