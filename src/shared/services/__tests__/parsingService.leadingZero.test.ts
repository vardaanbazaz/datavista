import { describe, it, expect, vi } from 'vitest';
import { processRawData, detectColumnType } from '../parsingService';

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

import { exportDataAsCSV } from '../../utils/exportUtils';
import { saveAs } from 'file-saver';

describe('parsingService - leading-zero numeric strings (comprehensive audit #4)', () => {
  it('preserves the leading zero at ingest instead of coercing to a JS number', () => {
    const raw = [
      { zip: '01234', name: 'Alice' },
      { zip: '00501', name: 'Bob' },
      { zip: '90210', name: 'Carl' },
    ];

    const ds = processRawData(raw, 'test.csv');

    expect(ds.data.map(r => r.zip)).toEqual(['01234', '00501', 90210]);
  });

  it('classifies a leading-zero column as categorical, not numeric', () => {
    const raw = [
      { zip: '01234' },
      { zip: '00501' },
      { zip: '90210' },
    ];

    const ds = processRawData(raw, 'test.csv');

    expect(ds.columnTypes.zip).toBe('categorical');
  });

  it('a mixed column (some leading-zero, some not) is fully preserved and categorical', () => {
    const raw = [
      { code: '01234' },
      { code: '5000' },
      { code: '007' },
    ];

    const ds = processRawData(raw, 'test.csv');

    expect(ds.data.map(r => r.code)).toEqual(['01234', 5000, '007']);
    expect(ds.columnTypes.code).toBe('categorical');
  });

  it('round-trips through CSV export without losing the leading zero (upload -> stored -> export)', async () => {
    const raw = [
      { zip: '01234', name: 'Alice' },
      { zip: '90210', name: 'Carl' },
    ];
    const ds = processRawData(raw, 'test.csv');

    await exportDataAsCSV(ds.data, 'test');

    expect(saveAs).toHaveBeenCalledTimes(1);
    const [blob] = vi.mocked(saveAs).mock.calls[0];
    const csvText = await (blob as Blob).text();

    expect(csvText).toContain('01234');
    expect(csvText).not.toContain(',1234,');
  });

  it('leaves ordinary numeric columns unaffected (no leading-zero values present)', () => {
    const raw = [
      { amount: '100' },
      { amount: '250' },
      { amount: '5000' },
    ];

    const ds = processRawData(raw, 'test.csv');

    expect(ds.data.map(r => r.amount)).toEqual([100, 250, 5000]);
    expect(ds.columnTypes.amount).toBe('numeric');
  });

  it('a bare "0" is unaffected (no data loss, still a valid number)', () => {
    const raw = [{ n: '0' }, { n: '5' }];
    const ds = processRawData(raw, 'test.csv');

    expect(ds.data.map(r => r.n)).toEqual([0, 5]);
    expect(ds.columnTypes.n).toBe('numeric');
  });

  it('detectColumnType classifies leading-zero values as categorical directly', () => {
    expect(detectColumnType(['01234', '00501', '90210'])).toBe('categorical');
    expect(detectColumnType([100, 250, 5000])).toBe('numeric');
  });

  it('documented scope gap: a negative leading-zero string is not covered', () => {
    // "-0123" is not matched by /^0\d+/ (string starts with "-", not a digit) — this is a
    // deliberate, approved omission, not an oversight. Number("-0123") = -123.
    const raw = [{ v: '-0123' }];
    const ds = processRawData(raw, 'test.csv');

    expect(ds.data[0].v).toBe(-123);
  });
});
