import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface SealProps {
  children: ReactNode;
  /** Accessible text when the content alone is not enough, e.g. "3 datasets". */
  label?: string;
  className?: string;
}

/**
 * Seal badge for counts in the frame (sidebar section counts): a round wax-seal disc with
 * an inner ring. Not for data values in tables or charts.
 */
export function Seal({ children, label, className }: SealProps) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-xs font-semibold text-primary-foreground",
        "after:pointer-events-none after:absolute after:inset-[2px] after:rounded-full after:border after:border-primary-foreground/35",
        className
      )}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      {children}
    </span>
  );
}
