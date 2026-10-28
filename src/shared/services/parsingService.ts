import { Dataset, DataRow, DatasetMetadata, ColumnMetadata } from "@/shared/types";
import { parseStrictNumber, toNumberOrNull, trimAscii } from "@/shared/utils/numeric";

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
 * Robust date check that avoids treating small plain numbers or unrelated strings as dates.
 */
const isDateString = (val: string): boolean => {
  // Check if it's a pure number or has letters but doesn't look like a date
  if (/^\d+$/.test(val)) {
    // Pure integer: only treat as date if it could be a year (e.g. 1900 - 2100)
    const year = Number(val);
    return year >= 1900 && year <= 2100;
  }

  // Regex checks for common date formats: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY, etc.
  const dateRegex = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const monthWordRegex = /^[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}/; // e.g. "January 15, 2021"

  if (dateRegex.test(val) || isoRegex.test(val) || monthWordRegex.test(val)) {
    const timestamp = Date.parse(val);
    return !isNaN(timestamp);
  }

  return false;
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

/**
 * Detects the type of a column based on its non-null values.
 */
export const detectColumnType = (values: DataRow[string][]): 'numeric' | 'categorical' | 'date' => {
  const nonNullValues = values.filter((v): v is string | number | boolean => v !== null && v !== undefined && v !== '');

  if (nonNullValues.length === 0) return 'categorical';

  // A column containing any leading-zero numeric-looking string (e.g. zip codes) must not
  // be classified 'numeric' — those values are intentionally kept as strings at ingest
  // (see processRawData) to avoid losing the leading zero, so labeling the column 'numeric'
  // here would contradict the actual cell types and break strict typeof-based consumers.
  if (nonNullValues.some(val => hasLeadingZero(String(val)))) {
    return 'categorical';
  }

  // Count matches
  let numericCount = 0;
  let dateCount = 0;

  nonNullValues.forEach(val => {
    const strVal = String(val);
    // Check numeric (the same strict rule every aggregation uses, see utils/numeric.ts)
    if (parseStrictNumber(strVal) !== null) {
      numericCount++;
    }
    // Check date
    if (isDateString(strVal)) {
      dateCount++;
    }
  });

  const total = nonNullValues.length;

  if (numericCount / total > 0.8) {
    return 'numeric';
  }

  if (dateCount / total > 0.8) {
    return 'date';
  }

  return 'categorical';
};

/**
 * Processes raw array-of-objects data parsed from CSV/XLSX.
 * Validates columns, cleans values, converts numbers, detects column types, and formats results.
 */
export const processRawData = (rawData: Record<string, unknown>[], fileName: string): Dataset => {
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

  const data: DataRow[] = rawData.map(row => {
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
  columns.forEach(col => {
    const columnValues = data.map(row => row[col]);
    columnTypes[col] = detectColumnType(columnValues);
  });

  // Format clean date strings if column type is date
  data.forEach(row => {
    columns.forEach(col => {
      if (columnTypes[col] === 'date' && row[col] !== null) {
        const strVal = String(row[col]);
        const timestamp = Date.parse(strVal);
        if (!isNaN(timestamp)) {
          // Normalize to ISO-style string date YYYY-MM-DD
          row[col] = new Date(timestamp).toISOString().split('T')[0];
        }
      }
    });
  });

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
    originalHeadersMap
  );

  return {
    id: datasetId,
    name: datasetName,
    data,
    columns,
    columnTypes,
    metadata
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
  originalHeadersMap: Record<string, string>
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
    minDate: Date | null;
    maxDate: Date | null;
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
          const date = new Date(strVal);
          if (!isNaN(date.getTime())) {
            if (!stats.minDate || date < stats.minDate) stats.minDate = date;
            if (!stats.maxDate || date > stats.maxDate) stats.maxDate = date;
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
      earliestDate: type === 'date' && stats.minDate ? stats.minDate.toISOString().split('T')[0] : undefined,
      latestDate: type === 'date' && stats.maxDate ? stats.maxDate.toISOString().split('T')[0] : undefined,
      detectedFormat: type === 'date' ? 'YYYY-MM-DD' : undefined,
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
    columns: columnsMetadata
  };
};
