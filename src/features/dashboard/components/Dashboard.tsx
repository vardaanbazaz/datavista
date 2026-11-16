import { useEffect, useState, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { InstantiateTemplateModal } from "@/features/dashboards/components/InstantiateTemplateModal";
import { MainContent } from "@/app/layout/MainContent";
import { FileUpload } from "@/features/upload/components/FileUpload";
import { ImportDialog } from "@/features/upload/components/ImportDialog";
import { DataPrivacyDialog } from "@/features/privacy/components/DataPrivacyDialog";
import { AiSettingsHost } from "@/features/ai/components/AiSettingsHost";
import { AppearancePanel } from "@/features/settings/components/AppearancePanel";
import { SetupFlow, shouldOfferSetup } from "@/features/settings/components/SetupFlow";
import { loadSampleDataset } from "@/features/datasets/sampleData";
import { AuroraRibbon, EmptyState, GlassPanel, PageHeader } from "@/shared/components/surface";
import { Logo } from "@/shared/brand/Logo";
import { NoDatasetPlate } from "@/shared/components/NoDatasetPlate";
import { ChartBuilder } from "@/features/charts/components/ChartBuilder";
import { DataTable } from "@/features/datasets/components/DataTable";
import { FilterPanel } from "@/features/filters/components/FilterPanel";
import { ExportPanel } from "@/features/export/components/ExportPanel";
import { ChartGrid } from "@/features/charts/components/ChartGrid";
import { DashboardSummary } from "./DashboardSummary";
import { OnboardingTour } from "@/features/ui/components/OnboardingTour";
import { LoadingProgress } from "@/shared/components/LoadingSpinner";
import { ViewSkeleton } from "@/shared/components/ViewSkeleton";
import { perfMark, perfMeasure } from "@/shared/lib/perfMarks";
import { ErrorBoundary, FullPageError } from "@/shared/components/ErrorBoundary";

import { PivotExplorer, StatsExplorer, WindowExplorer } from "../lazyViews";
import { Button } from "@/shared/components/ui/button";
import { BarChart3, Upload, Filter, Table, Grid, Sigma, Columns, Download } from "lucide-react";

import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";

import { shortcutManager } from "@/features/workspace/services/shortcutManager";

import { DataRow as SharedDataRow, Dataset as SharedDataset, ChartConfig as SharedChartConfig, FilterState as SharedFilterState } from "@/shared/types";
import { persistenceService } from "@/shared/services/persistenceService";
export type DataRow = SharedDataRow;
export type Dataset = SharedDataset;
export type ChartConfig = SharedChartConfig;
export type FilterState = SharedFilterState;

export function Dashboard() {
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setIsSetupOpen = useUiStore((state) => state.setIsSetupOpen);
  const isLoading = useUiStore((state) => state.isLoading);
  // The real IndexedDB load, not the synchronous localStorage-only `isHydrated` flag
  // (see uiStore.ts) - gating on that one let the dashboard render before actual data
  // had loaded.
  const isDataHydrated = useUiStore((state) => state.isDataHydrated);
  const startupStatus = useUiStore((state) => state.startupStatus);
  const setIsSnapshotManagerOpen = useUiStore((state) => state.setIsSnapshotManagerOpen);

  const activeDataset = useDatasetStore((state) => state.activeDataset);

  const filteredData = useFilterStore((state) => state.filteredData);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>(undefined);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Initialize global shortcuts (Cmd+K for Command Palette, Cmd+Z, Cmd+Shift+Z, Cmd+P, etc.)
  useEffect(() => {
    shortcutManager.init(() => {
      setSearchInitialQuery(undefined);
      setIsSearchOpen((prev) => !prev);
    });

    const handleOpenSnapshots = () => {
      setActiveView("overview");
      setIsSnapshotManagerOpen(true);
    };

    const handleExportPdf = () => {
      setActiveView("export");
    };

    window.addEventListener("datavista:open-snapshots", handleOpenSnapshots);
    window.addEventListener("datavista:export-pdf", handleExportPdf);

    return () => {
      shortcutManager.destroy();
      window.removeEventListener("datavista:open-snapshots", handleOpenSnapshots);
      window.removeEventListener("datavista:export-pdf", handleExportPdf);
    };
  }, [setActiveView, setIsSnapshotManagerOpen]);

  // Initialize persistence on mount
  useEffect(() => {
    persistenceService.init();
  }, []);

  // Startup timing (src/shared/lib/perfMarks.ts): hydrated → the workspace's first paint.
  useEffect(() => {
    if (!isDataHydrated) return;
    requestAnimationFrame(() => setTimeout(() => {
      perfMark("startup:first-render");
      perfMeasure("startup:render", "startup:hydrated");
    }, 0));
  }, [isDataHydrated]);

  // First visit: the setup (look, effects, optional AI key, then tour or sample data). Not for
  // returning users (hasCompletedSetup / hasSeenTour / the older `datavista-visited` flag) and
  // never when the workspace already holds data. Checked once, after IndexedDB has loaded.
  useEffect(() => {
    if (!isDataHydrated) return;
    const ui = useUiStore.getState();
    let visited = false;
    try {
      visited = localStorage.getItem('datavista-visited') !== null;
    } catch {
      visited = false;
    }
    if (shouldOfferSetup({ hasCompletedSetup: ui.hasCompletedSetup, hasSeenTour: ui.hasSeenTour, datasetCount: useDatasetStore.getState().datasets.length, visited })) {
      setIsSetupOpen(true);
    }
  }, [isDataHydrated, setIsSetupOpen]);

  if (!isDataHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center w-full">
        <LoadingProgress
          title="Opening your workspace"
          step={startupStatus?.step ?? "Starting up"}
          loaded={startupStatus?.loadedRows}
          total={startupStatus?.totalRows}
        />
      </div>
    );
  }

  const loadSampleData = loadSampleDataset;

  const isHero = !isLoading && ((activeView === 'overview' && !activeDataset) || activeView === 'upload');

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* The aurora ribbon behind the top of every view (larger on the welcome and upload screens). */}
      <AuroraRibbon variant={isHero ? "hero" : "page"} />
      <Sidebar
        onOpenSearch={() => {
          setSearchInitialQuery(undefined);
          setIsSearchOpen(true);
        }}
        onOpenAiCoPilot={() => {
          setSearchInitialQuery("/ai ");
          setIsSearchOpen(true);
        }}
      />
      
      <MainContent
        onOpenSearch={() => {
          setSearchInitialQuery(undefined);
          setIsSearchOpen(true);
        }}
      >
        {isLoading && (
          <ViewSkeleton label="Processing your data…" />
        )}
        
        {!isLoading && activeView === 'overview' && (
          <div className="animate-view-in">
            {activeDataset ? (
              <DashboardSummary />
            ) : (
              // Empty workspace: the welcome hero over the large ribbon.
              <div className="mx-auto max-w-4xl space-y-10 pt-6 sm:pt-12" data-testid="overview-empty">
                <div className="text-center" data-tour="view-overview">
                  <Logo size={64} className="mx-auto" />
                  <h2 className="mt-5 text-display text-foreground">Explore your data in DataVista</h2>
                  <p className="mx-auto mt-3 max-w-xl text-body text-frame-muted">
                    Charts, pivots and statistics from CSV, TSV and Excel files. Your files are read and kept in this browser.
                  </p>
                  <GlassPanel className="mx-auto mt-7 flex w-fit flex-col gap-2 p-2 sm:flex-row">
                    <Button data-testid="sample-data-button" onClick={loadSampleData} size="lg">
                      Try with sample data
                    </Button>
                    <Button onClick={() => setActiveView('upload')} variant="outline" size="lg" className="gap-2">
                      <Upload className="h-4 w-4" aria-hidden />
                      Upload your data
                    </Button>
                  </GlassPanel>
                </div>

                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { icon: Upload, title: "Import", text: "CSV, TSV or XLSX. Column types are detected for you." },
                    { icon: Filter, title: "Filter and group", text: "Narrow the rows and compare groups side by side." },
                    { icon: BarChart3, title: "Chart and summarise", text: "Bar, line, pie, scatter and more, with pivots and statistics." },
                  ].map(({ icon: Icon, title, text }) => (
                    <li key={title} className="surface-glass rounded-xl p-5">
                      <Icon className="mb-3 h-5 w-5 text-primary-ink" aria-hidden />
                      <h3 className="text-h3">{title}</h3>
                      <p className="mt-1 text-sm text-frame-muted">{text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {!isLoading && activeView === 'upload' && (
          <div className="max-w-2xl mx-auto animate-view-in">
            <PageHeader
              className="mb-6 pt-4"
              tourId="upload"
              icon={<Upload />}
              title="Add a dataset"
              description="CSV, TSV or XLSX, read and kept in this browser."
              actions={
                <Button onClick={loadSampleData} variant="outline">
                  Try with Sample Data
                </Button>
              }
            />
            <FileUpload />
          </div>
        )}

        {!isLoading && activeView === 'filters' && (
          <div className="space-y-6 animate-view-in">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <PageHeader
                className="w-full"
                tourId="filters"
                icon={<Filter />}
                title="Data Filters"
                actions={
                  <>
                    <Button variant="outline" onClick={() => setActiveView('charts')}>
                      Create Charts
                    </Button>
                    <Button variant="outline" onClick={() => setActiveView('data')}>
                      View Data
                    </Button>
                  </>
                }
              />
            </div>
            
            <FilterPanel />
          </div>
        )}

        {!isLoading && activeView === 'charts' && (
          <div className="space-y-6 animate-view-in">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <PageHeader
                className="w-full"
                tourId="charts"
                icon={<BarChart3 />}
                title="Chart Builder"
                description={activeDataset ? `Build charts from “${activeDataset.name}”.` : undefined}
                actions={
                  activeDataset ? (
                    <Button variant="outline" onClick={() => setActiveView('filters')}>
                      Back to Filters
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setActiveView('upload')}>
                      Upload Data First
                    </Button>
                  )
                }
              />
            </div>
            
            {activeDataset ? (
              <>
                {filteredData.length > 0 ? (
                  <>
                    <ChartBuilder />
                    <div className="mt-8">
                      <h3 className="text-h2 mb-4">Your Charts</h3>
                      <ChartGrid />
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="No rows match the filters"
                    level={3}
                    icon={<Filter aria-hidden />}
                    actions={
                      <Button variant="outline" onClick={() => setActiveView('filters')}>
                        Adjust Filters
                      </Button>
                    }
                  >
                    Every row is filtered out. Change or clear the filters to chart the data.
                  </EmptyState>
                )}
              </>
            ) : (
              <NoDatasetPlate view="Charts" emblem={<BarChart3 aria-hidden />}>
                Upload or pick a dataset to build charts.
              </NoDatasetPlate>
            )}
          </div>
        )}

        {!isLoading && activeView === 'data' && (
          <div className="space-y-6 animate-view-in">
            <PageHeader
              tourId="data"
              icon={<Table />}
              title="Data Explorer"
              actions={
                activeDataset ? (
                  <Button variant="outline" onClick={() => setActiveView('filters')}>
                    Back to Filters
                  </Button>
                ) : undefined
              }
            />
            <DataTable />
          </div>
        )}

        {!isLoading && activeView === 'pivot' && (
          <div className="space-y-6 animate-view-in w-full">
            <PageHeader
              tourId="pivot"
              icon={<Grid />}
              title="Pivot Analyzer"
              actions={
                activeDataset ? (
                  <Button variant="outline" onClick={() => setActiveView('filters')}>
                    Back to Filters
                  </Button>
                ) : undefined
              }
            />
            <ErrorBoundary fallback={(props) => <FullPageError {...props} />}>
              <Suspense fallback={<ViewSkeleton label="Loading the pivot table…" />}>
                <PivotExplorer />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!isLoading && activeView === 'stats' && (
          <div className="space-y-6 animate-view-in w-full">
            <PageHeader
              tourId="stats"
              icon={<Sigma />}
              title="Statistical Summary"
              actions={
                activeDataset ? (
                  <Button variant="outline" onClick={() => setActiveView('filters')}>
                    Back to Filters
                  </Button>
                ) : undefined
              }
            />
            <ErrorBoundary fallback={(props) => <FullPageError {...props} />}>
              <Suspense fallback={<ViewSkeleton label="Loading statistics…" />}>
                <StatsExplorer />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!isLoading && activeView === 'window-builder' && (
          <div className="space-y-6 animate-view-in w-full">
            <PageHeader
              tourId="window-builder"
              icon={<Columns />}
              title="Window & Ranking Builder"
              actions={
                activeDataset ? (
                  <Button variant="outline" onClick={() => setActiveView('filters')}>
                    Back to Filters
                  </Button>
                ) : undefined
              }
            />
            <ErrorBoundary fallback={(props) => <FullPageError {...props} />}>
              <Suspense fallback={<ViewSkeleton label="Loading window functions…" />}>
                <WindowExplorer />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!isLoading && activeView === 'export' && (
          <div className="space-y-6 animate-view-in">
            <PageHeader
              tourId="export"
              icon={<Download />}
              title="Export"
              description={activeDataset ? `Download “${activeDataset.name}” as CSV, its charts as images, or a PDF report.` : undefined}
            />
            <ExportPanel />
          </div>
        )}
      </MainContent>
      
      <SetupFlow />
      <OnboardingTour />
      
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onOpenTemplateModal={() => setIsTemplateModalOpen(true)}
        initialQuery={searchInitialQuery}
      />
      <InstantiateTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
      />
      <ImportDialog />
      <DataPrivacyDialog />
      <AiSettingsHost />
      <AppearancePanel />
    </div>
  );
}