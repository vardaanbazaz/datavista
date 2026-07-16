import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { ChartConfig } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { ChartVisualization } from "./ChartVisualization";
import { Button } from "@/shared/components/ui/button";
import { X, Check, Plus } from "lucide-react";

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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
            whileHover={{ 
              scale: 1.02,
              transition: { duration: 0.2 }
            }}
            className="relative group"
          >
            <div className="glass border border-border rounded-lg p-4 transition-shadow hover:shadow-elegant">
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {activeDashboard && (
                    <Button
                      variant={activeDashboard.chartIds.includes(chart.id) ? "default" : "outline"}
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => toggleChartInDashboard(chart.id)}
                      title={activeDashboard.chartIds.includes(chart.id) ? "Remove from Dashboard" : "Add to Dashboard"}
                    >
                      {activeDashboard.chartIds.includes(chart.id) ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <h3 className="font-semibold text-card-foreground truncate">
                    {chart.title}
                  </h3>
                </div>
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
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="h-64 w-full">
                <ChartVisualization chart={chart} />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}