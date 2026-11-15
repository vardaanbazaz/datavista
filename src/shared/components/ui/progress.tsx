import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/shared/lib/utils"

/**
 * `indeterminate`: the amount done is unknown (SheetJS reading a workbook). A short segment
 * slides across (transform only, so it stays on the compositor); with reduced motion it is a
 * still, striped full bar instead (index.css, .progress-indeterminate). Radix marks it
 * data-state="indeterminate" with no aria-valuenow.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indeterminate?: boolean }
>(({ className, value, indeterminate = false, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-muted",
      className
    )}
    value={indeterminate ? null : value}
    {...props}
  >
    {indeterminate ? (
      <ProgressPrimitive.Indicator className="progress-indeterminate h-full rounded-full bg-primary" />
    ) : (
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    )}
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
