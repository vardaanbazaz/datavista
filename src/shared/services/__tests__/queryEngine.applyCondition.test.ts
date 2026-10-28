import { describe, it, expect } from 'vitest';
import { queryEngine } from '../queryEngine';
import { DataRow } from '../../types';
import { FilterCondition } from '../../types/query';

// Regression test for: an unrecognized filter operator (e.g. from a malformed
// AI-generated query, bypassing the FilterOperator union at runtime) hit the switch's
// `default: return true` and silently matched every row instead of failing safe.

describe('queryEngine.applyCondition - unrecognized operator', () => {
  const data: DataRow[] = [
    { region: 'West', amount: 10 },
    { region: 'East', amount: 20 },
  ];

  it('excludes all rows rather than matching everything', () => {
    const cond = {
      column: 'region',
      operator: 'notARealOperator',
      value: 'West',
    } as unknown as FilterCondition;

    const result = queryEngine.applyCondition(data, cond);
    expect(result).toEqual([]);
  });
});

// Numeric comparisons use the shared numeric rule: a blank or junk cell is not 0, so it
// never matches lessThan/greaterThan/between.
describe('queryEngine.applyCondition - blanks and junk are not 0', () => {
  const data: DataRow[] = [
    { id: 'a', amount: 3 },
    { id: 'blank', amount: null },
    { id: 'junk', amount: 'ERROR' },
    { id: 'token', amount: 'N/A' },
    { id: 'b', amount: 8 },
  ];

  it('lessThan excludes blank/junk cells', () => {
    const result = queryEngine.applyCondition(data, { column: 'amount', operator: 'lessThan', value: 5 });
    expect(result.map(r => r.id)).toEqual(['a']);
  });

  it('greaterThan with a negative bound excludes blank/junk cells', () => {
    const result = queryEngine.applyCondition(data, { column: 'amount', operator: 'greaterThan', value: -1 });
    expect(result.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('between excludes blank/junk cells', () => {
    const result = queryEngine.applyCondition(data, { column: 'amount', operator: 'between', value: { start: 0, end: 10 } });
    expect(result.map(r => r.id)).toEqual(['a', 'b']);
  });
});
