import { useEffect } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Sparkles, RefreshCw, X, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useDatasetStore } from "@/store/datasetStore";
import { motion, AnimatePresence } from "framer-motion";

export function ExecutiveSummaryPanel() {
  const activeDataset = useDatasetStore((state) => state.activeDataset);

  const {
    executiveSummary,
    isGeneratingSummary,
    executiveSummaryDismissed,
    detectedAnomalies,
    generateExecutiveSummary,
    dismissExecutiveSummary,
  } = useDashboardStore();

  // Auto-generate summary on initial load if no summary exists yet
  useEffect(() => {
    if (activeDataset && !executiveSummary && !isGeneratingSummary && !executiveSummaryDismissed) {
      generateExecutiveSummary();
    }
  }, [activeDataset, executiveSummary, isGeneratingSummary, executiveSummaryDismissed, generateExecutiveSummary]);

  if (executiveSummaryDismissed || !activeDataset) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="w-full my-4"
      >
        <Card className="glass border-primary/30 bg-gradient-to-r from-primary/10 via-background/60 to-secondary/10 shadow-xl overflow-hidden relative">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="p-2.5 rounded-xl bg-primary/20 shrink-0 text-primary border border-primary/30 shadow-inner">
                  <Sparkles className={`h-5 w-5 ${isGeneratingSummary ? "animate-spin" : "animate-pulse"}`} />
                </div>

                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold gradient-primary bg-clip-text text-transparent uppercase tracking-wider">
                      Automated Analyst Insights
                    </h3>
                    {detectedAnomalies.length > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-2 py-0 gap-1 font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {detectedAnomalies.length} {detectedAnomalies.length === 1 ? "Outlier" : "Outliers"} Detected
                      </Badge>
                    )}
                  </div>

                  {isGeneratingSummary ? (
                    <div className="space-y-2 py-1">
                      <div className="h-3.5 bg-primary/20 rounded-md animate-pulse w-11/12" />
                      <div className="h-3.5 bg-primary/15 rounded-md animate-pulse w-4/5" />
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm text-foreground/90 font-medium leading-relaxed">
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
                          className={`text-[10px] py-0.5 px-2 gap-1 border-opacity-40 ${
                            anomaly.type === "spike"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500"
                              : "bg-blue-500/10 text-blue-600 border-blue-500"
                          }`}
                          title={anomaly.description}
                        >
                          {anomaly.type === "spike" ? (
                            <TrendingUp className="h-3 w-3 text-amber-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-blue-500" />
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateExecutiveSummary()}
                  disabled={isGeneratingSummary}
                  className="h-8 px-2.5 text-xs gap-1.5 text-primary hover:bg-primary/10"
                  title="Re-run statistical anomaly detection & AI summary"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingSummary ? "animate-spin" : ""}`} />
                  Refresh
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={dismissExecutiveSummary}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
