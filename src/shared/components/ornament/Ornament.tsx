import type { SVGProps } from "react";
import { cn } from "@/shared/lib/utils";

/*
 * Ornament primitives: inline SVG in currentColor (the --ornament token via the
 * `ornament` class), aria-hidden, unfocusable, no pointer events. They decorate the frame
 * (panel corners, headings, dividers, empty states), never the data. "Simple frames"
 * in Reading comfort hides every one of them with one CSS rule (src/index.css).
 */

type SvgProps = Omit<SVGProps<SVGSVGElement>, "children">;

const svgBase = (className?: string) => cn("ornament shrink-0", className);
const hidden = { "aria-hidden": true, focusable: "false" } as const;

export type CornerPosition = "tl" | "tr" | "bl" | "br";

const cornerPlacement: Record<CornerPosition, string> = {
  tl: "top-1.5 left-1.5",
  tr: "top-1.5 right-1.5 -scale-x-100",
  bl: "bottom-1.5 left-1.5 -scale-y-100",
  br: "bottom-1.5 right-1.5 -scale-x-100 -scale-y-100",
};

/** Corner flourish: a bracket with a rounded moulding, an inner hairline and a small scroll. */
export function Corner({ position = "tl", className, ...props }: SvgProps & { position?: CornerPosition }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={svgBase(cn("absolute", cornerPlacement[position], className))}
      data-ornament="corner"
      {...hidden}
      {...props}
    >
      <path d="M1.5 23V8.5C1.5 4.6 4.6 1.5 8.5 1.5H23" strokeWidth="1.25" />
      <path d="M5 23V11C5 7.7 7.7 5 11 5H23" strokeWidth="0.75" opacity="0.6" />
      <path d="M9 15.5C9 11.9 11.9 9 15.5 9" strokeWidth="0.9" />
      <path d="M15.5 9c1.4 0 2.2 1.1 1.6 2.1-.5.8-1.7.7-1.9-.2" strokeWidth="0.9" />
      <path d="M9 15.5c0 1.4 1.1 2.2 2.1 1.6.8-.5.7-1.7-.2-1.9" strokeWidth="0.9" />
      <circle cx="8.3" cy="8.3" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Four corners for a `relative` frame. Pass `omit` for a corner something else occupies. */
export function Corners({ omit = [] }: { omit?: CornerPosition[] }) {
  return (
    <>
      {(["tl", "tr", "bl", "br"] as const)
        .filter((p) => !omit.includes(p))
        .map((p) => (
          <Corner key={p} position={p} />
        ))}
    </>
  );
}

/** Fleuron: a lozenge flower between two scrolls, for the centre of a rule. */
export function Fleuron({ className, ...props }: SvgProps) {
  return (
    <svg
      viewBox="0 0 32 12"
      width="32"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={svgBase(className)}
      data-ornament="fleuron"
      {...hidden}
      {...props}
    >
      <path d="M16 1.5 18.8 6 16 10.5 13.2 6z" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="16" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <path d="M11.5 6C9.6 3.4 6.6 3 4.6 4.7c-1.3 1.1-.6 3 .9 2.8 1-.1 1.3-1.3.6-1.9" strokeWidth="0.9" />
      <path d="M20.5 6c1.9 2.6 4.9 3 6.9 1.3 1.3-1.1.6-3-.9-2.8-1 .1-1.3 1.3-.6 1.9" strokeWidth="0.9" />
      <circle cx="1.6" cy="6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="30.4" cy="6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

