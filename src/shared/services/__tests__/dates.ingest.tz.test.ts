import { describe, it, expect } from 'vitest';
import { processRawData, reparseDateColumn, needsDateReimportNotice, detectColumnType } from '../parsingService';
import { queryEngine } from '../queryEngine';
import { windowEngine } from '../window';
import { forecastingEngine } from '../forecasting/engine';
import { dateFunctions } from '../formula/library/date';
import { Dataset, DataRow } from '../../types';

// Every expectation here must hold under TZ=Asia/Kolkata, America/New_York and UTC
// (`npm run test:tz`). Locale-dependent defaults are passed explicitly.
const EN_IN = { dayFirstDefault: true };

const col = (ds: Dataset, name: string) => ds.metadata!.columns.find(c => c.name === name)!;

function groupCounts(ds: Dataset, column: string, period: 'year' | 'quarter' | 'month' | 'week' | 'day') {
  const res = queryEngine.execute(ds, {
    groupBy: { column, period },
    aggregations: [{ column, operator: 'count_rows', alias: 'n' }],
    pagination: { pageSize: 'all' },
    options: { bypassCache: true },
  });
  return Object.fromEntries(res.rows.map(r => [String(r[column]), r.n]));
}

describe('Netflix / Play Store month-name dates', () => {
  // The only two 2008 rows of the full Netflix file (s5958, s6612).
  const netflix = processRawData(
    [
      { show_id: 's5958', date_added: 'January 1, 2008' },
      { show_id: 's6612', date_added: 'February 4, 2008' },
      { show_id: 'x', date_added: ' December 31, 2019' },
      { show_id: 'y', date_added: '' },
    ],
    'netflix_titles.csv',
    EN_IN
  );

  it('stores the calendar day as written', () => {
    expect(netflix.columnTypes.date_added).toBe('date');
    expect(netflix.data.map(r => r.date_added)).toEqual(['2008-01-01', '2008-02-04', '2019-12-31', null]);
    expect(col(netflix, 'date_added')).toMatchObject({
      earliestDate: '2008-01-01',
      latestDate: '2019-12-31',
      detectedFormat: 'Month D, YYYY',
      invalidDateCount: 0,
      missingValueCount: 1,
    });
  });

  it('year buckets: 2007 = 0, 2008 = 2', () => {
    const years = groupCounts(netflix, 'date_added', 'year');
    expect(years['2007']).toBeUndefined();
    expect(years['2008']).toBe(2);
    expect(groupCounts(netflix, 'date_added', 'month')).toMatchObject({ '2008-01': 1, '2008-02': 1, '2019-12': 1 });
    expect(groupCounts(netflix, 'date_added', 'quarter')).toMatchObject({ '2008-Q1': 2, '2019-Q4': 1 });
    expect(groupCounts(netflix, 'date_added', 'week')).toMatchObject({ '2008-W01': 1, '2008-W06': 1, '2020-W01': 1 });
    expect(groupCounts(netflix, 'date_added', 'day')).toMatchObject({ '2008-01-01': 1 });
  });

  it('Play Store "January 15, 2018" -> 2018-01-15', () => {
    const ps = processRawData([{ 'Last Updated': 'January 15, 2018' }, { 'Last Updated': 'August 1, 2018' }], 'googleplaystore.csv', EN_IN);
    expect(ps.data[0]['Last Updated']).toBe('2018-01-15');
  });
});

describe('Lab-style mixed formats', () => {
  const raw = [
    '24-Feb-21', '03/16/2021', '2021-04-02', '2023/13/01', 'invalid', 'NaN',
    '08-Mar-21', '2022-05-09', '06/20/2023', '2023-02-30', '01/02/2022', '2021-01-31',
    '12-Dec-22', '2020-02-29', '07/04/2021', '2022-11-30', '2021-06-15', '2022-08-01',
    '15-Jan-22', '2023-03-03', '', '2022-10-10', '2021-09-09', '2020-12-31', '2021-05-05',
  ];
  const ds = processRawData(raw.map(v => ({ signout_date: v })), 'lab.csv', EN_IN);

  it('types the column as date despite zero-padded values (dates are checked before the leading-zero rule)', () => {
    expect(ds.columnTypes.signout_date).toBe('date');
    expect(detectColumnType(['05/06/2024', '01/02/2023'], true)).toBe('date');
    expect(detectColumnType(['01234', '00501'], true)).toBe('categorical');
  });

  it('parses each value by its own pattern; month-first decided by "03/16/2021"', () => {
    const c = col(ds, 'signout_date');
    expect(c.dayFirst).toBe(false);
    expect(c.dayFirstSource).toBe('data');
    expect(ds.data[0].signout_date).toBe('2021-02-24');
    expect(ds.data[1].signout_date).toBe('2021-03-16');
    expect(ds.data[10].signout_date).toBe('2022-01-02');
  });

  it('invalid values stay as text, are counted, and never roll over', () => {
    expect(ds.data[3].signout_date).toBe('2023/13/01');
    expect(ds.data[9].signout_date).toBe('2023-02-30');
    const c = col(ds, 'signout_date');
    expect(c.invalidDateCount).toBe(4); // 2023/13/01, invalid, NaN, 2023-02-30
    expect(c.missingValueCount).toBe(1);
    expect(c.earliestDate).toBe('2020-02-29');
    expect(c.latestDate).toBe('2023-06-20');
    // Invalid values join no period bucket.
    const years = groupCounts(ds, 'signout_date', 'year');
    expect(Object.values(years).reduce((a, b) => (a as number) + (b as number), 0)).toBe(raw.length - 1 - 4);
    expect(years['2023']).toBe(2);
  });
});

describe('day/month order', () => {
  const ds = processRawData([{ d: '05/06/2024' }, { d: '01/02/2024' }, { d: 'June 9, 2024' }], 'orders.csv', EN_IN);

  it('undecidable numeric dates follow the locale default (en-IN: day first)', () => {
    expect(ds.data[0].d).toBe('2024-06-05');
    expect(col(ds, 'd')).toMatchObject({ dayFirst: true, dayFirstSource: 'locale', detectedFormat: 'DD/MM/YYYY | Month D, YYYY' });
    const us = processRawData([{ d: '05/06/2024' }], 'orders.csv', { dayFirstDefault: false });
    expect(us.data[0].d).toBe('2024-05-06');
  });

  it('the toggle re-reads the original text month-first and back', () => {
    expect(ds.dateSourceValues?.d).toEqual(['05/06/2024', '01/02/2024', 'June 9, 2024']);
    const mf = reparseDateColumn(ds, 'd', false);
    expect(mf.data.map(r => r.d)).toEqual(['2024-05-06', '2024-01-02', '2024-06-09']);
    expect(col(mf, 'd')).toMatchObject({ dayFirst: false, dayFirstSource: 'user', earliestDate: '2024-01-02', latestDate: '2024-06-09' });
    const back = reparseDateColumn(mf, 'd', true);
    expect(back.data.map(r => r.d)).toEqual(['2024-06-05', '2024-02-01', '2024-06-09']);
  });

  it('a toggle that makes values impossible counts them invalid instead of rolling over', () => {
    const decided = processRawData([{ d: '13/06/2024' }, { d: '05/06/2024' }], 'x.csv', { dayFirstDefault: false });
    expect(col(decided, 'd')).toMatchObject({ dayFirst: true, dayFirstSource: 'data' });
    const flipped = reparseDateColumn(decided, 'd', false);
    expect(flipped.data.map(r => r.d)).toEqual(['13/06/2024', '2024-05-06']);
    expect(col(flipped, 'd').invalidDateCount).toBe(1);
  });

  it('mixed day-first and month-first values leave the column as text, flagged', () => {
    const mixed = processRawData([{ d: '13/06/2024' }, { d: '06/13/2024' }], 'x.csv', EN_IN);
    expect(mixed.columnTypes.d).toBe('categorical');
    expect(col(mixed, 'd').dateAmbiguity).toBe('ambiguous-mixed');
    expect(mixed.data[0].d).toBe('13/06/2024');
  });

  it('keeps original text only for columns with numeric D/M dates', () => {
    const iso = processRawData([{ d: '2024-01-01' }, { d: 'January 2, 2024' }], 'x.csv', EN_IN);
    expect(iso.dateSourceValues).toBeUndefined();
    expect(col(iso, 'd').dayFirst).toBeUndefined();
  });
});

describe('datetimes', () => {
  it('keeps the time of day (online retail InvoiceDate)', () => {
    const ds = processRawData(
      [{ InvoiceDate: '2009-12-01 07:45:00' }, { InvoiceDate: '2009-12-01 23:59:00' }, { InvoiceDate: '2010-12-09 20:01:00' }],
      'online_retail_II.csv',
      EN_IN
    );
    expect(ds.data.map(r => r.InvoiceDate)).toEqual(['2009-12-01T07:45:00', '2009-12-01T23:59:00', '2010-12-09T20:01:00']);
    expect(col(ds, 'InvoiceDate')).toMatchObject({ earliestDate: '2009-12-01T07:45:00', latestDate: '2010-12-09T20:01:00' });
    expect(groupCounts(ds, 'InvoiceDate', 'day')).toEqual({ '2009-12-01': 2, '2010-12-09': 1 });
  });
});

describe('filters, sorting and window ORDER BY on dates', () => {
  const ds = processRawData(
    [
      { id: 'a', d: 'January 1, 2008', v: 1 },
      { id: 'b', d: '2008-01-05 10:00', v: 2 },
      { id: 'c', d: 'invalid', v: 3 },
      { id: 'd', d: 'December 31, 2007', v: 4 },
      { id: 'e', d: '2008-01-06', v: 5 },
      { id: 'f', d: '2008-02-01', v: 6 },
    ],
    'x.csv',
    EN_IN
  );
  const ids = (rows: DataRow[]) => rows.map(r => r.id);

  it('is a date column (5 of 6 valid)', () => {
    expect(ds.columnTypes.d).toBe('date');
  });

  it('date-range filter: inclusive calendar days from picker Dates; invalid dates are outside', () => {
    const rows = queryEngine.applyFilters(ds.data, {
      categoricalFilters: {},
      dateRangeFilters: { d: { start: new Date(2008, 0, 1), end: new Date(2008, 0, 5) } },
    } as never);
    expect(ids(rows)).toEqual(['a', 'b']);
  });

  it('date-range filter accepts stored strings and JSON round-tripped picker Dates', () => {
    const rows = queryEngine.applyFilters(ds.data, {
      dateRangeFilters: { d: { start: '2007-12-31', end: new Date(2008, 0, 1).toISOString() } },
    } as never);
    expect(ids(rows)).toEqual(['a', 'd']);
  });

  it('global "between" and "equals" conditions with picker Dates use the calendar day', () => {
    const between = queryEngine.applyCondition(ds.data, {
      column: 'd', operator: 'between', value: { start: new Date(2008, 0, 5), end: new Date(2008, 0, 5) },
    } as never);
    expect(ids(between)).toEqual(['b']);
    const eq = queryEngine.applyCondition(ds.data, { column: 'd', operator: 'equals', value: new Date(2008, 0, 1) } as never);
    expect(ids(eq)).toEqual(['a']);
  });

  it('sorts chronologically with invalid text after dates', () => {
    expect(ids(queryEngine.applySorting(ds.data, [{ column: 'd', direction: 'asc' }]))).toEqual(['d', 'a', 'b', 'e', 'f', 'c']);
  });

  it('window ORDER BY a date column', () => {
    const out = windowEngine.execute(ds.data, [
      { alias: 'rn', functionType: 'ROW_NUMBER', orderBy: [{ column: 'd', direction: 'asc' }] },
    ] as never);
    const rn = Object.fromEntries(out.map(r => [r.id, r.rn]));
    expect([rn.d, rn.a, rn.b, rn.e]).toEqual([1, 2, 3, 4]);
  });
});

describe('forecast labels and formula date functions', () => {
  it('forecast x labels step the calendar parts', () => {
    const out = forecastingEngine.generateForecast(
      [{ m: '2024-12-31', y: 1 }, { m: '2025-01-31', y: 2 }],
      'm', 'y', { enabled: true, periodsToProject: 2, method: 'linear' }
    );
    expect(out.filter(p => p.isForecast).map(p => p.m)).toEqual(['2025-02-28', '2025-03-31']);
    const q = forecastingEngine.generateForecast(
      [{ m: '2024-Q3', y: 1 }, { m: '2024-Q4', y: 2 }],
      'm', 'y', { enabled: true, periodsToProject: 1, method: 'linear' }
    );
    expect(q.filter(p => p.isForecast).map(p => p.m)).toEqual(['2025-Q1']);
  });

  const fn = (name: string) => dateFunctions.find(f => f.name === name)!.apply as (args: unknown[]) => unknown;

  it('YEAR/MONTH/DAY read the stored parts', () => {
    expect(fn('YEAR')(['2008-01-01'])).toBe(2008);
    expect(fn('MONTH')(['2008-01-01'])).toBe(1);
    expect(fn('DAY')(['2008-01-01T23:30:00'])).toBe(1);
    expect(fn('YEAR')(['January 1, 2008'])).toBe(2008);
    expect(fn('YEAR')(['2023-02-30'])).toBeNull();
  });

  it('DATEADD/DATEDIFF use calendar arithmetic', () => {
    expect(fn('DATEADD')(['2024-01-31', 1, 'month'])).toBe('2024-02-29');
    expect(fn('DATEADD')(['2024-03-09', 1, 'day'])).toBe('2024-03-10');
    expect(fn('DATEADD')(['2024-02-29', 1, 'year'])).toBe('2025-02-28');
    expect(fn('DATEADD')(['2009-12-01T07:45:00', 1, 'day'])).toBe('2009-12-02T07:45:00');
    expect(fn('DATEDIFF')(['2024-03-01', '2024-04-01', 'day'])).toBe(31);
    expect(fn('DATEDIFF')(['2007-12-31', '2008-01-01', 'year'])).toBe(1);
  });
});

describe('saved datasets imported before this version', () => {
  const base = processRawData([{ d: '2024-01-01' }], 'x.csv', EN_IN);

  it('new imports carry the parser version and need no notice', () => {
    expect(base.metadata!.dateParserVersion).toBe(2);
    expect(needsDateReimportNotice(base)).toBe(false);
  });

  it('older datasets with date columns get the notice until dismissed', () => {
    const old: Dataset = { ...base, metadata: { ...base.metadata!, dateParserVersion: undefined } };
    expect(needsDateReimportNotice(old)).toBe(true);
    expect(needsDateReimportNotice({ ...old, metadata: { ...old.metadata!, dateReimportNoticeDismissed: true } })).toBe(false);
    const noDates = processRawData([{ a: 'x' }], 'y.csv', EN_IN);
    expect(needsDateReimportNotice({ ...noDates, metadata: { ...noDates.metadata!, dateParserVersion: undefined } })).toBe(false);
  });
});
