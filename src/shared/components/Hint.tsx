import type { ReactElement } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { formatShortcut } from "@/shared/lib/platform";

interface HintProps {
  /** Plain-words description of what the control does. Also used as its aria-label. */
  label: string;
  /** Keyboard shortcut parts, e.g. [modKey, "K"]. Shown after the label. */
  shortcut?: string[];
  side?: "top" | "right" | "bottom" | "left";
  /** The control to describe. Must forward refs and props (Button, Radix triggers, ...). */
  children: ReactElement;
}

/**
 * Shared tooltip for icon-only controls. Every icon-only button in the app goes through
 * this component so the tooltip look can be restyled in one place.
 *
 * - Sets aria-label on the child (a child's own aria-label wins) so touch and screen-reader
 *   users, who never see the tooltip, still get the description.
 * - Radix opens the tooltip on keyboard focus as well as on hover.
 */
export function Hint({ label, shortcut, side = "top", children }: HintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild aria-label={label}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>
        <p className="text-xs">
          {label}
          {shortcut && shortcut.length > 0 && (
            <>
              {" — "}
              <kbd className="font-mono">{formatShortcut(shortcut)}</kbd>
            </>
          )}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
