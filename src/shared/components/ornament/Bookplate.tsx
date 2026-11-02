import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Corners } from "./Ornament";
import { Rule } from "./Rule";

interface BookplateProps {
  /** Small line above the title, ex-libris style, e.g. "Ex libris · DataVista". */
  inscription?: string;
  title: ReactNode;
  /** Heading level of the title. */
  level?: 1 | 2 | 3;
  emblem?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Empty states and the upload screen: an ex-libris bookplate. Double-ruled plate with an
 * arched inner frame, corner flourishes, an emblem in a ring, the title in the display serif
 * and a fleuron rule before the actions.
 */
export function Bookplate({ inscription, title, level = 2, emblem, children, actions, className, ...rest }: BookplateProps) {
  const Tag = `h${level}` as const;
  return (
    <section className={cn("frame-double mx-auto max-w-2xl rounded-md bg-card px-6 py-10 text-center sm:px-12", className)} {...rest}>
      <Corners />
      {/* Arched inner frame, like the cartouche on a printed bookplate. */}
      <svg
        className="ornament absolute inset-x-4 top-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
        focusable="false"
      >
        <path
          d="M2 98V18C2 8 14 2 50 2S98 8 98 18V98Z"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative">
        {inscription && <p className="catalogue-label text-muted-foreground">{inscription}</p>}
        {emblem && (
          <div className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full border border-ornament/60 text-ornament ring-1 ring-ornament/30 ring-offset-4 ring-offset-card [&_svg]:h-7 [&_svg]:w-7">
            {emblem}
          </div>
        )}
        <Tag className="mt-5 font-display text-display text-foreground">{title}</Tag>
        {children && <div className="mx-auto mt-3 max-w-prose text-body text-muted-foreground">{children}</div>}
        {actions && (
          <>
            <Rule fleuron className="mx-auto my-6 max-w-xs" />
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">{actions}</div>
          </>
        )}
      </div>
    </section>
  );
}
