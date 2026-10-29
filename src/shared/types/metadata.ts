export interface ColumnMetadata {
  id: string;
  name: string;
  displayName: string;
  originalHeader: string;
  inferredDataType: 'numeric' | 'categorical' | 'date';
  nullableStatus: boolean;
  uniqueValueCount: number;
  missingValueCount: number;
  minimumValue?: number;
  maximumValue?: number;
  average?: number;
  earliestDate?: string;
  latestDate?: string;
  /** Date columns: source formats seen, most common first ("MM/DD/YYYY | D-Mon-YY"). */
  detectedFormat?: string;
  /** Date columns with numeric D/M values ("05/06/2024"): true when the first field is the day. */
  dayFirst?: boolean;
  /** Where dayFirst came from: the column's values, the browser locale, or the user's toggle. */
  dayFirstSource?: 'data' | 'locale' | 'user';
  /** Date columns: non-blank values that are not valid dates (month 13, Feb 30, "invalid"). Kept as text, ignored by every date operation. */
  invalidDateCount?: number;
  /** Set on a text column whose numeric dates need day-first for some values and month-first for others. */
  dateAmbiguity?: 'ambiguous-mixed';
  categoryCardinality?: Record<string, number>;
  role: 'dimension' | 'measure' | 'date' | 'identifier' | 'calculated' | 'hidden' | 'window';
  allIntegerValues: boolean;
  userOverrideType?: 'numeric' | 'categorical' | 'date' | null;
  /** Data-quality findings for this column (services/dataQuality.ts). Absent on datasets saved before them. */
  quality?: ColumnQuality;
}

export interface ValueCount {
  value: string;
  count: number;
}

/** What a column's values say about their own quality, computed with its metadata. */
export interface ColumnQuality {
  /** Non-blank cells that aren't valid for the column's type (numeric/date only), with the most common ones. */
  invalidCount: number;
  invalidSamples: ValueCount[];
  /** Categorical columns: the 5 most common values. */
  topValues?: ValueCount[];
  /** Categorical columns: groups of values that differ only by case or whitespace, most common first. */
  labelVariants?: ValueCount[][];
  /** Numeric columns: one value that looks like a "missing" code (-1, -99, 9999). */
  sentinel?: { value: number; count: number; reason: 'negative' | 'year' | 'nines' };
  /** Text values like "10,000+", "19M": how many non-blank cells "Convert to number…" would read. */
  suffixCandidate?: { convertible: number; total: number };
}

/**
 * One change to a column's values, kept so it can be shown and undone. The column's original
 * cells are in Dataset.fixSourceValues; services/columnFixes.ts replays every fix of a column
 * from them, in order.
 */
export interface ColumnFix {
  id: string;
  column: string;
  kind: 'sentinel' | 'currency' | 'thousands' | 'numberSuffix' | 'mergeLabels';
  /** Applied by the import (currency, thousands) rather than chosen by the user. */
  auto: boolean;
  /** The column's type before this fix. */
  previousType: 'numeric' | 'categorical' | 'date';
  /** Cells this fix changed when it was applied. */
  changedCount: number;
  /** sentinel: the value that now means "missing". */
  sentinel?: number;
  /** currency: ISO-like code and the mark as written in the file ("$", "ksh"). */
  currency?: { code: string; symbol: string };
  /** thousands: the grouping seen. */
  grouping?: 'western' | 'indian';
  /** numberSuffix: cells that couldn't be read and became missing; whether any "+" lower bounds were read. */
  unconvertible?: number;
  lowerBound?: boolean;
  /** mergeLabels: these values become `to`. */
  merge?: { from: string[]; to: string };
}

/** A row taken out by "Remove duplicates", with its per-row source text, so undo can put it back. */
export interface RemovedRow {
  index: number;
  row: Record<string, string | number | boolean | null>;
  dateSource?: Record<string, string | null>;
  fixSource?: Record<string, string | number | boolean | null>;
}

/** Dataset-wide findings from the import. */
export interface DatasetQuality {
  /** Exact duplicate rows (every column equal, compared as imported text), not counting each first occurrence. */
  duplicateRowCount: number;
  /** Their row indices, ascending. */
  duplicateIndices: number[];
  /** Columns left as text because they mix currencies: the codes found. */
  currencyWarnings?: Record<string, string[]>;
  /** Columns left as text because their comma use is inconsistent: why. */
  groupingWarnings?: Record<string, string>;
  /** Suggestions the user chose "Don't ask again" for (keys from dataQuality.suggestionKey). */
  dismissed?: string[];
}

/** One row the parser had a problem with (field count, quotes). */
export interface ImportIssue {
  /** 1-based data row in the source file (header excluded). */
  row: number;
  /** Papa's code: TooFewFields, TooManyFields, MissingQuotes, InvalidQuotes, ... */
  code: string;
  message: string;
  /** The row's fields as parsed, truncated for storage. */
  raw: string[];
}

/** Parse problems found while importing, kept so the import summary can be reopened. */
export interface ImportIssuesSummary {
  /** Distinct data rows with at least one problem. */
  rowCount: number;
  /** All problems (a row can have more than one). */
  issueCount: number;
  /** Problems not tied to a row (e.g. an undetectable delimiter). */
  fileIssues: string[];
  /** The first problems, in row order (at most IMPORT_ISSUES_STORED). */
  listed: ImportIssue[];
  /** The user chose to leave these rows out of the dataset. */
  excluded: boolean;
  /** Data rows in the source before any were excluded. */
  sourceRowCount: number;
}

export interface DatasetMetadata {
  datasetId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  rowCount: number;
  columnCount: number;
  originalFileName: string;
  originalFileType: string;
  parsingStatistics: {
    processingTimeMs: number;
    /** Parse problems found at import (see importIssues). */
    errorCount?: number;
  };
  /** Rows the parser had problems with, and whether they were kept or excluded. */
  importIssues?: ImportIssuesSummary;
  version: number;
  /**
   * Date parser that produced this dataset's date cells. Missing on datasets imported before
   * timezone-free dates (DATE_PARSER_VERSION 2), whose dates may be shifted a day.
   */
  dateParserVersion?: number;
  /** The user dismissed the "re-import for correct dates" notice. */
  dateReimportNoticeDismissed?: boolean;
  columns: ColumnMetadata[];
  /** Duplicate rows and column warnings found at import. */
  quality?: DatasetQuality;
  /** Column fixes in the order they were applied (see ColumnFix). */
  columnFixes?: ColumnFix[];
  /**
   * Rows removed by "Remove duplicates" (the rows themselves are in Dataset.removedDuplicates,
   * stored in the `removedRows` table, never in this record).
   */
  removedDuplicateCount?: number;
}
