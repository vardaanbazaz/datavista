import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { Sparkles, RefreshCw, X, AlertTriangle, TrendingUp, TrendingDown, Cpu } from "lucide-react";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useUiStore } from "@/store/uiStore";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { providerDisplayName } from "@/features/ai/providerDisplayName";
import { anomalyLabel } from "@/features/ai/anomalyDetector";
import { Hint } from "@/shared/components/Hint";

/**
 * Public entry point: wrapped in its own local error boundary so a rendering failure
 * inside the panel (e.g. an unvalidated LLM field) can't bubble up past it and blank the
 * rest of the dashboard.
 */
export function ExecutiveSummaryPanel() {
  return (
    <ErrorBoundary fallback={<ExecutiveSummaryPanelError />}>
      <ExecutiveSummaryPanelInner />
    </ErrorBoundary>
  );
}

function ExecutiveSummaryPanelError() {
  return (
    <div className="w-full my-4">
      <Card className="bg-card border border-destructive/40 shadow-none">
        <CardContent className="p-4 sm:p-5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" aria-hidden />
          <p className="text-xs sm:text-sm text-muted-foreground">
            Automated Analyst Insights couldn't be displayed. The rest of your dashboard is unaffected.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutiveSummaryPanelInner() {
  const activeDataset = useDatasetStore((state) => state.activeDataset);

  const {
    executiveSummary,
    isGeneratingSummary,
    executiveSummaryDismissed,
    executiveSummarySource,
    detectedAnomalies,
    generateExecutiveSummary,
    dismissExecutiveSummary,
  } = useDashboardStore(
    useShallow((state) => ({
      executiveSummary: state.executiveSummary,
      isGeneratingSummary: state.isGeneratingSummary,
      executiveSummaryDismissed: state.executiveSummaryDismissed,
      executiveSummarySource: state.executiveSummarySource,
      detectedAnomalies: state.detectedAnomalies,
      generateExecutiveSummary: state.generateExecutiveSummary,
      dismissExecutiveSummary: state.dismissExecutiveSummary,
    }))
  );

  const { llmApiKey, llmProvider, hasAcknowledgedAiInsights, setHasAcknowledgedAiInsights } = useUiStore(
    useShallow((state) => ({
      llmApiKey: state.llmApiKey,
      llmProvider: state.llmProvider,
      hasAcknowledgedAiInsights: state.hasAcknowledgedAiInsights,
      setHasAcknowledgedAiInsights: state.setHasAcknowledgedAiInsights,
    }))
  );

  // A key is configured, so generating would actually send dataset content to the
  // provider — require one explicit click before that ever happens automatically.
  const needsAiConfirmation = !!llmApiKey && llmApiKey.trim() !== "" && !hasAcknowledgedAiInsights;

  // Auto-generate on initial load, but only when no confirmation is pending: either no
  // API key is configured (offline heuristic, nothing leaves the browser) or the user has
  // already acknowledged AI generation once before (persists independently of the
  // per-dataset reset below, so it isn't re-asked on every dataset switch/reload).
  useEffect(() => {
    if (
      activeDataset &&
      !executiveSummary &&
      !isGeneratingSummary &&
      !executiveSummaryDismissed &&
      !needsAiConfirmation
    ) {
      generateExecutiveSummary();
    }
  }, [
    activeDataset,
    executiveSummary,
    isGeneratingSummary,
    executiveSummaryDismissed,
    needsAiConfirmation,
    generateExecutiveSummary,
  ]);

  const handleGenerateAiInsights = () => {
    setHasAcknowledgedAiInsights(true);
    generateExecutiveSummary();
  };

  if (executiveSummaryDismissed || !activeDataset) {
    return null;
  }

  const showConfirmationPrompt = needsAiConfirmation && !executiveSummary && !isGeneratingSummary;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="w-full my-4"
      >
        <Card className="frame-double rounded-md bg-card shadow-none overflow-hidden transition-colors">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2.5 rounded-full shrink-0 text-tertiary border border-ornament/60">
                  <Sparkles className={`h-5 w-5 ${isGeneratingSummary ? "animate-spin" : "animate-pulse"}`} />
                </div>

                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap bg-transparent">
                    <h3 className="catalogue-label text-foreground">
                      Automated Analyst Insights
                    </h3>
                    {executiveSummarySource === "ai" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-xs px-2 py-0 gap-1 font-semibold border-tertiary/50 text-tertiary bg-tertiary/5"
                          >
                            <Sparkles className="h-3 w-3" />
                            AI Generated
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            This summary was generated by {providerDisplayName(llmProvider)} using data from your
                            dataset.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {executiveSummarySource === "offline" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-xs px-2 py-0 gap-1 font-semibold border-border text-muted-foreground"
                          >
                            <Cpu className="h-3 w-3" />
                            Offline Estimate
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            This summary was generated locally using built-in heuristics — no dataset content was
                            sent to an AI provider.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {detectedAnomalies.length > 0 && (
                      <Badge variant="outline" className="text-xs px-2 py-0 gap-1 font-semibold border-tertiary/60 bg-card text-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-tertiary" aria-hidden />
                        {detectedAnomalies.length} {detectedAnomalies.length === 1 ? "unusual value" : "unusual values"}
                      </Badge>
                    )}
                  </div>

                  {showConfirmationPrompt ? (
                    <div className="space-y-2.5">
                      <p className="text-body text-foreground leading-relaxed">
                        Generate an AI summary of this dashboard? DataVista will send a snapshot of your
                        dataset — column names, row/chart counts, active filters, and detected outliers — to{" "}
                        {providerDisplayName(llmProvider)} using your configured API key.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleGenerateAiInsights}
                        className="h-9 px-3 text-sm gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Generate AI Insights
                      </Button>
                    </div>
                  ) : isGeneratingSummary ? (
                    <div className="space-y-2 py-1">
                      <div className="h-3.5 bg-muted rounded-md animate-pulse w-11/12" />
                      <div className="h-3.5 bg-muted rounded-md animate-pulse w-4/5" />
                    </div>
                  ) : (
                    <p className="text-body text-foreground leading-relaxed">
                      {executiveSummary || "Analyzing dataset trends and scanning widgets for statistical outliers..."}
                    </p>
                  )}

                  {/* Anomaly Chip Badges */}
                  {!isGeneratingSummary && detectedAnomalies.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {detectedAnomalies.slice(0, 4).map((anomaly) => (
                        <Badge
                          key={anomaly.id}
                          variant="outline"
                          className="text-xs py-0.5 px-2 gap-1 font-medium border-border text-foreground"
                          title={anomaly.description}
                        >
                          {anomaly.type === "spike" ? (
                            <TrendingUp className="h-3.5 w-3.5 text-tertiary" aria-hidden />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5 text-tertiary" aria-hidden />
                          )}
                          <span>
                            {anomalyLabel(anomaly)}: {anomaly.value.toLocaleString()}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                {!showConfirmationPrompt && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateExecutiveSummary()}
                        disabled={isGeneratingSummary}
                        className="h-9 px-3 text-sm gap-1.5 text-foreground hover:bg-accent"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingSummary ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Re-run statistical anomaly detection & AI summary</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <Hint label="Dismiss this AI summary">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={dismissExecutiveSummary}
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </Hint>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
