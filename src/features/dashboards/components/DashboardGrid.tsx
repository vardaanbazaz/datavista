import React, { useMemo, useState, useEffect } from "react";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ChartVisualization } from "@/features/charts/components/ChartVisualization";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { Button } from "@/shared/components/ui/button";
import { GripVertical, X } from "lucide-react";
import { ChartConfig, DashboardLayoutItem } from "@/shared/types";
import {
  findFreeSpot,
  scaleToMd,
  scaleToSm,
  scaleToLg
} from "@/features/dashboards/layout/layoutEngine";

const ResponsiveReactGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  charts: ChartConfig[];
  activeDashboardId: string;
}

export function DashboardGrid({ charts, activeDashboardId }: DashboardGridProps) {
  const dashboards = useDashboardStore((state) => state.dashboards);
  const saveDashboard = useDashboardStore((state) => state.saveDashboard);
  
  const [currentBreakpoint, setCurrentBreakpoint] = useState("lg");

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
    return () => clearTimeout(timer);
  }, [charts.length]);

  const activeDashboard = useMemo(() => {
    return dashboards.find((d) => d.id === activeDashboardId) || null;
  }, [dashboards, activeDashboardId]);

  // Build grid layout items based on stored settings
  const layoutItems = useMemo(() => {
    if (!activeDashboard) return [];
    
    const storedLayout = activeDashboard.layout || [];
    const currentLayout: DashboardLayoutItem[] = [];

    // Filter layout items that match existing charts on this dashboard
    const validStoredLayout = storedLayout.filter((item) =>
      charts.some((c) => c.id === item.i)
    );

    // Position each chart
    charts.forEach((chart) => {
      const existing = validStoredLayout.find((item) => item.i === chart.id);
      if (existing) {
        currentLayout.push(existing);
      } else {
        const spot = findFreeSpot(currentLayout, chart.id);
        currentLayout.push(spot);
      }
    });

    return currentLayout;
  }, [activeDashboard, charts]);

  // Automatically persist new layout items when a new chart is added or when layout is initialized
  useEffect(() => {
    if (!activeDashboard || charts.length === 0) return;
    const storedLayout = activeDashboard.layout || [];
    
    const hasChanges = layoutItems.length > storedLayout.length || 
      JSON.stringify(layoutItems) !== JSON.stringify(storedLayout);

    if (hasChanges) {
      saveDashboard(activeDashboard.id, { layout: layoutItems });
    }
  }, [layoutItems, activeDashboard, saveDashboard, charts.length]);

  // Generate responsive layouts dynamically
  const layouts = useMemo(() => {
    return {
      lg: layoutItems,
      md: scaleToMd(layoutItems),
      sm: scaleToSm(layoutItems),
    };
  }, [layoutItems]);

  const handleLayoutChange = (newLayout: any[]) => {
    if (!activeDashboard) return;
    // Prevent layout corruption from mobile stack layout modifications
    if (currentBreakpoint === "sm") return;

    // Scale layout changes back to the 12-column space (lg) if modifications were made in md
    const updatedLayout = scaleToLg(
      newLayout,
      currentBreakpoint,
      activeDashboard.layout || []
    );

    // Direct comparison to check if actually modified to avoid update loops
    const hasChanged = JSON.stringify(updatedLayout) !== JSON.stringify(activeDashboard.layout);
    if (hasChanged) {
      saveDashboard(activeDashboard.id, { layout: updatedLayout });
    }
  };

  const handleRemoveChartFromDashboard = (chartId: string) => {
    if (!activeDashboard) return;
    const updatedChartIds = activeDashboard.chartIds.filter((id) => id !== chartId);
    const updatedLayout = (activeDashboard.layout || []).filter((item) => item.i !== chartId);
    saveDashboard(activeDashboard.id, {
      chartIds: updatedChartIds,
      layout: updatedLayout,
    });
  };

  if (!activeDashboard || charts.length === 0) return null;

  const isMobile = currentBreakpoint === "sm";

  return (
    <div className="w-full relative min-h-[500px]">
      <ResponsiveReactGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 0 }}
        cols={{ lg: 12, md: 6, sm: 1 }}
        rowHeight={80}
        margin={[16, 16]}
        isDraggable={!isMobile}
        isResizable={!isMobile}
        draggableHandle=".drag-handle"
        onBreakpointChange={setCurrentBreakpoint}
        onLayoutChange={handleLayoutChange}
      >
        {charts.map((chart) => (
          <div key={chart.id}>
            <Card className="h-full w-full glass border-border flex flex-col overflow-hidden shadow-sm group">
              <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between border-b flex-shrink-0 drag-handle select-none">
                <div className="flex items-center gap-2 min-w-0">
                  {!isMobile && (
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
                  )}
                  <CardTitle className="text-sm font-semibold truncate">
                    {chart.title}
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  onClick={() => handleRemoveChartFromDashboard(chart.id)}
                  title="Remove from Dashboard"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="p-4 flex-1 min-h-0 w-full relative bg-card/10">
                <ChartVisualization chart={chart} />
              </CardContent>
            </Card>
          </div>
        ))}
      </ResponsiveReactGridLayout>
    </div>
  );
}
