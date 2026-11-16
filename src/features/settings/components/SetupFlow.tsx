/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Compass, KeyRound, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { useUiStore, DEFAULT_APPEARANCE, DEFAULT_THEME_SETTING, type LlmProvider, type TextSize } from "@/store/uiStore";
import { motionIsReduced, prefersReducedMotion, transparencyBlockedReason } from "@/shared/theme/displayPrefs";
import { providerDisplayName } from "@/features/ai/providerDisplayName";
import { loadSampleDataset } from "@/features/datasets/sampleData";
import { AutomaticOptions, Choice, ModeCards, ThemeGroups, Toggle, type Option } from "./appearanceControls";

/*
 * First-run setup (batch 7 phase B): three short screens, then a choice of next step.
 *   1. Look: Light / Dark / Automatic (+ day/night themes, device or schedule) and every theme.
 *   2. Effects & comfort: transparency, reduce motion, text size, high contrast, with a live
 *      preview.
 *   3. AI key (optional) and where data lives.
 *   End: "Take the tour" or "Start with sample data".
 * Each choice applies at once (same store as Appearance). "Use recommended settings" on any
 * screen puts that screen and the ones after it back to the defaults, keeps what was chosen on
 * earlier screens, and goes to the end. Closing (X / Esc) finishes setup with what is set.
 * Shown once: Dashboard opens it on a first visit with no data (see `shouldOfferSetup`);
 * "Run setup again" in Appearance reopens it.
 */

const STEPS = ["look", "effects", "ai", "done"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  look: "Choose a look",
  effects: "Effects & comfort",
  ai: "AI assistant (optional)",
  done: "You're all set",
};

const TEXT_SIZES: Option<TextSize>[] = [
  { value: "default", label: "Default", hint: "16 px" },
  { value: "large", label: "Large", hint: "19 px" },
  { value: "xlarge", label: "Extra large", hint: "22 px" },
];

/** A small live picture of the frame (ribbon, glass tile) and the data (solid table) in the current settings. */
function LivePreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-background p-3" aria-hidden data-testid="setup-preview">
      <div className="setup-preview-ribbon" />
      <div className="relative grid grid-cols-[1fr_1.4fr] gap-2">
        <div className="surface-glass rounded-lg p-2.5">
          <div className="text-xs text-frame-muted">Monthly income</div>
          <div className="text-h3 tabular-nums text-foreground">6,503</div>
          <div className="text-xs text-frame-muted">mean, 1,470 rows</div>
        </div>
        <div className="surface-solid overflow-hidden rounded-lg text-xs">
          {[
            ["Department", "Rows"],
            ["Research", "961"],
            ["Sales", "446"],
          ].map(([a, b], i) => (
            <div key={a} className={cn("flex justify-between px-2.5 py-1", i === 0 ? "bg-muted font-semibold text-foreground" : "border-t border-border text-muted-foreground")}>
              <span>{a}</span>
              <span className="tabular-nums">{b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Whether a first visit should get the setup: never seen it, no tour seen, no data, not an older install. */
export function shouldOfferSetup({ hasCompletedSetup, hasSeenTour, datasetCount, visited }: { hasCompletedSetup: boolean; hasSeenTour: boolean; datasetCount: number; visited: boolean }) {
  return !hasCompletedSetup && !hasSeenTour && datasetCount === 0 && !visited;
}

export function SetupFlow() {
  const open = useUiStore((s) => s.isSetupOpen);
  const setOpen = useUiStore((s) => s.setIsSetupOpen);
  const completeSetup = useUiStore((s) => s.completeSetup);
  const startTour = useUiStore((s) => s.startTour);
  const setActiveView = useUiStore((s) => s.setActiveView);
  const appearance = useUiStore((s) => s.appearance);
  const setAppearance = useUiStore((s) => s.setAppearance);
  const setSetting = useUiStore((s) => s.setThemeSetting);
  const llmApiKey = useUiStore((s) => s.llmApiKey);
  const llmProvider = useUiStore((s) => s.llmProvider);
  const setLlmApiKey = useUiStore((s) => s.setLlmApiKey);
  const setLlmProvider = useUiStore((s) => s.setLlmProvider);
  const [step, setStep] = useState<Step>("look");
  const [key, setKey] = useState("");
  const keyId = useId();
  const index = STEPS.indexOf(step);

  useEffect(() => {
    if (open) {
      setStep("look");
      setKey(llmApiKey);
    }
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const finish = () => {
    completeSetup();
    setOpen(false);
  };
  const saveKey = () => {
    if (key.trim() !== llmApiKey) setLlmApiKey(key.trim());
  };
  const recommended = () => {
    if (index <= 0) setSetting(DEFAULT_THEME_SETTING);
    if (index <= 1) setAppearance(DEFAULT_APPEARANCE);
    if (index === 2) setKey(llmApiKey);
    setStep("done");
  };
  const next = () => {
    if (step === "ai") saveKey();
    setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  };

  const deviceReduces = prefersReducedMotion();

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish())}>
      <DialogContent className="flex max-w-2xl flex-col gap-5" data-testid="setup-flow" aria-describedby="setup-desc">
        <DialogHeader>
          {step !== "done" && (
            <p className="text-xs font-semibold text-primary-ink" data-testid="setup-progress">
              Setup · step {index + 1} of 3
            </p>
          )}
          <DialogTitle className="text-h2">{TITLES[step]}</DialogTitle>
          <DialogDescription id="setup-desc" className="text-frame-muted">
            {step === "look" && "Pick a theme. You can change everything later in Appearance."}
            {step === "effects" && "Turn effects off if things feel slow. The preview updates as you go."}
            {step === "ai" && "Add a key to ask questions in plain English. Skip this if you don't need it."}
            {step === "done" && "Your choices are saved in this browser. Run setup again any time from Appearance."}
          </DialogDescription>
        </DialogHeader>

        {step === "look" && (
          <div className="space-y-5" data-testid="setup-step-look">
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">Mode</legend>
              <ModeCards name="setup-theme" />
              <AutomaticOptions idPrefix="setup-" />
            </fieldset>
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-semibold">Or pick a theme</legend>
              <ThemeGroups name="setup-theme" />
            </fieldset>
          </div>
        )}

        {step === "effects" && (
          <div className="grid gap-5 sm:grid-cols-[1fr_15rem]" data-testid="setup-step-effects">
            <div className="space-y-4">
              <Toggle
                id="setup-transparency"
                label="Transparency"
                description="Frosted-glass panels. Turn off if things feel slow."
                checked={appearance.transparency}
                onChange={(transparency) => setAppearance({ transparency })}
                blockedReason={transparencyBlockedReason(appearance)}
              />
              <Toggle
                id="setup-reduce-motion"
                label="Reduce motion"
                description={deviceReduces ? "Your device asks for less motion, so this starts on." : "Fewer moving transitions."}
                checked={motionIsReduced(appearance)}
                onChange={(reduce) => setAppearance({ motion: reduce ? "reduce" : deviceReduces ? "full" : "system" })}
              />
              <Toggle
                id="setup-high-contrast"
                label="High contrast"
                description="Solid panels, stronger borders and text."
                checked={appearance.highContrast}
                onChange={(highContrast) => setAppearance({ highContrast })}
              />
              <Choice legend="Text size" name="setup-text-size" options={TEXT_SIZES} value={appearance.textSize} onChange={(textSize) => setAppearance({ textSize })} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Preview</p>
              <LivePreview />
            </div>
          </div>
        )}

        {step === "ai" && (
          <div className="space-y-4" data-testid="setup-step-ai">
            <Choice<LlmProvider>
              legend="Provider"
              name="setup-provider"
              columns={2}
              options={[
                { value: "gemini", label: providerDisplayName("gemini") },
                { value: "openai", label: providerDisplayName("openai") },
              ]}
              value={llmProvider}
              onChange={setLlmProvider}
            />
            <div className="space-y-1.5">
              <label htmlFor={keyId} className="flex items-center gap-1.5 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-primary-ink" aria-hidden />
                API key
              </label>
              <Input
                id={keyId}
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={llmProvider === "gemini" ? "AIzaSy..." : "sk-..."}
                data-testid="setup-api-key"
              />
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm" data-testid="setup-privacy-note">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
              <p className="text-frame-muted">
                <span className="font-medium text-foreground">Your data stays in this browser.</span> Files are read and stored here, not
                uploaded. The key is saved in this browser's local storage (not encrypted) until you remove it in AI settings or with Data &amp; privacy → Clear all local data. When you use an AI feature, your question and
                the dataset's column names, types and first few values are sent to {providerDisplayName(llmProvider)}.
              </p>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="setup-step-done">
            <button
              type="button"
              className="flex items-start gap-3 rounded-xl border border-borderStrong p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                finish();
                setActiveView("overview");
                startTour();
              }}
              data-testid="setup-take-tour"
            >
              <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
              <span>
                <span className="block font-semibold">Take the tour</span>
                <span className="block text-sm text-frame-muted">One stop per section, about a minute.</span>
              </span>
            </button>
            <button
              type="button"
              className="flex items-start gap-3 rounded-xl border border-borderStrong p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                finish();
                loadSampleDataset();
                setActiveView("overview");
              }}
              data-testid="setup-sample-data"
            >
              <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
              <span>
                <span className="block font-semibold">Start with sample data</span>
                <span className="block text-sm text-frame-muted">A small sales table to try charts and pivots.</span>
              </span>
            </button>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {step !== "done" ? (
            <Button variant="ghost" onClick={recommended} data-testid="setup-recommended">
              Use recommended settings
            </Button>
          ) : (
            <Button variant="ghost" onClick={finish} data-testid="setup-close">
              Just explore
            </Button>
          )}
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" onClick={() => setStep(STEPS[index - 1])} data-testid="setup-back" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>
            )}
            {step === "ai" && (
              <Button variant="outline" onClick={() => setStep("done")} data-testid="setup-skip-ai">
                Skip, add later in AI settings
              </Button>
            )}
            {step !== "done" && (
              <Button onClick={next} data-testid="setup-next" className="gap-1.5">
                {step === "ai" ? (key.trim() ? "Save key" : "Next") : "Next"}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
