import { useEffect, useState, lazy, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { InstantiateTemplateModal } from "@/features/dashboards/components/InstantiateTemplateModal";
import { MainContent } from "@/app/layout/MainContent";
import { FileUpload } from "@/features/upload/components/FileUpload";
import { ImportDialog } from "@/features/upload/components/ImportDialog";
import { DataPrivacyDialog } from "@/features/privacy/components/DataPrivacyDialog";
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
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col lg:flex-row text-zinc-900 dark:text-zinc-100 transition-colors">
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
              <div className="max-w-4xl mx-auto text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="mb-12"
                >
                  <div className="w-20 h-20 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <BarChart3 className="w-10 h-10 text-primary" />
                  </div>
                  <h1 className="text-5xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-foreground to-muted-foreground">
                    DataVista Dashboard
                  </h1>
                  <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                    Transform your data into beautiful, interactive visualizations with professional-grade analytics tools
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
                >
                  <div className="glass p-6 rounded-xl text-center hover:shadow-md transition-all duration-300">
                    <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Import Data</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload CSV, TSV, or XLSX files to get started
                    </p>
                  </div>

                  <div className="glass p-6 rounded-xl text-center hover:shadow-md transition-all duration-300">
                    <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Smart Filtering</h3>
                    <p className="text-sm text-muted-foreground">
                      Advanced filters with real-time data grouping
                    </p>
                  </div>

                  <div className="glass p-6 rounded-xl text-center hover:shadow-md transition-all duration-300">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">8 Chart Types</h3>
                    <p className="text-sm text-muted-foreground">
                      Create stunning visualizations with our chart library
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                  className="flex flex-col sm:flex-row gap-4 justify-center"
                >
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      data-testid="sample-data-button"
                      onClick={loadSampleData} 
                      variant="premium" 
                      size="lg"
                      className="text-lg px-8"
                    >
                      Try with Sample Data ✨
                    </Button>
                  </motion.div>
                  
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      onClick={() => setActiveView('upload')} 
                      variant="outline" 
                      size="lg"
                      className="text-lg px-8"
                    >
                      Upload Your Data
                    </Button>
                  </motion.div>
                </motion.div>
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
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-center mb-8"
            >
              <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">
                Welcome to DataVista
              </h1>
              <p className="text-xl text-zinc-500 dark:text-zinc-400 mb-6">
                Upload your data and create stunning visualizations
              </p>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button onClick={loadSampleData} variant="outline" className="mb-6">
                  Try with Sample Data
                </Button>
              </motion.div>
            </motion.div>
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
              className="flex items-center justify-between"
            >
              <h2 className="text-h1">Data Filters</h2>
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
              className="flex items-center justify-between"
            >
              <h2 className="text-h1">Chart Builder</h2>
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
                      <h3 className="text-h2 mb-4">Your Charts</h3>
                      <ChartGrid />
                    </div>
                  </>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12"
                  >
                    <p className="text-muted-foreground">
                      No data matches your current filters. Please adjust your filters.
                    </p>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button 
                        variant="outline" 
                        onClick={() => setActiveView('filters')}
                        className="mt-4"
                      >
                        Adjust Filters
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <p className="text-muted-foreground">
                  Please upload a dataset first to start creating charts
                </p>
              </motion.div>
            )}
          </motion.div>
        )}

        {!isLoading && activeView === 'data' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-h1">Data Explorer</h2>
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
            <div className="flex items-center justify-between">
              <h2 className="text-h1">Pivot Analyzer</h2>
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
            <div className="flex items-center justify-between">
              <h2 className="text-h1">Statistical Summary</h2>
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
            <div className="flex items-center justify-between">
              <h2 className="text-h1">Window & Ranking Builder</h2>
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
    </div>
  );
}