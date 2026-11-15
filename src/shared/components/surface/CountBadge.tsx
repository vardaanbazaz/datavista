import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** A small count next to a section name (sidebar). `label` gives screen readers the full text. */
export function CountBadge({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border px-1.5 text-xs font-medium tabular-nums text-foreground", className)}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {children}
    </span>
  );
}
