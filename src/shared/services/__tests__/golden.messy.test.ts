import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCsvText } from '../csvParse';
import { processRawData } from '../parsingService';
import { queryEngine, numericColumnSet } from '../queryEngine';
import { statsEngine } from '../stats';
import { summarizeNumericColumns } from '../stats/columnSummary';
import { aggregateValues } from '@/features/charts/lib/chartAggregation';
import { addColumnFix } from '../columnFixes';
import { Dataset, QueryAggregation } from '../../types';

/**
 * Messy-data golden tests: real-world dirty CSV subsets (tests/fixtures/messy, sources and
 * row lists in tests/fixtures/README.md) loaded through the real parse path, and every
 * engine that shows count/sum/mean/min/max/std checked against each other and against an
 * independent pandas oracle (scripts/golden/generate_messy_golden.py ->
 * tests/fixtures/messy/messy.golden.json). Regenerate with `npm run golden:regen-messy`;
 * never edit the golden file by hand.
 */

const DIR = resolve(__dirname, '../../../../tests/fixtures/messy');
const golden = JSON.parse(readFileSync(resolve(DIR, 'messy.golden.json'), 'utf8'));

type Stat = { count: number; sum: number; mean: number; min: number; max: number; std: number };

function expectClose(actual: number, expected: number, label: string) {
  const tol = 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected));
  expect(Math.abs(actual - expected), `${label}: expected ${expected}, got ${actual}`).toBeLessThanOrEqual(tol);
}

function expectStat(actual: Stat, expected: Stat, label: string) {
  expect(actual.count, `${label} count`).toBe(expected.count);
  for (const k of ['sum', 'mean', 'min', 'max', 'std'] as const) expectClose(actual[k], expected[k], `${label} ${k}`);
}

function load(file: string, { exclude = false } = {}): Dataset {
  const parsed = parseCsvText(readFileSync(resolve(DIR, file), 'utf8'));
  // "Exclude N rows" in the import summary (importCore.runImport) drops the rows with problems.
  const bad = new Set(parsed.errors.filter(e => e.row !== undefined).map(e => e.row as number));
  const rows = exclude ? parsed.rows.filter((_, i) => !bad.has(i)) : parsed.rows;
  return processRawData(rows, file);
}

/** Every engine equals the expected stats for `col`. */
function expectEngines(ds: Dataset, col: string, expected: Stat, label: string) {
  expect(expected, `no reference stats for ${label} ${col}`).toBeDefined();
  for (const [engine, stat] of Object.entries(engines(ds, col))) {
    expectStat(stat, expected, `${label} ${col} [${engine}]`);
  }
}

const OPS = ['count', 'sum', 'avg', 'min', 'max', 'stddev'] as const;
const toStat = (r: Record<string, number>): Stat => ({
  count: r.count, sum: r.sum, mean: r.avg, min: r.min, max: r.max, std: r.stddev,
});

/** Each engine's view of one numeric column over the whole dataset. */
function engines(ds: Dataset, col: string): Record<string, Stat> {
  const numeric = numericColumnSet(ds);
  const full = statsEngine.calculateDatasetStats(ds, { isFullDataset: true }).descriptive[col];
  const raw = statsEngine.calculateDatasetStats(ds, { isFullDataset: false }).descriptive[col];
  const fromDescriptive = (d: typeof full): Stat => ({
    count: d.count, sum: d.sum, mean: d.mean, min: d.min, max: d.max, std: d.stdDev,
  });

  // KPI cards run exactly this query (kpiEngine.calculateKPIData -> queryEngine.execute)
  const aggs: QueryAggregation[] = OPS.map(op => ({ column: col, operator: op, alias: op }));
  const kpi = queryEngine.execute(ds, { aggregations: aggs, pagination: { pageSize: 'all' }, options: { bypassCache: true } });

  const chart = Object.fromEntries(OPS.map(op => [op, aggregateValues(ds.data, col, op, numeric)]));
  const summary = summarizeNumericColumns(ds.data, [col])[0];

  return {
    'statsEngine (full)': fromDescriptive(full),
    'statsEngine (filtered path)': fromDescriptive(raw),
    'queryEngine / KPI': toStat(kpi.summary!),
    'chart aggregateValues': toStat(chart),
    'DashboardSummary': summary,
  };
}

/**
 * Columns whose plain-import values still hold something the user must approve removing
 * (the -1 sentinel, the shifted row). On a plain load engines must agree with each other;
 * the oracle check is done after the fix, below (fixedStats).
 */
const NOT_ORACLE_CHECKED: Record<string, Record<string, string>> = {
  'playstore.csv': { Rating: 'shifted row 10473 (Rating 19) is kept unless excluded' },
  'glassdoor.csv': {
    Rating: '-1 sentinel is kept until the user treats it as missing',
    Founded: '-1 sentinel is kept until the user treats it as missing',
  },
};

const FIXTURES: { file: string; rows: number; numeric: string[] }[] = [
  { file: 'cafe.csv', rows: 81, numeric: ['Quantity', 'Price Per Unit', 'Total Spent'] },
  // Price: "$x.xx" values, converted by the import's currency fix
  { file: 'playstore.csv', rows: 80, numeric: ['Rating', 'Reviews', 'Price'] },
  { file: 'netflix.csv', rows: 66, numeric: ['release_year'] },
  { file: 'glassdoor.csv', rows: 31, numeric: ['index', 'Rating', 'Founded'] },
];

describe('golden: messy-data fixtures', () => {
  for (const { file, rows, numeric } of FIXTURES) {
    describe(file, () => {
      const ds = load(file);
      const g = golden[file];

      it('row and column counts and header names match pandas', () => {
        expect(ds.data.length).toBe(rows);
        expect(g.rowCount).toBe(rows);
        expect(ds.columns).toEqual(g.columns);
      });

      it('exact duplicate rows match pandas duplicated()', () => {
        expect(ds.metadata!.quality!.duplicateRowCount).toBe(g.duplicateRows);
      });

      it('numeric columns are the expected ones', () => {
        const numericCols = ds.columns.filter(c => ds.columnTypes[c] === 'numeric');
        expect(numericCols).toEqual(numeric);
      });

      for (const col of numeric) {
        const skipOracle = NOT_ORACLE_CHECKED[file]?.[col];
        // Oracle-checked columns: every engine equals pandas. Others: every engine equals
        // statsEngine (agreement only), until the later batch fixes the value itself.
        const reference = (): Stat =>
          skipOracle ? engines(ds, col)['statsEngine (full)'] : (g.numericStats[col] as Stat);

        it(skipOracle ? `${col}: every engine agrees (oracle check deferred: ${skipOracle})` : `${col}: every engine agrees with the oracle`, () => {
          const expected = reference();
          expect(expected, `no reference stats for ${col}`).toBeDefined();
          for (const [engine, stat] of Object.entries(engines(ds, col))) {
            expectStat(stat, expected, `${file} ${col} [${engine}]`);
          }
        });

        it(`${col}: group-by counts add up to the column count`, () => {
          // Filter group-by path: one group per non-blank value of the first column, then
          // the per-group count/sum of `col` must add up to the oracle's totals.
          const by = ds.columns.find(c => c !== col && ds.data.every(r => r[c] !== null && r[c] !== undefined))!;
          const res = queryEngine.execute(ds, {
            groupBy: { column: by },
            aggregations: [
              { column: col, operator: 'count', alias: 'n' },
              { column: col, operator: 'sum', alias: 's' },
            ],
            pagination: { pageSize: 'all' },
            options: { bypassCache: true },
          });
          const n = res.rows.reduce((a, r) => a + (r.n as number), 0);
          const s = res.rows.reduce((a, r) => a + (r.s as number), 0);
          const expected = reference();
          expect(n).toBe(expected.count);
          expectClose(s, expected.sum, `${file} ${col} group-by sum`);
        });
      }
    });
  }

  // Dates: pandas with an explicit format per column is the oracle. This file also runs
  // under several TZ values (npm run test:tz), so the counts must not move between zones.
  for (const file of ['netflix.csv', 'playstore.csv', 'cafe.csv']) {
    for (const [column, expected] of Object.entries(golden[file].dateStats as Record<string, {
      validCount: number; invalidCount: number; missingCount: number; min: string; max: string; yearCounts: Record<string, number>;
    }>)) {
      it(`${file} ${column}: date type, valid/invalid/missing counts, min, max and per-year buckets match pandas`, () => {
        const ds = load(file);
        expect(ds.columnTypes[column]).toBe('date');
        const meta = ds.metadata!.columns.find(c => c.name === column)!;
        expect(meta.invalidDateCount).toBe(expected.invalidCount);
        expect(meta.missingValueCount).toBe(expected.missingCount);
        expect([meta.earliestDate, meta.latestDate]).toEqual([expected.min, expected.max]);
        const res = queryEngine.execute(ds, {
          groupBy: { column, period: 'year' },
          aggregations: [{ column, operator: 'count_rows', alias: 'n' }],
          pagination: { pageSize: 'all' },
          options: { bypassCache: true },
        });
        expect(Object.fromEntries(res.rows.map(r => [String(r[column]), r.n]))).toEqual(expected.yearCounts);
        expect(res.rows.reduce((a, r) => a + (r.n as number), 0)).toBe(expected.validCount);
      });
    }
  }

  it('netflix: a trailing non-breaking space in a title is kept (s6530)', () => {
    const ds = load('netflix.csv');
    const row = ds.data.find(r => r.show_id === 's6530')!;
    expect(row.title).toBe('Consequences\u00a0');
  });

  it('glassdoor: Rating/Founded offer -1 as missing, and after Yes every engine matches the oracle', () => {
    let ds = load('glassdoor.csv');
    const fixed = golden['glassdoor.csv'].fixedStats;
    for (const col of ['Rating', 'Founded']) {
      const sentinel = ds.metadata!.columns.find(c => c.name === col)!.quality!.sentinel;
      expect(sentinel, col).toMatchObject({ value: -1 });
      ds = addColumnFix(ds, { id: `sentinel:${col}`, column: col, kind: 'sentinel', auto: false, sentinel: -1 });
      expectEngines(ds, col, fixed[col], 'glassdoor.csv (-1 as missing)');
    }
  });

  it('playstore: with the parse-problem row excluded, Rating matches the oracle', () => {
    const parsed = parseCsvText(readFileSync(resolve(DIR, 'playstore.csv'), 'utf8'));
    const rows = [...new Set(parsed.errors.filter(e => e.row !== undefined).map(e => e.row))];
    expect(rows).toEqual(golden['playstore.csv'].excludedRows);
    const ds = load('playstore.csv', { exclude: true });
    expectEngines(ds, 'Rating', golden['playstore.csv'].fixedStats.Rating, 'playstore.csv (excluded)');
  });

  it('playstore: Price "$x.xx" converts to numbers (currency USD, "$"), and undo-able', () => {
    const ds = load('playstore.csv');
    expect(ds.columnTypes.Price).toBe('numeric');
    expect(ds.metadata!.columnFixes).toEqual([
      expect.objectContaining({ column: 'Price', kind: 'currency', auto: true, currency: { code: 'USD', symbol: '$' } }),
    ]);
    expect(ds.fixSourceValues!.Price.some(v => typeof v === 'string' && v.startsWith('$'))).toBe(true);
  });

  it('playstore: Installs "Convert to number…" matches the oracle', () => {
    let ds = load('playstore.csv', { exclude: true });
    expect(ds.metadata!.columns.find(c => c.name === 'Installs')!.quality!.suffixCandidate).toBeDefined();
    ds = addColumnFix(ds, { id: 'numberSuffix:Installs', column: 'Installs', kind: 'numberSuffix', auto: false });
    expectEngines(ds, 'Installs', golden['playstore.csv'].fixedStats.Installs, 'playstore.csv (Installs converted)');
  });
});
