import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import { Dataset, DataRow, ChartConfig } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { ChartVisualization } from "@/features/charts/components/ChartVisualization";
import { DashboardGrid } from "@/features/dashboards/components/DashboardGrid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { BarChart3, Database, Filter, PieChart, TrendingUp, Users, LayoutDashboard, Calendar, AlertCircle, Plus, LayoutTemplate, RotateCcw, RotateCw, Camera } from "lucide-react";
import { GlobalFilterBar } from "@/features/dashboards/components/GlobalFilterBar";
import { ExecutiveSummaryPanel } from "@/features/ai/components/ExecutiveSummaryPanel";
import { DrillThroughModal } from "@/features/dashboards/components/DrillThroughModal";
import { motion } from "framer-motion";
import { KPIBuilder } from "@/features/kpi/components/KPIBuilder";
import { KPICardConfig } from "@/features/kpi/types";
import { CreateTemplateModal } from "@/features/dashboards/components/CreateTemplateModal";
import { SnapshotManager } from "@/features/dashboards/components/SnapshotManager";
import { useTemplateStore } from "@/features/dashboards/store/templateStore";
import { templateEngine } from "@/features/dashboards/services/templateEngine";
import { getEffectiveColumnType, getEffectiveColumnTypes } from "@/shared/utils/columnType";
import { useUiStore } from "@/store/uiStore";

export function DashboardSummary() {
  const dataset = useDatasetStore((state) => state.activeDataset);
  const filteredData = useFilterStore((state) => state.filteredData);
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const allCharts = useChartStore((state) => state.charts);

  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId);
  const dashboards = useDashboardStore((state) => state.dashboards);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);
  const addKpiCard = useDashboardStore((state) => state.addKpiCard);
  const updateKpiCard = useDashboardStore((state) => state.updateKpiCard);

  const undo = useDashboardStore((state) => state.undo);
  const redo = useDashboardStore((state) => state.redo);
  const past = useDashboardStore((state) => state.past);
  const future = useDashboardStore((state) => state.future);

  const addTemplate = useTemplateStore((state) => state.addTemplate);

  const [isKpiBuilderOpen, setIsKpiBuilderOpen] = useState(false);
  const [editKpi, setEditKpi] = useState<KPICardConfig | null>(null);
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const isSnapshotManagerOpen = useUiStore((state) => state.isSnapshotManagerOpen);
  const setIsSnapshotManagerOpen = useUiStore((state) => state.setIsSnapshotManagerOpen);


  const activeDashboard = useMemo(() => {
    return dashboards.find(d => d.id === activeDashboardId) || null;
  }, [dashboards, activeDashboardId]);

  const handleSaveTemplate = (name: string, description: string) => {
    if (!activeDashboard || !dataset) return;
    const template = templateEngine.extractTemplate(
      activeDashboard,
      name,
      description,
      dataset,
      allCharts
    );
    addTemplate(template);
  };

  const charts = useMemo(() => {
    if (!dataset) return [];
    const datasetCharts = allCharts.filter((c) => c.datasetId === dataset.id);
    if (activeDashboard) {
      return datasetCharts.filter(c => activeDashboard.chartIds.includes(c.id));
    }
    return datasetCharts;
  }, [allCharts, dataset, activeDashboard]);

  const insights = useMemo(() => {
    if (!dataset || !filteredData.length) return null;

    const totalRows = dataset.data.length;
    const filteredRows = filteredData.length;
    const filterProgress = (filteredRows / totalRows) * 100;
    
    const effectiveTypes = getEffectiveColumnTypes(dataset);
    const numericColumns = dataset.columns.filter(col => effectiveTypes[col] === 'numeric');
    const categoricalColumns = dataset.columns.filter(col => effectiveTypes[col] === 'categorical');

    const activeFilterCount = Object.keys(activeFilters.categoricalFilters || {}).length + 
                             Object.keys(activeFilters.dateRangeFilters || {}).length;

    // Calculate some basic statistics
    let numericStats;
    const isFiltered = filteredRows !== totalRows || activeFilterCount > 0 || !!activeFilters.groupByColumn;
    
    if (!isFiltered && dataset.metadata) {
      numericStats = dataset.metadata.columns
        .filter(c => getEffectiveColumnType(dataset, c.name) === 'numeric' && c.minimumValue !== undefined && c.maximumValue !== undefined && c.average !== undefined)
        .map(col => {
          const count = dataset.metadata!.rowCount - col.missingValueCount;
          const sum = (col.average || 0) * count;
          return {
            column: col.name,
            sum,
            avg: col.average !== undefined ? Math.round(col.average * 100) / 100 : 0,
            max: col.maximumValue || 0,
            min: col.minimumValue || 0,
            count
          };
        });
    } else {
      numericStats = numericColumns.map(col => {
        const values = filteredData
          .map(row => Number(row[col]))
          .filter(val => !isNaN(val));
        
        if (values.length === 0) return null;
        
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);
        
        return {
          column: col,
          sum,
          avg: Math.round(avg * 100) / 100,
          max,
          min,
          count: values.length
        };
      }).filter(Boolean);
    }

    return {
      totalRows,
      filteredRows,
      filterProgress,
      numericColumns: numericColumns.length,
      categoricalColumns: categoricalColumns.length,
      totalColumns: dataset.columns.length,
      chartsCreated: charts.length,
      numericStats,
      activeFilterCount
    };
  }, [dataset, filteredData, charts, activeFilters]);

  if (activeDashboardId && !dataset) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12 max-w-md mx-auto"
      >
        <Card className="glass border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6" />
              Dataset Not Found
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              The dataset associated with the dashboard "{activeDashboard?.name}" has been deleted.
            </p>
            <p className="text-muted-foreground text-sm">
              Please upload or select another dataset to continue.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  if (!insights) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Data Loaded</h3>
        <p className="text-muted-foreground">Upload a dataset to see your dashboard summary</p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 bg-transparent">
          {activeDashboard ? (
            <LayoutDashboard className="h-6 w-6 text-zinc-700 dark:text-zinc-300" />
          ) : (
            <TrendingUp className="h-6 w-6 text-zinc-700 dark:text-zinc-300" />
          )}
          <div className="bg-transparent">
            <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">
              {activeDashboard ? activeDashboard.name : "Dashboard Overview"}
            </h2>
            {activeDashboard ? (
              <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created {new Date(activeDashboard.createdAt).toLocaleDateString()}
                </span>
                <span>•</span>
                <span>
                  Updated {new Date(activeDashboard.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Executive summary and interactive analytics
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Undo/Redo & Snapshot Toolbar Controls */}
          <div className="flex items-center gap-1.5 border-r border-gray-200 dark:border-zinc-800 pr-3 mr-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              onClick={undo}
              disabled={past.length === 0}
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              onClick={redo}
              disabled={future.length === 0}
              title="Redo (Ctrl+Shift+Z)"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ml-1"
              onClick={() => setIsSnapshotManagerOpen(true)}
              title="Manage Workspace Snapshots & History"
            >
              <Camera className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
              Snapshots
            </Button>
          </div>

          {activeDashboard && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                onClick={() => setIsCreateTemplateOpen(true)}
              >
                <LayoutTemplate className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                Save as Template
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                onClick={() => {
                  setEditKpi(null);
                  setIsKpiBuilderOpen(true);
                }}
              >
                <Plus className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                Add KPI Card
              </Button>

              <CreateTemplateModal
                isOpen={isCreateTemplateOpen}
                onClose={() => setIsCreateTemplateOpen(false)}
                onSave={handleSaveTemplate}
              />
            </>
          )}

          {dashboards.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Switch Dashboard:</span>
              <Select
                value={activeDashboardId || "none"}
                onValueChange={(val) => {
                  if (val === "none") {
                    useDashboardStore.setState({ activeDashboardId: null });
                  } else {
                    loadDashboard(val);
                  }
                }}
              >
                <SelectTrigger className="w-[200px] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200">
                  <SelectItem value="none">None (Dataset Overview)</SelectItem>
                  {dashboards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* AI Executive Summary Banner */}
      <ExecutiveSummaryPanel />

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50">
                  <Database className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">Total Rows</p>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{insights.totalRows.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50">
                  <Users className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">Columns</p>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{insights.totalColumns}</p>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="outline" className="text-[10px] border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
                      {insights.numericColumns} numeric
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-gray-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400">
                      {insights.categoricalColumns} categorical
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50">
                  <Filter className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">Filtered Rows</p>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{insights.filteredRows.toLocaleString()}</p>
                  <Progress value={insights.filterProgress} className="h-1 mt-2 bg-gray-200 dark:bg-zinc-800" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/50">
                  <PieChart className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">Charts Created</p>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{insights.chartsCreated}</p>
                  {insights.activeFilterCount > 0 && (
                    <Badge className="mt-1 text-[10px] bg-gray-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-gray-300 dark:border-zinc-700">
                      {insights.activeFilterCount} filters active
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Numeric Insights */}
      {insights.numericStats.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Data Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {insights.numericStats.map((stat, index) => (
                  <motion.div
                    key={stat.column}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className="p-4 rounded-lg border border-border/50 bg-muted/30"
                  >
                    <h4 className="font-semibold mb-2 text-sm text-muted-foreground uppercase tracking-wide">
                      {stat.column}
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Average:</span>
                        <span className="font-medium">{stat.avg.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Maximum:</span>
                        <span className="font-medium text-green-600">{stat.max.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Minimum:</span>
                        <span className="font-medium text-blue-600">{stat.min.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Sum:</span>
                        <span className="font-medium">{stat.sum.toLocaleString()}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Dashboard Charts Grid */}
      {activeDashboard && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-8 space-y-4"
        >
          <div className="border-t pt-6 space-y-4">
            <GlobalFilterBar />
            
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              Dashboard Widgets ({charts.length + (activeDashboard.kpis?.length || 0)})
            </h3>
            {charts.length === 0 && (!activeDashboard.kpis || activeDashboard.kpis.length === 0) ? (
              <Card className="glass border-dashed border-2 py-12 text-center text-muted-foreground">
                <CardContent className="space-y-2">
                  <p>No widgets added to this dashboard yet.</p>
                  <p className="text-xs">Go to the "Charts" builder or click "Add KPI Card" above to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <DashboardGrid 
                charts={charts} 
                activeDashboardId={activeDashboard.id} 
                onEditKpi={(kpi) => {
                  setEditKpi(kpi);
                  setIsKpiBuilderOpen(true);
                }}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* KPI Card Builder Sidebar */}
      <KPIBuilder
        isOpen={isKpiBuilderOpen}
        onClose={() => {
          setIsKpiBuilderOpen(false);
          setEditKpi(null);
        }}
        onSave={(kpi) => {
          if (!activeDashboard) return;
          if (editKpi) {
            updateKpiCard(activeDashboard.id, kpi.id, kpi);
          } else {
            addKpiCard(activeDashboard.id, kpi);
          }
        }}
        editKpi={editKpi}
      />

      <DrillThroughModal />
      <SnapshotManager
        isOpen={isSnapshotManagerOpen}
        onClose={() => setIsSnapshotManagerOpen(false)}
      />
    </motion.div>
  );
}