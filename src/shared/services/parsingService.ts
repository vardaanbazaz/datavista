import { Dataset, DataRow, DatasetMetadata, ColumnMetadata, ImportIssuesSummary } from "@/shared/types";
import { parseStrictNumber, toNumberOrNull, trimAscii } from "@/shared/utils/numeric";
import { analyzeDateColumn, DateColumnAnalysis, localeDayFirst, parseDateValue, parseStoredDate, partsToUtcMs } from "@/shared/utils/dates";

/** Version of the date rule in utils/dates.ts that wrote a dataset's date cells (see DatasetMetadata.dateParserVersion). */
export const DATE_PARSER_VERSION = 2;

export interface ProcessOptions {
  /**
   * Day/month order for numeric dates ("05/06/2024") when a column's values don't decide it.
   * Defaults to the browser locale (en-IN, en-GB: day first; en-US: month first).
   */
  dayFirstDefault?: boolean;
  /** Parse problems from the import, stored in metadata (importIssues, parsingStatistics.errorCount). */
  importIssues?: ImportIssuesSummary;
  /** Called while the rows are cleaned and the columns analysed, with the share done (0..1). */
  onProgress?: (fraction: number) => void;
}

/**
 * Trims ASCII whitespace and handles empty strings, converting them to null. Non-breaking
 * and other Unicode spaces are part of the value and are kept.
 */
export const cleanValue = (val: unknown): string | number | null => {
  if (val === null || val === undefined) return null;
  const strVal = trimAscii(String(val));
  if (strVal === "" || strVal.toLowerCase() === "null" || strVal.toLowerCase() === "undefined" || strVal.toLowerCase() === "n/a") {
    return null;
  }
  return strVal;
};

/**
 * Matches a leading zero followed by more digits (e.g. "01234", "00501") — values shaped
 * like zip codes where coercing to a JS number would silently destroy the leading zero.
 * Deliberately does not match a leading zero on a negative number (e.g. "-0123") — that
 * shape is rare enough in practice to leave out of this narrow fix.
 */
const hasLeadingZero = (val: string): boolean => /^0\d+/.test(val);

/**
 * Header names the way pandas' read_csv (C parser) names them: a blank header becomes
 * "Unnamed: <index>", and a repeated name gets ".1", ".2", ... skipping any suffix that
 * is already a header in the file ("Name,Name,Name.1" -> "Name", "Name.2", "Name.1").
 * Already-unique, non-blank names are returned unchanged.
 */
export const normalizeHeaders = (headers: string[]): string[] => {
  const names = headers.map((h, i) => (h === "" ? `Unnamed: ${i}` : h));
  const counts = new Map<string, number>();
  for (let i = 0; i < names.length; i++) {
    const base = names[i];
    let name = base;
    let cur = counts.get(name) ?? 0;
    while (cur > 0) {
      counts.set(base, cur + 1);
      name = `${base}.${cur}`;
      cur = names.includes(name) ? cur + 1 : (counts.get(name) ?? 0);
    }
    names[i] = name;
    counts.set(name, cur + 1);
  }
  return names;
};

export interface ColumnInference {
  type: 'numeric' | 'categorical' | 'date';
  /** Date analysis of the column's values (see utils/dates.ts:analyzeDateColumn). */
  dates: DateColumnAnalysis;
}

/**
 * Detects the type of a column from its non-null values. Dates are checked first, so a
 * zero-padded date ("05/06/2024") isn't caught by the leading-zero rule. A column whose
 * numeric dates need day-first for some values and month-first for others stays text.
 */
export const inferColumn = (values: DataRow[string][], dayFirstDefault: boolean): ColumnInference => {
  const nonNullValues = values.filter((v): v is string | number | boolean => v !== null && v !== undefined && v !== '');
  const dates = analyzeDateColumn(nonNullValues, dayFirstDefault);

  if (nonNullValues.length === 0) return { type: 'categorical', dates };

  const total = nonNullValues.length;

  if (!dates.ambiguousMixed && dates.validCount / total > 0.8) {
    return { type: 'date', dates };
  }

  // A column containing any leading-zero numeric-looking string (e.g. zip codes) must not
  // be classified 'numeric' — those values are intentionally kept as strings at ingest
  // (see processRawData) to avoid losing the leading zero, so labeling the column 'numeric'
  // here would contradict the actual cell types and break strict typeof-based consumers.
  if (nonNullValues.some(val => hasLeadingZero(String(val)))) {
    return { type: 'categorical', dates };
  }

  // Numeric vote: the same strict rule every aggregation uses (see utils/numeric.ts).
  let numericCount = 0;
  for (const val of nonNullValues) {
    if (parseStrictNumber(String(val)) !== null) numericCount++;
  }

  if (numericCount / total > 0.8) {
    return { type: 'numeric', dates };
  }

  return { type: 'categorical', dates };
};

/**
 * Detects the type of a column based on its non-null values.
 */
export const detectColumnType = (
  values: DataRow[string][],
  dayFirstDefault: boolean = localeDayFirst()
): 'numeric' | 'categorical' | 'date' => inferColumn(values, dayFirstDefault).type;

/**
 * Processes raw array-of-objects data parsed from CSV/XLSX.
 * Validates columns, cleans values, converts numbers, detects column types, and formats results.
 */
export const processRawData = (
  rawData: Record<string, unknown>[],
  fileName: string,
  options: ProcessOptions = {}
): Dataset => {
  const dayFirstDefault = options.dayFirstDefault ?? localeDayFirst();
  const startTime = performance.now();
  if (!rawData || rawData.length === 0) {
    throw new Error("The file contains no data rows.");
  }

  // Name every header (blank -> "Unnamed: <i>", repeats -> "Name.1"), one per original key,
  // so names and values stay aligned. Dropping blank headers here used to shift every
  // later column onto its left neighbour's name.
  const originalKeys = Object.keys(rawData[0]);
  const columns = normalizeHeaders(originalKeys.map(k => trimAscii(k)));
  if (columns.length === 0) {
    throw new Error("No valid columns found in the dataset headers.");
  }

  // Map original column keys to the normalized column names
  const colMapping: Record<string, string> = {};
  const originalHeadersMap: Record<string, string> = {};
  originalKeys.forEach((key, idx) => {
    colMapping[key] = columns[idx];
    originalHeadersMap[columns[idx]] = key;
  });

  const onProgress = options.onProgress;
  const progressEvery = 50_000;
  const data: DataRow[] = rawData.map((row, rowIndex) => {
    if (onProgress && rowIndex % progressEvery === 0) onProgress(0.5 * (rowIndex / rawData.length));
    const processedRow: DataRow = {};
    Object.keys(row).forEach(originalCol => {
      const col = colMapping[originalCol];
      if (!col) return; // Key not present in the header row

      const cleanValResult = cleanValue(row[originalCol]);
      if (cleanValResult === null) {
        processedRow[col] = null;
      } else if (typeof cleanValResult === 'string' && hasLeadingZero(cleanValResult)) {
        // Preserve the original string so the leading zero isn't silently destroyed
        // (e.g. "01234" -> 1234). See detectColumnType, which forces such columns
        // to 'categorical' so the column type stays consistent with these string cells.
        processedRow[col] = cleanValResult;
      } else {
        const numVal = parseStrictNumber(String(cleanValResult));
        if (numVal !== null) {
          processedRow[col] = numVal;
        } else {
          processedRow[col] = String(cleanValResult);
        }
      }
    });
    return processedRow;
  });

  // Detect column types
  const columnTypes: Record<string, 'numeric' | 'categorical' | 'date'> = {};
  const dateInfo: Record<string, DateColumnAnalysis> = {};
  columns.forEach((col, colIndex) => {
    onProgress?.(0.5 + 0.4 * (colIndex / columns.length));
    const inference = inferColumn(data.map(row => row[col]), dayFirstDefault);
    columnTypes[col] = inference.type;
    dateInfo[col] = inference.dates;
  });

  // Date columns: store each valid date as a calendar string (utils/dates.ts). Values that
  // aren't valid dates keep their text and are ignored by date operations. Columns with
  // numeric D/M dates keep their original text so the day/month order can be switched.
  const dateSourceValues: Record<string, (string | null)[]> = {};
  columns.forEach(col => {
    if (columnTypes[col] !== 'date') return;
    const info = dateInfo[col];
    const dayFirst = info.dayFirst ?? dayFirstDefault;
    if (info.numericDayMonthCount > 0) {
      dateSourceValues[col] = data.map(row => (row[col] === null ? null : String(row[col])));
    }
    data.forEach(row => {
      const parsed = parseDateValue(row[col], dayFirst);
      if (parsed !== null) row[col] = parsed;
    });
  });

  onProgress?.(0.9);
  const datasetId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
  const datasetName = fileName.replace(/\.[^/.]+$/, "").trim() || "Dataset";
  const processingTimeMs = performance.now() - startTime;

  // Generate metadata in a single pass over final data
  const metadata = generateDatasetMetadata(
    datasetId,
    datasetName,
    data,
    columns,
    columnTypes,
    fileName,
    processingTimeMs,
    originalHeadersMap,
    dateInfo
  );
  if (options.importIssues) {
    metadata.parsingStatistics.errorCount = options.importIssues.issueCount;
    metadata.importIssues = options.importIssues;
  }
  onProgress?.(1);

  return {
    id: datasetId,
    name: datasetName,
    data,
    columns,
    columnTypes,
    metadata,
    ...(Object.keys(dateSourceValues).length > 0 ? { dateSourceValues } : {})
  };
};

export const generateDatasetMetadata = (
  datasetId: string,
  name: string,
  data: DataRow[],
  columns: string[],
  columnTypes: Record<string, 'numeric' | 'categorical' | 'date'>,
  originalFileName: string,
  processingTimeMs: number,
  originalHeadersMap: Record<string, string>,
  dateInfo: Record<string, DateColumnAnalysis> = {}
): DatasetMetadata => {
  const rowCount = data.length;
  const columnCount = columns.length;
  const originalFileType = originalFileName.split('.').pop()?.toLowerCase() || 'csv';

  interface ColStatAccumulator {
    missingCount: number;
    uniqueValuesMap: Map<string, number>;
    min: number;
    max: number;
    sum: number;
    validNumCount: number;
    minDate: string | null;
    maxDate: string | null;
    minDateMs: number;
    maxDateMs: number;
    invalidDateCount: number;
    allIntegers: boolean;
  }

  // Pre-initialize stats objects for each column
  const colStats = columns.reduce((acc, col) => {
    acc[col] = {
      missingCount: 0,
      uniqueValuesMap: new Map<string, number>(),
      min: Infinity,
      max: -Infinity,
      sum: 0,
      validNumCount: 0,
      minDate: null,
      maxDate: null,
      minDateMs: Infinity,
      maxDateMs: -Infinity,
      invalidDateCount: 0,
      allIntegers: true,
    };
    return acc;
  }, {} as Record<string, ColStatAccumulator>);

  // Single pass over the data to collect stats
  for (let i = 0; i < rowCount; i++) {
    const row = data[i];
    for (let j = 0; j < columnCount; j++) {
      const col = columns[j];
      const val = row[col];
      const stats = colStats[col];

      if (val === null || val === undefined || val === '') {
        stats.missingCount++;
      } else {
        const type = columnTypes[col];
        const strVal = String(val);
        
        // Update uniqueness mapping (cardinality)
        const count = stats.uniqueValuesMap.get(strVal) || 0;
        stats.uniqueValuesMap.set(strVal, count + 1);

        if (type === 'numeric') {
          const num = toNumberOrNull(val);
          if (num !== null) {
            stats.validNumCount++;
            stats.sum += num;
            if (num < stats.min) stats.min = num;
            if (num > stats.max) stats.max = num;
            if (!Number.isInteger(num)) stats.allIntegers = false;
          }
        } else if (type === 'date') {
          const parts = parseStoredDate(val);
          if (parts) {
            const ms = partsToUtcMs(parts);
            if (ms < stats.minDateMs) { stats.minDateMs = ms; stats.minDate = strVal; }
            if (ms > stats.maxDateMs) { stats.maxDateMs = ms; stats.maxDate = strVal; }
          } else {
            stats.invalidDateCount++;
          }
        }
      }
    }
  }

  const columnsMetadata: ColumnMetadata[] = columns.map(col => {
    const stats = colStats[col];
    const type = columnTypes[col];
    const uniqueCount = stats.uniqueValuesMap.size;
    const isNullable = stats.missingCount > 0;
    
    // Category cardinality (limit to top 100 values to avoid bloating memory)
    const categoryCardinality: Record<string, number> = {};
    if (type === 'categorical' || uniqueCount <= 100) {
      let idx = 0;
      for (const [key, count] of stats.uniqueValuesMap.entries()) {
        if (idx >= 100) break;
        categoryCardinality[key] = count;
        idx++;
      }
    }

    // Role detection
    let role: 'dimension' | 'measure' | 'date' | 'identifier' | 'calculated' | 'hidden' = 'dimension';
    if (type === 'numeric') {
      role = 'measure';
    } else if (type === 'date') {
      role = 'date';
    } else if (col.toLowerCase() === 'id' || col.toLowerCase() === 'key') {
      role = 'identifier';
    }

    return {
      id: `${datasetId}_${col}`,
      name: col,
      displayName: col,
      originalHeader: originalHeadersMap[col] || col,
      inferredDataType: type,
      nullableStatus: isNullable,
      uniqueValueCount: uniqueCount,
      missingValueCount: stats.missingCount,
      minimumValue: type === 'numeric' && stats.validNumCount > 0 ? stats.min : undefined,
      maximumValue: type === 'numeric' && stats.validNumCount > 0 ? stats.max : undefined,
      average: type === 'numeric' && stats.validNumCount > 0 ? stats.sum / stats.validNumCount : undefined,
      earliestDate: type === 'date' && stats.minDate ? stats.minDate : undefined,
      latestDate: type === 'date' && stats.maxDate ? stats.maxDate : undefined,
      detectedFormat: type === 'date' ? (dateInfo[col]?.formats.join(' | ') || 'YYYY-MM-DD') : undefined,
      ...(type === 'date' ? { invalidDateCount: stats.invalidDateCount } : {}),
      ...(type === 'date' && dateInfo[col]?.dayFirst !== undefined
        ? { dayFirst: dateInfo[col].dayFirst, dayFirstSource: dateInfo[col].dayFirstSource }
        : {}),
      ...(type !== 'date' && dateInfo[col]?.ambiguousMixed ? { dateAmbiguity: 'ambiguous-mixed' as const } : {}),
      categoryCardinality,
      role,
      allIntegerValues: type === 'numeric' ? (stats.validNumCount > 0 && stats.allIntegers) : false,
      userOverrideType: undefined
    };
  });

  const now = Date.now();
  return {
    datasetId,
    name,
    createdAt: now,
    updatedAt: now,
    rowCount,
    columnCount,
    originalFileName,
    originalFileType,
    parsingStatistics: {
      processingTimeMs,
      errorCount: 0
    },
    version: 1,
    dateParserVersion: DATE_PARSER_VERSION,
    columns: columnsMetadata
  };
};

/**
 * Re-reads a date column's original text with the given day/month order (the per-column
 * day/month toggle) and recomputes that column's metadata. Returns the dataset unchanged
 * when the original text wasn't kept (no numeric D/M values, or an older import).
 */
export const reparseDateColumn = (dataset: Dataset, column: string, dayFirst: boolean): Dataset => {
  const sources = dataset.dateSourceValues?.[column];
  if (!sources || sources.length !== dataset.data.length || !dataset.metadata) return dataset;

  const data = dataset.data.map((row, i) => {
    const src = sources[i];
    return { ...row, [column]: src === null ? null : (parseDateValue(src, dayFirst) ?? src) };
  });
  const analysis = analyzeDateColumn(sources.filter((v): v is string => v !== null), dayFirst, dayFirst);
  const fresh = generateDatasetMetadata(
    dataset.id, dataset.name, data, [column], { [column]: 'date' },
    dataset.metadata.originalFileName, 0, {}, { [column]: analysis }
  ).columns[0];

  return {
    ...dataset,
    data,
    metadata: {
      ...dataset.metadata,
      columns: dataset.metadata.columns.map(c =>
        c.name === column
          ? {
              ...c,
              earliestDate: fresh.earliestDate,
              latestDate: fresh.latestDate,
              detectedFormat: fresh.detectedFormat,
              invalidDateCount: fresh.invalidDateCount,
              uniqueValueCount: fresh.uniqueValueCount,
              categoryCardinality: fresh.categoryCardinality,
              dayFirst,
              dayFirstSource: 'user' as const,
            }
          : c
      ),
    },
  };
};

/**
 * True for a dataset imported before timezone-free dates (no dateParserVersion) that has
 * date columns and whose notice wasn't dismissed. Its date cells may be a day early and the
 * original text wasn't kept, so the only fix is re-importing the file.
 */
export const needsDateReimportNotice = (dataset: Dataset | null | undefined): boolean => {
  const meta = dataset?.metadata;
  if (!meta || meta.dateParserVersion !== undefined || meta.dateReimportNoticeDismissed) return false;
  return meta.columns.some(c => c.inferredDataType === 'date');
};
