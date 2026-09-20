import React, { useMemo, useState } from "react";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useDatasetStore } from "@/store/datasetStore";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/shared/components/ui/dropdown-menu";
import { X, Filter, Plus, RefreshCw, Calendar as CalendarIcon, Tag, SlidersHorizontal, Bookmark, RotateCcw, Trash2 } from "lucide-react";
import { GlobalFilter, FilterOperator, FilterValue } from "@/shared/types";
import { Calendar } from "@/shared/components/ui/calendar";
import { format } from "date-fns";
import { useViewStore } from "../store/viewStore";
import { useDrillStore } from "../store/drillStore";
import { SaveViewModal } from "./SaveViewModal";

export function GlobalFilterBar() {
  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId);
  const dashboards = useDashboardStore((state) => state.dashboards);
  const dataset = useDatasetStore((state) => state.activeDataset);

  const activeGlobalFilters = useDashboardStore((state) => state.activeGlobalFilters || []);
  const addGlobalFilter = useDashboardStore((state) => state.addGlobalFilter);
  const removeGlobalFilter = useDashboardStore((state) => state.removeGlobalFilter);
  const clearGlobalFilters = useDashboardStore((state) => state.clearGlobalFilters);

  const widgetDrillStates = useDrillStore((state) => state.widgetDrillStates);
  const setAllWidgetDrillStates = useDrillStore((state) => state.setAllWidgetDrillStates);
  const resetAllWidgetDrillStates = useDrillStore((state) => state.resetAllWidgetDrillStates);

  const allSavedViews = useViewStore((state) => state.savedViews);
  const savedViews = useMemo(
    () => (activeDashboardId ? allSavedViews.filter((v) => v.dashboardId === activeDashboardId) : []),
    [allSavedViews, activeDashboardId]
  );
  const addSavedView = useViewStore((state) => state.addSavedView);
  const deleteSavedView = useViewStore((state) => state.deleteSavedView);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator>("equals");
  
  // Form values
  const [textValue, setTextValue] = useState("");
  const [numValue, setNumValue] = useState<number | "">("");
  const [numValueEnd, setNumValueEnd] = useState<number | "">("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const activeDashboard = useMemo(() => {
    return dashboards.find((d) => d.id === activeDashboardId) || null;
  }, [dashboards, activeDashboardId]);

  const columnTypes = dataset?.columnTypes || {};
  const columns = dataset?.columns || [];
  const colType = selectedColumn ? columnTypes[selectedColumn] || "categorical" : "categorical";

  // Unique categorical values for dropdown selection
  const uniqueValues = useMemo(() => {
    if (!dataset || !selectedColumn || colType !== "categorical") return [];
    const vals = dataset.data
      .map((row) => String(row[selectedColumn]))
      .filter((v) => v !== "null" && v !== "undefined" && v !== "");
    return Array.from(new Set(vals)).sort();
  }, [dataset, selectedColumn, colType]);

  // If no dashboard is active, don't show the global filter bar (Hooks must be called before this!)
  if (!activeDashboard || !dataset) return null;

  const handleColumnChange = (col: string) => {
    setSelectedColumn(col);
    // Reset defaults based on column type
    const type = columnTypes[col] || "categorical";
    if (type === "categorical") {
      setSelectedOperator("equals");
    } else if (type === "numeric") {
      setSelectedOperator("equals");
    } else if (type === "date") {
      setSelectedOperator("between");
    }
    // Reset values
    setTextValue("");
    setNumValue("");
    setNumValueEnd("");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleAddFilter = () => {
    if (!selectedColumn) return;

    let value: FilterValue = null;
    let labelValue = "";

    if (colType === "categorical") {
      value = textValue;
      labelValue = textValue;
    } else if (colType === "numeric") {
      if (selectedOperator === "between") {
        const start = numValue === "" ? undefined : Number(numValue);
        const end = numValueEnd === "" ? undefined : Number(numValueEnd);
        value = { start, end };
        labelValue = `${start ?? "-∞"} to ${end ?? "∞"}`;
      } else {
        value = numValue === "" ? null : Number(numValue);
        labelValue = String(value);
      }
    } else if (colType === "date") {
      if (selectedOperator === "between") {
        value = { start: startDate, end: endDate };
        const startStr = startDate ? format(startDate, "yyyy-MM-dd") : "-∞";
        const endStr = endDate ? format(endDate, "yyyy-MM-dd") : "∞";
        labelValue = `${startStr} to ${endStr}`;
      } else {
        value = startDate || null;
        labelValue = startDate ? format(startDate, "yyyy-MM-dd") : "";
      }
    }

    if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
      return; // invalid value
    }

    const filterId = `gf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const operatorLabel = selectedOperator === "equals" ? "=" : selectedOperator;

    const newFilter: GlobalFilter = {
      id: filterId,
      column: selectedColumn,
      operator: selectedOperator,
      value,
      datasetId: dataset.id,
      linkedDatasets: useDatasetStore.getState().datasets.map((d) => d.id).filter((id) => id !== dataset.id),
      label: `${selectedColumn} ${operatorLabel} ${labelValue}`,
    };

    addGlobalFilter(newFilter);
    setIsOpen(false);

    // Reset fields
    setSelectedColumn("");
    setTextValue("");
    setNumValue("");
    setNumValueEnd("");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleSaveCurrentView = (name: string) => {
    if (!activeDashboardId) return;
    addSavedView({
      dashboardId: activeDashboardId,
      name,
      globalFilters: activeGlobalFilters,
      drillStates: widgetDrillStates,
    });
  };

  const handleLoadView = (view: typeof savedViews[0]) => {
    useDashboardStore.setState({ activeGlobalFilters: view.globalFilters });
    setAllWidgetDrillStates(view.drillStates || {});
  };

  const handleResetToDefault = () => {
    clearGlobalFilters();
    resetAllWidgetDrillStates();
  };

  return (
    <div className="w-full glass border border-border/50 rounded-xl p-3 bg-card/20 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
        <div className="flex items-center gap-2 text-muted-foreground font-semibold shrink-0 text-sm">
          <Filter className="h-4 w-4 text-primary" />
          <span>Dashboard Filters:</span>
        </div>

        <div className="flex flex-wrap gap-2 items-center flex-1">
          {activeGlobalFilters.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              No active global filters. Click elements on charts to cross-filter, or add manual filters.
            </span>
          ) : (
            activeGlobalFilters.map((filter) => {
              const isCrossFilter = !!filter.sourceWidgetId;
              return (
                <Badge
                  key={filter.id}
                  variant="outline"
                  className={`pl-2 pr-1 py-0.5 text-xs font-medium flex items-center gap-1.5 border rounded-full transition-all hover:bg-muted/50 ${
                    isCrossFilter
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-accent/40 bg-accent/5 text-accent-foreground"
                  }`}
                >
                  {isCrossFilter ? (
                    <Tag className="h-3 w-3 text-primary shrink-0" />
                  ) : (
                    <SlidersHorizontal className="h-3 w-3 text-accent shrink-0" />
                  )}
                  <span className="max-w-[200px] truncate" title={filter.label}>
                    {filter.label || `${filter.column} = ${String(filter.value)}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4.5 w-4.5 rounded-full p-0 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors shrink-0"
                    onClick={() => removeGlobalFilter(filter.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Bookmarks / Saved Views Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 glass">
              <Bookmark className="h-3.5 w-3.5 text-primary" />
              <span>Views</span>
              {savedViews.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {savedViews.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 glass">
            <DropdownMenuLabel className="text-xs">Saved Interactive Views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIsSaveModalOpen(true)} className="text-xs gap-2">
              <Bookmark className="h-3.5 w-3.5 text-primary" />
              <span>Save Current View...</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleResetToDefault} className="text-xs gap-2">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Reset to Default View</span>
            </DropdownMenuItem>
            {savedViews.length > 0 && <DropdownMenuSeparator />}
            {savedViews.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => handleLoadView(view)}
                className="text-xs flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Bookmark className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate font-medium">{view.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSavedView(view.id);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <SaveViewModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={handleSaveCurrentView}
        />

        {activeGlobalFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearGlobalFilters}
            className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Clear All
          </Button>
        )}

        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="premium" className="h-8 gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 border-border/80 glass shadow-xl" align="end">
            <div className="space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-1">
                <Filter className="h-4 w-4 text-primary" />
                Add Linked Filter
              </h4>

              {/* Column Select */}
              <div className="space-y-1.5">
                <Label className="text-xs">Field</Label>
                <Select value={selectedColumn} onValueChange={handleColumnChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col} className="text-xs">
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{col}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {columnTypes[col] || "categorical"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedColumn && (
                <>
                  {/* Operator Select (only show if numeric or date, otherwise default equals) */}
                  {colType !== "categorical" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Condition</Label>
                      <Select
                        value={selectedOperator}
                        onValueChange={(val) => setSelectedOperator(val as FilterOperator)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals" className="text-xs">Equals</SelectItem>
                          {colType === "numeric" && (
                            <>
                              <SelectItem value="greaterThan" className="text-xs">Greater Than</SelectItem>
                              <SelectItem value="lessThan" className="text-xs">Less Than</SelectItem>
                            </>
                          )}
                          <SelectItem value="between" className="text-xs">Between (Range)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Value Input based on Column Type and Operator */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Value</Label>
                    
                    {/* Categorical Dropdown */}
                    {colType === "categorical" && (
                      <Select value={textValue} onValueChange={setTextValue}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select value" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {uniqueValues.map((val) => (
                            <SelectItem key={val} value={val} className="text-xs">
                              {val}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Numeric Input */}
                    {colType === "numeric" && (
                      selectedOperator === "between" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Min"
                            value={numValue}
                            onChange={(e) => setNumValue(e.target.value === "" ? "" : Number(e.target.value))}
                            className="h-8 text-xs flex-1"
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <Input
                            type="number"
                            placeholder="Max"
                            value={numValueEnd}
                            onChange={(e) => setNumValueEnd(e.target.value === "" ? "" : Number(e.target.value))}
                            className="h-8 text-xs flex-1"
                          />
                        </div>
                      ) : (
                        <Input
                          type="number"
                          placeholder="Enter value"
                          value={numValue}
                          onChange={(e) => setNumValue(e.target.value === "" ? "" : Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                      )
                    )}

                    {/* Date Picker */}
                    {colType === "date" && (
                      selectedOperator === "between" ? (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-muted-foreground font-medium">Start Date</span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-full justify-start text-left text-xs font-normal"
                                >
                                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                                  {startDate ? format(startDate, "PPP") : <span>Pick start date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 border-border" align="start">
                                <Calendar
                                  mode="single"
                                  selected={startDate}
                                  onSelect={setStartDate}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-muted-foreground font-medium">End Date</span>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-full justify-start text-left text-xs font-normal"
                                >
                                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                                  {endDate ? format(endDate, "PPP") : <span>Pick end date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 border-border" align="start">
                                <Calendar
                                  mode="single"
                                  selected={endDate}
                                  onSelect={setEndDate}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      ) : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-full justify-start text-left text-xs font-normal"
                            >
                              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                              {startDate ? format(startDate, "PPP") : <span>Pick date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 border-border" align="start">
                            <Calendar
                              mode="single"
                              selected={startDate}
                              onSelect={setStartDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      )
                    )}
                  </div>

                  <Button
                    size="sm"
                    className="w-full h-8"
                    onClick={handleAddFilter}
                    disabled={
                      (colType === "categorical" && !textValue) ||
                      (colType === "numeric" && selectedOperator !== "between" && numValue === "") ||
                      (colType === "numeric" && selectedOperator === "between" && numValue === "" && numValueEnd === "") ||
                      (colType === "date" && selectedOperator !== "between" && !startDate) ||
                      (colType === "date" && selectedOperator === "between" && !startDate && !endDate)
                    }
                  >
                    Apply Filter
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
