import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { Badge } from "@/shared/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/shared/components/ui/dropdown-menu";
import { 
  Upload, 
  BarChart3, 
  Table, 
  Database,
  TrendingUp,
  FileText,
  Filter,
  Download,
  MoreVertical,
  Edit,
  Trash,
  Plus,
  LayoutDashboard,
  Menu,
  Grid,
  Sigma,
  Columns,
  LayoutTemplate,
  Search,
  HelpCircle
} from "lucide-react";
import { Dataset } from "@/shared/types";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { InstantiateTemplateModal } from "@/features/dashboards/components/InstantiateTemplateModal";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function Sidebar({
  onOpenSearch,
  onOpenAiCoPilot,
}: {
  onOpenSearch?: () => void;
  onOpenAiCoPilot?: () => void;
}) {
  const activeView = useUiStore((state) => state.activeView);
  const onViewChange = useUiStore((state) => state.setActiveView);
  const resetTour = useUiStore((state) => state.resetTour);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isInstantiateModalOpen, setIsInstantiateModalOpen] = useState(false);

  const datasets = useDatasetStore((state) => state.datasets);
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const onDatasetSelect = useDatasetStore((state) => state.selectDataset);
  const onDatasetRename = useDatasetStore((state) => state.renameDataset);
  const onDatasetDelete = useDatasetStore((state) => state.deleteDataset);

  const dashboards = useDashboardStore((state) => state.dashboards);
  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId);
  const createDashboard = useDashboardStore((state) => state.createDashboard);
  const renameDashboard = useDashboardStore((state) => state.renameDashboard);
  const deleteDashboard = useDashboardStore((state) => state.deleteDashboard);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);
  const navItems = [
    {
      id: 'overview' as const,
      label: 'Overview',
      icon: TrendingUp,
      description: 'Dashboard summary & insights'
    },
    {
      id: 'upload' as const,
      label: 'Upload Data',
      icon: Upload,
      description: 'Import CSV, TSV, XLSX files'
    },
    {
      id: 'filters' as const,
      label: 'Filters',
      icon: Filter,
      description: 'Filter and group data'
    },
    {
      id: 'charts' as const,
      label: 'Charts',
      icon: BarChart3,
      description: 'Create visualizations'
    },
    {
      id: 'data' as const,
      label: 'Data Explorer',
      icon: Table,
      description: 'Browse and filter data'
    },
    {
      id: 'pivot' as const,
      label: 'Pivot Table',
      icon: Grid,
      description: 'Multidimensional analysis'
    },
    {
      id: 'stats' as const,
      label: 'Statistics',
      icon: Sigma,
      description: 'Descriptive & correlation stats'
    },
    {
      id: 'window-builder' as const,
      label: 'Window Functions',
      icon: Columns,
      description: 'SQL-style analytical windows'
    },
    {
      id: 'export' as const,
      label: 'Export',
      icon: Download,
      description: 'Export charts and data'
    }
  ];

  const handleRenamePrompt = (dataset: Dataset) => {
    setTimeout(() => {
      const newName = window.prompt(`Rename "${dataset.name}" to:`, dataset.name);
      if (newName && newName.trim() && newName.trim() !== dataset.name) {
        onDatasetRename?.(dataset.id, newName.trim());
      }
    }, 100);
  };

  const handleDeleteConfirm = (dataset: Dataset) => {
    setTimeout(() => {
      if (window.confirm(`Are you sure you want to delete dataset "${dataset.name}"? This will also remove any charts created from it.`)) {
        onDatasetDelete?.(dataset.id);
      }
    }, 100);
  };

  const handleCreateDashboard = () => {
    if (!activeDataset) {
      alert("Please select or upload a dataset first to create a dashboard.");
      return;
    }
    const name = window.prompt("Enter dashboard name:", "New Dashboard");
    if (name && name.trim()) {
      createDashboard(name.trim(), activeDataset.id);
    }
  };

  const handleDashboardRename = (id: string, currentName: string) => {
    setTimeout(() => {
      const newName = window.prompt(`Rename dashboard "${currentName}" to:`, currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        renameDashboard(id, newName.trim());
      }
    }, 100);
  };

  const handleDashboardDelete = (id: string, name: string) => {
    setTimeout(() => {
      if (window.confirm(`Are you sure you want to delete dashboard "${name}"? Charts will not be deleted.`)) {
        deleteDashboard(id);
      }
    }, 100);
  };

  const handleDatasetSelect = (dataset: Dataset) => {
    useDashboardStore.setState({ activeDashboardId: null });
    onDatasetSelect(dataset);
  };

  return (
    <motion.div 
      data-testid="sidebar"
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full lg:w-80 bg-white dark:bg-zinc-950 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-zinc-800 flex flex-col shrink-0 transition-colors"
    >
      <div className="p-6 border-b border-gray-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 bg-transparent">
          <div className="w-10 h-10 bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
          </div>
          <div className="flex-1 bg-transparent">
            <h1 className="text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 text-h2">
              DataVista
            </h1>
            <p className="text-body text-zinc-500 dark:text-zinc-400">Data Visualization</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900"
                onClick={() => onOpenAiCoPilot?.()}
                aria-label="Ask AI Co-Pilot"
                data-tour="header-copilot"
              >
                <Sparkles className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Ask AI Co-Pilot (settings available inside)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900"
                onClick={resetTour}
                aria-label="Restart Onboarding Tour"
                data-tour="header-tutorial"
              >
                <HelpCircle className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Restart Onboarding Tutorial</p>
            </TooltipContent>
          </Tooltip>

          <ThemeToggle data-tour="header-theme" />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden ml-2 h-9 w-9"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            title="Toggle Menu"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              data-tour="global-search"
              className="w-full mt-4 justify-between h-9 px-3 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 text-xs bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800"
              onClick={() => onOpenSearch?.()}
            >
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-zinc-400" />
                <span>Global Search...</span>
              </div>
              <kbd className="hidden sm:inline-block border border-gray-300 dark:border-zinc-700 bg-gray-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Search charts, datasets, and views (Cmd+K)</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className={cn("flex-col flex-1", isMobileOpen ? "flex" : "hidden lg:flex")}>
        <div className="p-4">
        <nav className="space-y-2">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const tourAttr = 
              item.id === 'overview' ? 'nav-dashboard' : 
              item.id === 'upload' ? 'nav-upload' : 
              item.id === 'filters' ? 'tool-filters' : 
              item.id === 'charts' ? 'nav-charts' : 
              item.id === 'data' ? 'dataset-grid' : 
              item.id === 'pivot' ? 'nav-pivot' : 
              item.id === 'stats' ? 'tool-statistics' : 
              item.id === 'window-builder' ? 'tool-window-functions' : 
              item.id === 'export' ? 'tool-export' : 
              undefined;
            
            return (
              <motion.div
                key={item.id}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
              >
                <Button
                  data-testid={`sidebar-nav-${item.id}`}
                  data-tour={tourAttr}
                  variant={isActive ? "premium" : "ghost"}
                  className="w-full justify-start h-auto p-4 transition-all duration-200"
                  onClick={() => onViewChange(item.id)}
                >
                  <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  <div className="text-left flex-1">
                    <div className="font-medium">{item.label}</div>
                    <div className={cn(
                      "text-xs opacity-80",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}>
                      {item.description}
                    </div>
                  </div>
                </Button>
              </motion.div>
            );
          })}
        </nav>
      </div>

      <Separator />

      <div className="p-4 flex flex-col h-[200px] border-b" data-tour="nav-datasets">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4" />
          <span className="font-medium">Datasets</span>
          <Badge variant="secondary" className="ml-auto">
            {datasets.length}
          </Badge>
        </div>
        
        <ScrollArea className="flex-1 min-h-0">
          {datasets.length === 0 ? (
            <div className="text-center py-4">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No datasets uploaded</p>
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              {datasets.map((dataset, index) => (
                <div 
                  key={index}
                  className={cn(
                    "flex items-center gap-1 rounded-md group pr-1 transition-colors w-full",
                    activeDataset === dataset && !activeDashboardId ? "bg-primary/15" : "hover:bg-muted/50"
                  )}
                >
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start text-left h-auto p-3 bg-transparent hover:bg-transparent overflow-hidden"
                    onClick={() => handleDatasetSelect(dataset)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{dataset.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {dataset.data.length} rows, {dataset.columns.length} columns
                      </div>
                    </div>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Dataset options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleRenamePrompt(dataset);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConfirm(dataset);
                        }}
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="p-4 flex flex-col h-[200px]" data-tour="nav-dashboards">
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="w-4 h-4" />
          <span className="font-medium">Dashboards</span>
          <Badge variant="secondary" className="ml-auto">
            {dashboards.length}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 hover:bg-muted"
                onClick={() => setIsInstantiateModalOpen(true)}
                aria-label="Create dashboard from template"
              >
                <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Create dashboard from pre-built templates</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 hover:bg-muted"
                onClick={handleCreateDashboard}
                aria-label="Create new blank dashboard"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Create a new blank dashboard</p>
            </TooltipContent>
          </Tooltip>

          <InstantiateTemplateModal
            isOpen={isInstantiateModalOpen}
            onClose={() => setIsInstantiateModalOpen(false)}
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {dashboards.length === 0 ? (
            <div className="text-center py-4">
              <LayoutDashboard className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No dashboards saved</p>
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              {dashboards.map((dash) => (
                <div 
                  key={dash.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md group pr-1 transition-colors w-full",
                    activeDashboardId === dash.id ? "bg-primary/15" : "hover:bg-muted/50"
                  )}
                >
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start text-left h-auto p-3 bg-transparent hover:bg-transparent overflow-hidden"
                    onClick={() => loadDashboard(dash.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{dash.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {dash.chartIds.length} charts
                      </div>
                    </div>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Dashboard options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleDashboardRename(dash.id, dash.name);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDashboardDelete(dash.id, dash.name);
                        }}
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      </div>
    </motion.div>
  );
}