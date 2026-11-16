import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Calm placeholder while a view's content loads: nothing for the first `delay` ms (most loads
 * finish before then, so a fast load never flashes anything), then still grey blocks in the
 * shape of a header strip and a panel. No spinner, no pulse. The label is read by screen
 * readers (role="status").
 */
export function ViewSkeleton({ label, delay = 300, className }: { label: string; delay?: number; className?: string }) {
  const [shown, setShown] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const t = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  if (!shown) return null;
  return (
    <div role="status" aria-live="polite" data-testid="view-skeleton" className={cn("animate-view-in space-y-4", className)}>
      <span className="sr-only">{label}</span>
      <div className="flex gap-3" aria-hidden>
        <div className="h-9 w-40 rounded-lg bg-muted" />
        <div className="h-9 w-28 rounded-lg bg-muted" />
        <div className="h-9 w-32 rounded-lg bg-muted" />
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-card p-5" aria-hidden>
        <div className="h-4 w-1/3 rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-4 w-1/2 rounded bg-muted" />
        <div className="h-40 rounded-lg bg-muted/70" />
      </div>
    </div>
  );
}
