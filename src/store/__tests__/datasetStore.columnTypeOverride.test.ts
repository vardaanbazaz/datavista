import { describe, it, expect, beforeEach } from "vitest";
import { useDatasetStore } from "@/store/datasetStore";
import { Dataset, ColumnMetadata, DatasetMetadata } from "@/shared/types";

function makeCol(name: string, overrides: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return {
    id: `ds_${name}`, name, displayName: name, originalHeader: name,
    inferredDataType: 'numeric', nullableStatus: false,
    uniqueValueCount: 5, missingValueCount: 0, minimumValue: 1, maximumValue: 5,
    categoryCardinality: {}, role: 'measure', allIntegerValues: true,
    ...overrides,
  };
}

function makeDataset(): Dataset {
  const columns = [makeCol('Education'), makeCol('Age', { minimumValue: 18, maximumValue: 60, uniqueValueCount: 40 })];
  const metadata: DatasetMetadata = {
    datasetId: 'ds1', name: 'ds1', createdAt: 0, updatedAt: 0,
    rowCount: 10, columnCount: 2, originalFileName: 'f.csv', originalFileType: 'csv',
    parsingStatistics: { processingTimeMs: 0 }, version: 1, columns,
  };
  return {
    id: 'ds1', name: 'ds1', data: [{ Education: 1, Age: 30 }],
    columns: ['Education', 'Age'],
    columnTypes: { Education: 'numeric', Age: 'numeric' },
    metadata,
  };
}

describe('setColumnTypeOverride', () => {
  beforeEach(() => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset], activeDataset: dataset });
  });

  it('sets userOverrideType on the target column in both datasets[] and activeDataset', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const { datasets, activeDataset } = useDatasetStore.getState();
    expect(activeDataset!.metadata!.columns.find(c => c.name === 'Education')!.userOverrideType).toBe('categorical');
    expect(datasets[0].metadata!.columns.find(c => c.name === 'Education')!.userOverrideType).toBe('categorical');
  });

  it('leaves other columns untouched', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const ageCol = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Age')!;
    expect(ageCol.userOverrideType).toBeUndefined();
  });

  it('clears the override when passed null', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    useDatasetStore.getState().setColumnTypeOverride('Education', null);
    const col = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBeNull();
  });

  it('is a no-op when there is no active dataset', () => {
    useDatasetStore.setState({ datasets: [], activeDataset: null });
    expect(() => useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical')).not.toThrow();
  });
});

describe('updateDatasetData override lifecycle', () => {
  beforeEach(() => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset], activeDataset: dataset });
  });

  it('carries the override forward when the column\'s inferred type is unchanged across the update', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const prev = useDatasetStore.getState().activeDataset!;
    const newMetadata: DatasetMetadata = {
      ...prev.metadata!,
      columns: prev.metadata!.columns.map(c => c.name === 'Education' ? { ...c, uniqueValueCount: 6 } : c),
    };
    useDatasetStore.getState().updateDatasetData('ds1', prev.data, newMetadata, prev.columnTypes, prev.columns);
    const col = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBe('categorical');
  });

  it('drops the override when the column\'s inferred type changes across the update', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const prev = useDatasetStore.getState().activeDataset!;
    const newMetadata: DatasetMetadata = {
      ...prev.metadata!,
      columns: prev.metadata!.columns.map(c => c.name === 'Education' ? { ...c, inferredDataType: 'categorical' as const } : c),
    };
    const newColumnTypes = { ...prev.columnTypes, Education: 'categorical' as const };
    useDatasetStore.getState().updateDatasetData('ds1', prev.data, newMetadata, newColumnTypes, prev.columns);
    const col = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBeUndefined();
  });
});
