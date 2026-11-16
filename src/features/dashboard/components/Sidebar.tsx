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
import { CountBadge } from "@/shared/components/surface";
import { Logo } from "@/shared/brand/Logo";
import { Hint } from "@/shared/components/Hint";
import { Sparkles, ShieldCheck, Palette } from "lucide-react";
import { datasetRowCount } from "@/shared/services/datasetRows";
import { countOf } from "@/shared/utils/plural";

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
  const openAppearance = useUiStore((state) => state.setIsAppearanceOpen);
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

  // Search and Appearance live in the top header on large screens (MainContent); on phones the
  // header is this sidebar's compact row, so Appearance is in the menu here.
  const tools = [
    { label: "Co-Pilot", hint: "Ask the AI Co-Pilot about your data (settings inside)", icon: Sparkles, onClick: () => onOpenAiCoPilot?.(), tour: "header-copilot", testId: undefined, mobileOnly: false },
    { label: "Privacy", hint: "Data & privacy (clear all local data)", icon: ShieldCheck, onClick: () => openPrivacy(true), tour: undefined, testId: "open-privacy", mobileOnly: false },
    { label: "Tour", hint: "Restart the onboarding tour", icon: HelpCircle, onClick: () => {
      // On phones the open menu would push every view below the fold under the tour's sheet.
      setIsMobileOpen(false);
      resetTour();
    }, tour: "header-tutorial", testId: "restart-tour", mobileOnly: false },
    { label: "Appearance", hint: "Theme, transparency, animation, text size, contrast", icon: Palette, onClick: () => openAppearance(true), tour: "appearance", testId: "open-appearance-mobile", mobileOnly: true },
  ];

  const activeNavLabel = navItems.find((item) => item.id === activeView)?.label ?? "Menu";

  return (
    <div
      ref={sidebarRef}
      data-testid="sidebar"
      className={cn(
        // Frame glass. Phones: a sticky top bar; while its menu is open it scrolls with the page
        // and pushes the view down, so the view stays reachable below it. Large screens: a sticky
        // full-height column that scrolls on its own.
        "surface-glass top-0 z-40 w-full shrink-0 rounded-none border-x-0 border-t-0 text-sidebar-foreground flex flex-col",
        isMobileOpen ? "relative lg:sticky" : "sticky",
        "lg:h-screen lg:overflow-y-auto lg:w-72 lg:border-b-0 lg:border-r"
      )}
    >
      {/* Header. Phones: one compact row (brand, search, menu) so data is on the first
          screen; the tools, search and sections live in the menu. Large screens: the brand,
          then the always-open menu below it. */}
      <div className="px-4 py-3 lg:px-5 lg:pt-5 lg:pb-4">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <div className="flex-1 min-w-0">
            <h1 className="text-h2 font-semibold leading-none text-foreground">DataVista</h1>
          </div>

          <Hint label="Global search: charts, datasets and views">
            <Button variant="outline" size="icon" className="lg:hidden h-11 w-11 shrink-0" onClick={() => onOpenSearch?.()}>
              <Search className="h-5 w-5" />
            </Button>
          </Hint>

          {/* Mobile section menu toggle: visible text label (touch has no hover tooltips),
              showing the current section so a selection is visibly confirmed. */}
          <Button
            variant="outline"
            className="lg:hidden h-11 px-3 gap-2 max-w-[55%]"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-expanded={isMobileOpen}
            aria-controls="sidebar-mobile-menu"
            data-testid="mobile-menu-toggle"
          >
            {isMobileOpen ? <X className="h-4 w-4 shrink-0" /> : <Menu className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{isMobileOpen ? "Close" : "Menu"}</span>
            <span className="text-sm text-frame-muted truncate" data-testid="mobile-menu-current">
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
        <div className="px-3 pt-2 lg:px-4 lg:pt-0">
          <div className="grid grid-cols-3 gap-1">
            {tools.map((tool) => (
              <Hint key={tool.label} label={tool.hint}>
                <Button
                  variant="ghost"
                  className={cn(
                    "h-auto flex-col gap-1 px-1 py-2 text-xs text-frame-muted hover:text-foreground",
                    tool.mobileOnly && "col-span-3 h-11 flex-row justify-start gap-2 px-2 text-sm lg:hidden"
                  )}
                  onClick={tool.onClick}
                  data-tour={tool.tour}
                  data-testid={tool.testId}
                >
                  <tool.icon className="h-5 w-5 shrink-0 text-primary-ink" />
                  <span className="max-w-full truncate">{tool.label}</span>
                </Button>
              </Hint>
            ))}
          </div>
        </div>

        <div className="px-3 py-3 lg:px-4">
        <nav className="space-y-0.5" aria-label="Sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <Button
                key={item.id}
                data-testid={`sidebar-nav-${item.id}`}
                variant="ghost"
                className={cn(
                  "relative w-full justify-start h-auto gap-3 py-2 pl-3 pr-3 whitespace-normal",
                  // Active: accent fill, a bar on the left and the accent icon (not colour alone).
                  isActive && "bg-accent before:absolute before:left-0 before:inset-y-2 before:w-[3px] before:rounded-full before:bg-primary-ink"
                )}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  onViewChange(item.id);
                  setIsMobileOpen(false);
                }}
              >
                <Icon className={cn("w-[1.125rem] h-[1.125rem] flex-shrink-0", isActive ? "text-primary-ink" : "text-frame-muted")} />
                <div className="text-left flex-1 min-w-0">
                  <div className={cn("text-sm", isActive ? "font-semibold" : "font-medium")}>{item.label}</div>
                  <div className="text-xs text-frame-muted">{item.description}</div>
                </div>
              </Button>
            );
          })}
        </nav>
      </div>

      <Separator className="bg-sidebar-border" />

      <div className="px-4 py-3 flex flex-col h-[13rem] border-b border-sidebar-border" data-tour="nav-datasets">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-frame-muted" aria-hidden />
          <h2 className="text-xs font-semibold text-frame-muted">Datasets</h2>
          <CountBadge className="ml-auto" label={countOf(datasets.length, "dataset")}>
            {datasets.length}
          </CountBadge>
        </div>
        
        <ScrollArea className="flex-1 min-h-0">
          {datasets.length === 0 ? (
            <div className="text-center py-4">
              <FileText className="w-6 h-6 mx-auto text-frame-muted mb-2" aria-hidden />
              <p className="text-sm text-frame-muted">No datasets yet</p>
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              {datasets.map((dataset, index) => (
                <div 
                  key={index}
                  className={cn(
                    "flex items-center gap-1 rounded-md group pr-1 transition-colors w-full",
                    activeDataset === dataset && !activeDashboardId ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start text-left h-auto px-2.5 py-2 bg-transparent hover:bg-transparent overflow-hidden"
                    onClick={() => handleDatasetSelect(dataset)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{dataset.name}</div>
                      <div className="text-xs text-frame-muted tabular-nums">
                        {countOf(datasetRowCount(dataset), "row")}, {countOf(dataset.columns.length, "column")}
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

      <div className="px-4 py-3 flex flex-col h-[13rem]" data-tour="nav-dashboards">
        <div className="flex items-center gap-2 mb-2">
          <LayoutDashboard className="w-4 h-4 text-frame-muted" aria-hidden />
          <h2 className="text-xs font-semibold text-frame-muted">Dashboards</h2>
          <CountBadge className="ml-auto" label={`${dashboards.length} dashboards`}>
            {dashboards.length}
          </CountBadge>
          <Hint label="Create dashboard from template">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setIsInstantiateModalOpen(true)}
            >
              <LayoutTemplate className="h-4 w-4" />
            </Button>
          </Hint>

          <Hint label="Create new blank dashboard">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
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
              <LayoutDashboard className="w-6 h-6 mx-auto text-frame-muted mb-2" aria-hidden />
              <p className="text-sm text-frame-muted">No dashboards yet</p>
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              {dashboards.map((dash) => (
                <div 
                  key={dash.id}
                  className={cn(
                    "flex items-center gap-1 rounded-md group pr-1 transition-colors w-full",
                    activeDashboardId === dash.id ? "bg-accent" : "hover:bg-accent/60"
                  )}
                >
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start text-left h-auto px-2.5 py-2 bg-transparent hover:bg-transparent overflow-hidden"
                    onClick={() => handleDashboardSelect(dash.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{dash.name}</div>
                      <div className="text-xs text-frame-muted tabular-nums">
                        {countOf(dash.chartIds.length, "chart")}
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
    </div>
  );
}