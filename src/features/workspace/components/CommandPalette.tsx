import { useState, useMemo, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
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
  Loader2,
  AlertTriangle,
  Settings,
} from "lucide-react";

import { searchEngine, SearchResultItem } from "@/shared/services/searchEngine";
import { useCommandRegistry } from "@/shared/services/commandRegistry";
import { CommandDefinition } from "@/shared/types/commands";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { aiEngine } from "@/features/ai/aiEngine";
import { AiSettingsModal } from "@/features/ai/components/AiSettingsModal";
import { AIResponse } from "@/features/ai/types";
import { QueryResult } from "@/shared/types";
import { toast } from "@/shared/hooks/use-toast";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplateModal?: () => void;
}

type UnifiedItem =
  | { itemType: "ai"; prompt: string }
  | { itemType: "command"; data: CommandDefinition }
  | { itemType: "searchResult"; data: SearchResultItem };

export function CommandPalette({
  isOpen,
  onClose,
  onOpenTemplateModal,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAiExecuting, setIsAiExecuting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Generated-but-unreviewed AI query result, awaiting an explicit Apply/Discard before
  // it's allowed to touch filterStore/chartStore.
  const [aiPreview, setAiPreview] = useState<{
    prompt: string;
    response: AIResponse;
    queryResult: QueryResult;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const commandMap = useCommandRegistry((state) => state.commands);
  const commands = useMemo(() => Object.values(commandMap), [commandMap]);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const datasets = useDatasetStore((state) => state.datasets);
  const selectDataset = useDatasetStore((state) => state.selectDataset);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setAiError(null);
      setIsAiExecuting(false);
      setAiPreview(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const isAiMode = query.startsWith("/ai");
  const aiPromptText = isAiMode ? query.substring(3).trim() : query.trim();

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (isAiMode) return [];
    const trimmed = query.trim().toLowerCase();
    const enabledCmds = commands.filter((cmd) => !cmd.isEnabled || cmd.isEnabled());

    if (!trimmed) return enabledCmds;

    return enabledCmds.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(trimmed) ||
        (cmd.description && cmd.description.toLowerCase().includes(trimmed)) ||
        cmd.category.toLowerCase().includes(trimmed)
    );
  }, [commands, query, isAiMode]);

  // Filter metadata search results by query
  const searchResults = useMemo(() => {
    if (isAiMode) return { dashboards: [], datasets: [], columns: [], templates: [], views: [] };
    return searchEngine.search(query);
  }, [query, isAiMode]);

  // Unified items list for keyboard arrow selection
  const flatUnifiedItems = useMemo<UnifiedItem[]>(() => {
    const list: UnifiedItem[] = [];

    // Always offer AI prompt if query is non-empty
    if (query.trim().length > 0) {
      list.push({ itemType: "ai", prompt: aiPromptText || "Ask AI Co-Pilot..." });
    }

    if (!isAiMode) {
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
    }

    return list;
  }, [filteredCommands, searchResults, query, isAiMode, aiPromptText]);

  // Keep selectedIndex in range
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleRunAiQuery = async (promptText: string) => {
    if (!promptText || promptText === "Ask AI Co-Pilot...") return;

    if (!activeDataset) {
      setAiError("Please select or upload a dataset first.");
      return;
    }

    setIsAiExecuting(true);
    setAiError(null);

    try {
      const { response, queryResult } = await aiEngine.generateAIQueryPreview(promptText, activeDataset);
      setIsAiExecuting(false);
      // Land in a reviewable preview instead of applying immediately — nothing has
      // touched filterStore/chartStore yet.
      setAiPreview({ prompt: promptText, response, queryResult });
    } catch (e: unknown) {
      setIsAiExecuting(false);
      const errMsg = e instanceof Error ? e.message : "AI generated an invalid query. Please rephrase.";
      setAiError(errMsg);
      toast({
        title: "AI Error",
        description: errMsg,
        variant: "destructive",
      });
    }
  };

  const handleApplyAiPreview = () => {
    if (!aiPreview || !activeDataset) return;

    aiEngine.applyAIQueryResult(aiPreview.prompt, aiPreview.response, aiPreview.queryResult, activeDataset);

    toast({
      title: aiPreview.response.title || "AI Query Applied",
      description: `${aiPreview.response.explanation || "Query applied successfully."} (${aiPreview.queryResult.rows.length} rows returned)`,
    });

    setAiPreview(null);
    onClose();
    setActiveView("overview");
  };

  const handleDiscardAiPreview = () => {
    setAiPreview(null);
  };

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
    if (aiPreview) {
      // Input is disabled while a preview is pending — Enter applies it. Escape falls
      // through to the Dialog's default close behavior, which is fine here: nothing
      // has been applied to filterStore/chartStore yet, so closing without clicking
      // Apply is equivalent to Discard.
      if (e.key === "Enter") {
        e.preventDefault();
        handleApplyAiPreview();
      }
      return;
    }

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
        if (target.itemType === "ai") {
          handleRunAiQuery(aiPromptText);
        } else if (target.itemType === "command") {
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
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 shadow-2xl gap-0 text-zinc-900 dark:text-zinc-100">
          <DialogHeader className="p-4 pb-2 border-b border-gray-200 dark:border-zinc-800 flex flex-row items-center justify-between">
            <DialogTitle className="sr-only">Command Palette</DialogTitle>
            <div className="relative flex-1 flex items-center pr-2">
              <Search className="absolute left-3 h-4 w-4 text-zinc-400" />
              <Input
                ref={inputRef}
                placeholder="Type '/ai ...' for AI Co-Pilot, or search commands, datasets..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAiExecuting || !!aiPreview}
                className="pl-9 pr-36 h-11 bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus-visible:ring-primary"
              />
              <div className="absolute right-3 flex items-center gap-1.5">
                <kbd className="hidden sm:inline-block border border-gray-300 dark:border-zinc-700 bg-gray-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 gap-1 text-zinc-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-800"
                  onClick={() => setQuery("/ai ")}
                >
                  <Sparkles className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-300" /> /ai
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  onClick={() => setIsSettingsOpen(true)}
                  title="AI Co-Pilot Settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {aiError && (
            <div className="p-3 bg-destructive/10 border-b border-destructive/20 text-destructive flex items-center gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="flex-1">{aiError}</span>
            </div>
          )}

          {isAiExecuting && (
            <div className="p-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm font-semibold gradient-primary bg-clip-text text-transparent">
                Translating natural language with AI Co-Pilot...
              </p>
              <p className="text-xs text-muted-foreground">Generating AST-compatible query JSON</p>
            </div>
          )}

          {!isAiExecuting && aiPreview && (
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-semibold text-foreground truncate">
                    {aiPreview.response.title || "AI Query Result"}
                  </p>
                </div>
                {aiPreview.response.explanation && (
                  <p className="text-xs text-muted-foreground">{aiPreview.response.explanation}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {aiPreview.queryResult.rows.length} row{aiPreview.queryResult.rows.length === 1 ? "" : "s"}
                  </Badge>
                  {aiPreview.response.chartType && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <BarChart3 className="h-3 w-3" /> Will create a {aiPreview.response.chartType} chart
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nothing has been applied yet — review the result above before applying it.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleDiscardAiPreview}>
                  Discard
                </Button>
                <Button variant="default" size="sm" onClick={handleApplyAiPreview} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply
                </Button>
              </div>
            </div>
          )}

          {!isAiExecuting && !aiPreview && (
            <ScrollArea className="max-h-[300px] overflow-y-auto overflow-x-hidden p-3">
              {flatUnifiedItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm font-medium">No commands or metadata found</p>
                  <p className="text-xs text-muted-foreground/70">
                    Try typing "/ai top 5 regions by sales" or search for "theme", "pdf", "undo".
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* AI Co-Pilot Special Prompt Option */}
                  {query.trim().length > 0 && (
                    <div className="space-y-1">
                      <div className="px-2 py-1 text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Natural Language Query
                      </div>
                      {(() => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            onClick={() => handleRunAiQuery(aiPromptText)}
                            className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/20 border border-primary/50 font-medium"
                                : "bg-primary/5 hover:bg-primary/10 border border-primary/20"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-1.5 rounded-md bg-primary/20 shrink-0">
                                <Sparkles className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">
                                  Ask AI: "{aiPromptText || "Show me top 5 regions by revenue"}"
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  Translates prompt into strict QueryConfig / formula for dataset
                                </p>
                              </div>
                            </div>
                            <Badge variant="default" className="text-[10px] shrink-0">
                              Press ↵ Enter
                            </Badge>
                          </div>
                        );
                      })()}
                    </div>
                  )}

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
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
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
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
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
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
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
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
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
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            onClick={() => handleSelectSearchResult(item)}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <LayoutTemplate className="h-4 w-4 text-purple-500 shrink-0" />
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
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            onClick={() => handleSelectSearchResult(item)}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Bookmark className="h-4 w-4 text-amber-500 shrink-0" />
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
          )}
        </DialogContent>
      </Dialog>

      <AiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
