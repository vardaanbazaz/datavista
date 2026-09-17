import { Dataset, DataRow, DatasetMetadata, ColumnMetadata } from "@/shared/types";

/**
 * Trims whitespace and handles empty strings, converting them to null.
 */
export const cleanValue = (val: unknown): string | number | null => {
  if (val === null || val === undefined) return null;
  const strVal = String(val).trim();
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
 * Detects the type of a column based on its non-null values.
 */
export const detectColumnType = (values: (string | number | null)[]): 'numeric' | 'categorical' | 'date' => {
  const nonNullValues = values.filter((v): v is string | number => v !== null && v !== undefined && v !== '');

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
    // Check numeric
    if (!isNaN(Number(strVal)) && strVal !== "") {
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

  // Retrieve columns from headers, filtering out empty headers
  const rawColumns = Object.keys(rawData[0]).map(c => c.trim()).filter(Boolean);
  if (rawColumns.length === 0) {
    throw new Error("No valid columns found in the dataset headers.");
  }

  // Ensure unique column names to prevent duplicate key crashes
  const columnCounts: Record<string, number> = {};
  const columns = rawColumns.map(col => {
    if (columnCounts[col] === undefined) {
      columnCounts[col] = 1;
      return col;
    } else {
      columnCounts[col]++;
      return `${col}_${columnCounts[col]}`;
    }
  });

  // Map original columns keys to the deduplicated columns list
  const colMapping = rawColumns.reduce((acc, col, idx) => {
    acc[Object.keys(rawData[0])[idx]] = columns[idx];
    return acc;
  }, {} as Record<string, string>);

  const originalHeadersMap = columns.reduce((acc, col, idx) => {
    acc[col] = Object.keys(rawData[0])[idx];
    return acc;
  }, {} as Record<string, string>);

  const data: DataRow[] = rawData.map(row => {
    const processedRow: DataRow = {};
    Object.keys(row).forEach(originalCol => {
      const col = colMapping[originalCol];
      if (!col) return; // Skip if header was empty/filtered

      const cleanValResult = cleanValue(row[originalCol]);
      if (cleanValResult === null) {
        processedRow[col] = null;
      } else if (typeof cleanValResult === 'string' && hasLeadingZero(cleanValResult)) {
        // Preserve the original string so the leading zero isn't silently destroyed
        // (e.g. "01234" -> 1234). See detectColumnType, which forces such columns
        // to 'categorical' so the column type stays consistent with these string cells.
        processedRow[col] = cleanValResult;
      } else {
        const numVal = Number(cleanValResult);
        if (!isNaN(numVal) && cleanValResult !== "") {
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
          const num = Number(val);
          if (!isNaN(num)) {
            stats.validNumCount++;
            stats.sum += num;
            if (num < stats.min) stats.min = num;
            if (num > stats.max) stats.max = num;
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
      role
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
