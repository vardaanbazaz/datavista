import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import Papa from 'papaparse';
import { processRawData } from '../parsingService';

/**
 * Text columns keep the text as written. Cells used to be turned into numbers before the
 * column's type was known, so a version column lost "1.10" (-> 1.1), "1.0" (-> 1) and
 * "1e5" (-> 100000). Numeric columns are unchanged.
 */
const TRICKY = ['1.10', '1.0', '007', '00123', '1e5'];

describe('parsingService - categorical and ID columns keep their original text', () => {
  it('keeps numeric-looking text exactly in a categorical column', () => {
    const raw = [
      ...TRICKY.map((v, i) => ({ Version: v, Score: String(i + 1) })),
      { Version: '1.0.0', Score: '6' },
      { Version: 'Varies with device', Score: '7' },
    ];
    const ds = processRawData(raw, 'versions.csv');
    expect(ds.columnTypes.Version).toBe('categorical');
    expect(ds.data.map((r) => r.Version)).toEqual([...TRICKY, '1.0.0', 'Varies with device']);
    // The numeric column is still numbers.
    expect(ds.columnTypes.Score).toBe('numeric');
    expect(ds.data.map((r) => r.Score)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('counts "1.0" and "1" as different values in a text column', () => {
    const raw = ['1.0', '1', '1.10', '1.1', 'beta', 'beta'].map((v) => ({ Ver: v }));
    const ds = processRawData(raw, 'v.csv');
    const meta = ds.metadata!.columns.find((c) => c.name === 'Ver')!;
    expect(meta.uniqueValueCount).toBe(5);
  });

  it('keeps the text in an ID column typed categorical by its letter codes', () => {
    const raw = [...TRICKY, 'C570867', '85123A'].map((v) => ({ 'Invoice ID': v }));
    const ds = processRawData(raw, 'ids.csv');
    expect(ds.columnTypes['Invoice ID']).toBe('categorical');
    expect(ds.data.map((r) => r['Invoice ID'])).toEqual([...TRICKY, 'C570867', '85123A']);
  });

  it('keeps the text in an ID column of numbers whose spelling matters ("1.10", "1e5")', () => {
    const raw = ['1', '2', '1.10', '1e5', '1.0', '42'].map((v) => ({ 'Order ID': v }));
    const ds = processRawData(raw, 'orders.csv');
    expect(ds.columnTypes['Order ID']).toBe('categorical');
    expect(ds.data.map((r) => r['Order ID'])).toEqual(['1', '2', '1.10', '1e5', '1.0', '42']);
    // Plain-integer IDs stay numeric.
    const plain = processRawData(['1', '2', '3'].map((v) => ({ EmployeeNumber: v })), 'hr.csv');
    expect(plain.columnTypes.EmployeeNumber).toBe('numeric');
  });

  it('leaves a numeric column with a few text cells as numbers', () => {
    const raw = ['1.10', '2', '3', '4', '5', 'n/a?'].map((v) => ({ Amount: v }));
    const ds = processRawData(raw, 'amounts.csv');
    expect(ds.columnTypes.Amount).toBe('numeric');
    expect(ds.data.map((r) => r.Amount)).toEqual([1.1, 2, 3, 4, 5, 'n/a?']);
  });

  it('Play Store "Current Ver" keeps "1.0", "1.1" and "2.20" as written', () => {
    const csv = readFileSync('tests/fixtures/playstore-insights.csv', 'utf8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const ds = processRawData(parsed.data, 'playstore-insights.csv');
    expect(ds.columnTypes['Current Ver']).toBe('categorical');
    const values = ds.data.map((r) => r['Current Ver']);
    expect(values.every((v) => v === null || typeof v === 'string')).toBe(true);
    expect(values).toContain('1.0');
    expect(values).toContain('2.20');
    expect(values).not.toContain(1);
  });
});
