import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface SectionHeadingProps {
  numeral?: string;
  label?: string;
  title?: ReactNode;
  level?: 1 | 2 | 3;
  className?: string;
  id?: string;
}

/**
 * Catalogue-style heading: "II · CATEGORIES" in tracked capitals over a display-serif title.
 * The numeral and label are part of the heading's text for screen readers only when there
 * is no title (otherwise they are a visual catalogue mark and hidden from the outline).
 */
export function SectionHeading({ numeral, label, title, level = 2, className, id }: SectionHeadingProps) {
  const Tag = `h${level}` as const;
  const size = level === 1 ? "text-h1" : level === 2 ? "text-h2" : "text-h3";
  const mark = (numeral || label) && (
    <p className="catalogue-label text-muted-foreground" aria-hidden={title ? true : undefined}>
      {numeral && <span className="text-tertiary">{numeral}</span>}
      {numeral && label && <span className="mx-1.5 text-tertiary">·</span>}
      {label}
    </p>
  );
  return (
    <div className={cn("min-w-0", className)}>
      {mark}
      {title && (
        <Tag id={id} className={cn("font-display text-foreground", size, mark && "mt-0.5")}>
          {title}
        </Tag>
      )}
    </div>
  );
}
