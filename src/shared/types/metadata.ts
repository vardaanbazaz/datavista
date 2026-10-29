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
    errorCount?: number;
  };
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
