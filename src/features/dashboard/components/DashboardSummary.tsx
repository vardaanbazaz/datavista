import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { DashboardGrid } from "@/features/dashboards/components/DashboardGrid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { Database, Filter, PieChart, TrendingUp, Users, LayoutDashboard, Calendar, AlertCircle, Plus, LayoutTemplate, RotateCcw, RotateCw, Camera } from "lucide-react";
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
import { getEffectiveColumnTypes } from "@/shared/utils/columnType";
import { summarizeCategoricalColumns } from "@/shared/services/stats/columnSummary";
import { profileNumericColumns } from "@/shared/services/stats/columnProfile";
import { NumericLedger } from "./NumericLedger";
import { CategoryLedger } from "./CategorySummary";
import { useUiStore } from "@/store/uiStore";
import { Hint } from "@/shared/components/Hint";
import { Panel, Rule, SectionHeading, Bookplate } from "@/shared/components/ornament";
import { modKey } from "@/shared/lib/platform";

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

    // Real count/sum/avg/min/max of the valid numbers in the rows shown (shared numeric rule).
    // No metadata shortcut: metadata has no valid-number count, and rowCount − missing
    // counted junk strings, which inflated count and sum.
    // Ledger rows: count/sum/mean/min/max of the valid numbers in the rows shown (shared
    // numeric rule, via summarizeNumericColumns), plus missing/invalid and the column's
    // display role (ID/year: no sum or average; constant: one line).
    const numericStats = profileNumericColumns(filteredData, numericColumns, dataset);

    const categoryStats = summarizeCategoricalColumns(filteredData, categoricalColumns, dataset);

    return {
      categoryStats,
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
        className="py-12"
      >
        <Bookplate inscription="Overview" title="No Data Loaded" emblem={<Database aria-hidden />}>
          Upload a dataset to see your dashboard summary
        </Bookplate>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {activeDashboard ? (
            <LayoutDashboard className="hidden sm:block h-6 w-6 shrink-0 text-ornament" aria-hidden />
          ) : (
            <TrendingUp className="hidden sm:block h-6 w-6 shrink-0 text-ornament" aria-hidden />
          )}
          <div className="min-w-0">
            <SectionHeading
              numeral="I"
              label={activeDashboard ? "Dashboard" : "Overview"}
              title={activeDashboard ? activeDashboard.name : "Dashboard Overview"}
              level={2}
              className="[&_h2]:text-h1"
            />
            {activeDashboard ? (
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
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
              <p className="hidden sm:block text-body text-muted-foreground mt-0.5">
                Executive summary and interactive analytics
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Undo/Redo & Snapshot Toolbar Controls */}
          <div className="flex items-center gap-1.5 border-r border-border pr-3 mr-1">
            <Hint label="Undo last change" disabledReason="nothing to undo yet" shortcut={[modKey, "Z"]}>
              <Button
                size="icon"
                variant="plate"
                className="h-9 w-9"
                onClick={undo}
                disabled={past.length === 0}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </Hint>
            <Hint label="Redo last undone change" disabledReason="nothing to redo" shortcut={[modKey, "⇧", "Z"]}>
              <Button
                size="icon"
                variant="plate"
                className="h-9 w-9"
                onClick={redo}
                disabled={future.length === 0}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </Hint>
            <Button
              variant="plate"
              size="sm"
              className="gap-1.5 ml-1"
              onClick={() => setIsSnapshotManagerOpen(true)}
              title="Manage Workspace Snapshots & History"
            >
              <Camera className="h-4 w-4" />
              Snapshots
            </Button>
          </div>

          {activeDashboard && (
            <>
              <Button
                variant="plate"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsCreateTemplateOpen(true)}
              >
                <LayoutTemplate className="h-4 w-4" />
                Save as Template
              </Button>

              <Button
                variant="plate"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditKpi(null);
                  setIsKpiBuilderOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
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
              <span id="switch-dashboard-label" className="text-sm text-muted-foreground whitespace-nowrap">Switch Dashboard:</span>
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
                <SelectTrigger className="w-[12.5rem] bg-card border border-borderStrong" aria-labelledby="switch-dashboard-label">
                  <SelectValue placeholder="Select dashboard" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border text-popover-foreground">
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

      <Rule fleuron className="-mt-2 hidden sm:flex" />

      {/* AI Executive Summary Banner */}
      <div className="order-4 lg:order-none">
        <ExecutiveSummaryPanel />
      </div>

      {/* Key Metrics Grid */}
      <div className="order-2 lg:order-none grid grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="frame-double h-full rounded-md bg-card shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block p-2 rounded-full border border-ornament/50 text-ornament">
                  <Database className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="catalogue-label text-muted-foreground">Total Rows</p>
                  <p className="font-mono text-kpi text-foreground">{insights.totalRows.toLocaleString()}</p>
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
          <Card className="frame-double h-full rounded-md bg-card shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block p-2 rounded-full border border-ornament/50 text-ornament">
                  <Users className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="catalogue-label text-muted-foreground">Columns</p>
                  <p className="font-mono text-kpi text-foreground">{insights.totalColumns}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {insights.numericColumns} numeric · {insights.categoricalColumns} categorical
                  </p>
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
          <Card className="frame-double h-full rounded-md bg-card shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block p-2 rounded-full border border-ornament/50 text-ornament">
                  <Filter className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="catalogue-label text-muted-foreground">Filtered Rows</p>
                  <p className="font-mono text-kpi text-foreground">{insights.filteredRows.toLocaleString()}</p>
                  <Progress value={insights.filterProgress} className="h-1 mt-2 bg-muted" aria-label="Share of rows shown after filters" />
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
          <Card className="frame-double h-full rounded-md bg-card shadow-none transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="hidden sm:block p-2 rounded-full border border-ornament/50 text-ornament">
                  <PieChart className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="catalogue-label text-muted-foreground">Charts Created</p>
                  <p className="font-mono text-kpi text-foreground">{insights.chartsCreated}</p>
                  {insights.activeFilterCount > 0 && (
                    <Badge className="mt-1 text-xs font-medium bg-muted text-foreground border border-border hover:bg-muted">
                      {insights.activeFilterCount} filters active
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Numeric columns ledger. On phones the AI banner moves below it (order), so data is on the first screen. */}
      {insights.numericStats.length > 0 && (
        <Panel numeral="II" label="Numeric columns" title="Ledger" className="order-3 lg:order-none">
          <NumericLedger profiles={insights.numericStats} />
        </Panel>
      )}

      {/* Categorical columns: distinct, missing, top values */}
      {insights.categoryStats.length > 0 && (
        <Panel numeral="III" label="Categorical columns" title="Categories" data-testid="category-tiles" className="order-5 lg:order-none">
          <CategoryLedger stats={insights.categoryStats} />
        </Panel>
      )}

      {/* Dashboard Charts Grid */}
      {activeDashboard && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="order-6 lg:order-none mt-8 space-y-4"
        >
          <div className="border-t pt-6 space-y-4">
            <GlobalFilterBar />
            
            <h3 className="text-h2 flex items-center gap-2">
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