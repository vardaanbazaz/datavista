import { cn } from "@/shared/lib/utils";
import { useUiStore } from "@/store/uiStore";
import { detailFor, logoShapes, type Pt } from "./logoGeometry";

const pts = (p: Pt[]) => p.map(([x, y]) => `${+x.toFixed(3)},${+y.toFixed(3)}`).join(" ");

/**
 * The DataVista mark (see logoGeometry.ts). Full colour by default, the same fixed spectrum in
 * every theme; single colour (currentColor, shape opacity steps) when `mono` or when high
 * contrast is on. Decorative unless given a `title`.
 */
export function Logo({ size = 32, mono, title, className }: { size?: number; mono?: boolean; title?: string; className?: string }) {
  const highContrast = useUiStore((s) => s.appearance.highContrast);
  const isMono = mono ?? highContrast;
  const shapes = logoShapes(detailFor(size));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      data-testid="logo"
      data-mono={isMono ? "true" : "false"}
    >
      {shapes.map((s, i) => (
        <polygon key={i} points={pts(s.pts)} fill={isMono ? "currentColor" : s.fill} fillOpacity={isMono ? s.mono : 1} />
      ))}
    </svg>
  );
}
