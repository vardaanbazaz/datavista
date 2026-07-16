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
  detectedFormat?: string;
  categoryCardinality?: Record<string, number>;
  role: 'dimension' | 'measure' | 'date' | 'identifier' | 'calculated' | 'hidden';
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
  columns: ColumnMetadata[];
}
