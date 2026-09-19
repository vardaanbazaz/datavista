import { useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { Input } from "@/shared/components/ui/input";
import { Filter, CalendarIcon, X, RotateCcw, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/shared/lib/utils";
import { FilterState } from "@/shared/types";
import { queryEngine } from "@/shared/services/queryEngine";
import { useFilterStore } from "@/store/filterStore";
import { useDatasetStore } from "@/store/datasetStore";
import { buildFilterQuery } from "@/features/dashboards/store/dashboardStore";

export function FilterPanel() {
  const dataset = useDatasetStore((state) => state.activeDataset);
  const filters = useFilterStore((state) => state.activeFilters);
  const setFiltersChange = useFilterStore((state) => state.setFiltersChange);

  const categoricalColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns
        .filter(col => col.inferredDataType === 'categorical')
        .map(col => col.name);
    }
    return dataset.columns.filter(col => 
      dataset.columnTypes[col] === 'categorical'
    );
  }, [dataset]);
  
  const dateColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns
        .filter(col => col.inferredDataType === 'date')
        .map(col => col.name);
    }
    return dataset.columns.filter(col => 
      dataset.columnTypes[col] === 'date'
    );
  }, [dataset]);

  const numericColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns
        .filter(col => col.inferredDataType === 'numeric')
        .map(col => col.name);
    }
    return dataset.columns.filter(col => 
      dataset.columnTypes[col] === 'numeric'
    );
  }, [dataset]);

  const setFilters = (newFilters: FilterState | ((prev: FilterState) => FilterState)) => {
    if (typeof newFilters === 'function') {
      useFilterStore.setState((state) => ({
        activeFilters: newFilters(state.activeFilters)
      }));
    } else {
      useFilterStore.setState({ activeFilters: newFilters });
    }
  };

  // Apply filters and grouping
  useEffect(() => {
    if (!dataset) return;

    const queryResult = queryEngine.execute(dataset, buildFilterQuery(filters));
    setFiltersChange(queryResult.rows, filters);
  }, [filters, dataset, setFiltersChange]);

  if (!dataset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No dataset selected. Upload data to start filtering.
        </p>
      </div>
    );
  }

  const updateCategoricalFilter = (column: string, value: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      categoricalFilters: {
        ...prev.categoricalFilters,
        [column]: checked 
          ? [...(prev.categoricalFilters[column] || []), value]
          : (prev.categoricalFilters[column] || []).filter(v => v !== value)
      }
    }));
  };

  const updateDateRangeFilter = (column: string, type: 'start' | 'end', date: Date | undefined) => {
    setFilters(prev => ({
      ...prev,
      dateRangeFilters: {
        ...prev.dateRangeFilters,
        [column]: {
          ...prev.dateRangeFilters[column],
          [type]: date
        }
      }
    }));
  };

  const updateNumericRangeFilter = (column: string, bound: 'min' | 'max', value: number | undefined) => {
    setFilters(prev => ({
      ...prev,
      numericRangeFilters: {
        ...prev.numericRangeFilters,
        [column]: {
          ...prev.numericRangeFilters?.[column],
          [bound]: value
        }
      }
    }));
  };

  const updateTextSearchFilter = (column: string, text: string) => {
    setFilters(prev => ({
      ...prev,
      textSearchFilters: {
        ...prev.textSearchFilters,
        [column]: text
      }
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      categoricalFilters: {},
      dateRangeFilters: {},
      numericRangeFilters: {},
      textSearchFilters: {},
    });
  };

  const removeFilter = (type: 'categorical' | 'dateRange' | 'numericRange' | 'textSearch', column: string, value?: string) => {
    setFilters(prev => {
      if (type === 'categorical' && value) {
        return {
          ...prev,
          categoricalFilters: {
            ...prev.categoricalFilters,
            [column]: (prev.categoricalFilters[column] || []).filter(v => v !== value)
          }
        };
      } else if (type === 'dateRange') {
        const { [column]: _removed, ...rest } = prev.dateRangeFilters;
        return {
          ...prev,
          dateRangeFilters: rest
        };
      } else if (type === 'numericRange') {
        const { [column]: _removed, ...rest } = prev.numericRangeFilters || {};
        return {
          ...prev,
          numericRangeFilters: rest
        };
      } else if (type === 'textSearch') {
        const { [column]: _removed, ...rest } = prev.textSearchFilters || {};
        return {
          ...prev,
          textSearchFilters: rest
        };
      }
      return prev;
    });
  };

  const getUniqueValues = (column: string) => {
    const values = Array.from(new Set(dataset.data.map(row => String(row[column]))))
      .filter(Boolean)
      .sort();
    return values;
  };

  const activeNumericRangeFilters = Object.entries(filters.numericRangeFilters || {})
    .filter(([, range]) => range.min !== undefined || range.max !== undefined);
  const activeTextSearchFilters = Object.entries(filters.textSearchFilters || {})
    .filter(([, text]) => text && text.trim().length > 0);

  const activeFiltersCount = Object.values(filters.categoricalFilters).flat().length +
    Object.keys(filters.dateRangeFilters).length +
    activeNumericRangeFilters.length +
    activeTextSearchFilters.length;

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Advanced Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary">{activeFiltersCount}</Badge>
            )}
          </CardTitle>
          {activeFiltersCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearAllFilters}
              className="flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Active Filters:</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(filters.categoricalFilters).map(([column, values]) =>
                values.map(value => (
                  <Badge key={`${column}-${value}`} variant="outline" className="flex items-center gap-1">
                    {column}: {value}
                    <X 
                      className="w-3 h-3 cursor-pointer" 
                      onClick={() => removeFilter('categorical', column, value)}
                    />
                  </Badge>
                ))
              )}
              {Object.entries(filters.dateRangeFilters).map(([column, range]) => (
                <Badge key={column} variant="outline" className="flex items-center gap-1">
                  {column}: {range.start ? format(range.start, 'MMM dd') : '...'} - {range.end ? format(range.end, 'MMM dd') : '...'}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => removeFilter('dateRange', column)}
                  />
                </Badge>
              ))}
              {activeNumericRangeFilters.map(([column, range]) => (
                <Badge key={column} variant="outline" className="flex items-center gap-1">
                  {column}: {range.min ?? '-∞'} to {range.max ?? '∞'}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => removeFilter('numericRange', column)}
                  />
                </Badge>
              ))}
              {activeTextSearchFilters.map(([column, text]) => (
                <Badge key={column} variant="outline" className="flex items-center gap-1">
                  {column} contains "{text}"
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => removeFilter('textSearch', column)}
                  />
                </Badge>
              ))}
            </div>
            <Separator />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Categorical Filters */}
          {categoricalColumns.map(column => {
            const uniqueValues = getUniqueValues(column);
            const selectedValues = filters.categoricalFilters[column] || [];
            const searchText = filters.textSearchFilters?.[column] || '';

            return (
              <div key={column} className="space-y-3">
                <Label className="font-medium">{column}</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${column}...`}
                    value={searchText}
                    onChange={(e) => updateTextSearchFilter(column, e.target.value)}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
                <ScrollArea className="h-32 border rounded-md p-2">
                  <div className="space-y-2">
                    {uniqueValues.map(value => (
                      <div key={value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${column}-${value}`}
                          checked={selectedValues.includes(value)}
                          onCheckedChange={(checked) => 
                            updateCategoricalFilter(column, value, !!checked)
                          }
                        />
                        <Label 
                          htmlFor={`${column}-${value}`}
                          className="text-sm cursor-pointer"
                        >
                          {value}
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            );
          })}

          {/* Date Range Filters */}
          {dateColumns.map(column => {
            const dateRange = filters.dateRangeFilters[column] || {};

            return (
              <div key={column} className="space-y-3">
                <Label className="font-medium">{column} Range</Label>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateRange.start && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.start ? format(dateRange.start, "PPP") : "Pick start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateRange.start}
                          onSelect={(date) => updateDateRangeFilter(column, 'start', date)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateRange.end && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.end ? format(dateRange.end, "PPP") : "Pick end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateRange.end}
                          onSelect={(date) => updateDateRangeFilter(column, 'end', date)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Numeric Range Filters */}
          {numericColumns.map(column => {
            const range = filters.numericRangeFilters?.[column] || {};

            return (
              <div key={column} className="space-y-3">
                <Label className="font-medium">{column} Range</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={range.min ?? ''}
                    onChange={(e) => updateNumericRangeFilter(
                      column,
                      'min',
                      e.target.value === '' ? undefined : Number(e.target.value)
                    )}
                    className="h-9 text-sm"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={range.max ?? ''}
                    onChange={(e) => updateNumericRangeFilter(
                      column,
                      'max',
                      e.target.value === '' ? undefined : Number(e.target.value)
                    )}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            );
          })}

          {/* Grouping Controls */}
          <div className="space-y-3">
            <Label className="font-medium">Group By</Label>
            <div className="space-y-2">
              <Select 
                value={filters.groupByColumn || 'none'} 
                onValueChange={(value) => setFilters(prev => ({
                  ...prev,
                  groupByColumn: value === 'none' ? undefined : value
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  {[...categoricalColumns, ...dateColumns].map(column => (
                    <SelectItem key={column} value={column}>{column}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {filters.groupByColumn && dataset.columnTypes[filters.groupByColumn] === 'date' && (
                <Select 
                  value={filters.groupByPeriod || 'month'} 
                  onValueChange={(value) => setFilters(prev => ({
                    ...prev,
                    groupByPeriod: value as 'day' | 'month' | 'year'
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}