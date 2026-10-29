import { motion } from "framer-motion";
import { cn } from "@/shared/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

export function LoadingSpinner({ size = "md", className, text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <motion.div
        className={cn(
          "border-2 border-primary/20 border-t-primary rounded-full",
          sizeClasses[size]
        )}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: "linear"
        }}
      />
      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-muted-foreground"
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

/**
 * Text-first progress: what is loading, and how far along when the total is known. Used for
 * startup and for a dataset whose rows are read from disk when selected.
 */
export function LoadingProgress({ title, step, loaded, total }: { title: string; step: string; loaded?: number; total?: number }) {
  const known = loaded !== undefined && total !== undefined && total > 0;
  const percent = known ? Math.min(100, Math.round((loaded! / total!) * 100)) : null;
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-3" role="status" aria-live="polite" data-testid="loading-progress">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{step}</p>
      {known && (
        <>
          <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {loaded!.toLocaleString()} of {total!.toLocaleString()} rows ({percent}%)
          </p>
        </>
      )}
    </div>
  );
}

export function LoadingState({ title, description }: { title: string; description?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 space-y-4"
    >
      <LoadingSpinner size="lg" />
      <div className="text-center">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
    </motion.div>
  );
}