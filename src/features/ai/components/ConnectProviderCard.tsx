import { PlugZap } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useUiStore } from "@/store/uiStore";

/** Shown by AI features when no provider is connected. Opens AI settings; sends nothing. */
export function ConnectProviderCard({
  feature,
  className = "",
  note = "Until then nothing is sent; the offline estimate below runs in this browser.",
}: {
  feature: string;
  className?: string;
  /** The sentence after "Connect a provider to use AI for ...". */
  note?: string;
}) {
  const open = useUiStore((s) => s.setIsAiSettingsOpen);
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center ${className}`} data-testid="connect-provider-card">
      <PlugZap className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden />
      <p className="flex-1 text-sm text-foreground">
        <span className="font-semibold">Connect a provider</span> to use AI for {feature}. {note}
      </p>
      <Button type="button" size="sm" variant="default" onClick={() => open(true)} data-testid="connect-provider-open">
        Connect a provider
      </Button>
    </div>
  );
}
