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
