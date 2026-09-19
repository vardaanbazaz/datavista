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
