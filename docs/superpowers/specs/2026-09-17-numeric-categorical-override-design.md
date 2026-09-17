# Numeric/Categorical Type Override — Design

Status: approved, pending implementation
Source: `docs/AUDIT-TYPE-INFERENCE-2026-09-12.md`
Date: 2026-09-17

## Problem

`detectColumnType()` (`src/shared/services/parsingService.ts:50-90`) classifies a
column `numeric` whenever >80% of values parse as a JS number, with no cardinality
check. Ordinal/Likert-coded columns (`Education`, `JobSatisfaction`, etc., 4-5
distinct values on a 1-1470-row IBM HR dataset) and ID-like columns pass this test
identically to genuine continuous measures. ~12 downstream consumers (KPI cards,
Pivot auto-defaults, StatsExplorer, chart axis gating, AI Co-Pilot, anomaly
detection, export, ...) then treat these columns as arithmetic-safe, producing
correctly-computed but semantically meaningless numbers (see audit §2 for the full
consumer list and severity ranking).

Approved direction: **hybrid fix**. Keep automatic detection conservative (no
heuristic change to `detectColumnType` itself). Add a separate, opt-in "might be
categorical" indicator with a one-click override, surfaced where the user can act
on it, rather than silently reclassifying columns or adding an undiscoverable
manual toggle.

## Part 1 — Heuristic: "might be categorical"

A numeric column is flagged when **all** of the following hold:

1. `inferredDataType === 'numeric'`
2. Every non-null value is an integer (`Number.isInteger`)
3. `uniqueValueCount >= 2` (excludes constant columns — see "Constants" below)
4. `uniqueValueCount <= 12`
5. `maximumValue - minimumValue <= 10`

No distinct/row-count ratio gate. A ratio gate (e.g. `distinct/rowCount ≤ 0.05`)
was considered and rejected: on a small upload (e.g. 50 rows) a genuine 4-value
Likert column is `4/50 = 0.08`, which would fail a 5% ratio gate and silently
disable the indicator on small files — a validation blind spot a single
1470-row test dataset can't surface. The absolute cap + span + integer check
already separates every case below without that failure mode.

### Validation (IBM HR Attrition dataset shape, per audit doc)

| Column(s) | distinct | span | Verdict | Expected |
|---|---|---|---|---|
| Education, EnvironmentSatisfaction, JobInvolvement, JobLevel, JobSatisfaction, WorkLifeBalance, PerformanceRating, RelationshipSatisfaction, StockOptionLevel | 4-5 | 3-4 | **flagged** | flag — correct |
| Hypothetical 0/1 boolean column (not in this dataset) | 2 | 1 | **flagged** | flag — correct |
| MonthlyIncome | ~unique, hundreds+ | thousands | not flagged (fails distinct cap and span) | don't flag — correct |
| EmployeeNumber | 1470 (all-unique) | huge | not flagged (fails distinct cap and span) | don't flag — correct. Identifier detection (audit §3a, broadening `role: 'identifier'`) is a separate, out-of-scope heuristic; confirmed this one doesn't accidentally fire for it either. |
| EmployeeCount, StandardHours (constant) | 1 | 0 | not flagged — excluded by `uniqueValueCount >= 2` | **explicit decision**: constant/zero-variance columns are a separate concern (audit §3b), not built in this pass. |
| PercentSalaryHike | not measured — see below | not measured — see below | assumed not flagged | needs verification |

**PercentSalaryHike is an assumption, not a measurement.** The audit document
itself states (lines 18-19, and again at §3e) that it did not measure this
column's real min/max/distinct count — the CSV isn't in this repo — and reasoned
about it structurally only. The span≤10 threshold above assumes the real-world
range is ≈11-25 (span 14) from the public dataset's known shape, which clears it.
**Before/during implementation, verify the real column's span against an actual
CSV.** If real span is confirmed ≤10, tighten threshold 5 to `span <= 6` — this
still clears every Likert case above with margin (all span 3-4).

Caveat, not a case-breaker: `uniqueValueCount` is computed by `String(val)` key
(`parsingService.ts:259`), so `1` and `1.0` in a mixed-format column count as 2
distinct values, not 1. Doesn't affect any case in the table above.

### Constants (EmployeeCount, StandardHours)

Not flagged by this mechanism. A constant column isn't "might be an ordinal
code" — there's no variation to be ordinal or continuous about. Audit §3b
already records this as its own low-severity "zero-variance / low-information
column" gap, separate from the misclassification problem this feature addresses.
Not building a constant-column indicator in this pass.

## Part 2 — Data model, storage, resolution

### New fields on `ColumnMetadata` (`src/shared/types/metadata.ts`)

```ts
userOverrideType?: 'numeric' | 'categorical' | 'date' | null;
allIntegerValues: boolean;
```

Two fields, not one. `allIntegerValues` is the heuristic's integer signal;
nothing today recomputes it post-ingest, so it must be computed once, in the
existing single-pass accumulator loop in `generateDatasetMetadata`
(`parsingService.ts:245-279`), alongside min/max/sum.

Both fields live on `ColumnMetadata` rather than a new top-level map on
`Dataset`, matching where `role`/`inferredDataType` already sit, and they ride
free on existing persistence: `persistenceService.ts` subscribes to
`datasetStore`'s `datasets` reference and does `db.datasets.clear()` +
`bulkAdd(state.datasets)` on any change (`persistenceService.ts:320-330`) — any
immutable `datasets[]` update already survives reload with no new persistence
code.

### Backfill for already-persisted datasets

Datasets already in Dexie predate `allIntegerValues`. `persistenceService.hydrate()`
already re-runs `formulaEngine`/`windowEngine` over every persisted dataset as a
self-heal step (`persistenceService.ts:110-117`) — the same hydrate path
computes `allIntegerValues` for any `ColumnMetadata` missing it. A missing/
unknown field must degrade to **not flagged**, never to flagged (fail closed).

### Resolution helper — new file `src/shared/utils/columnType.ts`

Not added to `parsingService.ts`: that file is ingestion-time (CSV/XLSX) code,
and pulling it into ~12 unrelated consumer modules' import graphs is an
avoidable cost. A small, dependency-free util is the right size for something
this widely imported.

```ts
getEffectiveColumnType(dataset: Dataset, columnName: string): 'numeric' | 'categorical' | 'date'
getEffectiveColumnTypes(dataset: Dataset): Record<string, 'numeric' | 'categorical' | 'date'>
mightBeCategorical(columnMeta: ColumnMetadata): boolean
```

`getEffectiveColumnType` returns `userOverrideType` if set, else
`dataset.columnTypes[columnName]`. `getEffectiveColumnTypes` is the bulk form
for per-column render loops (DataTable header) and all-column filters
(phase 2's `queryEngine.ts:382-388`) — cheap to add now, awkward to retrofit
later. `mightBeCategorical` is the single implementation of the Part 1
heuristic — colocating it here (rather than reimplementing inline wherever the
badge renders) is what prevents the exact "duplicated heuristic" problem the
audit flagged for `ChartVisualization.tsx`'s standalone `getColumnType` (audit
§1) from recurring for this new logic.

### Store action

`setColumnTypeOverride(columnName: string, type: 'numeric' | 'categorical' | 'date' | null)`
on `useDatasetStore`, built on the existing `applyActiveDatasetUpdate` helper
(`datasetStore.ts:50-68`) — the same commit path already used for
`addCalculatedField`/`addWindowQuery`, which writes the evaluated result to both
`datasets[]` and `activeDataset` together. Reusing it avoids reintroducing the
exact `datasets[]`/`activeDataset` staleness bug that helper was built to fix
(see its own comment, `datasetStore.ts:34-49`).

### Override lifecycle across dataset version updates

`updateDatasetData` (`datasetStore.ts:112-134`) can replace `metadata` wholesale
on a re-upload (new file version). Without a rule, a stale `userOverrideType`
would either ride along onto a column whose actual shape changed, or vanish
depending on whether `newMetadata` happens to be supplied.

**Decision:** when merging new metadata onto an existing dataset, carry a
column's `userOverrideType` forward only if that column's `inferredDataType` is
unchanged between the old and new metadata; drop the override otherwise. This
matches `schemaDiff`'s existing treatment of a cross-version type change as a
breaking change — if the underlying data shape changed enough to flip the
auto-detected type, a prior override based on the old shape shouldn't silently
persist.

## Part 3 — UI surface

**Phase 1 surface: DataTable column header badge only**
(`src/features/datasets/components/DataTable.tsx:515-533`), which already
renders `dataset.columnTypes[column]` as a badge per column — additive, not new
UI real estate.

- Effective type numeric, no override set, `mightBeCategorical(columnMeta)`
  true → badge switches to a warning-styled variant, tooltip text
  `"Might be categorical — N distinct values, range {min}–{max}"`, click opens
  a small control: "Treat as Categorical" / "Keep as Numeric" (dismisses the
  indicator without changing anything downstream — sets `userOverrideType` back
  to `'numeric'` explicitly, distinguishing "reviewed and confirmed numeric"
  from "never reviewed").
- Override set → badge shows the override's type with a distinct style (e.g.
  "Categorical (override)") plus a "Reset to auto-detected" action that clears
  `userOverrideType` back to `null`.

Chosen as the single primary surface because: it's the first screen every
dataset lands on after upload, it already hosts the type badge being extended,
and the audit itself noted the DataTable footer gives the most self-correcting
context of any surface in the app (raw values sit right there). Other phase-1
consumers read the resolved effective type only — none hosts a duplicate
override control this pass, so there is exactly one place that writes
`userOverrideType`, not several UIs racing to update the same field. A
StatsExplorer-local echo of the (read-only) badge is reasonable phase-2 polish,
not phase 1.

## Consumer migration — phase 1 (this pass)

Highest-impact / most user-visible, per the audit's own severity ranking:

| Consumer | File:lines | Audit ref |
|---|---|---|
| DataTable header badge + footer `summaryStats` | `DataTable.tsx:251-295,515-533` | indicator's home surface |
| StatsExplorer `numericColumns` filter | `StatsExplorer.tsx:50-59` | §2c — confirmed trigger case |
| KPIBuilder measure picker | `KPIBuilder.tsx:151-166` | §2a — **highest** severity in audit |
| PivotExplorer auto-default on first tab open | `PivotExplorer.tsx:19-55` | §2b — zero-click default |
| PivotBuilder manual add-value default | `PivotBuilder.tsx:285` | §2d |
| ChartVisualization `getColumnType` / axis type gating | `ChartVisualization.tsx:221-281` | §2e — verified this function already holds a live `Dataset` via `useDatasetStore.getState()` inside the component, not just chart rows, so it can call the shared resolver directly instead of reimplementing the heuristic |

## Consumer migration — phase 2 (explicitly deferred)

Not silently left on raw `columnTypes`/`inferredDataType` — recorded here so the
gap is tracked, not forgotten:

- Formula engine (`formulaEngine.ts:527` `validate()`) — audit §2f; needs a
  semantic-warning concept that doesn't exist for *any* column type yet, a
  larger feature than "read the effective type."
- AI Co-Pilot context building + offline fallback (`aiEngine.ts:21-38`,
  `llmService.ts:4-57,171-222`) — audit §2g.
- Anomaly detector + executive-summary narration (`anomalyDetector.ts:77-118`,
  `summaryEngine.ts:39-42,108-130`) — audit §2h.
- PDF export (`exportUtils.ts:160-190`) — audit §2i.
- Window functions (`window/engine.ts:92-195`, `WindowExplorer.tsx:63-66`) —
  audit §2k.
- Query engine's no-aggregations-specified fallback (`queryEngine.ts:382-388`)
  — audit §2l.

## Explicitly out of scope (neither phase — separate product decisions)

- Spearman/rank correlation as an alternative to Pearson-only (audit §2m).
- Broadened identifier detection beyond exact `"id"`/`"key"` name match (audit
  §3a).
- Constant-column / zero-variance indicator (audit §3b).
- FilterPanel categorical-cardinality cap/pagination (audit §3d).

## Testing

- `mightBeCategorical` / `getEffectiveColumnType` / `getEffectiveColumnTypes`:
  unit tests covering every row of the Part 1 validation table plus the
  missing-`allIntegerValues`-field-degrades-to-false case.
- `setColumnTypeOverride`: persists through the `applyActiveDatasetUpdate` path,
  survives a simulated hydrate round-trip (write → reload from Dexie → override
  still present).
- Override-lifecycle rule: `updateDatasetData` with `newMetadata` that (a) keeps
  a column's inferred type unchanged — override survives; (b) changes it —
  override is dropped.
- Each phase-1 consumer: one regression test confirming it reads the effective
  type (override respected) rather than raw `columnTypes`/`inferredDataType`.
