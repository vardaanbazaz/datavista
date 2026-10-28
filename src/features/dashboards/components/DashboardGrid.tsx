import React, { useMemo, useState, useEffect } from "react";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ChartVisualization } from "@/features/charts/components/ChartVisualization";
import { ChartExpandButton } from "@/features/charts/components/ChartExpandButton";
import { Hint } from "@/shared/components/Hint";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { Button } from "@/shared/components/ui/button";
import { GripVertical, X } from "lucide-react";
import { ChartConfig, DashboardLayoutItem } from "@/shared/types";
import { KPICard } from "@/features/kpi/components/KPICard";
import { KPICardConfig } from "@/features/kpi/types";
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
  onEditKpi?: (kpi: KPICardConfig) => void;
}

export function DashboardGrid({ charts, activeDashboardId, onEditKpi }: DashboardGridProps) {
  const dashboards = useDashboardStore((state) => state.dashboards);
  const saveDashboard = useDashboardStore((state) => state.saveDashboard);
  const deleteKpiCard = useDashboardStore((state) => state.deleteKpiCard);
  
  const [currentBreakpoint, setCurrentBreakpoint] = useState("lg");

  const activeDashboard = useMemo(() => {
    return dashboards.find((d) => d.id === activeDashboardId) || null;
  }, [dashboards, activeDashboardId]);

  // Combine charts and KPI cards in a single widgets list
  // Put KPI cards first so they naturally stack at the top of the dashboard on layout initialization
  const widgets = useMemo(() => {
    const chartWidgets = charts.map((c) => ({
      id: c.id,
      type: "chart" as const,
      title: c.title,
      data: c,
    }));
    const kpiWidgets = (activeDashboard?.kpis || []).map((k) => ({
      id: k.id,
      type: "kpi-card" as const,
      title: k.title,
      data: k,
    }));
    return [...kpiWidgets, ...chartWidgets];
  }, [charts, activeDashboard]);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
    return () => clearTimeout(timer);
  }, [widgets.length]);

  // Build grid layout items based on stored settings
  const layoutItems = useMemo(() => {
    if (!activeDashboard) return [];
    
    const storedLayout = activeDashboard.layout || [];
    const currentLayout: DashboardLayoutItem[] = [];

    // Filter layout items that match existing widgets on this dashboard
    const validStoredLayout = storedLayout.filter((item) =>
      widgets.some((w) => w.id === item.i)
    );

    // Position each widget
    widgets.forEach((widget) => {
      const existing = validStoredLayout.find((item) => item.i === widget.id);
      if (existing) {
        currentLayout.push(existing);
      } else {
        const defaultW = widget.type === "kpi-card" ? 3 : 4;
        const defaultH = widget.type === "kpi-card" ? 2 : 4;
        const spot = findFreeSpot(currentLayout, widget.id, defaultW, defaultH);
        currentLayout.push(spot);
      }
    });

    return currentLayout;
  }, [activeDashboard, widgets]);

  // Automatically persist new layout items when a new widget is added or when layout is initialized
  useEffect(() => {
    if (!activeDashboard || widgets.length === 0) return;
    const storedLayout = activeDashboard.layout || [];
    
    const hasChanges = layoutItems.length > storedLayout.length || 
      JSON.stringify(layoutItems) !== JSON.stringify(storedLayout);

    if (hasChanges) {
      saveDashboard(activeDashboard.id, { layout: layoutItems });
    }
  }, [layoutItems, activeDashboard, saveDashboard, widgets.length]);

  // Generate responsive layouts dynamically
  const layouts = useMemo(() => {
    return {
      lg: layoutItems,
      md: scaleToMd(layoutItems),
      sm: scaleToSm(layoutItems),
    };
  }, [layoutItems]);

  const handleLayoutChange = (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
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

  if (!activeDashboard || widgets.length === 0) return null;

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
        {widgets.map((widget) => (
          <div key={widget.id}>
            {widget.type === "chart" ? (
              <Card className="h-full w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 flex flex-col overflow-hidden shadow-none group transition-colors">
                <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between border-b flex-shrink-0 drag-handle select-none">
                  <div className="flex items-center gap-2 min-w-0">
                    {!isMobile && (
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
                    )}
                    <CardTitle className="text-sm font-semibold truncate">
                      {widget.title}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1 [@media(pointer:coarse)]:gap-3 shrink-0">
                    <ChartExpandButton chart={widget.data} className="h-6" />
                    <Hint label="Remove this chart from the dashboard">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        onClick={() => handleRemoveChartFromDashboard(widget.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </Hint>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 flex-1 min-w-0 min-h-0 w-full relative overflow-hidden flex flex-col justify-between">
                  <ChartVisualization chart={widget.data} />
                </CardContent>
              </Card>
            ) : (
              <KPICard
                config={widget.data}
                onRemove={() => deleteKpiCard(activeDashboard.id, widget.id)}
                onEdit={() => onEditKpi?.(widget.data)}
                isMobile={isMobile}
              />
            )}
          </div>
        ))}
      </ResponsiveReactGridLayout>
    </div>
  );
}
