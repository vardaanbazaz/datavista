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
}
