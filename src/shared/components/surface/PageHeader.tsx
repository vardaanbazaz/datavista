import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Heading level (the app's h1 is the brand in the sidebar). */
  level?: 1 | 2;
  /** Buttons for the view. They sit on a glass toolbar: controls never sit straight on the ribbon. */
  actions?: ReactNode;
  className?: string;
  id?: string;
  /** The product tour's anchor for this view (data-tour="view-<tourId>", OnboardingTour.tsx). */
  tourId?: string;
}

/** A view's title over the aurora ribbon: foreground / frame-muted text, actions on glass. */
export function PageHeader({ title, description, icon, level = 2, actions, className, id, tourId }: PageHeaderProps) {
  const Tag = `h${level}` as const;
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)} data-tour={tourId ? `view-${tourId}` : undefined}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="surface-glass hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary-ink sm:flex [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <Tag id={id} className="text-h1 text-foreground">
            {title}
          </Tag>
          {description && <div className="mt-0.5 text-body text-frame-muted">{description}</div>}
        </div>
      </div>
      {actions && <div className="surface-glass flex flex-wrap items-center gap-1.5 rounded-xl p-1.5">{actions}</div>}
    </header>
  );
}
