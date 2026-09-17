import { describe, it, expect } from 'vitest';
import { processRawData } from '../parsingService';

describe('parsingService - allIntegerValues metadata', () => {
  it('marks a whole-number numeric column as allIntegerValues: true', () => {
    const raw = [{ Education: '1' }, { Education: '3' }, { Education: '4' }, { Education: '2' }];
    const ds = processRawData(raw, 'test.csv');
    const col = ds.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.allIntegerValues).toBe(true);
  });

  it('marks a fractional numeric column as allIntegerValues: false', () => {
    const raw = [{ Income: '1000.50' }, { Income: '2000' }, { Income: '3500.25' }];
    const ds = processRawData(raw, 'test.csv');
    const col = ds.metadata!.columns.find(c => c.name === 'Income')!;
    expect(col.allIntegerValues).toBe(false);
  });

  it('marks a categorical column as allIntegerValues: false (the flag is only meaningful for numeric columns)', () => {
    const raw = [{ Dept: 'Sales' }, { Dept: 'R&D' }, { Dept: 'Sales' }];
    const ds = processRawData(raw, 'test.csv');
    const col = ds.metadata!.columns.find(c => c.name === 'Dept')!;
    expect(col.allIntegerValues).toBe(false);
  });

  it('initializes userOverrideType as undefined for a freshly-parsed dataset', () => {
    const raw = [{ Education: '1' }, { Education: '3' }];
    const ds = processRawData(raw, 'test.csv');
    const col = ds.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBeUndefined();
  });
});
