import { describe, it, expect } from 'vitest';
import { queryEngine } from '../queryEngine';
import { DataRow } from '../../types';

describe('queryEngine.applyGroupingAndAggregations - min/max on large groups', () => {
  it('does not crash on a single group with 300k rows (spread-argument stack overflow regression)', () => {
    const LARGE_GROUP_SIZE = 300_000;
    const data: DataRow[] = Array.from({ length: LARGE_GROUP_SIZE }, (_, i) => ({
      category: 'A',
      value: i,
    }));

    expect(() =>
      queryEngine.applyGroupingAndAggregations(
        data,
        { column: 'category' },
        [
          { column: 'value', operator: 'min', alias: 'minValue' },
          { column: 'value', operator: 'max', alias: 'maxValue' },
        ],
        { category: 'categorical', value: 'numeric' },
        ['category', 'value']
      )
    ).not.toThrow();
  });

  it('computes correct min/max for a large group', () => {
    const LARGE_GROUP_SIZE = 300_000;
    const data: DataRow[] = Array.from({ length: LARGE_GROUP_SIZE }, (_, i) => ({
      category: 'A',
      value: i,
    }));

    const result = queryEngine.applyGroupingAndAggregations(
      data,
      { column: 'category' },
      [
        { column: 'value', operator: 'min', alias: 'minValue' },
        { column: 'value', operator: 'max', alias: 'maxValue' },
      ],
      { category: 'categorical', value: 'numeric' },
      ['category', 'value']
    );

    expect(result).toHaveLength(1);
    expect(result[0].minValue).toBe(0);
    expect(result[0].maxValue).toBe(LARGE_GROUP_SIZE - 1);
  });

  it('computes correct min/max for a small group (sanity check, not just large-input path)', () => {
    const data: DataRow[] = [
      { category: 'A', value: 10 },
      { category: 'A', value: -5 },
      { category: 'A', value: 42 },
      { category: 'B', value: 7 },
    ];

    const result = queryEngine.applyGroupingAndAggregations(
      data,
      { column: 'category' },
      [
        { column: 'value', operator: 'min', alias: 'minValue' },
        { column: 'value', operator: 'max', alias: 'maxValue' },
      ],
      { category: 'categorical', value: 'numeric' },
      ['category', 'value']
    );

    const groupA = result.find(r => r.category === 'A');
    const groupB = result.find(r => r.category === 'B');
    expect(groupA?.minValue).toBe(-5);
    expect(groupA?.maxValue).toBe(42);
    expect(groupB?.minValue).toBe(7);
    expect(groupB?.maxValue).toBe(7);
  });
});
