import { Compass, RotateCcw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useUiStore, DEFAULT_APPEARANCE, DEFAULT_THEME_SETTING, type MotionPreference, type TextSize } from "@/store/uiStore";
import { animationBlockedReason, prefersReducedMotion, transparencyBlockedReason } from "@/shared/theme/displayPrefs";
import { AutomaticOptions, Choice, ModeCards, ThemeGroups, Toggle, type Option } from "./appearanceControls";

const TEXT_SIZES: Option<TextSize>[] = [
  { value: "default", label: "Default", hint: "16 px" },
  { value: "large", label: "Large", hint: "19 px" },
  { value: "xlarge", label: "Extra large", hint: "22 px" },
];

/**
 * Appearance: theme (or Automatic day/night), transparency, background animation, text size,
 * high contrast, motion. Every change applies at once (ThemeProvider → displayPrefs.ts puts it
 * on <html>) and is kept in this browser (uiStore, localStorage).
 */
export function AppearancePanel() {
  const open = useUiStore((s) => s.isAppearanceOpen);
  const setOpen = useUiStore((s) => s.setIsAppearanceOpen);
  const appearance = useUiStore((s) => s.appearance);
  const setAppearance = useUiStore((s) => s.setAppearance);
  const setSetting = useUiStore((s) => s.setThemeSetting);
  const setIsSetupOpen = useUiStore((s) => s.setIsSetupOpen);
  const resetTour = useUiStore((s) => s.resetTour);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const deviceReduces = prefersReducedMotion();
  const MOTION: Option<MotionPreference>[] = [
    { value: "system", label: "Match my device", hint: deviceReduces ? "Currently: reduced" : "Currently: full" },
    { value: "reduce", label: "Reduce motion" },
    { value: "full", label: "Allow motion" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="grid max-w-3xl gap-6" data-testid="appearance-panel">
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription className="text-frame-muted">Changes apply straight away and are kept in this browser.</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-h3">Theme</legend>
          <ModeCards />
          <AutomaticOptions />
          <ThemeGroups />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-h3">Effects</legend>
          <Toggle
            id="transparency"
            label="Transparency effects"
            description="Frosted-glass sidebar, tiles and dialogs. Turn off if scrolling feels slow; tables and charts are always solid."
            checked={appearance.transparency}
            onChange={(transparency) => setAppearance({ transparency })}
            blockedReason={transparencyBlockedReason(appearance)}
          />
          <Toggle
            id="background-animation"
            label="Background animation"
            description="The coloured ribbon at the top of each page drifts slowly. Off by default: it keeps the graphics chip busy re-blurring the glass, so leave it off if things feel slow or on battery."
            checked={appearance.backgroundAnimation}
            onChange={(backgroundAnimation) => setAppearance({ backgroundAnimation })}
            blockedReason={animationBlockedReason(appearance)}
          />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="mb-3 text-h3">Reading</legend>
          <Choice legend="Text size" name="text-size" options={TEXT_SIZES} value={appearance.textSize} onChange={(textSize) => setAppearance({ textSize })} />
          <Toggle
            id="high-contrast"
            label="High contrast"
            description="Solid surfaces, stronger borders and text, no background ribbon. Works with any theme."
            checked={appearance.highContrast}
            onChange={(highContrast) => setAppearance({ highContrast })}
          />
          <Choice legend="Motion" name="motion" options={MOTION} value={appearance.motion} onChange={(motion) => setAppearance({ motion })} />
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setOpen(false);
              setActiveView("overview");
              resetTour();
            }}
            data-testid="appearance-take-tour"
          >
            <Compass className="h-4 w-4" aria-hidden />
            Take the tour
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setOpen(false);
              setIsSetupOpen(true);
            }}
            data-testid="appearance-run-setup"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Run setup again
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setAppearance(DEFAULT_APPEARANCE);
              setSetting(DEFAULT_THEME_SETTING);
            }}
            data-testid="appearance-reset"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Reset to defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
