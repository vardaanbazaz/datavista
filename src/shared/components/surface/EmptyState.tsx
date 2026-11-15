import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface EmptyStateProps {
  title: ReactNode;
  /** Heading level of the title. */
  level?: 1 | 2 | 3;
  icon?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** Empty states: a glass card with an icon tile, a title, one line of help and the next step. */
export function EmptyState({ title, level = 2, icon, children, actions, className, ...rest }: EmptyStateProps) {
  const Tag = `h${level}` as const;
  return (
    <section className={cn("surface-glass mx-auto max-w-xl rounded-2xl px-6 py-10 text-center sm:px-10", className)} {...rest}>
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary-ink [&_svg]:h-6 [&_svg]:w-6" aria-hidden>
          {icon}
        </div>
      )}
      <Tag className="text-h1 text-foreground">{title}</Tag>
      {children && <div className="mx-auto mt-2 max-w-prose text-body text-frame-muted">{children}</div>}
      {actions && <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">{actions}</div>}
    </section>
  );
}
