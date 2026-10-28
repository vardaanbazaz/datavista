import { cloneElement, type MouseEvent, type ReactElement } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { formatShortcut } from "@/shared/lib/platform";
import { cn } from "@/shared/lib/utils";

interface HintProps {
  /** Plain-words description of what the control does. Also used as its aria-label. */
  label: string;
  /** Keyboard shortcut parts, e.g. [modKey, "K"]. Shown after the label. */
  shortcut?: string[];
  /** Why the control is unavailable, shown after the label while the child is disabled. */
  disabledReason?: string;
  side?: "top" | "right" | "bottom" | "left";
  /** The control to describe. Must forward refs and props (Button, Radix triggers, ...). */
  children: ReactElement<{ disabled?: boolean; className?: string }>;
}

const blockActivation = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * Shared tooltip for icon-only controls. Every icon-only button in the app goes through
 * this component so the tooltip look can be restyled in one place.
 *
 * - Sets aria-label on the child (a child's own aria-label wins) so touch and screen-reader
 *   users, who never see the tooltip, still get the description.
 * - Radix opens the tooltip on keyboard focus as well as on hover.
 * - Adds the `hit-area` class (src/index.css): an invisible 24x24px (44x44px on touch)
 *   pointer target around small controls, without changing how they look.
 * - A `disabled` child is rendered `aria-disabled` instead: a natively disabled button gets
 *   no pointer or focus events, so its tooltip could never open. Activation is blocked here.
 */
export function Hint({ label, shortcut, disabledReason, side = "top", children }: HintProps) {
  const isDisabled = Boolean(children.props.disabled);
  const text = isDisabled && disabledReason ? `${label} — ${disabledReason}` : label;

  const trigger = cloneElement(children, {
    className: cn(
      "hit-area",
      isDisabled && "opacity-50 cursor-not-allowed",
      children.props.className
    ),
    ...(isDisabled && {
      disabled: false,
      "aria-disabled": true,
      onClick: blockActivation,
    }),
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild aria-label={label}>
        {trigger}
      </TooltipTrigger>
      <TooltipContent side={side}>
        <p className="text-xs">
          {text}
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
