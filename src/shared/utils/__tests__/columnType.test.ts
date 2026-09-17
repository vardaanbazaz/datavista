import { describe, it, expect } from 'vitest';
import { getEffectiveColumnType, getEffectiveColumnTypes, mightBeCategorical } from '../columnType';
import { Dataset, ColumnMetadata, DatasetMetadata } from '@/shared/types';

function makeCol(overrides: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return {
    id: 'ds_col',
    name: 'col',
    displayName: 'col',
    originalHeader: 'col',
    inferredDataType: 'numeric',
    nullableStatus: false,
    uniqueValueCount: 5,
    missingValueCount: 0,
    minimumValue: 1,
    maximumValue: 5,
    categoryCardinality: {},
    role: 'measure',
    allIntegerValues: true,
    ...overrides,
  };
}

function makeDataset(columns: ColumnMetadata[]): Dataset {
  const metadata: DatasetMetadata = {
    datasetId: 'ds', name: 'ds', createdAt: 0, updatedAt: 0,
    rowCount: 10, columnCount: columns.length,
    originalFileName: 'f.csv', originalFileType: 'csv',
    parsingStatistics: { processingTimeMs: 0 }, version: 1,
    columns,
  };
  const columnTypes: Record<string, 'numeric' | 'categorical' | 'date'> = {};
  columns.forEach(c => { columnTypes[c.name] = c.inferredDataType; });
  return { id: 'ds', name: 'ds', data: [], columns: columns.map(c => c.name), columnTypes, metadata };
}

describe('mightBeCategorical', () => {
  it('flags a 5-value Likert-scale column (Education-shaped: 1-5)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 5, minimumValue: 1, maximumValue: 5 }))).toBe(true);
  });
  it('flags a 4-value Likert-scale column (JobSatisfaction-shaped: 1-4)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 4, minimumValue: 1, maximumValue: 4 }))).toBe(true);
  });
  it('flags a hypothetical 0/1 boolean-coded column', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 2, minimumValue: 0, maximumValue: 1 }))).toBe(true);
  });
  it('does not flag a near-unique high-cardinality column (MonthlyIncome-shaped)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 1300, minimumValue: 1009, maximumValue: 19999, allIntegerValues: true }))).toBe(false);
  });
  it('does not flag an all-unique identifier column (EmployeeNumber-shaped)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 1470, minimumValue: 1, maximumValue: 2068, allIntegerValues: true }))).toBe(false);
  });
  it('does not flag a constant column (uniqueValueCount 1)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 1, minimumValue: 8, maximumValue: 8 }))).toBe(false);
  });
  it('does not flag a non-numeric column', () => {
    expect(mightBeCategorical(makeCol({ inferredDataType: 'categorical', uniqueValueCount: 3 }))).toBe(false);
  });
  it('does not flag a numeric column with fractional values', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 5, minimumValue: 1, maximumValue: 5, allIntegerValues: false }))).toBe(false);
  });
  it('does not flag when allIntegerValues is missing (fail closed)', () => {
    const col = makeCol({ uniqueValueCount: 5, minimumValue: 1, maximumValue: 5 });
    // @ts-expect-error simulating a pre-migration persisted dataset missing the field
    delete col.allIntegerValues;
    expect(mightBeCategorical(col)).toBe(false);
  });
  it('does not flag a narrow-range but wide-cardinality column exceeding the distinct cap (13 distinct)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 13, minimumValue: 1, maximumValue: 10 }))).toBe(false);
  });
  it('does not flag a column exceeding the span cap even with few distinct values (PercentSalaryHike-shaped control: span 14)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 15, minimumValue: 11, maximumValue: 25 }))).toBe(false);
  });
});

describe('getEffectiveColumnType', () => {
  it('returns the inferred type when no override is set', () => {
    const ds = makeDataset([makeCol({ name: 'Education', inferredDataType: 'numeric' })]);
    expect(getEffectiveColumnType(ds, 'Education')).toBe('numeric');
  });
  it('returns the override when set', () => {
    const ds = makeDataset([makeCol({ name: 'Education', inferredDataType: 'numeric', userOverrideType: 'categorical' })]);
    expect(getEffectiveColumnType(ds, 'Education')).toBe('categorical');
  });
  it('falls back to columnTypes when metadata is absent', () => {
    const ds = makeDataset([makeCol({ name: 'Education' })]);
    delete ds.metadata;
    expect(getEffectiveColumnType(ds, 'Education')).toBe('numeric');
  });
  it('treats an explicit null override as cleared (falls back to inferred)', () => {
    const ds = makeDataset([makeCol({ name: 'Education', inferredDataType: 'numeric', userOverrideType: null })]);
    expect(getEffectiveColumnType(ds, 'Education')).toBe('numeric');
  });
});

describe('getEffectiveColumnTypes', () => {
  it('returns a map covering every column, respecting overrides', () => {
    const ds = makeDataset([
      makeCol({ name: 'Education', inferredDataType: 'numeric', userOverrideType: 'categorical' }),
      makeCol({ name: 'Age', inferredDataType: 'numeric' }),
    ]);
    expect(getEffectiveColumnTypes(ds)).toEqual({ Education: 'categorical', Age: 'numeric' });
  });
});
