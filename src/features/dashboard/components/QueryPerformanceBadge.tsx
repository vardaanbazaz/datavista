import React from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Zap, Clock } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface QueryPerformanceBadgeProps {
  executionTimeMs: number;
  cacheHit: boolean;
  optimizerTimeSavedMs?: number;
  className?: string;
}

export const QueryPerformanceBadge: React.FC<QueryPerformanceBadgeProps> = ({
  executionTimeMs,
  cacheHit,
  optimizerTimeSavedMs,
  className
}) => {
  return (
    <div className={cn("inline-flex items-center gap-1.5 select-none animate-fade-in", className)}>
      {cacheHit ? (
        <Badge
          variant="outline"
          className="bg-card text-foreground border-success/60 text-xs font-semibold px-2 py-0.5 h-6 flex items-center gap-1"
        >
          <Zap className="w-3 h-3 text-success" aria-hidden />
          <span>Cache Hit</span>
          {optimizerTimeSavedMs && optimizerTimeSavedMs > 0 ? (
            <span className="text-xs text-muted-foreground font-normal">
              (saved {optimizerTimeSavedMs.toFixed(1)}ms)
            </span>
          ) : (
            <span className="text-xs text-muted-foreground font-normal">(&lt; 1ms)</span>
          )}
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="bg-muted/40 text-muted-foreground border-border text-xs font-medium px-2 py-0.5 h-6 flex items-center gap-1"
        >
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span>Query: {executionTimeMs.toFixed(1)}ms</span>
        </Badge>
      )}
    </div>
  );
};
export default QueryPerformanceBadge;
