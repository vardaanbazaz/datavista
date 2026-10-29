import { Dataset, DataRow, Query, QueryResult, QuerySort, QueryFilters, FilterCondition, QueryAggregation, QueryGroupBy } from "../types";
import { windowEngine } from "./window";
import { executionPlanner, filterCache, processCache, queryCache } from "./optimizer";
import { aggregationsAdapter } from "./aggregations";
import { columnNumbers, mean, median, minMax, sampleStdDev, sum, toNumberOrNull } from "@/shared/utils/numeric";
import { calendarDay, calendarFromPickerDate, compareCells, isStoredDate, parseStoredDate, partsToUtcMs, periodKey, rangeBoundDay } from "@/shared/utils/dates";

/**
 * Resolves a filter operand (cell value or filter target) to a comparable number for
 * greaterThan/lessThan/between. Plain numbers and numeric strings use the shared numeric
 * rule (a blank cell is not 0). Dates compare on their calendar parts (utils/dates.ts): a
 * stored date string or a date-picker Date (its local calendar day) becomes the parts'
 * UTC-ms, so a picked "Jan 5" and a stored "2024-01-05" are the same number in every zone.
 */
function toComparableNumber(v: unknown): number | null {
  if (v instanceof Date) {
    const day = calendarFromPickerDate(v);
    const p = day ? parseStoredDate(day) : null;
    return p ? partsToUtcMs(p) : null;
  }
  const n = toNumberOrNull(v);
  if (n !== null) return n;
  const p = parseStoredDate(v);
  return p ? partsToUtcMs(p) : null;
}

/** A range end given as a whole day (picker Date or "YYYY-MM-DD") includes that day's times. */
function isWholeDayBound(v: unknown): boolean {
  return v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()));
}


/**
 * Columns whose `count` means "count of valid numbers" (effective type numeric, so a
 * user's type override applies). Every other column counts its non-null cells.
 */
export function numericColumnSet(dataset: Dataset): Set<string> {
  // Calculated/window columns are in both lists today; reading metadata too keeps `count`
  // right for any column that only metadata knows about.
  const names = new Set([...dataset.columns, ...(dataset.metadata?.columns.map(c => c.name) ?? [])]);
  const numeric = new Set<string>();
  for (const col of names) {
    const meta = dataset.metadata?.columns.find(c => c.name === col);
    const type = meta?.userOverrideType ?? dataset.columnTypes[col] ?? meta?.inferredDataType;
    if (type === 'numeric') numeric.add(col);
  }
  return numeric;
}

/**
 * One non-advanced aggregation over a slice of rows. Values go through the shared numeric
 * rule (utils/numeric.ts): blanks, null tokens and junk are excluded, never counted as 0.
 * Without `numericColumns`, `count` counts valid numbers. With no valid numbers, every
 * result is 0 (the result type has no "empty" value). Std. deviation is the sample one.
 */
export function aggregateRows(
  rows: DataRow[],
  column: string,
  operator: QueryAggregation['operator'],
  numericColumns?: ReadonlySet<string>
): number {
  if (operator === 'count_rows') return rows.length;
  if (operator === 'count' && numericColumns && !numericColumns.has(column)) {
    let n = 0;
    for (const r of rows) if (r[column] !== null && r[column] !== undefined && r[column] !== '') n++;
    return n;
  }
  const values = columnNumbers(rows, column);
  switch (operator) {
    case 'count':
      return values.length;
    case 'sum':
      return sum(values);
    case 'avg':
      return mean(values);
    case 'min':
      return minMax(values)?.min ?? 0;
    case 'max':
      return minMax(values)?.max ?? 0;
    case 'median':
      return median(values);
    case 'stddev':
      return sampleStdDev(values);
    default:
      return 0;
  }
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

    const numericColumns = numericColumnSet(dataset);

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
          filteredData = this.applyFilters(filteredData, query.filters);
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
          columns,
          numericColumns
        );
        if (query.sorting && query.sorting.length > 0) {
          processedData = this.applySorting(processedData, query.sorting);
        }
      } else if (query.aggregations && query.aggregations.length > 0) {
        summary = this.computeAggregations(processedData, query.aggregations, numericColumns);
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
    filters: QueryFilters
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

    // B. Date range filters: inclusive calendar days ("YYYY-MM-DD" strings compare in date
    // order). A datetime on the end day is inside the range. A cell that isn't a valid date
    // (blank, "invalid", month 13) is outside any active range.
    if (filters.dateRangeFilters) {
      Object.entries(filters.dateRangeFilters).forEach(([column, range]) => {
        if (range && (range.start || range.end)) {
          const startDay = range.start ? rangeBoundDay(range.start) : null;
          const endDay = range.end ? rangeBoundDay(range.end) : null;

          result = result.filter(row => {
            const day = calendarDay(row[column]);
            if (day === null) return false;
            if (startDay !== null && day < startDay) return false;
            if (endDay !== null && day > endDay) return false;
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
          // A picked date (global filter "Date = Jan 5") matches that calendar day, times included.
          if (value instanceof Date) return calendarDay(cellVal) !== null && calendarDay(cellVal) === rangeBoundDay(value);
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
              let endNum = toComparableNumber(range.end);
              if (endNum !== null && isWholeDayBound(range.end) && isStoredDate(cellVal)) endNum += 86_400_000 - 1;
              if (endNum !== null && cellNum > endNum) return false;
            }
            return true;
          }
          return false;
        default:
          // Unrecognized operator (e.g. from a malformed AI-generated query) — fail
          // safe by excluding the row, consistent with the other invalid-shape cases
          // above ('in' with a non-array value, 'between' with a non-object value),
          // rather than silently matching every row.
          return false;
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

        const comp = compareCells(aVal, bVal);
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
    allColumns: string[],
    numericColumns?: ReadonlySet<string>
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
        // From the stored date's parts (utils/dates.ts); invalid dates join no bucket.
        const periodValue = periodKey(rawVal, period);
        if (periodValue === null) return;
        key = periodValue;
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
          value = aggregateRows(groupRows, aggCol, operator, numericColumns);
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
  computeAggregations(
    data: DataRow[],
    aggregations: QueryAggregation[],
    numericColumns?: ReadonlySet<string>
  ): Record<string, number> {
    const summary: Record<string, number> = {};

    aggregations.forEach(agg => {
      const { column, operator, alias } = agg;
      let value: number | null = 0;

      if (aggregationsAdapter.isAdvanced(operator)) {
        value = aggregationsAdapter.evaluate(agg, data);
      } else {
        value = aggregateRows(data, column, operator, numericColumns);
      }
      summary[alias] = value ?? 0;
    });

    return summary;
  }
};
export default queryEngine;
