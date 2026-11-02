import { useEffect, useState, lazy, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { InstantiateTemplateModal } from "@/features/dashboards/components/InstantiateTemplateModal";
import { MainContent } from "@/app/layout/MainContent";
import { FileUpload } from "@/features/upload/components/FileUpload";
import { ImportDialog } from "@/features/upload/components/ImportDialog";
import { DataPrivacyDialog } from "@/features/privacy/components/DataPrivacyDialog";
import { ReadingComfortPanel } from "@/features/settings/components/ReadingComfortPanel";
import { Bookplate, SectionHeading } from "@/shared/components/ornament";
import { NoDatasetPlate } from "@/shared/components/NoDatasetPlate";
import { ChartBuilder } from "@/features/charts/components/ChartBuilder";
import { DataTable } from "@/features/datasets/components/DataTable";
import { FilterPanel } from "@/features/filters/components/FilterPanel";
import { ExportPanel } from "@/features/export/components/ExportPanel";
import { ChartGrid } from "@/features/charts/components/ChartGrid";
import { DashboardSummary } from "./DashboardSummary";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { OnboardingTour } from "@/features/ui/components/OnboardingTour";
import { LoadingProgress, LoadingState } from "@/shared/components/LoadingSpinner";
import { perfMark, perfMeasure } from "@/shared/lib/perfMarks";
import { ErrorBoundary, FullPageError } from "@/shared/components/ErrorBoundary";

const PivotExplorer = lazy(() => import("@/features/pivot/components/PivotExplorer").then(m => ({ default: m.PivotExplorer })));
const StatsExplorer = lazy(() => import("@/features/stats/components/StatsExplorer").then(m => ({ default: m.StatsExplorer })));
const WindowExplorer = lazy(() => import("@/features/window/components/WindowExplorer").then(m => ({ default: m.WindowExplorer })));
import { Button } from "@/shared/components/ui/button";
import { motion } from "framer-motion";
import { BarChart3, Upload, Filter } from "lucide-react";

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
  const setShowWelcome = useUiStore((state) => state.setShowWelcome);
  const isLoading = useUiStore((state) => state.isLoading);
  // The real IndexedDB load, not the synchronous localStorage-only `isHydrated` flag
  // (see uiStore.ts) - gating on that one let the dashboard render before actual data
  // had loaded.
  const isDataHydrated = useUiStore((state) => state.isDataHydrated);
  const startupStatus = useUiStore((state) => state.startupStatus);
  const setIsSnapshotManagerOpen = useUiStore((state) => state.setIsSnapshotManagerOpen);

  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const uploadDataset = useDatasetStore((state) => state.uploadDataset);

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

  // Show welcome overlay on first visit
  useEffect(() => {
    if (!isDataHydrated) return;
    const hasVisited = localStorage.getItem('datavista-visited');
    if (!hasVisited) {
      setShowWelcome(true);
      localStorage.setItem('datavista-visited', 'true');
    }
  }, [isDataHydrated, setShowWelcome]);

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

  // Load sample data on first visit
  const loadSampleData = () => {
    const sampleDataset: Dataset = {
      id: "sample-sales-data",
      name: "Sample Sales Data",
      data: [
        { Product: "Laptop", Category: "Electronics", Sales: 1200, Profit: 300, Region: "North" },
        { Product: "Phone", Category: "Electronics", Sales: 800, Profit: 200, Region: "South" },
        { Product: "Tablet", Category: "Electronics", Sales: 600, Profit: 150, Region: "East" },
        { Product: "Desk Chair", Category: "Furniture", Sales: 350, Profit: 80, Region: "West" },
        { Product: "Bookshelf", Category: "Furniture", Sales: 280, Profit: 70, Region: "North" },
        { Product: "Coffee Maker", Category: "Appliances", Sales: 120, Profit: 30, Region: "South" },
        { Product: "Monitor", Category: "Electronics", Sales: 400, Profit: 100, Region: "North" },
        { Product: "Office Chair", Category: "Furniture", Sales: 320, Profit: 90, Region: "South" },
        { Product: "Keyboard", Category: "Electronics", Sales: 150, Profit: 40, Region: "West" },
        { Product: "Mouse", Category: "Electronics", Sales: 50, Profit: 15, Region: "North" }
      ],
      columns: ["Product", "Category", "Sales", "Profit", "Region"],
      columnTypes: {
        Product: "categorical",
        Category: "categorical", 
        Sales: "numeric",
        Profit: "numeric",
        Region: "categorical"
      }
    };
    uploadDataset(sampleDataset);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row transition-colors">
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
      
      <MainContent>
        {isLoading && (
          <LoadingState 
            title="Processing your data..." 
            description="Analyzing structure and preparing visualizations"
          />
        )}
        
        {!isLoading && activeView === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {activeDataset ? (
              <DashboardSummary />
            ) : (
              // Empty workspace: the ex-libris bookplate (batch 6 empty-state style).
              <div className="mx-auto max-w-4xl space-y-8">
                <Bookplate
                  inscription="Ex libris · DataVista"
                  title="DataVista Dashboard"
                  level={1}
                  emblem={<BarChart3 aria-hidden />}
                  data-testid="overview-empty"
                  actions={
                    <>
                      <Button
                        data-testid="sample-data-button"
                        onClick={loadSampleData}
                        variant="engraved"
                        size="lg"
                        className="text-base px-8"
                      >
                        Try with Sample Data
                      </Button>
                      <Button
                        onClick={() => setActiveView('upload')}
                        variant="plate"
                        size="lg"
                        className="text-base px-8"
                      >
                        Upload Your Data
                      </Button>
                    </>
                  }
                >
                  Transform your data into clear, interactive visualizations with professional-grade analytics tools.
                </Bookplate>

                <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {[
                    { icon: Upload, title: "Import Data", text: "Upload CSV, TSV, or XLSX files to get started" },
                    { icon: Filter, title: "Smart Filtering", text: "Advanced filters with real-time data grouping" },
                    { icon: BarChart3, title: "8 Chart Types", text: "Create clear visualizations with our chart library" },
                  ].map(({ icon: Icon, title, text }) => (
                    <li key={title} className="frame-double rounded-md bg-card p-6 text-center">
                      <Icon className="mx-auto mb-3 h-8 w-8 text-ornament" aria-hidden />
                      <h2 className="font-display text-h2">{title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
        
        {!isLoading && activeView === 'upload' && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl mx-auto"
          >
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <SectionHeading numeral="II" label="Upload Data" title="Add a dataset" className="[&_h2]:text-h1" />
                <p className="mt-1 text-body text-muted-foreground">CSV, TSV or XLSX, read and kept in this browser.</p>
              </div>
              <Button onClick={loadSampleData} variant="outline">
                Try with Sample Data
              </Button>
            </div>
            <FileUpload />
          </motion.div>
        )}

        {!isLoading && activeView === 'filters' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex flex-wrap items-end justify-between gap-3"
            >
              <SectionHeading numeral="III" label="Filters" title="Data Filters" className="[&_h2]:text-h1" />
              <div className="flex gap-2">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveView('charts')}
                  >
                    Create Charts
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveView('data')}
                  >
                    View Data
                  </Button>
                </motion.div>
              </div>
            </motion.div>
            
            <FilterPanel />
          </motion.div>
        )}

        {!isLoading && activeView === 'charts' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex flex-wrap items-end justify-between gap-3"
            >
              <SectionHeading numeral="IV" label="Charts" title="Chart Builder" className="[&_h2]:text-h1" />
              <div className="flex gap-2">
                {!activeDataset && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveView('upload')}
                    >
                      Upload Data First
                    </Button>
                  </motion.div>
                )}
                {activeDataset && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      variant="outline" 
                      onClick={() => setActiveView('filters')}
                    >
                      Back to Filters
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>
            
            {activeDataset ? (
              <>
                {filteredData.length > 0 ? (
                  <>
                    <ChartBuilder />
                    <div className="mt-8">
                      <h3 className="font-display text-h2 font-semibold mb-4">Your Charts</h3>
                      <ChartGrid />
                    </div>
                  </>
                ) : (
                  <Bookplate
                    inscription="Charts"
                    title="No rows match the filters"
                    level={3}
                    emblem={<Filter aria-hidden />}
                    actions={
                      <Button variant="outline" onClick={() => setActiveView('filters')}>
                        Adjust Filters
                      </Button>
                    }
                  >
                    Every row is filtered out. Change or clear the filters to chart the data.
                  </Bookplate>
                )}
              </>
            ) : (
              <NoDatasetPlate view="Charts" emblem={<BarChart3 aria-hidden />}>
                Upload or pick a dataset to build charts.
              </NoDatasetPlate>
            )}
          </motion.div>
        )}

        {!isLoading && activeView === 'data' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeading numeral="V" label="Data Explorer" title="Data Explorer" className="[&_h2]:text-h1" />
              {activeDataset && (
                <Button 
                  variant="outline" 
                  onClick={() => setActiveView('filters')}
                >
                  Back to Filters
                </Button>
              )}
            </div>
            <DataTable />
          </div>
        )}

        {!isLoading && activeView === 'pivot' && (
          <div className="space-y-6 animate-fade-in w-full">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeading numeral="VI" label="Pivot Table" title="Pivot Analyzer" className="[&_h2]:text-h1" />
              {activeDataset && (
                <Button 
                  variant="outline" 
                  onClick={() => setActiveView('filters')}
                >
                  Back to Filters
                </Button>
              )}
            </div>
            <ErrorBoundary fallback={(props) => <FullPageError {...props} />}>
              <Suspense fallback={<LoadingState title="Loading Pivot Analyzer..." description="Preparing pivot engine and view..." />}>
                <PivotExplorer />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!isLoading && activeView === 'stats' && (
          <div className="space-y-6 animate-fade-in w-full">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeading numeral="VII" label="Statistics" title="Statistical Summary" className="[&_h2]:text-h1" />
              {activeDataset && (
                <Button 
                  variant="outline" 
                  onClick={() => setActiveView('filters')}
                >
                  Back to Filters
                </Button>
              )}
            </div>
            <ErrorBoundary fallback={(props) => <FullPageError {...props} />}>
              <Suspense fallback={<LoadingState title="Loading Statistical Engine..." description="Calculating summary statistics..." />}>
                <StatsExplorer />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!isLoading && activeView === 'window-builder' && (
          <div className="space-y-6 animate-fade-in w-full">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeading numeral="VIII" label="Window Functions" title="Window & Ranking Builder" className="[&_h2]:text-h1" />
              {activeDataset && (
                <Button 
                  variant="outline" 
                  onClick={() => setActiveView('filters')}
                >
                  Back to Filters
                </Button>
              )}
            </div>
            <ErrorBoundary fallback={(props) => <FullPageError {...props} />}>
              <Suspense fallback={<LoadingState title="Loading Window Builder..." description="Initializing window calculation module..." />}>
                <WindowExplorer />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!isLoading && activeView === 'export' && (
          <div className="animate-fade-in">
            <ExportPanel />
          </div>
        )}
      </MainContent>
      
      <WelcomeOverlay />
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
      <ReadingComfortPanel />
    </div>
  );
}