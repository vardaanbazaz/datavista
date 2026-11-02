import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Rule } from "@/shared/components/ornament";
import { cn } from "@/shared/lib/utils";
import { useUiStore, DEFAULT_READING_COMFORT, type MotionPreference, type TextSize } from "@/store/uiStore";
import { prefersReducedMotion } from "@/shared/theme/displayPrefs";

type Option<T extends string> = { value: T; label: string; hint?: string };

const TEXT_SIZES: Option<TextSize>[] = [
  { value: "default", label: "Default", hint: "16 px" },
  { value: "large", label: "Large", hint: "19 px" },
  { value: "xlarge", label: "Extra large", hint: "22 px" },
];
const THEMES: Option<"light" | "dark" | "system">[] = [
  { value: "light", label: "Light", hint: "Parchment" },
  { value: "dark", label: "Dark", hint: "Ink and walnut" },
  { value: "system", label: "Match my device" },
];

/** A row of large radio buttons inside a fieldset. Native inputs: keyboard and screen readers for free. */
function Choice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="catalogue-label mb-2 text-muted-foreground">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-card",
              value === o.value ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-accent"
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
              {o.hint && <span className="block text-xs font-normal text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ id, label, description, checked, onChange }: { id: string; label: string; description: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
        aria-describedby={`${id}-desc`}
        data-testid={id}
      />
      <div>
        <label htmlFor={id} className="cursor-pointer font-semibold">
          {label}
        </label>
        <p id={`${id}-desc`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

/**
 * Reading comfort: text size, high contrast, reduced motion, simple frames and the theme.
 * Every change applies at once (shared/theme/displayPrefs.ts puts it on <html>) and is kept
 * in this browser (uiStore, localStorage).
 */
export function ReadingComfortPanel() {
  const open = useUiStore((s) => s.isReadingComfortOpen);
  const setOpen = useUiStore((s) => s.setIsReadingComfortOpen);
  const comfort = useUiStore((s) => s.readingComfort);
  const setComfort = useUiStore((s) => s.setReadingComfort);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const deviceReduces = prefersReducedMotion();
  const MOTION: Option<MotionPreference>[] = [
    { value: "system", label: "Match my device", hint: deviceReduces ? "Currently: reduced" : "Currently: full" },
    { value: "reduce", label: "Reduce motion" },
    { value: "full", label: "Allow motion" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="grid max-w-2xl gap-4" data-testid="reading-comfort-panel">
        <DialogHeader>
          <p className="catalogue-label text-muted-foreground">Settings</p>
          <DialogTitle className="font-display text-h1 font-semibold">Reading comfort</DialogTitle>
          <DialogDescription className="text-body">
            Changes apply straight away and are kept in this browser.
          </DialogDescription>
        </DialogHeader>
        <Rule fleuron className="my-1" />
        <div className="space-y-6">
          <Choice legend="Text size" name="text-size" options={TEXT_SIZES} value={comfort.textSize} onChange={(textSize) => setComfort({ textSize })} />
          <Choice legend="Theme" name="theme" options={THEMES} value={theme} onChange={setTheme} />
          <Choice legend="Motion" name="motion" options={MOTION} value={comfort.motion} onChange={(motion) => setComfort({ motion })} />
          <div className="space-y-4">
            <Toggle
              id="high-contrast"
              label="High contrast"
              description="Stronger text and borders, black or white backgrounds."
              checked={comfort.highContrast}
              onChange={(highContrast) => setComfort({ highContrast })}
            />
            <Toggle
              id="simple-frames"
              label="Simple frames"
              description="Turns the decorative corners, gilt rules and flourishes off."
              checked={comfort.simpleFrames}
              onChange={(simpleFrames) => setComfort({ simpleFrames })}
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button variant="plate" onClick={() => setComfort(DEFAULT_READING_COMFORT)} data-testid="reading-comfort-reset">
            Reset to defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
