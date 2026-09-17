# Numeric/Categorical Type Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user override a numeric column's type to categorical (or back) when it's actually an ordinal/category code, with a visible "might be categorical" indicator driving the override, and propagate that choice into the six highest-impact consumers identified by the type-inference audit.

**Architecture:** Two new fields on `ColumnMetadata` (`userOverrideType`, `allIntegerValues`) computed at ingest and persisted for free via the existing whole-dataset Dexie dump. A single new util module (`getEffectiveColumnType`/`getEffectiveColumnTypes`/`mightBeCategorical`) is the one place that resolves override-vs-inferred and defines the heuristic. Six consumers swap their raw `inferredDataType`/`columnTypes` reads for the resolver. A `setColumnTypeOverride` store action (built on the existing `applyActiveDatasetUpdate` commit path) is the only writer; the DataTable column header is the only UI surface that calls it.

**Tech Stack:** React + TypeScript, Zustand stores, Dexie (IndexedDB), Vitest (`environment: node`, no jsdom/RTL harness in this repo — component-level UI changes are verified by typecheck + manual run, not new component tests, matching existing repo convention).

**Spec:** `docs/superpowers/specs/2026-09-17-numeric-categorical-override-design.md`

## Global Constraints

- Heuristic (`mightBeCategorical`): `inferredDataType === 'numeric'` AND `allIntegerValues === true` AND `uniqueValueCount >= 2` AND `uniqueValueCount <= 12` AND `(maximumValue - minimumValue) <= 10`. A missing/undefined `allIntegerValues` must resolve to `false` (fail closed — never flag on missing data).
- `getEffectiveColumnType(dataset, columnName)` returns `userOverrideType` if set (non-null), else `dataset.columnTypes[columnName]`.
- No ratio-based gate in the heuristic (rejected in spec — breaks on small datasets).
- Override storage: `ColumnMetadata.userOverrideType?: 'numeric' | 'categorical' | 'date' | null`, persisted via the existing `datasets[]` → Dexie dump, no new persistence code.
- Override lifecycle: when `updateDatasetData` merges new metadata onto an existing dataset, carry a column's `userOverrideType` forward only if that column's `inferredDataType` is unchanged between old and new metadata; drop it otherwise.
- Phase 1 consumers (this plan): DataTable header badge + footer, StatsExplorer `numericColumns`, KPIBuilder `dateColumns`, PivotExplorer auto-default, PivotBuilder `getColumnsMetadata`, ChartVisualization `getColumnType`. No other consumer is touched by this plan (formula engine, AI Co-Pilot, anomaly detector, export, window functions, query engine fallback are explicitly phase 2 — do not modify them in this plan).
- No new write surface for the override besides the DataTable header. Do not add override controls to StatsExplorer/KPIBuilder/PivotBuilder/PivotExplorer/ChartVisualization in this plan.

---

### Task 1: `ColumnMetadata` type fields + `allIntegerValues` computation at ingest

**Files:**
- Modify: `src/shared/types/metadata.ts:1-18` (add two fields to `ColumnMetadata`)
- Modify: `src/shared/services/parsingService.ts:218-345` (`generateDatasetMetadata`: track and emit `allIntegerValues`)
- Test: `src/shared/services/__tests__/parsingService.allIntegerValues.test.ts`

**Interfaces:**
- Produces: `ColumnMetadata.userOverrideType?: 'numeric' | 'categorical' | 'date' | null` and `ColumnMetadata.allIntegerValues: boolean`, populated by `generateDatasetMetadata` for every column (numeric or not — see below).

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/services/__tests__/parsingService.allIntegerValues.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/services/__tests__/parsingService.allIntegerValues.test.ts`
Expected: FAIL — `allIntegerValues` is `undefined`, not `true`/`false` (property doesn't exist yet).

- [ ] **Step 3: Implement**

In `src/shared/types/metadata.ts`, add to `ColumnMetadata` (after `role`):

```ts
  role: 'dimension' | 'measure' | 'date' | 'identifier' | 'calculated' | 'hidden' | 'window';
  allIntegerValues: boolean;
  userOverrideType?: 'numeric' | 'categorical' | 'date' | null;
```

In `src/shared/services/parsingService.ts`, extend `ColStatAccumulator` (line 218-227) with an integer-tracking flag, initialize it in the pre-init block (line 230-242), update it in the single-pass loop's numeric branch (line 262-269), and emit it in the returned `ColumnMetadata` (line 308-326):

```ts
  interface ColStatAccumulator {
    missingCount: number;
    uniqueValuesMap: Map<string, number>;
    min: number;
    max: number;
    sum: number;
    validNumCount: number;
    minDate: Date | null;
    maxDate: Date | null;
    allIntegers: boolean;
  }
```

```ts
    acc[col] = {
      missingCount: 0,
      uniqueValuesMap: new Map<string, number>(),
      min: Infinity,
      max: -Infinity,
      sum: 0,
      validNumCount: 0,
      minDate: null,
      maxDate: null,
      allIntegers: true,
    };
```

In the numeric branch of the single-pass loop (right after `if (!isNaN(num)) {`):

```ts
        if (type === 'numeric') {
          const num = Number(val);
          if (!isNaN(num)) {
            stats.validNumCount++;
            stats.sum += num;
            if (num < stats.min) stats.min = num;
            if (num > stats.max) stats.max = num;
            if (!Number.isInteger(num)) stats.allIntegers = false;
          }
        } else if (type === 'date') {
```

In the `columnsMetadata` map (inside the `columns.map(col => {...})` block), add to the returned object:

```ts
      categoryCardinality,
      role,
      allIntegerValues: type === 'numeric' ? (stats.validNumCount > 0 && stats.allIntegers) : false,
      userOverrideType: undefined,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/services/__tests__/parsingService.allIntegerValues.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full existing suite to check no regressions**

Run: `npx vitest run`
Expected: all previously-passing tests still PASS (this task only adds fields; no removed/renamed fields).

- [ ] **Step 6: Commit**

Stage the changes (`git add src/shared/types/metadata.ts src/shared/services/parsingService.ts src/shared/services/__tests__/parsingService.allIntegerValues.test.ts`) and stop for the user to review/commit per repo convention — do not run `git commit`.

---

### Task 2: `getEffectiveColumnType` / `getEffectiveColumnTypes` / `mightBeCategorical` util

**Files:**
- Create: `src/shared/utils/columnType.ts`
- Test: `src/shared/utils/__tests__/columnType.test.ts`

**Interfaces:**
- Consumes: `Dataset` and `ColumnMetadata` from `@/shared/types` (Task 1's fields).
- Produces:
  - `getEffectiveColumnType(dataset: Dataset, columnName: string): 'numeric' | 'categorical' | 'date'`
  - `getEffectiveColumnTypes(dataset: Dataset): Record<string, 'numeric' | 'categorical' | 'date'>`
  - `mightBeCategorical(columnMeta: ColumnMetadata): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/utils/__tests__/columnType.test.ts
import { describe, it, expect } from 'vitest';
import { getEffectiveColumnType, getEffectiveColumnTypes, mightBeCategorical } from '../columnType';
import { Dataset, ColumnMetadata, DatasetMetadata } from '@/shared/types';

function makeCol(overrides: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return {
    id: 'ds_col',
    name: 'col',
    displayName: 'col',
    originalHeader: 'col',
    inferredDataType: 'numeric',
    nullableStatus: false,
    uniqueValueCount: 5,
    missingValueCount: 0,
    minimumValue: 1,
    maximumValue: 5,
    categoryCardinality: {},
    role: 'measure',
    allIntegerValues: true,
    ...overrides,
  };
}

function makeDataset(columns: ColumnMetadata[]): Dataset {
  const metadata: DatasetMetadata = {
    datasetId: 'ds', name: 'ds', createdAt: 0, updatedAt: 0,
    rowCount: 10, columnCount: columns.length,
    originalFileName: 'f.csv', originalFileType: 'csv',
    parsingStatistics: { processingTimeMs: 0 }, version: 1,
    columns,
  };
  const columnTypes: Record<string, 'numeric' | 'categorical' | 'date'> = {};
  columns.forEach(c => { columnTypes[c.name] = c.inferredDataType; });
  return { id: 'ds', name: 'ds', data: [], columns: columns.map(c => c.name), columnTypes, metadata };
}

describe('mightBeCategorical', () => {
  it('flags a 5-value Likert-scale column (Education-shaped: 1-5)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 5, minimumValue: 1, maximumValue: 5 }))).toBe(true);
  });
  it('flags a 4-value Likert-scale column (JobSatisfaction-shaped: 1-4)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 4, minimumValue: 1, maximumValue: 4 }))).toBe(true);
  });
  it('flags a hypothetical 0/1 boolean-coded column', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 2, minimumValue: 0, maximumValue: 1 }))).toBe(true);
  });
  it('does not flag a near-unique high-cardinality column (MonthlyIncome-shaped)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 1300, minimumValue: 1009, maximumValue: 19999, allIntegerValues: true }))).toBe(false);
  });
  it('does not flag an all-unique identifier column (EmployeeNumber-shaped)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 1470, minimumValue: 1, maximumValue: 2068, allIntegerValues: true }))).toBe(false);
  });
  it('does not flag a constant column (uniqueValueCount 1)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 1, minimumValue: 8, maximumValue: 8 }))).toBe(false);
  });
  it('does not flag a non-numeric column', () => {
    expect(mightBeCategorical(makeCol({ inferredDataType: 'categorical', uniqueValueCount: 3 }))).toBe(false);
  });
  it('does not flag a numeric column with fractional values', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 5, minimumValue: 1, maximumValue: 5, allIntegerValues: false }))).toBe(false);
  });
  it('does not flag when allIntegerValues is missing (fail closed)', () => {
    const col = makeCol({ uniqueValueCount: 5, minimumValue: 1, maximumValue: 5 });
    // @ts-expect-error simulating a pre-migration persisted dataset missing the field
    delete col.allIntegerValues;
    expect(mightBeCategorical(col)).toBe(false);
  });
  it('does not flag a narrow-range but wide-cardinality column exceeding the distinct cap (13 distinct)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 13, minimumValue: 1, maximumValue: 10 }))).toBe(false);
  });
  it('does not flag a column exceeding the span cap even with few distinct values (PercentSalaryHike-shaped control: span 14)', () => {
    expect(mightBeCategorical(makeCol({ uniqueValueCount: 15, minimumValue: 11, maximumValue: 25 }))).toBe(false);
  });
});

describe('getEffectiveColumnType', () => {
  it('returns the inferred type when no override is set', () => {
    const ds = makeDataset([makeCol({ name: 'Education', inferredDataType: 'numeric' })]);
    expect(getEffectiveColumnType(ds, 'Education')).toBe('numeric');
  });
  it('returns the override when set', () => {
    const ds = makeDataset([makeCol({ name: 'Education', inferredDataType: 'numeric', userOverrideType: 'categorical' })]);
    expect(getEffectiveColumnType(ds, 'Education')).toBe('categorical');
  });
  it('falls back to columnTypes when metadata is absent', () => {
    const ds = makeDataset([makeCol({ name: 'Education' })]);
    delete ds.metadata;
    expect(getEffectiveColumnType(ds, 'Education')).toBe('numeric');
  });
  it('treats an explicit null override as cleared (falls back to inferred)', () => {
    const ds = makeDataset([makeCol({ name: 'Education', inferredDataType: 'numeric', userOverrideType: null })]);
    expect(getEffectiveColumnType(ds, 'Education')).toBe('numeric');
  });
});

describe('getEffectiveColumnTypes', () => {
  it('returns a map covering every column, respecting overrides', () => {
    const ds = makeDataset([
      makeCol({ name: 'Education', inferredDataType: 'numeric', userOverrideType: 'categorical' }),
      makeCol({ name: 'Age', inferredDataType: 'numeric' }),
    ]);
    expect(getEffectiveColumnTypes(ds)).toEqual({ Education: 'categorical', Age: 'numeric' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/utils/__tests__/columnType.test.ts`
Expected: FAIL — module `../columnType` does not exist.

- [ ] **Step 3: Implement**

```ts
// src/shared/utils/columnType.ts
import { Dataset, ColumnMetadata } from "@/shared/types";

/**
 * Heuristic for "this numeric column looks like it might actually be an ordinal
 * or category code" (Likert scales, boolean 0/1 codes, small fixed-range integer
 * codes) rather than a genuine continuous measure. Deliberately conservative —
 * see docs/superpowers/specs/2026-09-17-numeric-categorical-override-design.md
 * Part 1 for the validation table these thresholds were checked against.
 */
export function mightBeCategorical(columnMeta: ColumnMetadata): boolean {
  if (columnMeta.inferredDataType !== 'numeric') return false;
  if (!columnMeta.allIntegerValues) return false;
  if (columnMeta.uniqueValueCount < 2 || columnMeta.uniqueValueCount > 12) return false;
  if (columnMeta.minimumValue === undefined || columnMeta.maximumValue === undefined) return false;
  const span = columnMeta.maximumValue - columnMeta.minimumValue;
  if (span > 10) return false;
  return true;
}

/**
 * Single resolution point for "what type should this column be treated as".
 * Returns the user's override if one is set, otherwise the auto-detected type.
 * Every consumer that branches on column type should read through this (or
 * getEffectiveColumnTypes) instead of dataset.columnTypes[col] /
 * metadata.columns[].inferredDataType directly, so a user's override is
 * respected everywhere at once.
 */
export function getEffectiveColumnType(
  dataset: Dataset,
  columnName: string
): 'numeric' | 'categorical' | 'date' {
  const colMeta = dataset.metadata?.columns.find(c => c.name === columnName);
  if (colMeta?.userOverrideType) return colMeta.userOverrideType;
  return dataset.columnTypes[columnName];
}

/** Bulk form of getEffectiveColumnType, for per-column render loops and all-column filters. */
export function getEffectiveColumnTypes(dataset: Dataset): Record<string, 'numeric' | 'categorical' | 'date'> {
  const result: Record<string, 'numeric' | 'categorical' | 'date'> = {};
  dataset.columns.forEach(col => {
    result[col] = getEffectiveColumnType(dataset, col);
  });
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/utils/__tests__/columnType.test.ts`
Expected: PASS (all cases above)

- [ ] **Step 5: Commit**

Stage `src/shared/utils/columnType.ts` and `src/shared/utils/__tests__/columnType.test.ts`, stop for review (no `git commit`).

---

### Task 3: `setColumnTypeOverride` store action + override-lifecycle rule

**Files:**
- Modify: `src/store/datasetStore.ts` (add action; update `updateDatasetData`, lines 112-134)
- Test: `src/store/__tests__/datasetStore.columnTypeOverride.test.ts`

**Interfaces:**
- Consumes: `applyActiveDatasetUpdate` (existing, `datasetStore.ts:50-68`), `ColumnMetadata` from Task 1.
- Produces: `useDatasetStore().setColumnTypeOverride(columnName: string, overrideType: 'numeric' | 'categorical' | 'date' | null): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/store/__tests__/datasetStore.columnTypeOverride.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useDatasetStore } from "@/store/datasetStore";
import { Dataset, ColumnMetadata, DatasetMetadata } from "@/shared/types";

function makeCol(name: string, overrides: Partial<ColumnMetadata> = {}): ColumnMetadata {
  return {
    id: `ds_${name}`, name, displayName: name, originalHeader: name,
    inferredDataType: 'numeric', nullableStatus: false,
    uniqueValueCount: 5, missingValueCount: 0, minimumValue: 1, maximumValue: 5,
    categoryCardinality: {}, role: 'measure', allIntegerValues: true,
    ...overrides,
  };
}

function makeDataset(): Dataset {
  const columns = [makeCol('Education'), makeCol('Age', { minimumValue: 18, maximumValue: 60, uniqueValueCount: 40 })];
  const metadata: DatasetMetadata = {
    datasetId: 'ds1', name: 'ds1', createdAt: 0, updatedAt: 0,
    rowCount: 10, columnCount: 2, originalFileName: 'f.csv', originalFileType: 'csv',
    parsingStatistics: { processingTimeMs: 0 }, version: 1, columns,
  };
  return {
    id: 'ds1', name: 'ds1', data: [{ Education: 1, Age: 30 }],
    columns: ['Education', 'Age'],
    columnTypes: { Education: 'numeric', Age: 'numeric' },
    metadata,
  };
}

describe('setColumnTypeOverride', () => {
  beforeEach(() => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset], activeDataset: dataset });
  });

  it('sets userOverrideType on the target column in both datasets[] and activeDataset', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const { datasets, activeDataset } = useDatasetStore.getState();
    expect(activeDataset!.metadata!.columns.find(c => c.name === 'Education')!.userOverrideType).toBe('categorical');
    expect(datasets[0].metadata!.columns.find(c => c.name === 'Education')!.userOverrideType).toBe('categorical');
  });

  it('leaves other columns untouched', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const ageCol = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Age')!;
    expect(ageCol.userOverrideType).toBeUndefined();
  });

  it('clears the override when passed null', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    useDatasetStore.getState().setColumnTypeOverride('Education', null);
    const col = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBeNull();
  });

  it('is a no-op when there is no active dataset', () => {
    useDatasetStore.setState({ datasets: [], activeDataset: null });
    expect(() => useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical')).not.toThrow();
  });
});

describe('updateDatasetData override lifecycle', () => {
  beforeEach(() => {
    const dataset = makeDataset();
    useDatasetStore.setState({ datasets: [dataset], activeDataset: dataset });
  });

  it('carries the override forward when the column\'s inferred type is unchanged across the update', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const prev = useDatasetStore.getState().activeDataset!;
    const newMetadata: DatasetMetadata = {
      ...prev.metadata!,
      columns: prev.metadata!.columns.map(c => c.name === 'Education' ? { ...c, uniqueValueCount: 6 } : c),
    };
    useDatasetStore.getState().updateDatasetData('ds1', prev.data, newMetadata, prev.columnTypes, prev.columns);
    const col = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBe('categorical');
  });

  it('drops the override when the column\'s inferred type changes across the update', () => {
    useDatasetStore.getState().setColumnTypeOverride('Education', 'categorical');
    const prev = useDatasetStore.getState().activeDataset!;
    const newMetadata: DatasetMetadata = {
      ...prev.metadata!,
      columns: prev.metadata!.columns.map(c => c.name === 'Education' ? { ...c, inferredDataType: 'categorical' as const } : c),
    };
    const newColumnTypes = { ...prev.columnTypes, Education: 'categorical' as const };
    useDatasetStore.getState().updateDatasetData('ds1', prev.data, newMetadata, newColumnTypes, prev.columns);
    const col = useDatasetStore.getState().activeDataset!.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.userOverrideType).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/datasetStore.columnTypeOverride.test.ts`
Expected: FAIL — `setColumnTypeOverride` is not a function; override-lifecycle tests fail because `updateDatasetData` doesn't carry/drop overrides yet.

- [ ] **Step 3: Implement**

In `src/store/datasetStore.ts`, add to the `DatasetState` interface (after `deleteWindowQuery`):

```ts
  setColumnTypeOverride: (columnName: string, overrideType: 'numeric' | 'categorical' | 'date' | null) => void;
```

Add the action implementation (after `deleteWindowQuery`, using the existing `applyActiveDatasetUpdate` helper):

```ts
  setColumnTypeOverride: (columnName, overrideType) => {
    applyActiveDatasetUpdate((dataset) => {
      if (!dataset.metadata) return dataset;
      return {
        ...dataset,
        metadata: {
          ...dataset.metadata,
          columns: dataset.metadata.columns.map((c) =>
            c.name === columnName ? { ...c, userOverrideType: overrideType } : c
          ),
        },
      };
    });
  },
```

In `updateDatasetData` (`datasetStore.ts:112-134`), carry forward `userOverrideType` for columns whose inferred type is unchanged, right before building `updatedDataset`:

```ts
    const nextVersion = (targetDataset.version || 1) + 1;
    const computedColumns = newColumns || (newMetadata ? newMetadata.columns.map((c) => c.name) : targetDataset.columns);
    const computedTypes = newColumnTypes || targetDataset.columnTypes;

    // Carry a column's manual override forward only if its auto-detected type
    // didn't change across this update; a changed inferred type means the
    // underlying data shape changed enough that a prior override (based on the
    // old shape) shouldn't silently persist — matches schemaDiff's existing
    // treatment of a cross-version type change as breaking.
    const mergedMetadata = newMetadata && targetDataset.metadata
      ? {
          ...newMetadata,
          columns: newMetadata.columns.map((newCol) => {
            const oldCol = targetDataset.metadata!.columns.find((c) => c.name === newCol.name);
            if (oldCol && oldCol.userOverrideType && oldCol.inferredDataType === newCol.inferredDataType) {
              return { ...newCol, userOverrideType: oldCol.userOverrideType };
            }
            return newCol;
          }),
        }
      : newMetadata;

    const updatedDataset: Dataset = {
      ...targetDataset,
      data: newRawData,
      columns: computedColumns,
      columnTypes: computedTypes,
      metadata: mergedMetadata || targetDataset.metadata,
      version: nextVersion,
      lastUpdated: Date.now(),
      calculatedFields: targetDataset.calculatedFields || [],
      windowQueries: targetDataset.windowQueries || [],
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/datasetStore.columnTypeOverride.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run full existing suite to check no regressions**

Run: `npx vitest run`
Expected: all tests PASS, including `datasetStore.windowZeroing.test.ts` (unaffected — this task doesn't touch `applyActiveDatasetUpdate`'s existing callers).

- [ ] **Step 6: Commit**

Stage `src/store/datasetStore.ts` and the new test file, stop for review (no `git commit`).

---

### Task 4: Hydration backfill for `allIntegerValues`

**Files:**
- Modify: `src/shared/services/persistenceService.ts:109-120`
- Test: `src/shared/services/__tests__/persistenceService.allIntegerValuesBackfill.test.ts`

**Interfaces:**
- Consumes: `mightBeCategorical` is NOT called here — this task only ensures the field exists with a safe value; Task 2's fail-closed behavior handles an actually-missing field too, so this backfill is a correctness/consistency pass, not a safety requirement.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/services/__tests__/persistenceService.allIntegerValuesBackfill.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/shared/lib/db";
import { persistenceService } from "../persistenceService";
import { useDatasetStore } from "@/store/datasetStore";
import { Dataset, ColumnMetadata, DatasetMetadata } from "@/shared/types";

function legacyColumnMissingField(): ColumnMetadata {
  const col = {
    id: 'ds1_Education', name: 'Education', displayName: 'Education', originalHeader: 'Education',
    inferredDataType: 'numeric' as const, nullableStatus: false,
    uniqueValueCount: 5, missingValueCount: 0, minimumValue: 1, maximumValue: 5,
    categoryCardinality: {}, role: 'measure' as const,
  };
  return col as ColumnMetadata; // deliberately missing allIntegerValues, simulating pre-migration persisted data
}

describe('persistenceService hydrate - allIntegerValues backfill', () => {
  beforeEach(async () => {
    await db.datasets.clear();
    persistenceService.initialized = false;
  });

  it('backfills allIntegerValues on hydrate for a dataset persisted before this field existed', async () => {
    const metadata: DatasetMetadata = {
      datasetId: 'ds1', name: 'ds1', createdAt: 0, updatedAt: 0,
      rowCount: 2, columnCount: 1, originalFileName: 'f.csv', originalFileType: 'csv',
      parsingStatistics: { processingTimeMs: 0 }, version: 1,
      columns: [legacyColumnMissingField()],
    };
    const dataset: Dataset = {
      id: 'ds1', name: 'ds1',
      data: [{ Education: 1 }, { Education: 3 }],
      columns: ['Education'], columnTypes: { Education: 'numeric' }, metadata,
    };
    await db.datasets.put(dataset);

    await persistenceService.hydrate();

    const hydrated = useDatasetStore.getState().datasets.find(d => d.id === 'ds1')!;
    const col = hydrated.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.allIntegerValues).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/services/__tests__/persistenceService.allIntegerValuesBackfill.test.ts`
Expected: FAIL — `col.allIntegerValues` is `undefined`.

- [ ] **Step 3: Implement**

In `src/shared/services/persistenceService.ts`, add a backfill helper near the top (after `reportSyncFailure`, before `persistenceService`):

```ts
/**
 * Datasets persisted before ColumnMetadata.allIntegerValues existed load without it.
 * Recompute it from the dataset's own rows so the "might be categorical" heuristic
 * (src/shared/utils/columnType.ts) doesn't have to special-case a missing field beyond
 * its existing fail-closed default. No-ops (returns the dataset unchanged) if metadata
 * is absent or every column already has the field.
 */
function backfillAllIntegerValues(dataset: import("@/shared/types").Dataset): import("@/shared/types").Dataset {
  if (!dataset.metadata) return dataset;
  const needsBackfill = dataset.metadata.columns.some((c) => c.allIntegerValues === undefined);
  if (!needsBackfill) return dataset;

  return {
    ...dataset,
    metadata: {
      ...dataset.metadata,
      columns: dataset.metadata.columns.map((col) => {
        if (col.allIntegerValues !== undefined) return col;
        if (col.inferredDataType !== 'numeric') return { ...col, allIntegerValues: false };
        const allIntegers = dataset.data.every((row) => {
          const val = row[col.name];
          return val === null || val === undefined || (typeof val === 'number' && Number.isInteger(val));
        });
        return { ...col, allIntegerValues: allIntegers };
      }),
    },
  };
}
```

In `hydrate()`, extend the existing self-heal line (`persistenceService.ts:117`):

```ts
      const evaluatedDatasets = validDatasets
        .map(backfillAllIntegerValues)
        .map(d => windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(d)));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/services/__tests__/persistenceService.allIntegerValuesBackfill.test.ts`
Expected: PASS

- [ ] **Step 5: Run full existing suite to check no regressions**

Run: `npx vitest run`
Expected: all tests PASS, including `persistenceService.test.ts` and `persistenceService.windowRehydrate.test.ts`.

- [ ] **Step 6: Commit**

Stage `src/shared/services/persistenceService.ts` and the new test file, stop for review (no `git commit`).

---

### Task 5: DataTable footer `summaryStats` — effective-type migration

**Files:**
- Modify: `src/features/datasets/components/DataTable.tsx:251-295`

**Interfaces:**
- Consumes: `getEffectiveColumnType` from `@/shared/utils/columnType` (Task 2).

- [ ] **Step 1: Write the failing test**

No component test harness exists in this repo (vitest `environment: node`, no `.test.tsx` precedent — see plan header). Verify this task via a direct read of the diff plus the manual check in Step 4; do not introduce a new RTL/jsdom setup for one component.

- [ ] **Step 2: Implement**

Add the import at the top of `DataTable.tsx` (alongside the existing `@/shared/services/...` imports):

```ts
import { getEffectiveColumnType } from "@/shared/utils/columnType";
```

In the `summaryStats` `useMemo` (lines 258-274, the metadata fast path), replace the `inferredDataType` check:

```ts
      dataset.metadata.columns.forEach(col => {
        if (
          getEffectiveColumnType(dataset, col.name) === 'numeric' &&
          col.minimumValue !== undefined &&
          col.maximumValue !== undefined &&
          col.average !== undefined
        ) {
```

Note: `col.minimumValue`/`maximumValue`/`average` remain the *inferred-numeric* precomputed stats even when the effective type is now numeric via an override from a non-numeric inferred type — but an override can only ever be set on a column whose `inferredDataType` was originally `'numeric'` in the DataTable UI flow (Task 6 only shows the override control on already-numeric columns), so these fields are always populated whenever this branch's `getEffectiveColumnType` check passes. Leave the non-fast-path branch's raw-value computation (lines 277-292) as the fallback for the opposite direction (numeric overridden to categorical, or filtered/searched state):

```ts
    dataset.columns.forEach(col => {
      if (getEffectiveColumnType(dataset, col) === 'numeric') {
        const values = filteredData
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open a dataset with an existing numeric column, confirm the footer summary still shows Min/Max/Mean unchanged (no override set yet — behavior must be identical to before this task).

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS (no test currently covers this component; this step is a regression guard for anything indirectly exercising `DataTable`'s exports, if any).

- [ ] **Step 6: Commit**

Stage `src/features/datasets/components/DataTable.tsx`, stop for review (no `git commit`).

---

### Task 6: DataTable column header — "might be categorical" badge + override control

**Files:**
- Modify: `src/features/datasets/components/DataTable.tsx:515-533` (header cell) and imports

**Interfaces:**
- Consumes: `getEffectiveColumnType`, `mightBeCategorical` (Task 2); `useDatasetStore().setColumnTypeOverride` (Task 3); `Popover`/`PopoverTrigger`/`PopoverContent` from `@/shared/components/ui/popover`.

- [ ] **Step 1: No new automated test**

Same rationale as Task 5 — no component test harness in this repo. Verified via Step 4's manual walkthrough, which is the acceptance check for this task's UI behavior.

- [ ] **Step 2: Implement**

Add imports at the top of `DataTable.tsx`:

```ts
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { getEffectiveColumnType, mightBeCategorical } from "@/shared/utils/columnType";
```

Add the store action alongside the existing `updateDatasetData` selector (near the top of the component body):

```ts
  const setColumnTypeOverride = useDatasetStore((state) => state.setColumnTypeOverride);
```

Replace the header badge block (`DataTable.tsx:515-533`):

```tsx
                  {dataset.columns.map((column) => {
                    const colMeta = dataset.metadata?.columns.find(c => c.name === column);
                    const effectiveType = getEffectiveColumnType(dataset, column);
                    const flagged = colMeta
                      ? mightBeCategorical(colMeta) && colMeta.userOverrideType == null
                      : false;
                    const overridden = colMeta?.userOverrideType != null;

                    const badge = (
                      <Badge
                        variant="outline"
                        className={
                          "ml-2 text-[10px] uppercase font-normal cursor-pointer " +
                          (flagged
                            ? "border-amber-400 text-amber-600 dark:text-amber-400"
                            : overridden
                              ? "border-primary text-primary"
                              : "border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400")
                        }
                      >
                        {effectiveType}
                        {overridden && " (override)"}
                      </Badge>
                    );

                    return (
                      <TableHead
                        key={column}
                        className="bg-gray-50 dark:bg-zinc-900/95 backdrop-blur-sm text-xs uppercase tracking-wider text-gray-500 dark:text-zinc-400 font-semibold py-2"
                        aria-sort={sortColumn === column ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <Button
                          variant="ghost"
                          className="h-auto p-2 justify-start font-semibold text-xs uppercase tracking-wider text-gray-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                          onClick={() => handleSort(column)}
                          aria-label={`Sort by ${column}, currently ${sortColumn === column ? (sortDirection === 'asc' ? 'sorted ascending' : 'sorted descending') : 'unsorted'}`}
                        >
                          <span className="truncate max-w-32">{column}</span>
                          {(flagged || overridden) && colMeta ? (
                            <Popover>
                              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                {badge}
                              </PopoverTrigger>
                              <PopoverContent className="w-64 text-xs normal-case tracking-normal" onClick={(e) => e.stopPropagation()}>
                                {flagged ? (
                                  <>
                                    <p className="font-semibold mb-1">Might be categorical</p>
                                    <p className="text-muted-foreground mb-3">
                                      {colMeta.uniqueValueCount} distinct values, range {colMeta.minimumValue}–{colMeta.maximumValue}. Could be an ordinal or category code rather than a real measure.
                                    </p>
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => setColumnTypeOverride(column, 'categorical')}>
                                        Treat as Categorical
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => setColumnTypeOverride(column, 'numeric')}>
                                        Keep as Numeric
                                      </Button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-semibold mb-1">Type overridden</p>
                                    <p className="text-muted-foreground mb-3">
                                      Treated as {colMeta.userOverrideType} instead of the auto-detected {colMeta.inferredDataType}.
                                    </p>
                                    <Button size="sm" variant="outline" onClick={() => setColumnTypeOverride(column, null)}>
                                      Reset to auto-detected
                                    </Button>
                                  </>
                                )}
                              </PopoverContent>
                            </Popover>
                          ) : (
                            badge
                          )}
                          <ArrowUpDown className="ml-2 h-3 w-3" />
                        </Button>
                      </TableHead>
                    );
                  })}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Upload (or use an existing) dataset with a small-integer-range numeric column (e.g. a 1-5 rating column). Confirm:
1. That column's header badge renders amber/warning-styled with "numeric" text.
2. Clicking the badge opens a popover showing distinct-value count and range, with "Treat as Categorical" / "Keep as Numeric" buttons.
3. Clicking "Treat as Categorical" changes the badge to show "categorical (override)" in a distinct style, and the popover now offers "Reset to auto-detected".
4. Reload the page — the override persists (confirms the Dexie round-trip from Task 1/3 works end-to-end).
5. A normal numeric column (e.g. a high-cardinality salary column) shows the plain, non-clickable badge exactly as before this task.

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

Stage `src/features/datasets/components/DataTable.tsx`, stop for review (no `git commit`).

---

### Task 7: StatsExplorer `numericColumns` — effective-type migration

**Files:**
- Modify: `src/features/stats/components/StatsExplorer.tsx:49-59`

**Interfaces:**
- Consumes: `getEffectiveColumnTypes` from Task 2.

- [ ] **Step 1: Add the import**

```ts
import { getEffectiveColumnTypes } from "@/shared/utils/columnType";
```

- [ ] **Step 2: Replace the `numericColumns` memo**

```ts
  const numericColumns = useMemo(() => {
    if (!activeDataset) return [];
    const effectiveTypes = getEffectiveColumnTypes(activeDataset);
    return activeDataset.columns.filter(col => effectiveTypes[col] === 'numeric');
  }, [activeDataset]);
```

This replaces both branches of the previous metadata-fast-path / fallback split (`StatsExplorer.tsx:50-59`) — `getEffectiveColumnTypes` already handles the metadata-present/absent distinction internally, so the two-branch structure is no longer needed here.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open Stats Explorer on a dataset, confirm the "Column" selector for descriptive stats still lists the same numeric columns as before (no override set — must be unchanged). Then go to DataTable, override one numeric column to categorical, return to Stats Explorer, confirm that column no longer appears in the numeric column list.

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

Stage `src/features/stats/components/StatsExplorer.tsx`, stop for review (no `git commit`).

---

### Task 8: KPIBuilder `dateColumns` — effective-type migration

**Files:**
- Modify: `src/features/kpi/components/KPIBuilder.tsx:57-66`

**Interfaces:**
- Consumes: `getEffectiveColumnTypes` from Task 2.

- [ ] **Step 1: Add the import**

```ts
import { getEffectiveColumnTypes } from "@/shared/utils/columnType";
```

- [ ] **Step 2: Replace the `dateColumns` memo**

```ts
  const dateColumns = useMemo(() => {
    if (!dataset) return [];
    const effectiveTypes = getEffectiveColumnTypes(dataset);
    return dataset.columns.filter((col) => effectiveTypes[col] === "date");
  }, [dataset]);
```

`allColumns` (`KPIBuilder.tsx:48-55`) is left unchanged — it lists every column regardless of type today with no type-based filtering to migrate; this plan does not add new filtering behavior to the Measure Column picker (see Global Constraints — no new UI/filtering beyond what's specified).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open KPI Builder, enable trend comparison, confirm the date-column dropdown lists the same columns as before (no override set — unchanged behavior).

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

Stage `src/features/kpi/components/KPIBuilder.tsx`, stop for review (no `git commit`).

---

### Task 9: PivotExplorer auto-default — effective-type migration

**Files:**
- Modify: `src/features/pivot/components/PivotExplorer.tsx:19-55`

**Interfaces:**
- Consumes: `getEffectiveColumnType` from Task 2.

- [ ] **Step 1: Add the import**

```ts
import { getEffectiveColumnType } from "@/shared/utils/columnType";
```

- [ ] **Step 2: Replace the column-shape resolution and default-picking logic**

```ts
  const resolvedConfig = useMemo((): PivotConfig | null => {
    if (pivotConfig) return pivotConfig;
    if (!activeDataset) return null;

    const columnNames = activeDataset.metadata
      ? activeDataset.metadata.columns.map(c => c.name)
      : activeDataset.columns;

    const effectiveTypeOf = (name: string) => getEffectiveColumnType(activeDataset, name);

    const defaultRow = columnNames.find(name => {
      const t = effectiveTypeOf(name);
      return t === 'categorical' || t === 'date';
    });
    const defaultVal = columnNames.find(name => effectiveTypeOf(name) === 'numeric');
```

The remainder of the function (the `if (defaultRow && defaultVal) { ... }` block, lines 36-51) is unchanged — it already references `defaultRow`/`defaultVal` by name, not by the removed `columns` array.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open a dataset's Pivot tab for the first time (no saved pivot config), confirm the auto-generated pivot is unchanged from before this task (no override set yet). Then override a would-be-first-numeric-column to categorical in DataTable, clear the saved pivot config for that dataset (or use a fresh dataset), reopen Pivot tab, confirm the auto-default now skips that column for the value field.

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

Stage `src/features/pivot/components/PivotExplorer.tsx`, stop for review (no `git commit`).

---

### Task 10: PivotBuilder `getColumnsMetadata` — effective-type migration

**Files:**
- Modify: `src/features/pivot/components/PivotBuilder.tsx:84-98`

**Interfaces:**
- Consumes: `getEffectiveColumnType` from Task 2.

- [ ] **Step 1: Add the import**

```ts
import { getEffectiveColumnType } from "@/shared/utils/columnType";
```

- [ ] **Step 2: Replace `getColumnsMetadata`**

```ts
  const getColumnsMetadata = (): { name: string; type: 'numeric' | 'categorical' | 'date'; role: string }[] => {
    if (dataset.metadata) {
      return dataset.metadata.columns.map(c => ({
        name: c.name,
        type: getEffectiveColumnType(dataset, c.name),
        role: c.role,
      }));
    }
    return dataset.columns.map(colName => ({
      name: colName,
      type: dataset.columnTypes[colName] || 'categorical',
      role: dataset.columnTypes[colName] === 'numeric' ? 'measure' : 'dimension',
    }));
  };
```

This single change fixes both the field-list type icon (`renderTypeIcon`, line 102) and the "+Val" default operator: `addValueField` (line 137-150) already re-derives `resolvedOp` from `colMetadata?.type` looked up in `columns` (built from this function), so once `type` reflects the effective (override-aware) value, `addValueField(col.name, col.type === 'numeric' ? 'sum' : 'count')` (line 285) and the internal `resolvedOp` computation both automatically respect the override — no change needed at either of those call sites.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open Pivot Builder, confirm field type icons and "+Val" default operator are unchanged for columns with no override. Override a numeric column to categorical in DataTable, return to Pivot Builder, confirm that column's icon switches to the categorical (Type) icon and clicking "+Val" on it now defaults to Count instead of Sum.

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

Stage `src/features/pivot/components/PivotBuilder.tsx`, stop for review (no `git commit`).

---

### Task 11: ChartVisualization `getColumnType` — effective-type migration

**Files:**
- Modify: `src/features/charts/components/ChartVisualization.tsx:221-241`

**Interfaces:**
- Consumes: `getEffectiveColumnType` from Task 2.

- [ ] **Step 1: Add the import**

```ts
import { getEffectiveColumnType } from "@/shared/utils/columnType";
```

- [ ] **Step 2: Replace the metadata-resolution branch inside `getColumnType`**

```ts
    const getColumnType = (col: string): 'numeric' | 'date' | 'categorical' => {
      const activeDataset = useDatasetStore.getState().activeDataset;
      if (activeDataset && activeDataset.id === chart.datasetId && activeDataset.metadata) {
        const colMeta = activeDataset.metadata.columns.find(c => c.name === col);
        if (colMeta) return getEffectiveColumnType(activeDataset, col);
      }

      const nonNull = chartData.map(d => d[col]).filter(v => v !== null && v !== undefined && v !== "");
      if (!nonNull.length) return 'categorical';
      
      const numericCount = nonNull.filter(v => !isNaN(Number(v))).length;
      if (numericCount / nonNull.length > 0.8) return 'numeric';
      
      const dateCount = nonNull.filter(v => {
        const str = String(v);
        if (/^\d+$/.test(str)) return false;
        return !isNaN(Date.parse(str));
      }).length;
      
      if (dateCount / nonNull.length > 0.8) return 'date';
      return 'categorical';
    };
```

The row-sampling fallback (used only when `activeDataset`/`metadata`/`colMeta` are unavailable) is intentionally left as-is — it's the audit-flagged duplicated heuristic (audit §1), but eliminating it entirely is a larger refactor than this plan's scope (it operates on `chartData` rows, not a `Dataset`, so it can't call the shared resolver directly); this task only fixes the metadata-available path, which is the common case.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, build a scatter or histogram chart using a numeric column with no override — confirm it renders exactly as before. Override that column to categorical in DataTable, return to the chart — confirm it now shows the "requires numeric column" validation error instead of rendering (axis type gating now respects the override).

- [ ] **Step 5: Run full existing suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

Stage `src/features/charts/components/ChartVisualization.tsx`, stop for review (no `git commit`).

---

## Final Check (after all 11 tasks)

- [ ] Run `npx vitest run` — full suite green.
- [ ] Run `npx tsc --noEmit` — zero errors.
- [ ] Run `npm run build` — production build succeeds.
- [ ] Manual walkthrough: upload a dataset with a Likert-style column → confirm badge appears → override to categorical → confirm StatsExplorer, KPIBuilder's date picker (n/a for this column, verify no crash), PivotExplorer default, PivotBuilder icon/default-op, and ChartVisualization gating all reflect the override → reload page → confirm override survived.
