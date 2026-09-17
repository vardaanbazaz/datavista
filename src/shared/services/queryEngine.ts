import { Dataset, DataRow, Query, QueryResult, QuerySort, QueryFilters, FilterCondition, QueryAggregation } from "../types";
import { windowEngine } from "./window";
import { executionPlanner, filterCache, processCache, queryCache } from "./optimizer";
import { aggregationsAdapter } from "./aggregations";

/**
 * Standard ISO week string helper: YYYY-Www
 */
function getWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Standard date parser helper
 */
function parseDate(val: string | number | Date | null | undefined): Date | null {
  if (val === null || val === undefined) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Helper to compute standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Resolves a filter operand (cell value or filter target) to a comparable number for
 * greaterThan/lessThan/between. Plain numbers and numeric strings use Number() as before;
 * date strings/Date objects (which Number() turns into NaN) fall back to date parsing so
 * date-range filters don't silently match zero rows.
 */
function toComparableNumber(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return isNaN(t) ? null : t;
  }
  const n = Number(v);
  if (!isNaN(n)) return n;
  // Only fall back to date parsing for strings that plausibly encode a date (contain a
  // 4-digit year). JS's Date parser is permissive enough that ambiguous, non-date strings
  // like "5/3" or "10-20" (a categorical code, a ratio, ...) silently resolve to a real but
  // wrong date instead of failing, which would make greaterThan/lessThan/between misbehave
  // on non-date columns that share this code path.
  if (typeof v === 'string' && /\d{4}/.test(v)) {
    const d = parseDate(v);
    return d ? d.getTime() : null;
  }
  return null;
}

/**
 * Helper to compute median
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export const queryEngine = {
  /**
   * Clears the query cache
   */
  clearCache(): void {
    queryCache.clearAll();
  },

  /**
   * Executes a query against a dataset
   */
  execute(dataset: Dataset, query: Query): QueryResult {
    const startTime = performance.now();
    const totalRowsBeforeFilter = dataset.data.length;

    // Resolve column definitions from metadata if available (preferred)
    const columns = dataset.metadata
      ? dataset.metadata.columns.map(c => c.name)
      : dataset.columns;

    const columnTypes = dataset.metadata
      ? dataset.metadata.columns.reduce((acc, col) => {
          acc[col.name] = col.inferredDataType;
          return acc;
        }, {} as Record<string, 'numeric' | 'categorical' | 'date'>)
      : dataset.columnTypes;

    const bypassCache = !!query.options?.bypassCache;
    const plan = bypassCache
      ? { steps: ["FILTER", "PROCESS", "PAGINATE"], reuseFilterData: null, reuseProcessResult: null, filterCacheKey: "", processCacheKey: "" }
      : executionPlanner.generatePlan(dataset, query);

    let filteredData: DataRow[] = [];
    let processedData: DataRow[] = [];
    let summary: Record<string, number> | undefined = undefined;
    let totalRowsAfterFilter = 0;
    let cacheHit = false;
    let timeSaved = 0;

    if (plan.steps.includes("REUSE_PROCESS") && plan.reuseProcessResult) {
      processedData = plan.reuseProcessResult.rows;
      summary = plan.reuseProcessResult.summary;
      totalRowsAfterFilter = plan.reuseProcessResult.metadata.totalRowsAfterFilter;
      cacheHit = true;
      const elapsed = performance.now() - startTime;
      timeSaved = Math.max(0, plan.reuseProcessResult.metadata.executionTimeMs - elapsed);
    } else {
      // 1. FILTERING STAGE
      if (plan.steps.includes("REUSE_FILTER") && plan.reuseFilterData) {
        filteredData = plan.reuseFilterData;
      } else {
        filteredData = [...dataset.data];
        if (query.filters) {
          filteredData = this.applyFilters(filteredData, query.filters, columnTypes);
        }
        if (!bypassCache) {
          filterCache.set(plan.filterCacheKey, dataset.id, filteredData, filteredData.length);
        }
      }

      totalRowsAfterFilter = filteredData.length;

      // 2. PROCESS STAGE (Sorting, Grouping, Aggregation, Windowing)
      processedData = filteredData;
      if (!query.groupBy && query.sorting && query.sorting.length > 0) {
        processedData = this.applySorting(processedData, query.sorting);
      }

      if (query.groupBy) {
        processedData = this.applyGroupingAndAggregations(
          processedData,
          query.groupBy,
          query.aggregations || [],
          columnTypes,
          columns
        );
        if (query.sorting && query.sorting.length > 0) {
          processedData = this.applySorting(processedData, query.sorting);
        }
      } else if (query.aggregations && query.aggregations.length > 0) {
        summary = this.computeAggregations(processedData, query.aggregations);
      }

      if (query.windowQueries && query.windowQueries.length > 0) {
        processedData = windowEngine.execute(processedData, query.windowQueries);
      }

      if (!bypassCache) {
        const processTimeMs = performance.now() - startTime;
        const cachedPayload: QueryResult = {
          rows: processedData,
          summary,
          metadata: {
            executionTimeMs: processTimeMs,
            cacheHit: false,
            totalRowsBeforeFilter,
            totalRowsAfterFilter,
            totalPages: 1,
            currentPage: 1
          }
        };
        processCache.set(plan.processCacheKey, dataset.id, cachedPayload, processedData.length);
      }
    }

    // 3. PAGINATION STAGE
    let paginatedRows = processedData;
    let totalPages = 1;
    let currentPage = 1;

    if (query.pagination) {
      const { page = 1, pageSize = 25 } = query.pagination;
      currentPage = page;

      if (pageSize !== 'all') {
        totalPages = Math.ceil(processedData.length / pageSize) || 1;
        const resolvedPage = Math.min(page, totalPages);
        currentPage = resolvedPage;

        paginatedRows = processedData.slice(
          (resolvedPage - 1) * pageSize,
          resolvedPage * pageSize
        );
      }
    }

    const executionTimeMs = performance.now() - startTime;

    return {
      rows: paginatedRows,
      summary,
      metadata: {
        executionTimeMs,
        cacheHit,
        totalRowsBeforeFilter,
        totalRowsAfterFilter,
        totalPages,
        currentPage,
        optimizerTimeSavedMs: timeSaved > 0 ? timeSaved : undefined
      }
    };
  },

  /**
   * Applies filters to rows
   */
  applyFilters(
    data: DataRow[],
    filters: QueryFilters,
    columnTypes: Record<string, 'numeric' | 'categorical' | 'date'>
  ): DataRow[] {
    let result = data;

    // A. Categorical filters
    if (filters.categoricalFilters) {
      Object.entries(filters.categoricalFilters).forEach(([column, selectedValues]) => {
        if (selectedValues && selectedValues.length > 0) {
          result = result.filter(row => selectedValues.includes(String(row[column])));
        }
      });
    }

    // B. Date range filters
    if (filters.dateRangeFilters) {
      Object.entries(filters.dateRangeFilters).forEach(([column, range]) => {
        if (range && (range.start || range.end)) {
          const parsedStart = range.start ? new Date(range.start).getTime() : null;
          const parsedEnd = range.end ? new Date(range.end).getTime() : null;
          
          result = result.filter(row => {
            const val = row[column];
            if (val === null || val === undefined) return false;
            
            const timestamp = new Date(val as string).getTime();
            if (isNaN(timestamp)) return true; // skip invalid dates
            
            if (parsedStart !== null && timestamp < parsedStart) return false;
            if (parsedEnd !== null && timestamp > parsedEnd) return false;
            
            return true;
          });
        }
      });
    }

    // C. Search filter (Across all columns, case-insensitive)
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(value =>
          value !== null && value !== undefined && String(value).toLowerCase().includes(searchTerm)
        )
      );
    }

    // D. Custom conditions
    if (filters.conditions && filters.conditions.length > 0) {
      filters.conditions.forEach(cond => {
        result = this.applyCondition(result, cond);
      });
    }

    return result;
  },

  /**
   * Applies a single FilterCondition
   */
  applyCondition(data: DataRow[], cond: FilterCondition): DataRow[] {
    const { column, operator, value } = cond;
    if (value === undefined || value === null) return data;

    return data.filter(row => {
      const cellVal = row[column];
      if (cellVal === null || cellVal === undefined) return false;

      switch (operator) {
        case 'equals':
          return String(cellVal) === String(value);
        case 'contains':
          return String(cellVal).toLowerCase().includes(String(value).toLowerCase());
        case 'in':
          if (Array.isArray(value)) {
            return value.map(String).includes(String(cellVal));
          }
          return false;
        case 'greaterThan': {
          const a = toComparableNumber(cellVal);
          const b = toComparableNumber(value);
          return a !== null && b !== null && a > b;
        }
        case 'lessThan': {
          const a = toComparableNumber(cellVal);
          const b = toComparableNumber(value);
          return a !== null && b !== null && a < b;
        }
        case 'startsWith':
          return String(cellVal).startsWith(String(value));
        case 'endsWith':
          return String(cellVal).endsWith(String(value));
        case 'between':
          if (typeof value === 'object' && value !== null) {
            const range = value as { start?: string | Date | number; end?: string | Date | number };
            const cellNum = toComparableNumber(cellVal);
            if (cellNum === null) return false;
            if (range.start !== undefined) {
              const startNum = toComparableNumber(range.start);
              if (startNum !== null && cellNum < startNum) return false;
            }
            if (range.end !== undefined) {
              const endNum = toComparableNumber(range.end);
              if (endNum !== null && cellNum > endNum) return false;
            }
            return true;
          }
          return false;
        default:
          return true;
      }
    });
  },

  /**
   * Multi-level sorting
   */
  applySorting(data: DataRow[], sorting: QuerySort[]): DataRow[] {
    return [...data].sort((a, b) => {
      for (const sort of sorting) {
        const { column, direction } = sort;
        const aVal = a[column];
        const bVal = b[column];

        // Null handling: keep nulls at the end of the table
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        let comp = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comp = aVal - bVal;
        } else {
          comp = String(aVal).localeCompare(String(bVal));
        }

        if (comp !== 0) {
          return direction === 'asc' ? comp : -comp;
        }
      }
      return 0;
    });
  },

  /**
   * Groups rows and calculates aggregations for each group
   */
  applyGroupingAndAggregations(
    data: DataRow[],
    groupBy: QueryGroupBy,
    aggregations: QueryAggregation[],
    columnTypes: Record<string, 'numeric' | 'categorical' | 'date'>,
    allColumns: string[]
  ): DataRow[] {
    const { column, period } = groupBy;
    const isDateCol = columnTypes[column] === 'date';

    // 1. Group rows by key
    const groups = new Map<string, DataRow[]>();
    
    data.forEach(row => {
      const rawVal = row[column];
      if (rawVal === null || rawVal === undefined) return;

      let key = '';
      if (isDateCol && period) {
        const date = parseDate(rawVal);
        if (!date) return;
        
        switch (period) {
          case 'year':
            key = date.getFullYear().toString();
            break;
          case 'quarter':
            key = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
            break;
          case 'month':
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          case 'week':
            key = getWeekString(date);
            break;
          case 'day':
          default:
            key = date.toISOString().split('T')[0];
            break;
        }
      } else {
        key = String(rawVal);
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    });

    const resultRows: DataRow[] = [];

    // 2. Perform aggregations for each group
    // In backward-compatibility mode: if no aggregations are specified, sum all numeric columns
    const finalAggregations = aggregations.length > 0 
      ? aggregations 
      : allColumns
          .filter(col => columnTypes[col] === 'numeric')
          .map(col => ({ column: col, operator: 'sum' as const, alias: col }));

    groups.forEach((groupRows, key) => {
      const resultRow: DataRow = {
        [column]: key,
      };

      // Add default count field if aggregations are auto-generated
      if (aggregations.length === 0) {
        resultRow['count'] = groupRows.length;
      }

      finalAggregations.forEach(agg => {
        const { column: aggCol, operator, alias } = agg;
        let value: number | null = null;

        if (aggregationsAdapter.isAdvanced(operator)) {
          value = aggregationsAdapter.evaluate(agg, groupRows);
        } else {
          const numericValues = groupRows
            .map(r => Number(r[aggCol]))
            .filter(v => !isNaN(v) && v !== null && v !== undefined);

          switch (operator) {
            case 'count':
              value = groupRows.filter(r => r[aggCol] !== null && r[aggCol] !== undefined).length;
              break;
            case 'sum':
              value = numericValues.reduce((s, v) => s + v, 0);
              break;
            case 'avg':
              value = numericValues.length > 0 
                ? numericValues.reduce((s, v) => s + v, 0) / numericValues.length 
                : 0;
              break;
            case 'min':
              value = numericValues.length > 0
                ? numericValues.reduce((m, v) => (v < m ? v : m), numericValues[0])
                : 0;
              break;
            case 'max':
              value = numericValues.length > 0
                ? numericValues.reduce((m, v) => (v > m ? v : m), numericValues[0])
                : 0;
              break;
            case 'median':
              value = calculateMedian(numericValues);
              break;
            case 'stddev':
              value = calculateStdDev(numericValues);
              break;
          }
        }
        resultRow[alias] = value;
      });

      resultRows.push(resultRow);
    });

    return resultRows;
  },

  /**
   * Computes aggregations over the entire dataset (no grouping)
   */
  computeAggregations(data: DataRow[], aggregations: QueryAggregation[]): Record<string, number> {
    const summary: Record<string, number> = {};

    aggregations.forEach(agg => {
      const { column, operator, alias } = agg;
      let value: number | null = 0;

      if (aggregationsAdapter.isAdvanced(operator)) {
        value = aggregationsAdapter.evaluate(agg, data);
      } else {
        const numericValues = data
          .map(r => Number(r[column]))
          .filter(v => !isNaN(v) && v !== null && v !== undefined);

        switch (operator) {
          case 'count':
            value = data.filter(r => r[column] !== null && r[column] !== undefined).length;
            break;
          case 'sum':
            value = numericValues.reduce((s, v) => s + v, 0);
            break;
          case 'avg':
            value = numericValues.length > 0 
              ? numericValues.reduce((s, v) => s + v, 0) / numericValues.length 
              : 0;
            break;
          case 'min':
            value = numericValues.length > 0
              ? numericValues.reduce((m, v) => (v < m ? v : m), numericValues[0])
              : 0;
            break;
          case 'max':
            value = numericValues.length > 0
              ? numericValues.reduce((m, v) => (v > m ? v : m), numericValues[0])
              : 0;
            break;
          case 'median':
            value = calculateMedian(numericValues);
            break;
          case 'stddev':
            value = calculateStdDev(numericValues);
            break;
        }
      }
      summary[alias] = value ?? 0;
    });

    return summary;
  }
};
export default queryEngine;
