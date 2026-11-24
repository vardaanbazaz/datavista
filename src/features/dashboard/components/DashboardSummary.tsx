import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Progress } from "@/shared/components/ui/progress";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { DashboardGrid } from "@/features/dashboards/components/DashboardGrid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { Database, PieChart, TrendingUp, Columns3, LayoutDashboard, AlertCircle, Plus, LayoutTemplate, RotateCcw, RotateCw, Camera, CircleAlert } from "lucide-react";
import { GlobalFilterBar } from "@/features/dashboards/components/GlobalFilterBar";
import { ExecutiveSummaryPanel } from "@/features/ai/components/ExecutiveSummaryPanel";
import { DrillThroughModal } from "@/features/dashboards/components/DrillThroughModal";
import { motion } from "framer-motion";
import { KPIBuilder } from "@/features/kpi/components/KPIBuilder";
import { KPICardConfig } from "@/features/kpi/types";
import { addKpiToWorkspace } from "@/features/dashboards/services/kpiPlacement";
import { CreateTemplateModal } from "@/features/dashboards/components/CreateTemplateModal";
import { SnapshotManager } from "@/features/dashboards/components/SnapshotManager";
import { useTemplateStore } from "@/features/dashboards/store/templateStore";
import { templateEngine } from "@/features/dashboards/services/templateEngine";
import { getEffectiveColumnTypes } from "@/shared/utils/columnType";
import { summarizeCategoricalColumns } from "@/shared/services/stats/columnSummary";
import { profileNumericColumns } from "@/shared/services/stats/columnProfile";
import { NumericSummaryTable } from "./NumericSummary";
import { CategorySummaryTable } from "./CategorySummary";
import { useUiStore } from "@/store/uiStore";
import { Hint } from "@/shared/components/Hint";
import { DataPanel, EmptyState, GlassPanel, PageHeader } from "@/shared/components/surface";
import { modKey } from "@/shared/lib/platform";
import { formatPercent, formatShare } from "@/shared/utils/percent";

export function DashboardSummary() {
  const dataset = useDatasetStore((state) => state.activeDataset);
  const filteredData = useFilterStore((state) => state.filteredData);
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const allCharts = useChartStore((state) => state.charts);

  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId);
  const dashboards = useDashboardStore((state) => state.dashboards);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);
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

  /**
   * KPI cards live on a dashboard. From the plain Overview (no dashboard open) the first
   * saved KPI creates one for this dataset ("<dataset> KPIs", numbered if taken) and opens
   * it, so the card shows at once; cancelling the builder creates nothing.
   */
  const saveKpi = (kpi: KPICardConfig) => {
    if (activeDashboard && editKpi) {
      updateKpiCard(activeDashboard.id, kpi.id, kpi);
      return;
    }
    if (dataset) addKpiToWorkspace(dataset, kpi);
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

    // Numeric summary rows: count/sum/mean/min/max of the valid numbers in the rows shown
    // (shared numeric rule, via summarizeNumericColumns; no metadata shortcut: metadata has no
    // valid-number count), plus missing/invalid and the column's display role (ID/year: no
    // sum or average; constant: one line).
    const numericStats = profileNumericColumns(filteredData, numericColumns, dataset);

    const categoryStats = summarizeCategoricalColumns(filteredData, categoricalColumns, dataset);
    const missingValues =
      numericStats.reduce((n, p) => n + p.missing, 0) + categoryStats.reduce((n, c) => n + c.missing, 0);
    const invalidValues = numericStats.reduce((n, p) => n + p.invalid, 0);

    return {
      categoryStats,
      totalRows,
      filteredRows,
      filterProgress,
      numericColumns: numericColumns.length,
      categoricalColumns: categoricalColumns.length,
      otherColumns: dataset.columns.length - numericColumns.length - categoricalColumns.length,
      missingValues,
      invalidValues,
      // Cells the missing count is taken over: the numeric and categorical columns of the rows shown.
      summarisedCells: filteredRows * (numericColumns.length + categoricalColumns.length),
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
        data-tour="view-overview"
      >
        <Card surface="glass" className="border-destructive/60">
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
        data-tour="view-overview"
      >
        <EmptyState title="No rows to summarise" icon={<Database aria-hidden />}>
          Upload a dataset, or clear the filters, to see the summary.
        </EmptyState>
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
      <PageHeader
        className="pt-2"
        tourId="overview"
        icon={activeDashboard ? <LayoutDashboard /> : <TrendingUp />}
        title={activeDashboard ? activeDashboard.name : "Overview"}
        description={
          activeDashboard ? (
            <span className="tabular-nums">
              Created {new Date(activeDashboard.createdAt).toLocaleDateString()} · Updated {new Date(activeDashboard.updatedAt).toLocaleDateString()}
            </span>
          ) : (
            <>Summary of “{dataset!.name}” in the rows shown</>
          )
        }
        actions={
          <>
            <Hint label="Undo last change" disabledReason="nothing to undo yet" shortcut={[modKey, "Z"]}>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={undo} disabled={past.length === 0}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </Hint>
            <Hint label="Redo last undone change" disabledReason="nothing to redo" shortcut={[modKey, "⇧", "Z"]}>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={redo} disabled={future.length === 0}>
                <RotateCw className="h-4 w-4" />
              </Button>
            </Hint>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="overview-add-kpi"
              onClick={() => {
                setEditKpi(null);
                setIsKpiBuilderOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add KPI
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsSnapshotManagerOpen(true)} title="Manage Workspace Snapshots & History">
              <Camera className="h-4 w-4" />
              Snapshots
            </Button>

            {activeDashboard && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsCreateTemplateOpen(true)}>
                  <LayoutTemplate className="h-4 w-4" />
                  Save as Template
                </Button>
                <CreateTemplateModal isOpen={isCreateTemplateOpen} onClose={() => setIsCreateTemplateOpen(false)} onSave={handleSaveTemplate} />
              </>
            )}

            {dashboards.length > 0 && (
              <div className="flex items-center gap-2 pl-1">
                <span id="switch-dashboard-label" className="whitespace-nowrap text-sm text-frame-muted">
                  Dashboard:
                </span>
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
                  <SelectTrigger className="h-9 w-[12.5rem]" aria-labelledby="switch-dashboard-label">
                    <SelectValue placeholder="Select dashboard" />
                  </SelectTrigger>
                  <SelectContent>
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
          </>
        }
      />

      {/*
        Bento: glass tiles on the frame, one row on large screens (Rows a little wider: it holds
        the filter bar), 2 x 2 below with Rows across the top. On phones they come first, then the
        tables, then the AI summary.
      */}
      <div className="order-2 grid grid-cols-2 gap-3 lg:order-none lg:grid-cols-[1.35fr_1.15fr_1fr_1fr]" data-testid="overview-bento">
        <GlassPanel className="col-span-2 p-5 lg:col-span-1" data-testid="tile-rows">
          <div className="flex items-center gap-2 text-sm font-medium text-frame-muted">
            <Database className="h-4 w-4 text-primary-ink" aria-hidden />
            Rows
          </div>
          <p className="mt-2 text-kpi tabular-nums text-foreground" data-testid="kpi-rows">
            {insights.totalRows.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-frame-muted tabular-nums" data-testid="tile-rows-subtitle">
            {insights.filteredRows === insights.totalRows
              ? insights.activeFilterCount > 0
                ? `All shown · ${insights.activeFilterCount} ${insights.activeFilterCount === 1 ? "filter" : "filters"} active`
                : "All rows shown · no filters"
              : `${insights.filteredRows.toLocaleString()} shown (${formatPercent(insights.filterProgress)}) · ${insights.activeFilterCount} ${insights.activeFilterCount === 1 ? "filter" : "filters"}`}
          </p>
          <Progress value={insights.filterProgress} className="mt-2 h-1.5 bg-foreground/10" aria-label="Share of rows shown after filters" />
        </GlassPanel>

        <GlassPanel className="col-span-2 p-5 lg:col-span-1" data-testid="tile-columns">
          <div className="flex items-center gap-2 text-sm font-medium text-frame-muted">
            <Columns3 className="h-4 w-4 text-primary-ink" aria-hidden />
            Columns
          </div>
          <p className="mt-2 text-kpi tabular-nums text-foreground">{insights.totalColumns}</p>
          <p className="mt-1 text-sm text-frame-muted tabular-nums" data-testid="tile-columns-subtitle">
            {insights.numericColumns} numeric · {insights.categoricalColumns} categorical
            {insights.otherColumns > 0 && ` · ${insights.otherColumns} other`}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5" data-testid="tile-charts">
          <div className="flex items-center gap-2 text-sm font-medium text-frame-muted">
            <PieChart className="h-4 w-4 text-primary-ink" aria-hidden />
            Charts
          </div>
          <p className="mt-2 text-kpi tabular-nums text-foreground">{insights.chartsCreated}</p>
          <p className="mt-1 text-sm text-frame-muted" data-testid="tile-charts-subtitle">
            {insights.chartsCreated === 0
              ? "None yet: build one in Charts"
              : activeDashboard
                ? "On this dashboard"
                : "Saved for this dataset"}
          </p>
        </GlassPanel>

        <GlassPanel className="p-5" data-testid="tile-missing">
          <div className="flex items-center gap-2 text-sm font-medium text-frame-muted">
            <CircleAlert className="h-4 w-4 text-primary-ink" aria-hidden />
            Missing values
          </div>
          <p className="mt-2 text-kpi tabular-nums text-foreground">{insights.missingValues.toLocaleString()}</p>
          <p className="mt-1 text-sm text-frame-muted tabular-nums" data-testid="tile-missing-subtitle">
            {insights.missingValues > 0 ? `${formatShare(insights.missingValues, insights.summarisedCells)} of cells` : "No blank cells"}
            {" · "}
            {insights.invalidValues > 0
              ? `${insights.invalidValues.toLocaleString()} invalid ${insights.invalidValues === 1 ? "number" : "numbers"}`
              : "no invalid numbers"}
          </p>
        </GlassPanel>
      </div>

      {/* AI Executive Summary Banner */}
      <div className="order-4 lg:order-none">
        <ExecutiveSummaryPanel />
      </div>

      {/* Numeric columns. On phones the AI banner moves below the tables (order), so data is on the first screen. */}
      {insights.numericStats.length > 0 && (
        <DataPanel title="Numeric columns" description="Summary of the rows shown. Select a header to sort." flush className="order-3 lg:order-none">
          <NumericSummaryTable profiles={insights.numericStats} />
        </DataPanel>
      )}

      {/* Categorical columns: distinct, missing, top values */}
      {insights.categoryStats.length > 0 && (
        <DataPanel title="Categorical columns" description="Distinct and missing values, and the most common values." flush data-testid="category-panel" className="order-5 lg:order-none">
          <CategorySummaryTable stats={insights.categoryStats} />
        </DataPanel>
      )}

      {/* Dashboard Charts Grid */}
      {activeDashboard && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="order-6 lg:order-none mt-8 space-y-4"
        >
          <div className="space-y-4">
            <GlobalFilterBar />
            
            <h3 className="text-h2 flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              Dashboard Widgets ({charts.length + (activeDashboard.kpis?.length || 0)})
            </h3>
            {charts.length === 0 && (!activeDashboard.kpis || activeDashboard.kpis.length === 0) ? (
              <Card surface="glass" className="py-12 text-center text-muted-foreground">
                <CardContent className="space-y-2">
                  <p>No widgets added to this dashboard yet.</p>
                  <p className="text-xs">Go to the "Charts" builder or click "Add KPI" above to get started.</p>
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
        onSave={saveKpi}
        saveNote={activeDashboard ? undefined : `The card goes on a new dashboard for “${dataset!.name}”, opened here when you save.`}
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