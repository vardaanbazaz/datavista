import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
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
  HelpCircle,
  X
} from "lucide-react";
import { Dataset } from "@/shared/types";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { InstantiateTemplateModal } from "@/features/dashboards/components/InstantiateTemplateModal";
import { Seal } from "@/shared/components/ornament";
import { Hint } from "@/shared/components/Hint";
import { modKey, formatShortcut } from "@/shared/lib/platform";
import { motion } from "framer-motion";
import { Sparkles, ShieldCheck, BookOpen } from "lucide-react";
import { datasetRowCount } from "@/shared/services/datasetRows";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

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
  const openPrivacy = useUiStore((state) => state.setIsPrivacyOpen);
  const openReadingComfort = useUiStore((state) => state.setIsReadingComfortOpen);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isInstantiateModalOpen, setIsInstantiateModalOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

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

  // Mobile menu: close whenever the view changes, from the menu itself or from any other
  // source (command palette, keyboard shortcut, a button inside a view).
  useEffect(() => {
    setIsMobileOpen(false);
  }, [activeView]);

  // Mobile menu: close on Esc and on a tap/click outside the sidebar.
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileOpen(false);
    };
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || sidebarRef.current?.contains(target)) return;
      // Menus and dialogs opened from inside the sidebar render in portals outside it.
      if (target.closest("[data-radix-popper-content-wrapper], [role='dialog'], [role='menu']")) return;
      setIsMobileOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMobileOpen]);

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
    setIsMobileOpen(false);
  };

  const handleDashboardSelect = (id: string) => {
    loadDashboard(id);
    setIsMobileOpen(false);
  };

  const tools = [
    { label: "Co-Pilot", hint: "Ask the AI Co-Pilot about your data (settings inside)", icon: Sparkles, onClick: () => onOpenAiCoPilot?.(), tour: "header-copilot", testId: undefined, wide: false },
    { label: "Privacy", hint: "Data & privacy (clear all local data)", icon: ShieldCheck, onClick: () => openPrivacy(true), tour: undefined, testId: "open-privacy", wide: false },
    { label: "Tour", hint: "Restart the onboarding tour", icon: HelpCircle, onClick: resetTour, tour: "header-tutorial", testId: undefined, wide: false },
    // Reading comfort holds the theme too (Alt+T still toggles light/dark); the tour's
    // "header-theme" step points here.
    { label: "Reading comfort", hint: "Reading comfort and theme (text size, contrast, motion)", icon: BookOpen, onClick: () => openReadingComfort(true), tour: "header-theme", testId: "open-reading-comfort", wide: true },
  ];

  const activeNavLabel = navItems.find((item) => item.id === activeView)?.label ?? "Menu";

  return (
    <motion.div 
      ref={sidebarRef}
      data-testid="sidebar"
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="sidebar-frame w-full lg:w-80 bg-sidebar text-sidebar-foreground border-b lg:border-b-0 lg:border-r border-sidebar-border flex flex-col shrink-0 transition-colors"
    >
      {/* Header. Phones: one compact row (brand, search, menu) so data is on the first
          screen; the tools, search and sections live in the menu. Large screens: the brand,
          then the always-open menu below it. */}
      <div className="px-4 py-3 lg:p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {/* Emblem: the mark in a gilt ring, like a library stamp. */}
          <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-full border border-ornament/70 ring-1 ring-ornament/30 ring-offset-2 ring-offset-sidebar flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-tertiary" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-h2 lg:text-h1 leading-none text-foreground">DataVista</h1>
            <p className="catalogue-label mt-1 hidden lg:block text-muted-foreground">Data Visualization</p>
          </div>

          <Hint label="Global search: charts, datasets and views">
            <Button variant="plate" size="icon" className="lg:hidden h-11 w-11 shrink-0" onClick={() => onOpenSearch?.()}>
              <Search className="h-5 w-5" />
            </Button>
          </Hint>

          {/* Mobile section menu toggle: visible text label (touch has no hover tooltips),
              showing the current section so a selection is visibly confirmed. */}
          <Button
            variant="plate"
            className="lg:hidden h-11 px-3 gap-2 max-w-[55%]"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-expanded={isMobileOpen}
            aria-controls="sidebar-mobile-menu"
            data-testid="mobile-menu-toggle"
          >
            {isMobileOpen ? <X className="h-4 w-4 shrink-0" /> : <Menu className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{isMobileOpen ? "Close" : "Menu"}</span>
            <span className="text-sm text-muted-foreground truncate" data-testid="mobile-menu-current">
              {activeNavLabel}
            </span>
          </Button>
        </div>
      </div>

      <div
        id="sidebar-mobile-menu"
        data-testid="sidebar-menu"
        className={cn("flex-col flex-1", isMobileOpen ? "flex" : "hidden lg:flex")}
      >
        {/* Tools with visible names (older users, touch screens); the tooltip says more. */}
        <div className="px-4 pt-4 lg:px-6 lg:pt-0 lg:-mt-px">
          <div className="grid grid-cols-3 gap-1">
            {tools.map((tool) => (
              <Hint key={tool.label} label={tool.hint}>
                <Button
                  variant="ghost"
                  className={cn(
                    "text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                    // Three short tools side by side (icon over its name); Reading comfort gets a full row.
                    tool.wide ? "col-span-3 h-11 justify-start gap-2 px-2" : "h-auto flex-col gap-1 px-1 py-2"
                  )}
                  onClick={tool.onClick}
                  data-tour={tool.tour}
                  data-testid={tool.testId}
                >
                  <tool.icon className="h-5 w-5 shrink-0 text-ornament" />
                  <span className="max-w-full truncate">{tool.label}</span>
                </Button>
              </Hint>
            ))}
          </div>

          {/* The name starts with the visible text (WCAG 2.5.3). The shortcut badge is CSS generated
              content, so it isn't part of the label; the tooltip and name still give it. */}
          <Hint label="Global search: charts, datasets and views" shortcut={[modKey, "K"]}>
            <Button
              variant="outline"
              data-tour="global-search"
              className="hidden lg:flex w-full mt-3 justify-between h-10 px-3 text-muted-foreground hover:text-foreground text-sm bg-background border border-borderStrong"
              onClick={() => onOpenSearch?.()}
            >
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                <span>Global search</span>
              </div>
              <kbd aria-hidden="true" data-keys={formatShortcut([modKey, "K"])} className="inline-block border border-border bg-muted text-muted-foreground text-xs rounded px-1.5 py-0.5 font-mono after:content-[attr(data-keys)]" />
            </Button>
          </Hint>
        </div>

        <div className="p-4">
        <nav className="space-y-1" aria-label="Sections">
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
                  variant={isActive ? "engraved" : "ghost"}
                  className={cn(
                    "relative w-full justify-start h-auto py-3 pl-3 pr-4 whitespace-normal transition-all duration-200",
                    // Active: oxblood plate with a gilt bar on the left (not colour alone).
                    isActive && "before:absolute before:left-0 before:inset-y-2 before:w-1 before:rounded-r before:bg-tertiary"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    onViewChange(item.id);
                    setIsMobileOpen(false);
                  }}
                >
                  <span
                    className={cn("w-7 shrink-0 text-right font-display text-lg leading-none", isActive ? "text-primary-foreground" : "text-tertiary")}
                    aria-hidden
                  >
                    {ROMAN[index]}
                  </span>
                  <Icon className="w-5 h-5 mx-2 flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-semibold text-base">{item.label}</div>
                    <div className={cn(
                      "text-sm",
                      isActive ? "text-primary-foreground/90" : "text-muted-foreground"
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

      <Separator className="bg-sidebar-border" />

      <div className="p-4 flex flex-col h-[13rem] border-b border-sidebar-border" data-tour="nav-datasets">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-ornament" aria-hidden />
          <h2 className="catalogue-label text-muted-foreground">Datasets</h2>
          <Seal className="ml-auto" label={`${datasets.length} datasets`}>
            {datasets.length}
          </Seal>
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
                        {datasetRowCount(dataset).toLocaleString()} rows, {dataset.columns.length} columns
                      </div>
                    </div>
                  </Button>

                  <DropdownMenu>
                    <Hint label="Dataset options (rename, delete)">
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </Hint>
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

      <div className="p-4 flex flex-col h-[13rem]" data-tour="nav-dashboards">
        <div className="flex items-center gap-2 mb-3">
          <LayoutDashboard className="w-4 h-4 text-ornament" aria-hidden />
          <h2 className="catalogue-label text-muted-foreground">Dashboards</h2>
          <Seal className="ml-auto" label={`${dashboards.length} dashboards`}>
            {dashboards.length}
          </Seal>
          <Hint label="Create dashboard from template">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:bg-muted"
              onClick={() => setIsInstantiateModalOpen(true)}
            >
              <LayoutTemplate className="h-4 w-4 text-tertiary" />
            </Button>
          </Hint>

          <Hint label="Create new blank dashboard">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:bg-muted"
              onClick={handleCreateDashboard}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </Hint>

          <InstantiateTemplateModal
            isOpen={isInstantiateModalOpen}
            onClose={() => setIsInstantiateModalOpen(false)}
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {dashboards.length === 0 ? (
            <div className="text-center py-4">
              <LayoutDashboard className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No dashboards saved</p>
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
                    onClick={() => handleDashboardSelect(dash.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{dash.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {dash.chartIds.length} charts
                      </div>
                    </div>
                  </Button>

                  <DropdownMenu>
                    <Hint label="Dashboard options (rename, delete)">
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </Hint>
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