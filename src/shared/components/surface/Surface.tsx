import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Frame surface: translucent tint + backdrop blur (index.css `.surface-glass`). For tiles,
 * the sidebar and toolbars; text on it uses foreground / text-frame-muted. Don't nest glass
 * in glass.
 */
export const GlassPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { float?: boolean }>(
  ({ className, float = false, ...props }, ref) => (
    <div ref={ref} className={cn(float ? "surface-float" : "surface-glass", "rounded-xl", className)} {...props} />
  )
);
GlassPanel.displayName = "GlassPanel";

interface DataPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /** Heading level of the title. */
  level?: 2 | 3;
  /** Controls on the right of the title row. */
  actions?: ReactNode;
  /** Content runs to the panel's edges (tables). */
  flush?: boolean;
  /** `glass` for forms and short info cards (upload panel, builders); default solid for data. */
  surface?: "solid" | "glass";
  children: ReactNode;
}

/**
 * A titled panel. Default: data surface, ~95% opaque, no blur behind text (index.css
 * `.surface-solid`) for tables, grids, summaries, chart plots and long lists. `surface="glass"`
 * for forms and short info cards (the surface rule in decisions.md, batch 7 phase B).
 */
export function DataPanel({ title, description, level = 2, actions, flush = false, surface = "solid", className, children, ...rest }: DataPanelProps) {
  const Tag = `h${level}` as const;
  return (
    <section className={cn(surface === "glass" ? "surface-glass" : "surface-solid", "rounded-xl text-card-foreground", className)} {...rest}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <Tag className={level === 2 ? "text-h2" : "text-h3"}>{title}</Tag>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? undefined : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}
