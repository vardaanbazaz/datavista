import { cn } from "@/shared/lib/utils";
import { Fleuron } from "./Ornament";

interface RuleProps {
  /** A fleuron at the centre (section breaks); plain engraved double hairline otherwise. */
  fleuron?: boolean;
  className?: string;
}

/**
 * Engraved divider: a thick-thin double hairline, with an optional fleuron. With "Simple
 * frames" it falls back to one plain border line (the ornament parts are hidden).
 */
export function Rule({ fleuron = false, className }: RuleProps) {
  return (
    <div role="separator" className={cn("flex items-center gap-3", className)}>
      <span className="h-[3px] flex-1 border-y border-border" />
      {fleuron && <Fleuron />}
      {fleuron && <span className="h-[3px] flex-1 border-y border-border" />}
    </div>
  );
}
