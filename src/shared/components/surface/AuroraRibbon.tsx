import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { motionIsReduced } from "@/shared/theme/displayPrefs";

/*
 * The aurora ribbon: three soft gradient strands behind the top of a view. Colours come from
 * the theme (--ribbon-1..4, peak opacity --ribbon-opacity); the shapes are ours. Purely
 * decorative (aria-hidden).
 *
 * Still by default. With Background animation on (Appearance, opt-in), each strand sways with a
 * CSS animation of `transform` only (index.css `aurora-sway`): every strand is its own
 * composited layer whose blur (an SVG filter inside the strand) is rasterised once, so the
 * compositor moves a ready texture at the display's rate; no stepped timer, nothing animated in
 * blur, filters or gradients. The animation is only attached while it can be seen
 * (`data-paused="false"`): not when the ribbon is scrolled out of view, the tab is hidden,
 * motion is reduced, high contrast is on (the ribbon is hidden then) or the setting is off.
 * Glass above a moving ribbon is re-blurred every frame, which is the cost measured in
 * decisions.md (batch 7 phase B); that is why it is off by default.
 */

const STRANDS = [
  {
    period: 34,
    phase: 0,
    d: "M-80 430C260 300 600 540 920 340S1400 110 1680 190L1680 340C1420 270 1160 480 900 480S320 470 -80 570Z",
    stops: [1, 2, 3, 4],
    blur: 30,
    opacity: 1,
  },
  {
    period: 46,
    phase: 2.1,
    d: "M-80 250C260 170 660 390 1010 220S1460 50 1680 110L1680 200C1420 150 1060 340 800 340S260 270 -80 330Z",
    stops: [3, 1, 2],
    blur: 24,
    opacity: 0.8,
  },
  {
    period: 27,
    phase: 4.2,
    d: "M-80 480C400 380 720 300 1110 380S1500 330 1680 290L1680 330C1460 370 1160 430 900 420S320 455 -80 510Z",
    stops: [4, 2, 1],
    blur: 12,
    opacity: 0.7,
  },
] as const;

/** Per-strand animation timing: a half period each way (alternate), started part-way through by its phase. */
function strandStyle(i: number) {
  const s = STRANDS[i];
  const half = s.period / 2;
  return {
    opacity: s.opacity,
    ["--sway-duration" as string]: `${half}s`,
    ["--sway-delay" as string]: `${(-(s.phase / (2 * Math.PI)) * s.period).toFixed(2)}s`,
    ["--sway-x" as string]: i % 2 ? "-4%" : "4%",
    ["--sway-y" as string]: i === 1 ? "-2.5%" : "2.5%",
  };
}

export function AuroraRibbon({ variant = "page", className }: { variant?: "page" | "hero"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const appearance = useUiStore((s) => s.appearance);
  const moving = onScreen && tabVisible && appearance.backgroundAnimation && !appearance.highContrast && !motionIsReduced(appearance);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div
      ref={ref}
      className={cn("aurora", className)}
      style={{ ["--aurora-height" as string]: variant === "hero" ? "44rem" : "26rem" }}
      data-paused={moving ? "false" : "true"}
      data-testid="aurora-ribbon"
      aria-hidden
    >
      {STRANDS.map((s, i) => (
        <div key={i} className="aurora-strand" style={strandStyle(i)}>
          <svg viewBox="0 0 1600 640" preserveAspectRatio="none" focusable="false">
            <defs>
              <linearGradient id={`aurora-g${i}`} x1="0" y1="0" x2="1" y2="0">
                {s.stops.map((n, k) => (
                  <stop key={k} offset={k / (s.stops.length - 1)} style={{ stopColor: `hsl(var(--ribbon-${n}))` }} />
                ))}
              </linearGradient>
              <filter id={`aurora-f${i}`} x="-10%" y="-40%" width="120%" height="180%">
                <feGaussianBlur stdDeviation={s.blur} />
              </filter>
            </defs>
            <path d={s.d} fill={`url(#aurora-g${i})`} filter={`url(#aurora-f${i})`} />
          </svg>
        </div>
      ))}
    </div>
  );
}
