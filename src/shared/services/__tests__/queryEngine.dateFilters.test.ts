import { describe, it, expect } from 'vitest';
import { queryEngine } from '../queryEngine';
import { DataRow } from '../../types';

describe('queryEngine.applyCondition - date-range filters (comprehensive audit #3)', () => {
  const data: DataRow[] = [
    { name: 'Jan', d: '2024-01-01' },
    { name: 'Mar', d: '2024-03-15' },
    { name: 'Jun', d: '2024-06-15' },
    { name: 'Dec', d: '2024-12-31' },
  ];

  it('greaterThan returns dates after the target instead of zero rows', () => {
    const result = queryEngine.applyCondition(data, {
      column: 'd',
      operator: 'greaterThan',
      value: '2024-03-01',
    });

    expect(result.map(r => r.name)).toEqual(['Mar', 'Jun', 'Dec']);
  });

  it('lessThan returns dates before the target instead of zero rows', () => {
    const result = queryEngine.applyCondition(data, {
      column: 'd',
      operator: 'lessThan',
      value: '2024-06-01',
    });

    expect(result.map(r => r.name)).toEqual(['Jan', 'Mar']);
  });

  it('between returns dates within the range instead of zero rows', () => {
    const result = queryEngine.applyCondition(data, {
      column: 'd',
      operator: 'between',
      value: { start: '2024-02-01', end: '2024-07-01' },
    });

    expect(result.map(r => r.name)).toEqual(['Mar', 'Jun']);
  });

  it('between with only a start bound still works for dates', () => {
    const result = queryEngine.applyCondition(data, {
      column: 'd',
      operator: 'between',
      value: { start: '2024-06-01' },
    });

    expect(result.map(r => r.name)).toEqual(['Jun', 'Dec']);
  });

  it('does not misparse ambiguous non-date strings into a real date (guards against permissive Date parsing)', () => {
    // "5/3", "10-20" etc. have no year and JS's Date parser silently resolves them to a
    // real (wrong) date rather than failing — these must not participate in comparisons.
    const categoricalData: DataRow[] = [
      { name: 'CodeA', code: '5/3' },
      { name: 'CodeB', code: '10-20' },
      { name: 'CodeC', code: 'N/A' },
    ];

    expect(
      queryEngine.applyCondition(categoricalData, { column: 'code', operator: 'greaterThan', value: '2024-01-01' })
    ).toEqual([]);
    expect(
      queryEngine.applyCondition(categoricalData, { column: 'code', operator: 'lessThan', value: '2024-01-01' })
    ).toEqual([]);
    expect(
      queryEngine.applyCondition(categoricalData, {
        column: 'code',
        operator: 'between',
        value: { start: '2020-01-01', end: '2030-01-01' },
      })
    ).toEqual([]);
  });

  it('numeric greaterThan/lessThan/between still work unaffected (regression guard)', () => {
    const numericData: DataRow[] = [
      { name: 'A', n: 5 },
      { name: 'B', n: 15 },
      { name: 'C', n: 25 },
    ];

    expect(
      queryEngine
        .applyCondition(numericData, { column: 'n', operator: 'greaterThan', value: 10 })
        .map(r => r.name)
    ).toEqual(['B', 'C']);

    expect(
      queryEngine
        .applyCondition(numericData, { column: 'n', operator: 'lessThan', value: 20 })
        .map(r => r.name)
    ).toEqual(['A', 'B']);

    expect(
      queryEngine
        .applyCondition(numericData, { column: 'n', operator: 'between', value: { start: 10, end: 20 } })
        .map(r => r.name)
    ).toEqual(['B']);
  });
});
