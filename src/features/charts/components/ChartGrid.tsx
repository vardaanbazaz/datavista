import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { useDatasetStore } from "@/store/datasetStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { ChartVisualization } from "./ChartVisualization";
import { Button } from "@/shared/components/ui/button";
import { Hint } from "@/shared/components/Hint";
import { X, Check, Plus } from "lucide-react";
import { ChartExpandButton } from "./ChartExpandButton";

export function ChartGrid() {
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const allCharts = useChartStore((state) => state.charts);
  const onChartDelete = useChartStore((state) => state.deleteChart);

  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId);
  const dashboards = useDashboardStore((state) => state.dashboards);
  const saveDashboard = useDashboardStore((state) => state.saveDashboard);

  const activeDashboard = useMemo(() => {
    return dashboards.find(d => d.id === activeDashboardId) || null;
  }, [dashboards, activeDashboardId]);

  const charts = useMemo(() => {
    if (!activeDataset) return [];
    return allCharts.filter((c) => c.datasetId === activeDataset.id);
  }, [allCharts, activeDataset]);

  const toggleChartInDashboard = (chartId: string) => {
    if (!activeDashboard) return;
    const isIncluded = activeDashboard.chartIds.includes(chartId);
    const updatedChartIds = isIncluded
      ? activeDashboard.chartIds.filter(id => id !== chartId)
      : [...activeDashboard.chartIds, chartId];
    
    saveDashboard(activeDashboard.id, { chartIds: updatedChartIds });
  };

  if (charts.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12 text-muted-foreground"
      >
        <p>No charts created yet. Use the chart builder above to get started.</p>
      </motion.div>
    );
  }

  return (
    // One chart per row up to very wide screens: charts use the available width instead of
    // being squeezed into a 3-column grid.
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
      <AnimatePresence mode="popLayout">
        {charts.map((chart, index) => (
          <motion.div
            key={chart.id}
            layout
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              transition: {
                delay: index * 0.1,
                duration: 0.4,
                ease: "easeOut"
              }
            }}
            exit={{ 
              opacity: 0, 
              scale: 0.8, 
              y: -20,
              transition: { duration: 0.2 }
            }}
            className="relative group"
            data-testid="chart-card"
          >
            <div className="glass border border-border rounded-lg p-4 transition-shadow hover:shadow-elegant">
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {activeDashboard && (
                    <Hint
                      label={activeDashboard.chartIds.includes(chart.id)
                        ? `Remove from dashboard “${activeDashboard.name}”`
                        : `Add to dashboard “${activeDashboard.name}”`}
                    >
                      <Button
                        variant={activeDashboard.chartIds.includes(chart.id) ? "default" : "outline"}
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => toggleChartInDashboard(chart.id)}
                      >
                        {activeDashboard.chartIds.includes(chart.id) ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </Hint>
                  )}
                  <h3 className="font-semibold text-card-foreground truncate">
                    {chart.title}
                  </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <ChartExpandButton chart={chart} />
                  <Hint label="Delete this chart">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (activeDashboard) {
                          const updatedChartIds = activeDashboard.chartIds.filter(id => id !== chart.id);
                          saveDashboard(activeDashboard.id, { chartIds: updatedChartIds });
                        }
                        onChartDelete(chart.id);
                      }}
                      className="h-8 w-8 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </Hint>
                </div>
              </div>
              
              <div
                className="h-[clamp(360px,60vh,600px)] w-full min-w-0 min-h-0 relative overflow-hidden flex flex-col justify-between"
                data-testid="chart-card-body"
              >
                <ChartVisualization chart={chart} fitHeight />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}