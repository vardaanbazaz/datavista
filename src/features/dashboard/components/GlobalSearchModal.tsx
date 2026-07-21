import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Button } from "@/shared/components/ui/button";
import {
  Search,
  LayoutDashboard,
  Database,
  Columns,
  LayoutTemplate,
  Bookmark,
  X,
  ChevronRight,
  Sparkles,
} from "lucide-react";

import { searchEngine, SearchResultItem } from "@/shared/services/searchEngine";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useDrillStore } from "@/features/dashboards/store/drillStore";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTemplateModal?: () => void;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  onOpenTemplateModal,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");

  const setActiveView = useUiStore((state) => state.setActiveView);
  const datasets = useDatasetStore((state) => state.datasets);
  const selectDataset = useDatasetStore((state) => state.selectDataset);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);

  // Reset query on open/close
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const results = useMemo(() => {
    return searchEngine.search(query);
  }, [query]);

  const totalResults = useMemo(() => {
    return (
      results.dashboards.length +
      results.datasets.length +
      results.columns.length +
      results.templates.length +
      results.views.length
    );
  }, [results]);

  const handleSelectResult = (item: SearchResultItem) => {
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
          useDrillStore
            .getState()
            .setAllWidgetDrillStates(item.savedView.drillStates || {});
          setActiveView("overview");
        }
        break;
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl glass border-white/20 shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border/40">
          <DialogTitle className="sr-only">Global Metadata Search</DialogTitle>
          <div className="relative flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across Dashboards, Datasets, Columns, Templates & Views... (e.g. Sales, Region, Profit)"
              className="pl-11 pr-10 h-12 text-base border-none shadow-none focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/60"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[480px] p-4">
          {!query.trim() ? (
            <div className="py-12 text-center text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto text-primary/40 mb-3 animate-pulse" />
              <p className="font-medium text-foreground">Global Metadata Search</p>
              <p className="text-xs mt-1 text-muted-foreground">
                Type a query to search across all uploaded datasets, fields, dashboards, saved interactive views, and templates.
              </p>
            </div>
          ) : totalResults === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium text-foreground">No matching results found</p>
              <p className="text-xs mt-1 text-muted-foreground">
                No metadata items matched "{query}". Try searching for another keyword.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dashboards Category */}
              {results.dashboards.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-primary">
                      <LayoutDashboard className="h-3.5 w-3.5" /> Dashboards
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {results.dashboards.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {results.dashboards.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectResult(item)}
                        className="w-full text-left p-2.5 rounded-lg flex items-center justify-between hover:bg-primary/10 transition-colors group border border-transparent hover:border-primary/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                            <LayoutDashboard className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Datasets Category */}
              {results.datasets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-sky-500">
                      <Database className="h-3.5 w-3.5" /> Datasets
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {results.datasets.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {results.datasets.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectResult(item)}
                        className="w-full text-left p-2.5 rounded-lg flex items-center justify-between hover:bg-sky-500/10 transition-colors group border border-transparent hover:border-sky-500/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-sky-500/10 text-sky-500 group-hover:bg-sky-500 group-hover:text-white transition-colors shrink-0">
                            <Database className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-sky-500 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Columns Category */}
              {results.columns.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-emerald-500">
                      <Columns className="h-3.5 w-3.5" /> Columns / Fields
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {results.columns.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {results.columns.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectResult(item)}
                        className="w-full text-left p-2.5 rounded-lg flex items-center justify-between hover:bg-emerald-500/10 transition-colors group border border-transparent hover:border-emerald-500/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors shrink-0">
                            <Columns className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved Views Category */}
              {results.views.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-pink-500">
                      <Bookmark className="h-3.5 w-3.5" /> Saved Interactive Views
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {results.views.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {results.views.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectResult(item)}
                        className="w-full text-left p-2.5 rounded-lg flex items-center justify-between hover:bg-pink-500/10 transition-colors group border border-transparent hover:border-pink-500/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-pink-500/10 text-pink-500 group-hover:bg-pink-500 group-hover:text-white transition-colors shrink-0">
                            <Bookmark className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-pink-500 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Templates Category */}
              {results.templates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-2">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-amber-500">
                      <LayoutTemplate className="h-3.5 w-3.5" /> Dashboard Templates
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {results.templates.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {results.templates.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelectResult(item)}
                        className="w-full text-left p-2.5 rounded-lg flex items-center justify-between hover:bg-amber-500/10 transition-colors group border border-transparent hover:border-amber-500/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-md bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
                            <LayoutTemplate className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-500 transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
