import { describe, it, expect } from 'vitest';
import {
  addMonths,
  analyzeDateColumn,
  calendarDay,
  calendarFromPickerDate,
  compareStoredDates,
  dateKeyMs,
  dateKeyParts,
  expandTwoDigitYear,
  isoWeek,
  localeDayFirst,
  parseDateValue,
  parseStoredDate,
  periodKey,
  periodKeyRange,
  rangeBoundDay,
  stepDateKey,
} from '../dates';

// Runs under several TZ values via `npm run test:tz`; every expectation must hold in each.
describe('time zone sanity', () => {
  it('the TZ env var is the zone the runtime uses', () => {
    const tz = process.env.TZ;
    if (tz) {
      // ICU may report the legacy alias (Asia/Calcutta for Asia/Kolkata).
      const aliases: Record<string, string[]> = { 'Asia/Kolkata': ['Asia/Kolkata', 'Asia/Calcutta'], UTC: ['UTC', 'Etc/UTC'] };
      expect(aliases[tz] ?? [tz]).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  });
});

describe('parseDateValue', () => {
  it.each([
    ['January 1, 2008', '2008-01-01'],
    ['January 15, 2018', '2018-01-15'],
    ['December 31, 2019', '2019-12-31'],
    ['Sept 3 2020', '2020-09-03'],
    ['24-Feb-21', '2021-02-24'],
    ['08-Mar-21', '2021-03-08'],
    ['24-Feb-2021', '2021-02-24'],
    ['24 February 2021', '2021-02-24'],
    ['2024-01-15', '2024-01-15'],
    ['2024/01/15', '2024-01-15'],
    ['2024.1.5', '2024-01-05'],
    ['2009-12-01 07:45:00', '2009-12-01T07:45:00'],
    ['2009-12-01T07:45', '2009-12-01T07:45'],
    ['2024-01-15T23:30:00.000Z', '2024-01-15T23:30:00'],
    ['2024-01-15T23:30:00+05:30', '2024-01-15T23:30:00'],
    ['12/1/2009 7:45 PM', '2009-12-01T19:45'],
    ['12/1/2009 12:05 AM', '2009-12-01T00:05'],
  ])('%s -> %s (month-first default)', (raw, expected) => {
    expect(parseDateValue(raw, false)).toBe(expected);
  });

  it('numeric D/M order follows dayFirst', () => {
    expect(parseDateValue('05/06/2024', true)).toBe('2024-06-05');
    expect(parseDateValue('05/06/2024', false)).toBe('2024-05-06');
    expect(parseDateValue('13.05.2024', true)).toBe('2024-05-13');
    expect(parseDateValue('13-05-2024', false)).toBeNull();
  });

  it.each([
    '2023/13/01', // month 13
    '2023-02-30', // no rollover to March 2
    '2023-02-29', // not a leap year
    '1900-02-29', // 1900 is not a leap year
    '2024-01-00', // day 0
    '2024-00-10',
    '2024-01-15 25:00',
    '2024-01-15 13:00 PM',
    'invalid',
    'NaN',
    '05/06/24', // numeric D/M needs a 4-digit year
    '1.0.19',
    '2024',
    '20240115',
    '',
  ])('%s is not a date', raw => {
    expect(parseDateValue(raw, true)).toBeNull();
    expect(parseDateValue(raw, false)).toBeNull();
  });

  it('accepts leap days', () => {
    expect(parseDateValue('2000-02-29', false)).toBe('2000-02-29');
    expect(parseDateValue('2024-02-29', false)).toBe('2024-02-29');
  });

  it('non-strings are never dates (no epoch from numbers or booleans)', () => {
    expect(parseDateValue(40148, false)).toBeNull();
    expect(parseDateValue(true, false)).toBeNull();
    expect(parseDateValue(null, false)).toBeNull();
  });

  it('two-digit years follow strptime %y (00-68 -> 20xx, 69-99 -> 19xx)', () => {
    expect(expandTwoDigitYear(0)).toBe(2000);
    expect(expandTwoDigitYear(68)).toBe(2068);
    expect(expandTwoDigitYear(69)).toBe(1969);
    expect(expandTwoDigitYear(99)).toBe(1999);
    expect(parseDateValue('1-Jan-69', false)).toBe('1969-01-01');
    expect(parseDateValue('1-Jan-68', false)).toBe('2068-01-01');
  });
});

describe('analyzeDateColumn', () => {
  it('any first field > 12 decides day-first', () => {
    const a = analyzeDateColumn(['05/06/2024', '13/06/2024'], false);
    expect(a.dayFirst).toBe(true);
    expect(a.dayFirstSource).toBe('data');
    expect(a.validCount).toBe(2);
  });

  it('any second field > 12 decides month-first', () => {
    const a = analyzeDateColumn(['05/06/2024', '03/16/2021'], true);
    expect(a.dayFirst).toBe(false);
    expect(a.dayFirstSource).toBe('data');
  });

  it('undecidable columns use the locale default', () => {
    expect(analyzeDateColumn(['05/06/2024'], true)).toMatchObject({ dayFirst: true, dayFirstSource: 'locale' });
    expect(analyzeDateColumn(['05/06/2024'], false)).toMatchObject({ dayFirst: false, dayFirstSource: 'locale' });
  });

  it('both > 12 is ambiguous-mixed and those values are not counted valid', () => {
    const a = analyzeDateColumn(['13/06/2024', '06/13/2024', '2024-01-01'], true);
    expect(a.ambiguousMixed).toBe(true);
    expect(a.validCount).toBe(1);
  });

  it('year-first and month-name values do not vote (Lab "2023/13/01" is just invalid)', () => {
    const a = analyzeDateColumn(['2023/13/01', '24-Feb-21', '03/16/2021', 'invalid', 'NaN', '2021-04-02'], true);
    expect(a.ambiguousMixed).toBe(false);
    expect(a.dayFirst).toBe(false);
    expect(a.validCount).toBe(3);
    expect(a.invalidCount).toBe(3);
    expect(a.formats).toEqual(expect.arrayContaining(['D-Mon-YY', 'MM/DD/YYYY', 'YYYY-MM-DD']));
  });

  it('a forced order skips the vote', () => {
    const a = analyzeDateColumn(['13/06/2024', '06/13/2024'], true, false);
    expect(a.ambiguousMixed).toBe(false);
    expect(a.validCount).toBe(1);
  });
});

describe('stored dates', () => {
  it('parseStoredDate reads the parts without a time zone', () => {
    expect(parseStoredDate('2008-01-01')).toEqual({ year: 2008, month: 1, day: 1 });
    expect(parseStoredDate('2009-12-01T07:45:00')).toEqual({ year: 2009, month: 12, day: 1, hour: 7, minute: 45, second: 0 });
    expect(parseStoredDate('2023-02-30')).toBeNull();
    expect(parseStoredDate('05/06/2024')).toBeNull();
    expect(parseStoredDate(1199145600000)).toBeNull();
    expect(calendarDay('2009-12-01T07:45:00')).toBe('2009-12-01');
  });

  it('period keys come from the parts (Jan 1 stays in its year in every zone)', () => {
    expect(periodKey('2008-01-01', 'year')).toBe('2008');
    expect(periodKey('2008-01-01', 'quarter')).toBe('2008-Q1');
    expect(periodKey('2008-12-31', 'quarter')).toBe('2008-Q4');
    expect(periodKey('2008-01-01', 'month')).toBe('2008-01');
    expect(periodKey('2008-01-01T23:59', 'day')).toBe('2008-01-01');
    expect(periodKey('invalid', 'year')).toBeNull();
  });

  it('ISO weeks at year edges', () => {
    expect(isoWeek({ year: 2021, month: 1, day: 1 })).toEqual({ year: 2020, week: 53 });
    expect(isoWeek({ year: 2024, month: 12, day: 30 })).toEqual({ year: 2025, week: 1 });
    expect(isoWeek({ year: 2026, month: 1, day: 1 })).toEqual({ year: 2026, week: 1 });
    expect(periodKey('2021-01-03', 'week')).toBe('2020-W53');
    expect(periodKey('2021-01-04', 'week')).toBe('2021-W01');
  });

  it('period keys map back to their start for axes', () => {
    expect(dateKeyParts('2008')).toEqual({ year: 2008, month: 1, day: 1 });
    expect(dateKeyParts('2008-Q3')).toEqual({ year: 2008, month: 7, day: 1 });
    expect(dateKeyParts('2008-03')).toEqual({ year: 2008, month: 3, day: 1 });
    expect(dateKeyParts('2021-W01')).toEqual({ year: 2021, month: 1, day: 4 });
    expect(dateKeyParts('2020-W53')).toEqual({ year: 2020, month: 12, day: 28 });
    expect(dateKeyMs('2008-01-01')).toBe(Date.UTC(2008, 0, 1));
  });

  it('orders by the parts, invalid last', () => {
    const keys = ['2024-01-05T10:00', 'invalid', '2023-12-31', '2024-01-05'];
    expect([...keys].sort(compareStoredDates)).toEqual(['2023-12-31', '2024-01-05', '2024-01-05T10:00', 'invalid']);
  });

  it('adds months with a day clamp and steps period keys by their own unit', () => {
    expect(addMonths({ year: 2024, month: 1, day: 31 }, 1)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(addMonths({ year: 2023, month: 12, day: 15 }, 2)).toEqual({ year: 2024, month: 2, day: 15 });
    expect(stepDateKey('2024-01-31', 1)).toBe('2024-02-29');
    expect(stepDateKey('2024-11', 3)).toBe('2025-02');
    expect(stepDateKey('2024-Q4', 1)).toBe('2025-Q1');
    expect(stepDateKey('2024', 2)).toBe('2026');
    expect(stepDateKey('2020-W53', 1)).toBe('2021-W01');
    expect(stepDateKey('abc', 1)).toBeNull();
  });
});

describe('periodKeyRange', () => {
  it('first and last day of a period key or stored date', () => {
    expect(periodKeyRange('2008')).toEqual({ start: '2008-01-01', end: '2008-12-31' });
    expect(periodKeyRange('2024-Q1')).toEqual({ start: '2024-01-01', end: '2024-03-31' });
    expect(periodKeyRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(periodKeyRange('2023-12')).toEqual({ start: '2023-12-01', end: '2023-12-31' });
    expect(periodKeyRange('2024-W01')).toEqual({ start: '2024-01-01', end: '2024-01-07' });
    expect(periodKeyRange('2024-02-29T10:30')).toEqual({ start: '2024-02-29', end: '2024-02-29' });
    expect(periodKeyRange('(No date)')).toBeNull();
    expect(periodKeyRange(2024)).toBeNull();
  });
});

describe('filter bounds', () => {
  it('a picker Date is its local calendar day', () => {
    expect(calendarFromPickerDate(new Date(2008, 0, 1))).toBe('2008-01-01');
    expect(rangeBoundDay(new Date(2008, 0, 1))).toBe('2008-01-01');
  });

  it('a picker Date that went through JSON reads back as the same local day', () => {
    expect(rangeBoundDay(new Date(2008, 0, 1).toISOString())).toBe('2008-01-01');
  });

  it('a stored date string is its own day', () => {
    expect(rangeBoundDay('2008-01-01')).toBe('2008-01-01');
    expect(rangeBoundDay('2008-01-01T10:00')).toBe('2008-01-01');
  });
});

describe('localeDayFirst', () => {
  it('reads the order from the locale', () => {
    expect(localeDayFirst('en-IN')).toBe(true);
    expect(localeDayFirst('en-GB')).toBe(true);
    expect(localeDayFirst('de-DE')).toBe(true);
    expect(localeDayFirst('en-US')).toBe(false);
  });
});
