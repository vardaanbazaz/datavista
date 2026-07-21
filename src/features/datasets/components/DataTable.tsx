import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Search, ArrowUpDown, Download, Palette } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Dataset, Query, DataRow, ConditionalFormatRule } from "@/shared/types";
import { queryEngine } from "@/shared/services/queryEngine";
import { formattingEngine } from "@/shared/services/formattingEngine";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { CalculatedFieldsManager } from "./CalculatedFieldsManager";
import { QueryPerformanceBadge } from "@/features/dashboard/components/QueryPerformanceBadge";
import { ConditionalFormattingBuilder } from "@/features/dashboards/components/ConditionalFormattingBuilder";

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

  const activeDataset = customDataset !== undefined ? customDataset : activeDatasetStore;
  const storeData = customData !== undefined ? customData : storeFilteredData;

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
    
    // Performance optimization: if no filters are active, use precomputed metadata
    const isFiltered = filteredData.length !== dataset.data.length || !!searchTerm || (filterColumn !== 'none' && !!filterValue);
    if (!isFiltered && dataset.metadata) {
      dataset.metadata.columns.forEach(col => {
        if (
          col.inferredDataType === 'numeric' && 
          col.minimumValue !== undefined && 
          col.maximumValue !== undefined && 
          col.average !== undefined
        ) {
          stats[col.name] = {
            min: col.minimumValue,
            max: col.maximumValue,
            mean: col.average,
            count: dataset.metadata!.rowCount - col.missingValueCount
          };
        }
      });
      return stats;
    }
    
    dataset.columns.forEach(col => {
      if (dataset.columnTypes[col] === 'numeric') {
        const values = filteredData
          .map(row => row[col])
          .filter(val => val !== null && val !== undefined && typeof val === 'number') as number[];
        
        if (values.length > 0) {
          stats[col] = {
            min: Math.min(...values),
            max: Math.max(...values),
            mean: values.reduce((sum, val) => sum + val, 0) / values.length,
            count: values.length
          };
        }
      }
    });
    
    return stats;
  }, [dataset, filteredData, searchTerm, filterColumn, filterValue]);

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
    <div className="space-y-6">
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
              <Button onClick={handleExport} variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        {/* Conditional Formatting Dialog */}
        <Dialog open={isFormattingOpen} onOpenChange={setIsFormattingOpen}>
          <DialogContent className="max-w-4xl glass border-white/20 shadow-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
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

      {/* Summary Statistics */}
      {Object.keys(summaryStats).length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Summary Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(summaryStats).map(([column, stats]) => (
                <div key={column} className="p-3 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">{column}</h4>
                  <div className="space-y-1 text-sm">
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
            className="h-[500px] overflow-auto border rounded-md relative scroll-container"
          >
            <Table className="relative">
              <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                <TableRow>
                  {dataset.columns.map((column) => (
                    <TableHead 
                      key={column} 
                      className="bg-card/95 backdrop-blur-sm"
                    >
                      <Button
                        variant="ghost"
                        className="h-auto p-2 justify-start font-medium"
                        onClick={() => handleSort(column)}
                      >
                        <span className="truncate max-w-32">{column}</span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {dataset.columnTypes[column]}
                        </Badge>
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                      </Button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowVirtualizer.getVirtualItems().length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={dataset.columns.length} className="h-24 text-center">
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
                                <div className="truncate font-medium">
                                  {row[column] === null || row[column] === undefined ? (
                                    <span className="text-muted-foreground italic">null</span>
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
    </div>
  );
}