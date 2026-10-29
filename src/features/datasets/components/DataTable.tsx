import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { Search, ArrowUpDown, Download, Palette, RefreshCw } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Dataset, Query, DataRow, ConditionalFormatRule, DatasetMetadata } from "@/shared/types";
import { queryEngine } from "@/shared/services/queryEngine";
import { formattingEngine } from "@/shared/services/formattingEngine";
import { needsDateReimportNotice } from "@/shared/services/parsingService";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { CalculatedFieldsManager } from "./CalculatedFieldsManager";
import { QueryPerformanceBadge } from "@/features/dashboard/components/QueryPerformanceBadge";
import { ConditionalFormattingBuilder } from "@/features/dashboards/components/ConditionalFormattingBuilder";
import { DatasetUpdateModal } from "./DatasetUpdateModal";
import { getEffectiveColumnType, mightBeCategorical } from "@/shared/utils/columnType";
import { summarizeNumericColumns } from "@/shared/services/stats/columnSummary";
import { useImportStore } from "@/store/importStore";
import { ImportIssuesDialog } from "@/features/upload/components/ImportDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";

interface DataTableProps {
  customDataset?: Dataset | null;
  customData?: DataRow[];
  hideCalculatedFields?: boolean;
}

export function DataTable({
  customDataset,
  customData,
  hideCalculatedFields = false
}: DataTableProps = {}) {
  const [formattingRules, setFormattingRules] = useState<ConditionalFormatRule[]>([]);
  const [isFormattingOpen, setIsFormattingOpen] = useState(false);

  const compiledFormattingRules = useMemo(() => {
    return formattingEngine.compileRules(formattingRules);
  }, [formattingRules]);

  const activeDatasetStore = useDatasetStore((state) => state.activeDataset);
  const storeFilteredData = useFilterStore((state) => state.filteredData);
  const updateDatasetData = useDatasetStore((state) => state.updateDatasetData);
  const setColumnTypeOverride = useDatasetStore((state) => state.setColumnTypeOverride);
  const setDateDayFirst = useDatasetStore((state) => state.setDateDayFirst);
  const dismissDateReimportNotice = useDatasetStore((state) => state.dismissDateReimportNotice);

  const activeDataset = customDataset !== undefined ? customDataset : activeDatasetStore;
  const storeData = customData !== undefined ? customData : storeFilteredData;

  const importForReplace = useImportStore((state) => state.importForReplace);
  const [isIssuesOpen, setIsIssuesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [newParsedData, setNewParsedData] = useState<{
    data: DataRow[];
    columns: string[];
    columnTypes: Record<string, "numeric" | "categorical" | "date">;
    metadata?: DatasetMetadata;
    dateSourceValues?: Dataset["dateSourceValues"];
  } | null>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeDataset) return;
    // Same pipeline as the upload panel: size cap first, then the import worker.
    const processed = await importForReplace(file);
    if (!processed) return;
    setNewParsedData({
      data: processed.data,
      columns: processed.columns,
      columnTypes: processed.columnTypes,
      metadata: processed.metadata,
      dateSourceValues: processed.dateSourceValues,
    });
    setIsUpdateModalOpen(true);
  };

  const handleConfirmVersionUpdate = () => {
    if (!activeDataset || !newParsedData) return;
    updateDatasetData(
      activeDataset.id,
      newParsedData.data,
      newParsedData.metadata,
      newParsedData.columnTypes,
      newParsedData.columns,
      newParsedData.dateSourceValues
    );
    setNewParsedData(null);
  };

  const dataset = useMemo(() => {
    if (!activeDataset) return null;
    return {
      ...activeDataset,
      data: storeData,
    };
  }, [activeDataset, storeData]);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterColumn, setFilterColumn] = useState<string>('none');
  const [filterValue, setFilterValue] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(25);

  // Filter and sort data using the Unified Query Engine
  const queryResult = useMemo(() => {
    if (!dataset) return null;

    const query: Query = {
      filters: {
        search: searchTerm,
        conditions: filterColumn !== 'none' && filterValue ? [{
          column: filterColumn,
          operator: 'contains',
          value: filterValue
        }] : []
      },
      sorting: sortColumn ? [{
        column: sortColumn,
        direction: sortDirection
      }] : [],
      windowQueries: activeDataset?.windowQueries
    };

    const tempDataset: Dataset = {
      ...dataset,
      data: storeData
    };

    return queryEngine.execute(tempDataset, query);
  }, [dataset, storeData, searchTerm, filterColumn, filterValue, sortColumn, sortDirection, activeDataset?.windowQueries]);

  const filteredData = useMemo(() => {
    return queryResult ? queryResult.rows : [];
  }, [queryResult]);

  // Pagination calculations supporting 'all'
  const resolvedPageSize = pageSize === 'all' ? filteredData.length : pageSize;
  const totalPages = resolvedPageSize > 0 ? Math.ceil(filteredData.length / resolvedPageSize) : 1;
  const resolvedPage = Math.min(currentPage, totalPages || 1);
  
  const paginatedData = useMemo(() => {
    if (pageSize === 'all') return filteredData;
    return filteredData.slice(
      (resolvedPage - 1) * pageSize,
      resolvedPage * pageSize
    );
  }, [filteredData, resolvedPage, pageSize]);

  // Virtualization ref and set up
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: paginatedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52, // Estimated height of TableRow in pixels
    overscan: 10,
  });

  // Reset scroll to top on pagination / dataset changes
  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0;
    }
  }, [currentPage, pageSize, activeDataset?.id]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    const csvContent = [
      dataset.columns.join(','),
      ...filteredData.map(row => 
        dataset.columns.map(col => {
          const value = row[col];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return String(value);
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}_filtered.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate summary statistics for numeric columns
  const summaryStats = useMemo(() => {
    if (!dataset) return {};
    const stats: Record<string, { min: number; max: number; mean: number; count: number }> = {};
    // Computed from the shown rows with the shared numeric rule. The old unfiltered
    // shortcut took count from metadata (rowCount − missing), which counted junk strings.
    const numericColumns = dataset.columns.filter(col => getEffectiveColumnType(dataset, col) === 'numeric');
    for (const s of summarizeNumericColumns(filteredData, numericColumns)) {
      stats[s.column] = { min: s.min, max: s.max, mean: s.mean, count: s.count };
    }
    
    return stats;
  }, [dataset, filteredData]);

  if (!dataset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No dataset selected. Upload data to explore.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="data-table-container" data-tour="dataset-grid" className="space-y-6">
      {/* Controls */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Data Explorer
            </span>
            <div className="flex gap-2">
              {!hideCalculatedFields && <CalculatedFieldsManager />}
              {activeDataset && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        variant="outline"
                        className="gap-2 glass border-primary/20 text-foreground hover:bg-primary/5"
                      >
                        <RefreshCw className="w-4 h-4 text-primary" />
                        Update Version
                        {activeDataset.version && activeDataset.version > 1 && (
                          <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0">
                            v{activeDataset.version}
                          </Badge>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Upload new data version while preserving calculated fields & dashboard links</p>
                    </TooltipContent>
                  </Tooltip>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelected}
                    data-testid="replace-data-input"
                    accept=".csv,.tsv,.xlsx,.xls"
                    className="hidden"
                  />
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setIsFormattingOpen(true)}
                    variant={formattingRules.length > 0 ? "default" : "outline"}
                    className="gap-2"
                  >
                    <Palette className="w-4 h-4" />
                    Conditional Formatting
                    {formattingRules.length > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                        {formattingRules.length}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Configure custom cell highlight rules based on thresholds</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleExport} variant="outline" className="gap-2">
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Download current filtered data as a CSV file</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardTitle>
        </CardHeader>

        {/* Conditional Formatting Dialog */}
        <Dialog open={isFormattingOpen} onOpenChange={setIsFormattingOpen}>
          <DialogContent className="max-w-4xl glass border-white/20 shadow-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-h2 flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Data Table Conditional Formatting
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <ConditionalFormattingBuilder
                rules={formattingRules}
                onChange={setFormattingRules}
                availableColumns={dataset.columns}
              />
            </div>
          </DialogContent>
        </Dialog>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <Input
                placeholder="Search across all columns..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Column Filter */}
            <div className="flex gap-2">
              <Select value={filterColumn} onValueChange={setFilterColumn}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No column filter</SelectItem>
                  {dataset.columns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {filterColumn && filterColumn !== 'none' && (
                <Input
                  placeholder="Filter value..."
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="w-48"
                />
              )}
            </div>

            {/* Page Size */}
            <Select value={String(pageSize)} onValueChange={(value) => {
              setPageSize(value === 'all' ? 'all' : Number(value));
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
                <SelectItem value="5000">5000</SelectItem>
                <SelectItem value="10000">10000</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground select-none">
            <div>
              Showing {paginatedData.length} of {filteredData.length} rows 
              {filteredData.length !== dataset.data.length && 
                ` (filtered from ${dataset.data.length} total)`
              }
            </div>
            {queryResult && (
              <QueryPerformanceBadge
                executionTimeMs={queryResult.metadata.executionTimeMs}
                cacheHit={queryResult.metadata.cacheHit}
                optimizerTimeSavedMs={queryResult.metadata.optimizerTimeSavedMs}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* One-time notice: imported before timezone-free dates, original text not kept */}
      {activeDataset && customDataset === undefined && needsDateReimportNotice(activeDataset) && (
        <div
          role="status"
          data-testid="date-reimport-notice"
          className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-tertiary/40 bg-tertiary/5 text-body"
        >
          <p className="flex-1">
            This dataset was imported before date handling was fixed, so its dates may be one day early and day/month order may be swapped. Re-import the file with <span className="font-semibold">Update Data</span> to get correct dates.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={() => fileInputRef.current?.click()}>
              Re-import file
            </Button>
            <Button size="sm" variant="outline" onClick={() => dismissDateReimportNotice(activeDataset.id)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Rows the parser had problems with at import; reopens the import summary */}
      {activeDataset && customDataset === undefined && (activeDataset.metadata?.importIssues?.rowCount ?? 0) > 0 && (
        <div role="status" data-testid="import-issues-notice" className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border text-body">
          <p className="flex-1">
            {activeDataset.metadata!.importIssues!.rowCount.toLocaleString()}{" "}
            {activeDataset.metadata!.importIssues!.rowCount === 1 ? "row" : "rows"} had parse problems at import and{" "}
            {activeDataset.metadata!.importIssues!.excluded ? "were excluded" : "were kept"}.
          </p>
          <Button size="sm" variant="outline" onClick={() => setIsIssuesOpen(true)} data-testid="import-issues-open">
            View import summary
          </Button>
          <ImportIssuesDialog issues={activeDataset.metadata!.importIssues!} open={isIssuesOpen} onOpenChange={setIsIssuesOpen} />
        </div>
      )}

      {/* Summary Statistics */}
      {Object.keys(summaryStats).length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(summaryStats).map(([column, stats]) => (
                <div key={column} className="p-3 bg-muted/50 border border-border rounded-lg" data-testid={`column-stats-${column}`}>
                  <h4 className="text-caption uppercase text-textTertiary mb-2">{column}</h4>
                  <div className="space-y-1 text-body font-mono text-dataTable">
                    <div>Count: {stats.count}</div>
                    <div>Min: {stats.min.toFixed(2)}</div>
                    <div>Max: {stats.max.toFixed(2)}</div>
                    <div>Mean: {stats.mean.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card className="glass">
        <CardContent className="p-0">
          <div 
            ref={parentRef} 
            className="h-[500px] overflow-auto border border-border rounded-md relative scroll-container bg-background"
          >
            <Table className="relative">
              <TableHeader className="sticky top-0 bg-popover/95 backdrop-blur-sm z-10 border-b border-border">
                <TableRow>
                  {dataset.columns.map((column) => {
                    const colMeta = dataset.metadata?.columns.find(c => c.name === column);
                    const effectiveType = getEffectiveColumnType(dataset, column);
                    const flagged = colMeta
                      ? mightBeCategorical(colMeta) && colMeta.userOverrideType == null
                      : false;
                    const overridden = colMeta?.userOverrideType != null;
                    // Date columns (and text columns whose dates were ambiguous) get a details popover.
                    const dateInfo = colMeta && !overridden && !flagged
                      && (colMeta.inferredDataType === 'date' || colMeta.dateAmbiguity === 'ambiguous-mixed');
                    const invalidDates = effectiveType === 'date' ? (colMeta?.invalidDateCount ?? 0) : 0;

                    const badge = (
                      <Badge
                        variant="outline"
                        className={
                          "ml-2 text-[10px] uppercase font-normal cursor-pointer " +
                          (flagged
                            ? "border-tertiary text-tertiary"
                            : overridden
                              ? "border-primary text-primary"
                              : "border-border text-textTertiary")
                        }
                      >
                        {effectiveType}
                        {overridden && " (override)"}
                        {invalidDates > 0 && ` · ${invalidDates} invalid`}
                      </Badge>
                    );

                    return (
                      <TableHead
                        key={column}
                        className="bg-popover/95 backdrop-blur-sm text-caption uppercase text-textTertiary py-2"
                        aria-sort={sortColumn === column ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className={"flex items-center" + (effectiveType === 'numeric' ? " justify-end" : "")}>
                          <Button
                            variant="ghost"
                            className="h-auto p-2 justify-start text-caption uppercase text-muted-foreground hover:text-foreground"
                            onClick={() => handleSort(column)}
                            aria-label={`Sort by ${column}, currently ${sortColumn === column ? (sortDirection === 'asc' ? 'sorted ascending' : 'sorted descending') : 'unsorted'}`}
                          >
                            <span className="truncate max-w-32">{column}</span>
                            <ArrowUpDown className="ml-2 h-3 w-3" />
                          </Button>
                          {dateInfo && colMeta ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                {badge}
                              </PopoverTrigger>
                              <PopoverContent className="w-72 text-xs normal-case tracking-normal" data-testid={`date-column-popover-${column}`}>
                                {colMeta.dateAmbiguity === 'ambiguous-mixed' ? (
                                  <>
                                    <p className="font-semibold mb-1">Ambiguous dates, kept as text</p>
                                    <p className="text-muted-foreground">
                                      Some values only make sense day-first (e.g. 13/05/2024) and others only month-first (05/13/2024), so this column is left as text.
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-semibold mb-1">Date column</p>
                                    <p className="text-muted-foreground">Format: {colMeta.detectedFormat}</p>
                                    {colMeta.earliestDate && (
                                      <p className="text-muted-foreground">Range: {colMeta.earliestDate} to {colMeta.latestDate}</p>
                                    )}
                                    <p className="text-muted-foreground mb-2">
                                      {colMeta.invalidDateCount ?? 0} value(s) aren't valid dates (e.g. month 13, Feb 30, text). They're kept as text and left out of date grouping, filters and charts.
                                    </p>
                                    {colMeta.dayFirst !== undefined && (
                                      <>
                                        <p className="mb-2" data-testid="date-order">
                                          Numeric dates read as <span className="font-semibold">{colMeta.dayFirst ? "day/month (DD/MM)" : "month/day (MM/DD)"}</span>
                                          {colMeta.dayFirstSource === 'data' && ", decided by the values"}
                                          {colMeta.dayFirstSource === 'locale' && ", from your browser's language settings"}
                                          {colMeta.dayFirstSource === 'user' && ", chosen by you"}.
                                        </p>
                                        {activeDataset?.dateSourceValues?.[column] ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => setDateDayFirst(column, !colMeta.dayFirst)}
                                          >
                                            Read as {colMeta.dayFirst ? "month/day (MM/DD)" : "day/month (DD/MM)"}
                                          </Button>
                                        ) : (
                                          <p className="text-muted-foreground">Re-import the file to switch the day/month order.</p>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}
                              </PopoverContent>
                            </Popover>
                          ) : (flagged || overridden) && colMeta ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                {badge}
                              </PopoverTrigger>
                              <PopoverContent className="w-64 text-xs normal-case tracking-normal">
                                {flagged ? (
                                  <>
                                    <p className="font-semibold mb-1">Might be categorical</p>
                                    <p className="text-muted-foreground mb-3">
                                      {colMeta.uniqueValueCount} distinct values, range {colMeta.minimumValue}–{colMeta.maximumValue}. Could be an ordinal or category code rather than a real measure.
                                    </p>
                                    <div className="flex flex-col gap-2">
                                      <Button size="sm" variant="default" className="w-full" onClick={() => setColumnTypeOverride(column, 'categorical')}>
                                        Treat as Categorical
                                      </Button>
                                      <Button size="sm" variant="outline" className="w-full" onClick={() => setColumnTypeOverride(column, 'numeric')}>
                                        Keep as Numeric
                                      </Button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-semibold mb-1">Type overridden</p>
                                    <p className="text-muted-foreground mb-3">
                                      Treated as {colMeta.userOverrideType} instead of the auto-detected {colMeta.inferredDataType}.
                                    </p>
                                    <Button size="sm" variant="outline" onClick={() => setColumnTypeOverride(column, null)}>
                                      Reset to auto-detected
                                    </Button>
                                  </>
                                )}
                              </PopoverContent>
                            </Popover>
                          ) : (
                            badge
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowVirtualizer.getVirtualItems().length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={dataset.columns.length} className="h-24 text-center text-muted-foreground">
                      No rows match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rowVirtualizer.getVirtualItems()[0].start > 0 && (
                      <TableRow style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }} className="hover:bg-transparent">
                        <TableCell colSpan={dataset.columns.length} className="p-0 border-0" />
                      </TableRow>
                    )}
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = paginatedData[virtualRow.index];
                      if (!row) return null;
                      return (
                        <TableRow 
                          key={virtualRow.key} 
                          data-index={virtualRow.index} 
                          className="h-[52px]"
                          ref={rowVirtualizer.measureElement}
                        >
                          {dataset.columns.map((column) => {
                            const cellStyle = formattingEngine.evaluateCompiledRules(
                              compiledFormattingRules,
                              row,
                              column
                            );
                            const isNumeric = getEffectiveColumnType(dataset, column) === 'numeric';
                            return (
                              <TableCell
                                key={column}
                                className="max-w-48 transition-colors"
                                style={
                                  cellStyle
                                    ? {
                                        color: cellStyle.textColor,
                                        backgroundColor: cellStyle.backgroundColor
                                      }
                                    : undefined
                                }
                              >
                                <div className={isNumeric ? "truncate text-right font-mono text-dataTable tabular-nums" : "truncate text-body"}>
                                  {row[column] === null || row[column] === undefined ? (
                                    <span className="text-muted-foreground italic font-sans">null</span>
                                  ) : (
                                    String(row[column])
                                  )}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end > 0 && (
                      <TableRow 
                        style={{ 
                          height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px` 
                        }} 
                        className="hover:bg-transparent"
                      >
                        <TableCell colSpan={dataset.columns.length} className="p-0 border-0" />
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (page > totalPages) return null;
              
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "premium" : "outline"}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}

      <DatasetUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        existingDataset={activeDataset}
        newParsedData={newParsedData}
        onConfirm={handleConfirmVersionUpdate}
      />
    </div>
  );
}