import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import Papa from 'papaparse';
import { processRawData } from '../parsingService';
import { queryEngine } from '../queryEngine';
import { pivotEngine } from '../pivot';
import { statsEngine } from '../stats/engine';
import { windowEngine } from '../window';
import { Dataset, DataRow, QueryAggregation } from '../../types';

/**
 * Golden numeric tests: every engine checked against values computed independently by
 * pandas (scripts/golden/generate_hr_golden.py -> tests/fixtures/hr-attrition.golden.json).
 * Conventions (population variance, linear quantiles, stable ROW_NUMBER ties, peer-inclusive
 * running total) are documented in the generator. Never edit the golden file to make a test
 * pass; regenerate it with `npm run golden:regen` only when the oracle itself changes.
 */

const FIXTURES = resolve(__dirname, '../../../../tests/fixtures');
const golden = JSON.parse(readFileSync(resolve(FIXTURES, 'hr-attrition.golden.json'), 'utf8'));

/**
 * Floats: |a - b| <= 1e-9 * max(1, |a|, |b|) — relative tolerance, with an absolute floor
 * so expected values of 0 don't demand bit-exact equality. Counts and ranks use toBe.
 */
function expectClose(actual: unknown, expected: number, label: string) {
  expect(typeof actual, `${label}: not a number (${String(actual)})`).toBe('number');
  const a = actual as number;
  const tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(expected));
  expect(Math.abs(a - expected), `${label}: expected ${expected}, got ${a}`).toBeLessThanOrEqual(tol);
}

// Same path as FileUpload.tsx: PapaParse (same options) -> processRawData.
function loadDataset(): Dataset {
  const csv = readFileSync(resolve(FIXTURES, 'hr-attrition.csv'), 'utf8');
  const parsed = Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: 'greedy' });
  return processRawData(parsed.data, 'hr-attrition.csv');
}

function groupBy(ds: Dataset, column: string, aggregations: QueryAggregation[]): Map<string, DataRow> {
  const result = queryEngine.execute(ds, {
    groupBy: { column },
    aggregations,
    pagination: { pageSize: 'all' },
    options: { bypassCache: true },
  });
  return new Map(result.rows.map(r => [String(r[column]), r]));
}

const ATTRITION_YES = '[Attrition] = "Yes"';

describe('golden: IBM HR attrition fixture', () => {
  let ds: Dataset;

  beforeAll(() => {
    ds = loadDataset();
  });

  it('parses every row and column with the expected types', () => {
    expect(ds.data.length).toBe(golden._meta.rowCount);
    expect(ds.columns[0]).toBe('Age'); // BOM stripped
    for (const c of ['Age', 'Education', 'MonthlyIncome', 'TotalWorkingYears', 'YearsAtCompany', 'EmployeeNumber']) {
      expect(ds.columnTypes[c], c).toBe('numeric');
    }
    for (const c of ['Department', 'JobRole', 'Gender', 'Attrition']) {
      expect(ds.columnTypes[c], c).toBe('categorical');
    }
  });

  describe('queryEngine group-by', () => {
    it('Age: sum/avg/count/min/max of Education and MonthlyIncome', () => {
      const cols = ['Education', 'MonthlyIncome'];
      const ops = ['sum', 'avg', 'count', 'min', 'max'] as const;
      const rows = groupBy(
        ds,
        'Age',
        cols.flatMap(column => ops.map(operator => ({ column, operator, alias: `${operator}_${column}` })))
      );
      const expected = golden.groupByAge as Record<string, Record<string, Record<string, number>>>;
      expect([...rows.keys()].sort()).toEqual(Object.keys(expected).sort());
      for (const [age, byCol] of Object.entries(expected)) {
        for (const col of cols) {
          for (const op of ops) {
            const label = `Age=${age} ${op}(${col})`;
            if (op === 'count') expect(rows.get(age)![`${op}_${col}`], label).toBe(byCol[col][op]);
            else expectClose(rows.get(age)![`${op}_${col}`], byCol[col][op], label);
          }
        }
      }
    });

    for (const column of ['Department', 'JobRole']) {
      it(`${column}: count, avg MonthlyIncome, Attrition=Yes rate`, () => {
        const rows = groupBy(ds, column, [
          { column: 'EmployeeNumber', operator: 'count', alias: 'n' },
          { column: 'MonthlyIncome', operator: 'avg', alias: 'avgIncome' },
          { column: 'Attrition', operator: 'count_if', alias: 'yes', conditionExpression: ATTRITION_YES },
        ]);
        const expected = golden[`groupBy${column}`] as Record<string, Record<string, number>>;
        expect([...rows.keys()].sort()).toEqual(Object.keys(expected).sort());
        for (const [key, e] of Object.entries(expected)) {
          const r = rows.get(key)!;
          expect(r.n, `${key} count`).toBe(e.count);
          expectClose(r.avgIncome, e.avgMonthlyIncome, `${key} avg MonthlyIncome`);
          // Guard: count_if returns 0 on a condition that fails to compile, which would
          // look like an engine bug rather than a test bug.
          expect(r.yes as number, `${key} Attrition=Yes count`).toBeGreaterThan(0);
          expect(r.yes, `${key} Attrition=Yes count`).toBe(e.attritionYesCount);
          expectClose((r.yes as number) / (r.n as number), e.attritionYesRate, `${key} attrition rate`);
        }
      });
    }
  });

  describe('pivotEngine', () => {
    it('Department > JobRole rows: count, avg MonthlyIncome, Attrition=Yes rate', () => {
      const result = pivotEngine.execute(ds, {
        rowDimensions: ['Department', 'JobRole'],
        columnDimensions: [],
        valueFields: [
          { column: 'EmployeeNumber', operator: 'count', displayName: 'n' },
          { column: 'MonthlyIncome', operator: 'avg', displayName: 'avg' },
          { column: 'Attrition', operator: 'count_if', displayName: 'yes', conditionExpression: ATTRITION_YES },
        ],
      });
      const expected = golden.groupByDepartmentJobRole as Record<string, Record<string, number>>;
      const yesAlias = `count_if_Attrition_c:${ATTRITION_YES}`;
      const leaves = result.rows.filter(r => r.level === 1);
      expect(leaves.length).toBe(Object.keys(expected).length);
      for (const [key, e] of Object.entries(expected)) {
        const path = key.split('\u0000');
        const n = result.getCell(path, [], 'count_EmployeeNumber');
        const yes = result.getCell(path, [], yesAlias) as number;
        expect(n, `${path.join(' > ')} count`).toBe(e.count);
        expectClose(result.getCell(path, [], 'avg_MonthlyIncome'), e.avgMonthlyIncome, `${path.join(' > ')} avg`);
        expect(yes, `${path.join(' > ')} yes count`).toBe(e.attritionYesCount);
        expectClose(yes / (n as number), e.attritionYesRate, `${path.join(' > ')} attrition rate`);
      }
    });

    it('Department x Gender: count and sum MonthlyIncome with row/column/grand totals', () => {
      const result = pivotEngine.execute(ds, {
        rowDimensions: ['Department'],
        columnDimensions: ['Gender'],
        valueFields: [
          { column: 'EmployeeNumber', operator: 'count', displayName: 'n' },
          { column: 'MonthlyIncome', operator: 'sum', displayName: 'sum' },
        ],
      });
      const expected = golden.pivotDepartmentGender as Record<string, { count: number; sumMonthlyIncome: number }>;
      const toPath = (k: string) => (k === '__total__' ? [] : [k]);
      for (const [key, e] of Object.entries(expected)) {
        const [dept, gender] = key.split('|');
        const label = `${dept} x ${gender}`;
        expect(result.getCell(toPath(dept), toPath(gender), 'count_EmployeeNumber'), label).toBe(e.count);
        expectClose(result.getCell(toPath(dept), toPath(gender), 'sum_MonthlyIncome'), e.sumMonthlyIncome, label);
      }
    });
  });

  describe('statsEngine', () => {
    const statKeys = ['mean', 'median', 'variance', 'stdDev', 'min', 'max', 'q1', 'q3'] as const;

    for (const isFullDataset of [true, false]) {
      it(`descriptive stats (isFullDataset=${isFullDataset})`, () => {
        const res = statsEngine.calculateDatasetStats(ds, { isFullDataset });
        for (const [col, e] of Object.entries(golden.stats as Record<string, Record<string, number>>)) {
          const d = res.descriptive[col];
          expect(d.count, `${col} count`).toBe(e.count);
          for (const k of statKeys) expectClose(d[k], e[k], `${col} ${k}`);
        }
      });
    }

    it('IQR (1.5x) and z-score (|z|>3) outlier counts', () => {
      const iqr = statsEngine.calculateDatasetStats(ds, { outlierMethod: 'iqr' });
      const z = statsEngine.calculateDatasetStats(ds, { outlierMethod: 'zscore' });
      for (const [col, e] of Object.entries(golden.stats as Record<string, Record<string, number>>)) {
        expect(iqr.outliers[col].count, `${col} IQR outliers`).toBe(e.iqrOutlierCount);
        expect(z.outliers[col].count, `${col} z-score outliers`).toBe(e.zscoreOutlierCount);
      }
    });

    it('Pearson correlation matrix', () => {
      const res = statsEngine.calculateDatasetStats(ds);
      const expected = golden.correlation as Record<string, Record<string, number>>;
      for (const [a, row] of Object.entries(expected)) {
        for (const [b, r] of Object.entries(row)) {
          expectClose(res.correlationMatrix.matrix[a][b], r, `r(${a}, ${b})`);
        }
      }
    });
  });

  describe('windowEngine', () => {
    it('PARTITION BY Department ORDER BY MonthlyIncome DESC: ROW_NUMBER, RANK, DENSE_RANK, running total', () => {
      const partitionBy = ['Department'];
      const orderBy = [{ column: 'MonthlyIncome', direction: 'desc' as const }];
      const out = windowEngine.execute(ds.data, [
        { alias: 'rn', functionType: 'ROW_NUMBER', partitionBy, orderBy },
        { alias: 'rk', functionType: 'RANK', partitionBy, orderBy },
        { alias: 'drk', functionType: 'DENSE_RANK', partitionBy, orderBy },
        { alias: 'rt', functionType: 'RUNNING_TOTAL', targetColumn: 'MonthlyIncome', partitionBy, orderBy },
      ]);
      const byEmployee = new Map(out.map(r => [String(r.EmployeeNumber), r]));
      const expected = golden.windowByDepartmentIncomeDesc as Record<
        string,
        { rowNumber: number; rank: number; denseRank: number; runningTotal: number }
      >;
      for (const [emp, e] of Object.entries(expected)) {
        const r = byEmployee.get(emp)!;
        expect(r.rn, `#${emp} ROW_NUMBER`).toBe(e.rowNumber);
        expect(r.rk, `#${emp} RANK`).toBe(e.rank);
        expect(r.drk, `#${emp} DENSE_RANK`).toBe(e.denseRank);
        expectClose(r.rt, e.runningTotal, `#${emp} running total`);
      }
    });
  });
});
