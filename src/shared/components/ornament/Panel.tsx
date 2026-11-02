import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Corners, type CornerPosition } from "./Ornament";
import { SectionHeading } from "./SectionHeading";

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Catalogue number shown before the label, e.g. "II". */
  numeral?: string;
  /** Small tracked-capitals label above the title, e.g. "Categories". */
  label?: string;
  title?: ReactNode;
  /** Heading level of the title. */
  level?: 2 | 3;
  /** Controls on the right of the heading row. */
  actions?: ReactNode;
  /** Corners to leave out (e.g. where a close button sits). */
  omitCorners?: CornerPosition[];
  /** Plain panel: no corners. The double rule stays (it is the frame). */
  plain?: boolean;
  children: ReactNode;
}

/**
 * A framed panel: double-rule border (outer border + inner gilt hairline) with corner
 * flourishes and an optional catalogue heading. The frame is ornamented; the content area
 * is plain card colour, so tables, charts and numbers inside stay clean.
 */
export function Panel({
  numeral,
  label,
  title,
  level = 2,
  actions,
  omitCorners,
  plain = false,
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <section className={cn("frame-double rounded-md bg-card text-card-foreground", className)} {...rest}>
      {!plain && <Corners omit={omitCorners} />}
      <div className="relative px-6 py-5 sm:px-8 sm:py-6">
        {(title || label) && (
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <SectionHeading numeral={numeral} label={label} title={title} level={level} />
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
