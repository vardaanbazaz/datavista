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
import { providerDisplayName } from "@/features/ai/providerDisplayName";
import { AIResponse } from "@/features/ai/types";
import { QueryResult } from "@/shared/types";
import { toast } from "@/shared/hooks/use-toast";
import { Hint } from "@/shared/components/Hint";
import { formatShortcut, modKey } from "@/shared/lib/platform";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplateModal?: () => void;
  initialQuery?: string;
}

type UnifiedItem =
  | { itemType: "ai"; prompt: string }
  | { itemType: "command"; data: CommandDefinition }
  | { itemType: "searchResult"; data: SearchResultItem };

export function CommandPalette({
  isOpen,
  onClose,
  onOpenTemplateModal,
  initialQuery,
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
  const llmApiKey = useUiStore((state) => state.llmApiKey);
  const llmProvider = useUiStore((state) => state.llmProvider);
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const datasets = useDatasetStore((state) => state.datasets);
  const selectDataset = useDatasetStore((state) => state.selectDataset);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);

  useEffect(() => {
    if (isOpen) {
      const startQuery = initialQuery ?? "";
      setQuery(startQuery);
      setSelectedIndex(0);
      setAiError(null);
      setIsAiExecuting(false);
      setAiPreview(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(startQuery.length, startQuery.length);
      }, 50);
    }
  }, [isOpen, initialQuery]);

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
        return <Sun className="h-4 w-4 text-tertiary" />;
      case "RotateCcw":
        return <RotateCcw className="h-4 w-4 text-primary-ink" />;
      case "RotateCw":
        return <RotateCw className="h-4 w-4 text-primary-ink" />;
      case "Camera":
        return <Camera className="h-4 w-4 text-primary-ink" />;
      case "FileDown":
        return <FileDown className="h-4 w-4 text-success" />;
      case "FilterX":
        return <FilterX className="h-4 w-4 text-destructive" />;
      case "BarChart3":
        return <BarChart3 className="h-4 w-4 text-primary-ink" />;
      case "TrendingUp":
        return <TrendingUp className="h-4 w-4 text-primary-ink" />;
      case "Table":
        return <TableIcon className="h-4 w-4 text-cyan-500" />;
      case "Calculator":
        return <Calculator className="h-4 w-4 text-success" />;
      case "Database":
        return <Database className="h-4 w-4 text-primary-ink" />;
      default:
        return <Terminal className="h-4 w-4 text-primary-ink" />;
    }
  };

  let globalItemCounter = 0;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent corners={false} className="max-w-2xl max-h-[85vh] p-0 overflow-hidden bg-card border border-border shadow-2xl gap-0 text-foreground">
          <DialogHeader className="p-4 pr-14 pb-2 border-b border-border flex flex-row items-center justify-between">
            <DialogTitle className="sr-only">Command Palette</DialogTitle>
            <div className="relative flex-1 flex items-center pr-2">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="Type '/ai ...' for AI Co-Pilot, or search commands, datasets..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAiExecuting || !!aiPreview}
                role="combobox"
                aria-label="Search commands, datasets and charts, or type /ai for the AI Co-Pilot"
                aria-expanded={flatUnifiedItems.length > 0}
                aria-controls="command-palette-options"
                aria-autocomplete="list"
                aria-activedescendant={flatUnifiedItems.length > 0 ? `command-option-${selectedIndex}` : undefined}
                className="pl-9 pr-36 h-11 bg-muted border border-border text-sm text-foreground focus-visible:ring-primary"
              />
              <div className="absolute right-3 flex items-center gap-1.5">
                <kbd className="hidden sm:inline-block border border-borderStrong bg-muted text-muted-foreground text-xs rounded px-1.5 py-0.5 font-mono">{formatShortcut([modKey, "K"])}</kbd>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2 gap-1 text-muted-foreground hover:bg-accent"
                  onClick={() => setQuery("/ai ")}
                >
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> /ai
                </Button>
                <Hint label="AI Co-Pilot settings (provider and API key)">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </Hint>
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
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary-ink" />
              <p className="text-sm font-semibold">
                Translating natural language with AI Co-Pilot...
              </p>
              <p className="text-xs text-muted-foreground">Generating AST-compatible query JSON</p>
            </div>
          )}

          {!isAiExecuting && aiPreview && (
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-ink shrink-0" />
                  <p className="text-sm font-semibold text-foreground truncate">
                    {aiPreview.response.title || "AI Query Result"}
                  </p>
                </div>
                {aiPreview.response.explanation && (
                  <p className="text-xs text-muted-foreground">{aiPreview.response.explanation}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {aiPreview.queryResult.rows.length} row{aiPreview.queryResult.rows.length === 1 ? "" : "s"}
                  </Badge>
                  {aiPreview.response.chartType && (
                    <Badge variant="outline" className="text-xs gap-1">
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
                <div className="space-y-4" role="listbox" id="command-palette-options" aria-label="Results">
                  {/* AI Co-Pilot Special Prompt Option */}
                  {query.trim().length > 0 && (
                    <div className="space-y-1" role="group" aria-labelledby="command-group-1">
                      <div id="command-group-1" className="px-2 py-1 catalogue-label text-primary-ink flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary-ink" /> AI Natural Language Query
                      </div>
                      {llmApiKey && llmApiKey.trim() !== "" && (
                        <p className="px-2 pb-1 text-xs text-muted-foreground">
                          Sends this dataset's column names and sample values to {providerDisplayName(llmProvider)}.
                        </p>
                      )}
                      {(() => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleRunAiQuery(aiPromptText)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleRunAiQuery(aiPromptText))(); } }}
                            className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/20 border border-primary/50 font-medium"
                                : "bg-primary/5 hover:bg-primary/10 border border-primary/20"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-1.5 rounded-md bg-primary/20 shrink-0">
                                <Sparkles className="h-4 w-4 text-primary-ink" />
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
                            <Badge variant="default" className="text-xs shrink-0">
                              Press ↵ Enter
                            </Badge>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Registered Executable Commands Section */}
                  {filteredCommands.length > 0 && (
                    <div className="space-y-1" role="group" aria-labelledby="command-group-2">
                      <div id="command-group-2" className="px-2 py-1 catalogue-label text-muted-foreground flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-primary-ink" /> Workspace Commands ({filteredCommands.length})
                      </div>
                      {filteredCommands.map((cmd) => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;

                        return (
                          <div
                            key={cmd.id}
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleExecuteCommand(cmd)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleExecuteCommand(cmd))(); } }}
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
                                  <Badge variant="outline" className="text-xs py-0 px-1.5 font-normal">
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
                                    className="px-1.5 py-0.5 text-xs font-mono font-semibold bg-muted border border-border/80 rounded shadow-xs text-muted-foreground"
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
                    <div className="space-y-1" role="group" aria-labelledby="command-group-3">
                      <div id="command-group-3" className="px-2 py-1 catalogue-label text-muted-foreground flex items-center gap-1.5">
                        <LayoutDashboard className="h-3.5 w-3.5 text-primary-ink" /> Dashboards ({searchResults.dashboards.length})
                      </div>
                      {searchResults.dashboards.map((item) => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            key={item.id}
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleSelectSearchResult(item)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleSelectSearchResult(item))(); } }}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <LayoutDashboard className="h-4 w-4 text-primary-ink shrink-0" />
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
                    <div className="space-y-1" role="group" aria-labelledby="command-group-4">
                      <div id="command-group-4" className="px-2 py-1 catalogue-label text-muted-foreground flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5 text-primary-ink" /> Datasets ({searchResults.datasets.length})
                      </div>
                      {searchResults.datasets.map((item) => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            key={item.id}
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleSelectSearchResult(item)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleSelectSearchResult(item))(); } }}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Database className="h-4 w-4 text-primary-ink shrink-0" />
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
                    <div className="space-y-1" role="group" aria-labelledby="command-group-5">
                      <div id="command-group-5" className="px-2 py-1 catalogue-label text-muted-foreground flex items-center gap-1.5">
                        <Columns className="h-3.5 w-3.5 text-primary-ink" /> Columns ({searchResults.columns.length})
                      </div>
                      {searchResults.columns.map((item) => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            key={item.id}
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleSelectSearchResult(item)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleSelectSearchResult(item))(); } }}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Columns className="h-4 w-4 text-primary-ink shrink-0" />
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
                    <div className="space-y-1" role="group" aria-labelledby="command-group-6">
                      <div id="command-group-6" className="px-2 py-1 catalogue-label text-muted-foreground flex items-center gap-1.5">
                        <LayoutTemplate className="h-3.5 w-3.5 text-primary-ink" /> Templates ({searchResults.templates.length})
                      </div>
                      {searchResults.templates.map((item) => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            key={item.id}
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleSelectSearchResult(item)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleSelectSearchResult(item))(); } }}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <LayoutTemplate className="h-4 w-4 text-primary-ink shrink-0" />
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
                    <div className="space-y-1" role="group" aria-labelledby="command-group-7">
                      <div id="command-group-7" className="px-2 py-1 catalogue-label text-muted-foreground flex items-center gap-1.5">
                        <Bookmark className="h-3.5 w-3.5 text-primary-ink" /> Saved Views ({searchResults.views.length})
                      </div>
                      {searchResults.views.map((item) => {
                        const currentIndex = globalItemCounter++;
                        const isSelected = selectedIndex === currentIndex;
                        return (
                          <div
                            key={item.id}
                            ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                            id={`command-option-${currentIndex}`}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={-1}
                            onClick={() => handleSelectSearchResult(item)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (() => handleSelectSearchResult(item))(); } }}
                            className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-sm ${
                              isSelected
                                ? "bg-primary/15 border border-primary/40 font-medium"
                                : "hover:bg-accent/10 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Bookmark className="h-4 w-4 text-tertiary shrink-0" />
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
