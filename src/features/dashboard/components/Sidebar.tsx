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
  Search
} from "lucide-react";
import { Dataset } from "@/shared/types";
import { useUiStore, ViewType } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { InstantiateTemplateModal } from "@/features/dashboards/components/InstantiateTemplateModal";
import { ThemeToggle } from "@/shared/components/ThemeToggle";
import { motion } from "framer-motion";

export function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const activeView = useUiStore((state) => state.activeView);
  const onViewChange = useUiStore((state) => state.setActiveView);
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
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full lg:w-80 glass border-b lg:border-b-0 lg:border-r flex flex-col shrink-0"
    >
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold gradient-primary bg-clip-text text-transparent">
              DataVista
            </h1>
            <p className="text-sm text-muted-foreground">Data Visualization</p>
          </div>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden ml-2 h-9 w-9"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            title="Toggle Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        
        <Button
          variant="outline"
          className="w-full mt-4 justify-between h-9 px-3 text-muted-foreground hover:text-foreground text-xs glass border-border/60"
          onClick={() => onOpenSearch?.()}
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-primary" />
            <span>Global Search...</span>
          </div>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </Button>
      </div>

      <div className={cn("flex-col flex-1", isMobileOpen ? "flex" : "hidden lg:flex")}>
        <div className="p-4">
        <nav className="space-y-2">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            
            return (
              <motion.div
                key={item.id}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
              >
                <Button
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

      <div className="p-4 flex flex-col h-[200px] border-b">
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
                    activeDataset === dataset && !activeDashboardId ? "bg-secondary" : "hover:bg-muted/50"
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

      <div className="p-4 flex flex-col h-[200px]">
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="w-4 h-4" />
          <span className="font-medium">Dashboards</span>
          <Badge variant="secondary" className="ml-auto">
            {dashboards.length}
          </Badge>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 hover:bg-muted"
            onClick={() => setIsInstantiateModalOpen(true)}
            title="Create from Template"
          >
            <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 hover:bg-muted"
            onClick={handleCreateDashboard}
            title="Create New Blank Dashboard"
          >
            <Plus className="h-4 w-4" />
          </Button>

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
                    activeDashboardId === dash.id ? "bg-secondary" : "hover:bg-muted/50"
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