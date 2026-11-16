import { cn } from "@/shared/lib/utils";

/*
 * The aurora ribbon: three soft gradient strands behind the top of a view. Colours come from
 * the theme (--ribbon-1..4, peak opacity --ribbon-opacity); the shapes are ours. Purely
 * decorative (aria-hidden) and always still: the opt-in drift animation was removed
 * (decisions.md, 2026-11-16). Each strand's blur is an SVG filter inside the strand, so it is
 * rasterised once. Hidden in high contrast (index.css).
 */

const STRANDS = [
  {
    d: "M-80 430C260 300 600 540 920 340S1400 110 1680 190L1680 340C1420 270 1160 480 900 480S320 470 -80 570Z",
    stops: [1, 2, 3, 4],
    blur: 30,
    opacity: 1,
  },
  {
    d: "M-80 250C260 170 660 390 1010 220S1460 50 1680 110L1680 200C1420 150 1060 340 800 340S260 270 -80 330Z",
    stops: [3, 1, 2],
    blur: 24,
    opacity: 0.8,
  },
  {
    d: "M-80 480C400 380 720 300 1110 380S1500 330 1680 290L1680 330C1460 370 1160 430 900 420S320 455 -80 510Z",
    stops: [4, 2, 1],
    blur: 12,
    opacity: 0.7,
  },
] as const;

export function AuroraRibbon({ variant = "page", className }: { variant?: "page" | "hero"; className?: string }) {
  return (
    <div
      className={cn("aurora", className)}
      style={{ ["--aurora-height" as string]: variant === "hero" ? "44rem" : "26rem" }}
      data-testid="aurora-ribbon"
      aria-hidden
    >
      {STRANDS.map((s, i) => (
        <div key={i} className="aurora-strand" style={{ opacity: s.opacity }}>
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
