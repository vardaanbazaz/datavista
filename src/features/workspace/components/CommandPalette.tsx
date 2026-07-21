import { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
  Search,
  LayoutDashboard,
  Database,
  Columns,
  LayoutTemplate,
  Bookmark,
  Terminal,
  Sparkles,
  Sun,
  RotateCcw,
  RotateCw,
  Camera,
  FileDown,
  FilterX,
  BarChart3,
  TrendingUp,
  Table as TableIcon,
  Calculator,
  ChevronRight,
} from "lucide-react";

import { searchEngine, SearchResultItem } from "@/shared/services/searchEngine";
import { useCommandRegistry } from "@/shared/services/commandRegistry";
import { CommandDefinition } from "@/shared/types/commands";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplateModal?: () => void;
}

type UnifiedItem =
  | { itemType: "command"; data: CommandDefinition }
  | { itemType: "searchResult"; data: SearchResultItem };

export function CommandPalette({
  isOpen,
  onClose,
  onOpenTemplateModal,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useCommandRegistry((state) => Object.values(state.commands));
  const setActiveView = useUiStore((state) => state.setActiveView);
  const datasets = useDatasetStore((state) => state.datasets);
  const selectDataset = useDatasetStore((state) => state.selectDataset);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const enabledCmds = commands.filter((cmd) => !cmd.isEnabled || cmd.isEnabled());

    if (!trimmed) return enabledCmds;

    return enabledCmds.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(trimmed) ||
        (cmd.description && cmd.description.toLowerCase().includes(trimmed)) ||
        cmd.category.toLowerCase().includes(trimmed)
    );
  }, [commands, query]);

  // Filter metadata search results by query
  const searchResults = useMemo(() => {
    return searchEngine.search(query);
  }, [query]);

  // Unified items list for keyboard arrow selection
  const flatUnifiedItems = useMemo<UnifiedItem[]>(() => {
    const list: UnifiedItem[] = [];

    // Add matching commands first
    filteredCommands.forEach((cmd) => {
      list.push({ itemType: "command", data: cmd });
    });

    // Add metadata search results
    const metaList = [
      ...searchResults.dashboards,
      ...searchResults.datasets,
      ...searchResults.columns,
      ...searchResults.templates,
      ...searchResults.views,
    ];

    metaList.forEach((res) => {
      list.push({ itemType: "searchResult", data: res });
    });

    return list;
  }, [filteredCommands, searchResults]);

  // Keep selectedIndex in range
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleExecuteCommand = (cmd: CommandDefinition) => {
    onClose();
    cmd.execute();
  };

  const handleSelectSearchResult = (item: SearchResultItem) => {
    onClose();
    switch (item.type) {
      case "dashboard":
        if (item.dashboardId) {
          loadDashboard(item.dashboardId);
          setActiveView("overview");
        }
        break;

      case "dataset":
      case "column":
        if (item.datasetId) {
          const ds = datasets.find((d) => d.id === item.datasetId);
          if (ds) {
            useDashboardStore.setState({ activeDashboardId: null });
            selectDataset(ds);
            setActiveView("data");
          }
        }
        break;

      case "template":
        if (onOpenTemplateModal) {
          onOpenTemplateModal();
        }
        break;

      case "view":
        if (item.dashboardId && item.savedView) {
          loadDashboard(item.dashboardId);
          useDashboardStore.setState({
            activeGlobalFilters: item.savedView.globalFilters || [],
          });
          setActiveView("overview");
        }
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        flatUnifiedItems.length === 0 ? 0 : (prev + 1) % flatUnifiedItems.length
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        flatUnifiedItems.length === 0
          ? 0
          : (prev - 1 + flatUnifiedItems.length) % flatUnifiedItems.length
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatUnifiedItems[selectedIndex];
      if (target) {
        if (target.itemType === "command") {
          handleExecuteCommand(target.data);
        } else {
          handleSelectSearchResult(target.data);
        }
      }
    }
  };

  const renderCommandIcon = (iconName?: string) => {
    switch (iconName) {
      case "Sun":
        return <Sun className="h-4 w-4 text-amber-500" />;
      case "RotateCcw":
        return <RotateCcw className="h-4 w-4 text-primary" />;
      case "RotateCw":
        return <RotateCw className="h-4 w-4 text-primary" />;
      case "Camera":
        return <Camera className="h-4 w-4 text-purple-500" />;
      case "FileDown":
        return <FileDown className="h-4 w-4 text-green-500" />;
      case "FilterX":
        return <FilterX className="h-4 w-4 text-destructive" />;
      case "BarChart3":
        return <BarChart3 className="h-4 w-4 text-blue-500" />;
      case "TrendingUp":
        return <TrendingUp className="h-4 w-4 text-indigo-500" />;
      case "Table":
        return <TableIcon className="h-4 w-4 text-cyan-500" />;
      case "Calculator":
        return <Calculator className="h-4 w-4 text-emerald-500" />;
      case "Database":
        return <Database className="h-4 w-4 text-sky-500" />;
      default:
        return <Terminal className="h-4 w-4 text-primary" />;
    }
  };

  let globalItemCounter = 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden glass border-border shadow-2xl gap-0">
        <DialogHeader className="p-4 pb-2 border-b border-border/40">
          <DialogTitle className="sr-only">Command Palette</DialogTitle>
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Type a command or search datasets, dashboards, columns... (⌘K)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9 pr-4 h-11 bg-muted/20 border-border/50 text-sm focus-visible:ring-primary"
            />
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[460px] p-3">
          {flatUnifiedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium">No commands or metadata found</p>
              <p className="text-xs text-muted-foreground/70">
                Try searching for "theme", "pdf", "undo", or column names.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Registered Executable Commands Section */}
              {filteredCommands.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-primary" /> Workspace Commands ({filteredCommands.length})
                  </div>
                  {filteredCommands.map((cmd) => {
                    const currentIndex = globalItemCounter++;
                    const isSelected = selectedIndex === currentIndex;

                    return (
                      <div
                        key={cmd.id}
                        onClick={() => handleExecuteCommand(cmd)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/40 font-medium"
                            : "hover:bg-accent/10 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded-md bg-muted/40 shrink-0">
                            {renderCommandIcon(cmd.icon)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate">{cmd.label}</span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                                {cmd.category}
                              </Badge>
                            </div>
                            {cmd.description && (
                              <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Keyboard Shortcut Badges */}
                        {cmd.shortcut && cmd.shortcut.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {cmd.shortcut.map((sc, idx) => (
                              <kbd
                                key={idx}
                                className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-muted border border-border/80 rounded shadow-xs text-muted-foreground"
                              >
                                {sc}
                              </kbd>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dashboards Search Results */}
              {searchResults.dashboards.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <LayoutDashboard className="h-3.5 w-3.5 text-primary" /> Dashboards ({searchResults.dashboards.length})
                  </div>
                  {searchResults.dashboards.map((item) => {
                    const currentIndex = globalItemCounter++;
                    const isSelected = selectedIndex === currentIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSearchResult(item)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/40 font-medium"
                            : "hover:bg-accent/10 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <LayoutDashboard className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Datasets Search Results */}
              {searchResults.datasets.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-primary" /> Datasets ({searchResults.datasets.length})
                  </div>
                  {searchResults.datasets.map((item) => {
                    const currentIndex = globalItemCounter++;
                    const isSelected = selectedIndex === currentIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSearchResult(item)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/40 font-medium"
                            : "hover:bg-accent/10 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Database className="h-4 w-4 text-sky-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Columns Search Results */}
              {searchResults.columns.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Columns className="h-3.5 w-3.5 text-primary" /> Columns ({searchResults.columns.length})
                  </div>
                  {searchResults.columns.map((item) => {
                    const currentIndex = globalItemCounter++;
                    const isSelected = selectedIndex === currentIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSearchResult(item)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/40 font-medium"
                            : "hover:bg-accent/10 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Columns className="h-4 w-4 text-indigo-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Templates Search Results */}
              {searchResults.templates.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <LayoutTemplate className="h-3.5 w-3.5 text-primary" /> Templates ({searchResults.templates.length})
                  </div>
                  {searchResults.templates.map((item) => {
                    const currentIndex = globalItemCounter++;
                    const isSelected = selectedIndex === currentIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSearchResult(item)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/40 font-medium"
                            : "hover:bg-accent/10 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <LayoutTemplate className="h-4 w-4 text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Saved Views Search Results */}
              {searchResults.views.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5 text-primary" /> Saved Views ({searchResults.views.length})
                  </div>
                  {searchResults.views.map((item) => {
                    const currentIndex = globalItemCounter++;
                    const isSelected = selectedIndex === currentIndex;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSearchResult(item)}
                        className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "bg-primary/15 border border-primary/40 font-medium"
                            : "hover:bg-accent/10 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Bookmark className="h-4 w-4 text-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
