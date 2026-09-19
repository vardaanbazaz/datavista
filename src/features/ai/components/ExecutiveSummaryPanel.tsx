import { useEffect } from "react";
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
      <Card className="bg-white dark:bg-zinc-900 border border-destructive/20 shadow-none">
        <CardContent className="p-4 sm:p-5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
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
  } = useDashboardStore();

  const { llmApiKey, llmProvider, hasAcknowledgedAiInsights, setHasAcknowledgedAiInsights } = useUiStore();

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
        <Card className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-none overflow-hidden relative transition-colors">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800 shrink-0 text-zinc-700 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700/50">
                  <Sparkles className={`h-5 w-5 ${isGeneratingSummary ? "animate-spin" : "animate-pulse"}`} />
                </div>

                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap bg-transparent">
                    <h3 className="text-sm font-bold uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-zinc-800 to-zinc-500 dark:from-white dark:to-zinc-400">
                      Automated Analyst Insights
                    </h3>
                    {executiveSummarySource === "ai" && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-2 py-0 gap-1 font-semibold border-primary/30 text-primary bg-primary/5"
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
                            className="text-[10px] px-2 py-0 gap-1 font-semibold border-zinc-400/40 text-zinc-600 dark:text-zinc-300 bg-zinc-500/5"
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
                      <Badge variant="destructive" className="text-[10px] px-2 py-0 gap-1 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {detectedAnomalies.length} {detectedAnomalies.length === 1 ? "Outlier" : "Outliers"} Detected
                      </Badge>
                    )}
                  </div>

                  {showConfirmationPrompt ? (
                    <div className="space-y-2.5">
                      <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
                        Generate an AI summary of this dashboard? DataVista will send a snapshot of your
                        dataset — column names, row/chart counts, active filters, and detected outliers — to{" "}
                        {providerDisplayName(llmProvider)} using your configured API key.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleGenerateAiInsights}
                        className="h-8 px-3 text-xs gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Generate AI Insights
                      </Button>
                    </div>
                  ) : isGeneratingSummary ? (
                    <div className="space-y-2 py-1">
                      <div className="h-3.5 bg-gray-200 dark:bg-zinc-800 rounded-md animate-pulse w-11/12" />
                      <div className="h-3.5 bg-gray-200 dark:bg-zinc-800 rounded-md animate-pulse w-4/5" />
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
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
                          className={`text-[10px] py-0.5 px-2 gap-1 ${
                            anomaly.type === "spike"
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                              : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30"
                          }`}
                          title={anomaly.description}
                        >
                          {anomaly.type === "spike" ? (
                            <TrendingUp className="h-3 w-3 text-amber-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-indigo-500" />
                          )}
                          <span>
                            {anomaly.columnName} ({anomaly.dimensionKey}): {anomaly.value.toLocaleString()}
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
                        className="h-8 px-2.5 text-xs gap-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
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

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={dismissExecutiveSummary}
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  title="Dismiss Insight"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
