# DataVista — Comprehensive Cross-Cutting Audit (2026-09-14)

**Scope:** Read-only. Every file under `src/` read in full by six parallel subagents partitioned by module (formula+calculated-fields; pivot+window; stats+charts+KPI+forecasting; AI co-pilot; dashboards+filters+export+persistence; command-palette+templates+onboarding+core-services+orphans), then synthesized here across module and audit-lens boundaries. No application code was modified.

**Purpose:** not a fifth isolated audit. Everything already found by the four prior audits is referenced by number, not re-explained. This report exists for two things the prior audits structurally could not do: (a) read the whole codebase in one pass looking for what four separate single-lens passes missed, and (b) connect findings *across* modules and *across* audits — compounding pairs, and five specific cross-cutting sweeps the task explicitly called for.

**Status correction, read this first:** the task brief describes `docs/INVESTIGATION-item3-window-pivot-zeroing-2026-09-14.md` as "root cause not yet confirmed." That investigation doc, dated today, **has since confirmed the root cause** — two independent mechanisms (detailed in §Cross-cutting-1 below) where raw, unevaluated dataset reads bypass `windowEngine.evaluate()`. This report treats that as a confirmed, open finding, not an open question, and adds a **third** occurrence the investigation doc missed (`snapshotStore.ts`).

**Also worth flagging up front:** `npx tsc --noEmit` (used by AUDIT-2026-09-10's health table to report "Clean, 0 errors") is a false green. The root `tsconfig.json` has `"files": []` and only references sub-projects; the config that actually type-checks `src/` is `tsc -p tsconfig.app.json`, which currently reports live errors (TS2353/TS2339/TS2741) in `templateStore.ts`, `templateEngine.ts`, and `src/shared/lib/db.ts` — confirmed independently by two subagents. A CI gate on the naive command would pass today despite real type errors in the tree.

---

## 1. New findings not covered by any prior audit

Worst first, merged and deduplicated across all six subagent reports.

### 1.1 CRITICAL — Pivot Min/Max crashes on large groups, and the crash is swallowed into "Unconfigured" with zero trace
`src/shared/services/pivot/hierarchyBuilder.ts:199` calls `queryEngine.computeAggregations()`, which at `src/shared/services/queryEngine.ts:424,427` still does `Math.min(...numericValues)` / `Math.max(...numericValues)`. AUDIT-2026-09-10 #5 (the same spread-crash pattern, empirically measured there at ~300,000 elements) was fixed in `window/functions.ts` but **not** in `queryEngine.ts` — and this is exactly the path pivot's grand-total node runs through, where `rows` = the entire dataset (`hierarchyBuilder.ts:65`). At dataset sizes in the range AUDIT-2026-09-10 measured (DataVista's stated target is hundreds of thousands of rows per ADR-001), picking Min/Max as a pivot value-field operator throws `RangeError: Maximum call stack size exceeded`. `PivotExplorer.tsx:70-80`'s try/catch turns that into a bare `console.error` and the same "Pivot Table Unconfigured" placeholder shown when nothing has been configured at all — a crash and a never-touched pivot are visually identical to the user. The same unrepaired `Math.min/max(...)` spread also recurs at `src/shared/services/stats/descriptive.ts:118-119` and `DataTable.tsx:285-286`.

### 1.2 CRITICAL — `datasetStore.ts`: calculated-field/window-query actions write the *raw* dataset into `datasets[]`, live, no reload required
`src/store/datasetStore.ts:214,242,273,301` (`addCalculatedField`, `deleteCalculatedField`, `addWindowQuery`, `deleteWindowQuery`):
```ts
const evaluated = windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(updatedDataset));
const updatedDatasets = datasets.map(d => d.id === activeDataset.id ? updatedDataset : d); // BUG: should be `evaluated`
set({ datasets: updatedDatasets, activeDataset: evaluated });
```
`activeDataset` gets the materialized copy; `datasets[]` gets the raw one — the instant a calc field or window query is added/removed, before any reload, before any dashboard load. This is the upstream cause feeding shell-completeness #8 and every raw-`datasets[]` read below, and `persistenceService`'s change-detection sync then writes this same unevaluated copy to IndexedDB, so it also seeds Mechanism A on the next reload. Contrast `updateDatasetData` (:101) and `uploadDataset` (:58-61), which correctly write `evaluated` to both.

### 1.3 HIGH — `snapshotStore.ts` is a third raw-`datasets[]` Mechanism-B site, missed by today's investigation doc
`src/features/dashboards/store/snapshotStore.ts:109-115` (`restoreSnapshot`): `useDatasetStore.getState().datasets.find(...)` then a raw `useDatasetStore.setState({ activeDataset: dataset })` — identical pattern to `dashboardStore.loadDashboard`/`restoreExternalContext`, same zeroing of window columns. Restoring a workspace snapshot reproduces the exact symptom the investigation doc attributes only to dashboard-load and undo/redo.

### 1.4 HIGH — Date columns silently break `greaterThan`/`lessThan`/`between` filters — returns zero rows, no error
`src/shared/services/queryEngine.ts:276-291` (`applyCondition`) does `Number(cellVal)` / `Number(value)` unconditionally for these operators. Date columns are normalized `"YYYY-MM-DD"` strings (`parsingService.ts:151`); `Number("2024-01-15")` is `NaN`, and `NaN > NaN` is always `false` — every row is excluded, silently, with no error. Hits hardest through the AI path: `aiEngine.ts:211` feeds LLM-generated `Query` objects straight into `queryEngine.execute` with no confirmation step, so "orders after Jan 2024" becomes a chart with zero rows and no explanation (see Compounding §2.3).

### 1.5 HIGH — Leading-zero numeric strings are silently corrupted at ingest — data loss, not just misclassification
`src/shared/services/parsingService.ts:125-127`: `Number("00501")` → `501`, a valid non-NaN number, so it's stored as `501` and the zero-padding is permanently destroyed before `detectColumnType` even runs. This is the opposite and more severe version of what AUDIT-TYPE-INFERENCE-2026-09-12 hypothesized ("leading zeros making an ID look non-numeric") — zip codes, employee codes, and product codes with leading zeros are mangled on every upload with no recovery path.

### 1.6 HIGH — Formula engine's `+` operator silently string-concatenates instead of adding, while every sibling operator coerces to number
`src/shared/services/formulaEngine.ts:456-460`:
```ts
case '+':
  if (typeof leftVal === 'string' || typeof rightVal === 'string') {
    return String(leftVal) + String(rightVal);
  }
  return Number(leftVal) + Number(rightVal);
```
vs `-` at :462, unconditional `Number(leftVal) - Number(rightVal)`. CSV-parsed numeric columns commonly stay strings in row data (the engine's own comment at :394-401 exists because of exactly this). `[Revenue] + [Bonus]` with both stored as strings "5"/"3" → `"53"`, not `8`; the same row's `[Revenue] - [Bonus]` → `2`. Worse: the corrupted string "53" still parses as `Number("53")`, so type-inference tags the resulting calculated column `numeric`, completely masking the corruption. No test exercises `+` on string-typed fields.

### 1.7 HIGH — WindowExplorer's new Order-By validation covers only ordering; every other numeric field is unvalidated, producing three distinct failure modes
`src/features/window/components/WindowExplorer.tsx`, `handleCreateColumn` (:143-183):
- **Crash:** LAG/LEAD with Offset cleared → `parseInt(offset)` → `NaN`. `computeLag`/`computeLead` only default when the argument is `undefined`, not `NaN`; the bounds guards (`< 0`, `>= length`) are both `false` for `NaN`, so `partition[NaN]` → `undefined`, then `.row[targetColumn]` throws.
- **Silent constant garbage:** NTILE with Buckets cleared → `NaN`; `computeNtile`'s `ntileGroups <= 0` guard is `false` for `NaN` (any NaN comparison is false), so every row gets `NaN`.
- **Silent unbounded widening:** Custom frame, "PRECEDING" with its numeric field cleared → `parseInt` → `NaN` → `startIdx = Math.max(0, idx - NaN) = NaN`. The eviction loop `while (left < start)` in `computeFrameSumsAndCounts` never advances when `start` is `NaN`, so RUNNING_TOTAL/MOVING_AVG/WINDOW_MIN/WINDOW_MAX silently become unbounded cumulative results instead of the configured "N PRECEDING" window — no error anywhere.

### 1.8 MEDIUM-HIGH — Executive Summary auto-sends real data to the LLM with zero disclosure of that specific trigger
`src/features/ai/summaryEngine.ts:44-51,63-72`, `ExecutiveSummaryPanel.tsx:53-57`: fires on dataset mount with no user action. With an API key set, the prompt context includes real filter values and real anomaly values (e.g. "Sales spiked to 45000 on North..."). `AiSettingsModal.tsx:169-174`'s disclosure (the fix credited to AUDIT-PRODUCT-RELEVANCE's #1-priority item) only covers "when you run a natural-language query or generate an AI formula" — never the summary panel's silent auto-trigger. Treat product-relevance's "AI privacy disclosure: fixed" as **partially fixed**, not closed — see §2.1.

### 1.9 MEDIUM — Calculated-field formula expressions (business logic) are sent to the LLM, also undisclosed
`src/features/ai/aiEngine.ts:59`: `context.calculatedFields = dataset.calculatedFields || []` sends full `{name, expression}` — real formula strings, potentially proprietary pricing/margin logic — to the LLM. Same disclosure gap as 1.8.

### 1.10 MEDIUM — `role` metadata is, for practical purposes, dead across the entire codebase
All six subagents were asked to find every `.role` branch in their scope. Combined result: the 7-value enum (`measure|calculated|dimension|identifier|hidden|date|window`) has exactly **three** real consumers in ~165 files: `formulaEngine.ts:735` (excludes `'calculated'` when rebuilding metadata — binary, not a real switch), `PivotBuilder.tsx:102-115` (an icon, no `'window'` case), and `window/engine.ts` (the one place that *assigns* `'window'`). `'hidden'` is declared in `metadata.ts` and never assigned anywhere in the codebase. `'identifier'` is only assigned via an exact-name match on `"id"`/`"key"` and is never read downstream to change any default or exclude anything. Every numeric/categorical picker in Stats, Charts, KPI, Pivot, Window, AI, Filters, Export, DataTable branches on `inferredDataType`/`columnTypes` alone. See §2.2 for full detail — this isn't isolated gaps in individual switch statements, it's that the field itself does almost nothing.

### 1.11 MEDIUM — Comparator ties on `null`/`undefined` values are non-antisymmetric, present twice, safe by accident in a third spot
`src/shared/services/window/partitioner.ts:20-21` (`sortPartitionItems`) and `src/shared/services/pivot/hierarchyBuilder.ts:238-239` (`sortHierarchyByValue`) both use `if (a === null) return 1; if (b === null) return -1;` — invalid when two-or-more elements tie at `null`/`undefined` (both comparisons return `1` simultaneously), making sort order for those ties engine/version-dependent despite `Array.prototype.sort`'s documented ES2019 stability guarantee (which only helps when the comparator itself is valid). This directly feeds RUNNING_TOTAL/MOVING_AVG's positional frame — a second, independent source of the "arbitrary-within-ties" symptom the investigation doc already flagged for non-null ties (its Question 3), but for `null` specifically. A third instance at `hierarchyBuilder.ts:29-30` (dimension sort) uses the identical pattern but is currently safe because tree-building dedupes blanks into one `'(Blank)'` child per node before this runs.

### 1.12 MEDIUM — `StatsExplorer`'s "is this the full dataset" check is a tautology; filtered-view stats card silently mixes stale and fresh numbers
`src/shared/services/stats/descriptive.ts:71`: `isFullDataset = totalCount === totalRowCount`. Caller `engine.ts:27-30` builds `rawValues` via `dataset.data.map(...)`, so `rawValues.length` **always** equals `dataset.data.length` — the check is comparing an array to its own length and is therefore always true whenever metadata exists, filtered or not. Concrete failure: filter `Age > 50` to 50 rows all in [51,90] — the card shows `Count: 50` (freshly computed, correct) next to `Minimum: 18` (stale, from the unfiltered metadata cache) under a banner that says "Analyzing Filtered Dataset." `sum` is confirmed unaffected — `descriptive.ts:122` computes it directly from the current values array, not gated by the `isFullDataset` shortcut; `mean`/`median`/`variance` appear to follow the same direct-computation pattern by inspection but were not independently traced line-by-line — only `min`/`max`/`missingCount`/`uniqueCount`/`nullPercentage` are confirmed wrong. Same shape of bug (a cache/shortcut trusted past its real scope) recurs independently at `DataTable.tsx:257`'s `isFiltered` check (§1.16) and `DashboardSummary.tsx:98-112`'s avg×count shortcut (already known, product-relevance) — three unrelated instances of the identical anti-pattern.

### 1.13 MEDIUM — PivotTable emits a duplicated, misaligned header row whenever there are zero column dimensions AND 2+ value fields
`PivotTable.tsx`, `renderColumnHeaders()` (:97-191 for the value-field-name block, :208-222 for the unconditional second header row): with `columnDimensions.length === 0`, one block emits a row of `valueFields.length` cells, the other unconditionally emits a second row of `1 + valueFields.length` cells — different cell counts, both rendering the value-field names, neither lining up with the `1+N`-cell body rows. Shell-completeness #2 (the single-value-field duplicate-body-cell bug) is confirmed fixed; this is a **sibling defect in the same rendering block**, reachable by adding one more value field to the exact default pivot configuration `PivotExplorer` auto-builds.

### 1.14 MEDIUM — Forecast regression runs on raw row order, not chronological order; future-date labels always jump by a month regardless of series granularity
`src/shared/services/forecasting/engine.ts`. The least-squares regression (:51-76) uses array index as x; `ChartVisualization.tsx:112-117` calls it on `chartData` built with **no `sorting`** in the query (the chart itself sorts only *after* forecasting, :583-595/:1025-1037). If the underlying rows aren't pre-sorted by the x column, trend direction/magnitude is computed against scrambled order. Separately, :96-100 does `nextDate.setMonth(nextDate.getMonth() + k)` unconditionally for any date-keyed series — a daily or weekly series gets forecast points spaced a month apart, visibly distorting the x-axis. Neither issue is caught anywhere; `ForecastConfig.confidenceInterval` is declared in the type but never read in the engine (dead config option).

### 1.15 MEDIUM — Chart anomaly badge reads a frozen data snapshot from chart-creation time, not live filtered data
`anomalyDetector.detectChartAnomalies(chart)` operates on `chart.data` = `ChartConfig.data`, set once at `ChartBuilder.tsx:138` from `filteredData` *at creation time* and never updated. The chart's own bars/lines re-query live via `chartData` and do respond to filters/drill-down; the "N Outliers" badge does not. Change filters after creating a chart and the badge keeps reporting outliers from data the chart no longer displays.

### 1.16 LOW-MEDIUM — `DataTable`'s Summary Statistics can show whole-dataset numbers under a filtered table with no indication
`DataTable.tsx:257`'s `isFiltered = filteredData.length !== dataset.data.length` only detects DataTable's *own* local search/column-filter shrinking an already-filtered `storeData` — it cannot detect that the global `FilterPanel`/`useFilterStore` filter already shrank the dataset before it ever reached DataTable. Apply a global filter, touch nothing in DataTable's own controls, and the Summary Statistics footer serves parse-time whole-dataset `min`/`max`/`average` under a row count that (separately) does reflect the filter.

### 1.17 LOW-MEDIUM — Sidebar's "active dataset" highlight is permanently broken by reference-equality comparison
`Sidebar.tsx:348`: `activeDataset === dataset && !activeDashboardId`. `selectDataset`/`setActiveDataset` always construct a *new* evaluated object for `activeDataset` — never reference-equal to the array element the Sidebar list is iterating. The highlight only ever appears immediately after `uploadDataset` (which happens to set both to the same reference); clicking any dataset row afterward never highlights it. Compounding: the same list uses `key={index}` (Sidebar.tsx:344-345) rather than `key={dash.id}` used two hundred lines below for dashboards — an unstable key that can carry the wrong row's open-menu state across a rename/delete/reorder.

### 1.18 LOW-MEDIUM — Templates: shipped default template and its own schema-extraction don't type-check against live KPI/Chart shapes
Confirmed live via `tsc -p tsconfig.app.json` (not hypothetical): `templateStore.ts:23,39` (TS2741, `ChartConfig` widgets missing required `data`), `templateStore.ts:52,59` (TS2353, KPI objects use legacy `metricColumn`/`aggregation`/`polarity` instead of `primaryMetric`/`sparkline`), `templateEngine.ts:29-30` (TS2339, `extractTemplate` reads the same nonexistent `kpi.metricColumn`/`kpi.trendDateColumn`). Product-relevance already flagged the type mismatch; new here is that it's a **live, currently-failing typecheck**, not a hypothetical, and that `templateEngine.instantiateTemplate` blindly spreads `...kpi` with a new id, so instantiating the app's own first-run default template produces KPI cards `KPICard` cannot render correctly.

### 1.19 LOW-MEDIUM — `db.ts`'s `DashboardConfig` type is stale against the real `Dashboard` type, causing 5 live tsc errors
`src/shared/lib/db.ts:9-14` declares `{id,name,layout,chartIds}`; the real `Dashboard` type additionally has `datasetId`, `createdAt`, `updatedAt`, `settings`, `kpis`, `kpiIds`. Runtime is unaffected (Dexie doesn't enforce the TS shape), but `persistenceService.ts:121,130,133,411` force real `Dashboard[]` through a `Table<DashboardConfig>`, producing 5 confirmed errors under `tsc -p tsconfig.app.json`.

### 1.20 LOW — Persisted `activeView` whitelist is missing three real views — silently resets to Overview on every reload
`src/shared/utils/validators.ts:87-95` (`isValidUIState`)'s `activeView` whitelist is `["overview","upload","charts","data","filters","export"]` — missing `"pivot"`, `"stats"`, `"window-builder"`, all three real, reachable views. `persistenceService.ts` persists `activeView` on every change and filters it back through this whitelist on hydrate; an invalid value is silently dropped rather than applied. Concrete repro: open Pivot Table, refresh the page — the app reverts to Overview, no error, no toast.

### 1.21 LOW — Aggregation-type gap: `sum_if`/`count_if` default to `0` when misconfigured, `weighted_average` defaults to `null` for the analogous gap
`src/shared/services/aggregations/adapter.ts:40-46` vs `:30`. A misconfigured "Sum If" tile (no condition entered) renders a plausible-looking `0` instead of signaling "not configured," inconsistent with the sibling operator's own convention two lines away.

### 1.22 LOW — Advanced-aggregation operator set is hand-duplicated three times with no shared source of truth
`aggregations/types.ts:1-7` (enum) vs `adapter.ts:9-15` (`isAdvanced()`'s literal array) vs `adapter.ts:24-48` (the switch) — `adapter.ts` never imports the enum it's supposed to mirror.

### 1.23 LOW — Locale-formatted numeric strings (thousands separators, currency, percent signs) are always misclassified categorical
`parsingService.ts:54,125` both do bare `Number(strVal)`; `Number("1,234.56")`/`Number("$100")`/`Number("50%")` are all `NaN`. A distinct, additional root-cause on top of the already-known cardinality gap — pure absence of any normalization pass before the numeric-parse test.

### 1.24 LOW, UNCONFIRMED EXACT TRIGGER — Default-aggregation fallback may sum a column literally named "count," clobbering the auto-generated row-count
`queryEngine.ts:396-398` sets `resultRow['count']` first; the later aggregation loop's `resultRow[alias] = value` uses the column name as alias for auto-generated aggregations. If a dataset has a numeric column whose name collides with the literal key `'count'` used for the row-count field, the aggregation write would overwrite it — flagged here as a real code-shape risk; whether the collision is case-sensitive (i.e. whether a column literally named `Count` vs `count` triggers it) was not traced key-by-key and should be confirmed before prioritizing a fix.

### 1.25 LOW — `KPICard`'s currency detection is a bare column-name regex
`KPICard.tsx:93`: `/sales|revenue|profit|price|cost|budget|spend/i.test(config.primaryMetric.column)`. False positive on `cost_center_id`, false negative on `Total_ARR`/`MRR`. No currency/unit metadata exists to consult instead.

### 1.26 LOW — `ChartBuilder`'s Pie "Values" picker offers every column, not just numeric ones, deferring a guaranteed error to post-creation
`ChartBuilder.tsx:362`: the ternary gives `allColumns` to both `pie` and `heatmap`, but only heatmap's Y-axis is legitimately non-numeric (a grouping dimension); pie sums its Y-axis. `isFormValid()` only checks truthiness, not type, so a categorical "Values" selection passes the builder and immediately hits `ChartVisualization.tsx:278-280`'s runtime error banner.

### 1.27 LOW — `formattingEngine`/date-diff/misc small items
- `DATEDIFF`'s "month"/"year" units do naive calendar-field subtraction (ignoring day-of-month) while "day" does precise ms math under the same function, undocumented (`formula/library/date.ts:100-115`).
- `CalculatedFieldsManager.tsx` never reads `ColumnMetadata.role`, so `'hidden'`-role columns (were any ever assigned — see §1.10) would still be clickable/insertable in the formula editor.
- Forecast points remain fully interactive for click-to-drill/cross-filter even though they're fabricated projections (`ChartVisualization.tsx:717-718,1168-1169`) — clicking a *projected* future point drills/filters on a value that was never observed.
- `use-toast.ts`'s `TOAST_LIMIT = 1` means a second toast silently displaces the first rather than queuing.
- `FilterState.groupByPeriod` (3 values) and `QueryGroupBy.period` (5 values) are independently declared unions for the same concept, one a strict subset of the other — latent type drift in the canonical type files.

---

## 2. Compounding findings — where two findings from different audits (or different subagents in this pass) make each other worse together

This section exists per the task brief even if short; it isn't — five genuine cross-boundary compounds were found, none visible to any single-lens audit.

### 2.1 Unmaterialized window column → anomaly detector's missing null guard → verbatim narration in the Executive Summary
Mechanism A/B/C (§Cross-cutting-1, confirmed root cause today) zero a `role:'window'` column in `dataset.data` after a reload, dashboard load, undo/redo, or snapshot restore. Separately, `anomalyDetector.ts:93` does `Number(undefined) || 0` with no guard when reducing values for outlier detection. This does **not** fire on a uniformly-zeroed column — an all-zero column has zero variance, so `computeOutliers`'s IQR fences collapse to nothing and no anomaly is flagged. It fires on **partial materialization**: any row that still carries its real pre-zeroing value alongside rows that now read `0` (e.g. `activeDataset` was swapped from raw `datasets[]` mid-session while other in-memory copies/derived views still hold real values, or the zeroing happened between two dashboard loads rather than from a clean cold start) — in that mixed state, the `0` rows read as a genuine low-end IQR "drop" against the surviving real values. `summaryEngine.ts:121-126` then splices the top anomaly's description **verbatim** into the offline Executive Summary's headline sentence. Net effect: the same class of event that silently zeroes a pivot cell (shell-completeness-style symptom) can, in the partial-materialization case, *also* manufacture a fabricated "X dropped to 0 (N% deviation from average)" sentence and present it as an AI-narrated executive finding (type-inference-style symptom) — two prior audits each owned half of this, neither could see the combination, and neither the uniform-zero nor the partial case was checked by any single-lens audit.

### 2.2 `queryEngine.ts`'s unfixed Min/Max spread + Pivot's silent try/catch
AUDIT-2026-09-10 #5 was fixed in `window/functions.ts` but not in `queryEngine.computeAggregations`, which is exactly the aggregation path pivot's grand-total node uses (§1.1). `PivotExplorer.tsx:77-80` catches any exception from pivot execution and renders the identical "Unconfigured" placeholder shown when the user has configured nothing at all. A partial performance fix plus a silent catch means a Min/Max pivot on a large dataset doesn't error, doesn't warn, doesn't degrade — it simply looks like the feature was never touched.

### 2.3 Date-column filter NaN-collapse + AI auto-execute with no confirmation + queryEngine's match-all fallback for unknown operators
`queryEngine.ts:276-291` silently returns zero rows for a `greaterThan`/`lessThan`/`between` filter on a date column (Number(dateString) = NaN). `queryEngine.ts:292-293`'s `default: return true` silently matches *every* row for any operator string it doesn't recognize (a real risk for an LLM-generated query with a hallucinated/misspelled operator). `aiEngine.executeAIQuery` (`aiEngine.ts:201-234`) auto-executes the LLM's query and auto-creates a chart with zero confirmation step in between (confirmed live, no dialog, no preview). The result: the identical unguarded, auto-executed path produces two opposite silent failure modes — a date-scoped natural-language question can come back with zero rows, or a garbled operator can come back with every row — and both get auto-charted and presented to the user as if the query succeeded exactly as asked.

### 2.4 Type-inference root cause + queryEngine's default-sum fallback + leading-zero data corruption at ingest
`parsingService.ts:125-127` destroys leading-zero padding on ingest (§1.5) before `detectColumnType` ever runs, and the `role:'identifier'` heuristic only matches the literal names `"id"`/`"key"` (AUDIT-TYPE-INFERENCE §1/§3a). `queryEngine.ts:383-388`'s no-aggregations-specified fallback then sums *every* numeric column for any caller that omits aggregations on a grouped query — including exactly these misclassified, corrupted ID-like columns. Three independent gaps (ingest corruption, identifier detection, and a core-engine default) stack into "a grouped query with no explicit aggregations quietly returns a 'Sum of CustomerID' column with data that's already been silently mangled on the way in."

### 2.5 The same "trust the cache without checking it's still valid" bug, independently reinvented three times
`descriptive.ts:71`'s `isFullDataset` tautology (§1.12), `DataTable.tsx:257`'s `isFiltered` blind spot (§1.16), and `DashboardSummary.tsx:98-112`'s avg×count-from-cached-metadata shortcut (already known, AUDIT-PRODUCT-RELEVANCE) are three unrelated files, written independently, that all made the identical mistake: computing some stats fresh from the current (possibly filtered) rows and others from a stale, pre-filter cache, with the UI presenting both as one consistent card. No prior audit connected these three because each one only looked at a single module; together they show this isn't three bugs, it's one recurring blind spot in how "is this view filtered" gets checked across the app.

---

## 3. Cross-cutting consistency checks (items 1–5 from the task brief)

### 3.1 Direct `dataset.data` readers vs. queryEngine consumers — full sweep

The exhaustive sweep the persistence/dashboard subagent ran, extended with sites the other five subagents found in their own scopes:

| Site | Reads | Materialization risk |
|---|---|---|
| `persistenceService.ts:109-112` (`hydrate`) | `formulaEngine.evaluateCalculatedFields` only, **no** `windowEngine.evaluate` | **HIGH — confirmed Mechanism A** |
| `persistenceService.ts:130-132`, `:160-162` (`hydrate`, two branches) | same gap propagated into `activeDataset` | **HIGH** |
| `dashboardStore.ts:460,476` (`loadDashboard`) | raw `useDatasetStore.setState({activeDataset: dataset})` from raw `datasets[]` | **HIGH — confirmed Mechanism B** |
| `dashboardStore.ts:128-135` (`restoreExternalContext`, undo/redo) | same raw-setState pattern | **HIGH** |
| `snapshotStore.ts:109-115` (`restoreSnapshot`) | same raw-setState pattern | **HIGH — new, §1.3, missed by the investigation doc** |
| `datasetStore.ts:214,242,273,301` (calc-field/window-query actions) | writes raw `updatedDataset` into `datasets[]` | **HIGH — the upstream root cause, §1.2, live in-session, no reload needed** |
| `datasetStore.ts:174-178` (`deleteDataset`) | `nextActive = updatedDatasets[0]`, no re-evaluate | MEDIUM — inherits staleness only if that entry was already tainted |
| `DrillThroughModal.tsx:17-20` | raw `datasets.find(...)` for the drill-through table | MEDIUM — same compounding risk |
| `InstantiateTemplateModal.tsx:29,44` / `templateEngine.ts:120` | snapshots `targetDataset.data` into new `ChartConfig.data`, never refreshed | MEDIUM — frozen forever after instantiation |
| `aiEngine.ts:23-26,43-46` | `dataset.data.slice(0,5)` for LLM sample values | LOW — has its own `!== "undefined"` string filter, degrades to empty rather than garbage |
| `anomalyDetector.ts:78,89,93` | `dataset.data`/`chart.data` direct, `Number(undefined)\|\|0` with **no guard** | **HIGH — see Compounding §2.1** |
| `ChartBuilder.tsx:34-40,138` | snapshots `filteredData` into `ChartConfig.data` at creation, frozen | MEDIUM — feeds the stale anomaly badge, §1.15 |
| `pivot/engine.ts:15,24-25,62` | reads whatever `.data` `PivotExplorer` passed in (already `{...activeDataset, data: filteredData}`) | Inherits Mechanism A/B/C via `filteredData`, not introduced independently |
| `window/engine.ts:234` | `dataset.data.map(row => ({...row}))` inside `evaluate()` | **NONE — this is the correct materialization site**, confirms the engine itself is not the bug |
| `DataTable.tsx:142,176` | always overrides `.data` with store-filtered `storeData`, and builds its own `windowQueries`-aware query | **NONE — structurally immune**, which is exactly why the Data Table alone "looks correct" while everything else zeros |
| `Sidebar.tsx` → `selectDataset` | correctly re-runs `windowEngine.evaluate(formulaEngine.evaluateCalculatedFields(...))` before every `activeDataset` set | **NONE — the correct reference pattern**, contrast against every raw-setState site above |
| `queryEngine.ts:101` | `filteredData = [...dataset.data]`, the filter-stage input | NONE — expected; calculated fields are pre-materialized before this point |
| `descriptive.ts` (stats engine) | operates on whatever rows the caller passed (already filtered upstream) | NONE independently, but see §1.12/§2.5 for the separate min/max staleness bug |

**The crisp version of this whole bug class**, per the core-services subagent: `queryEngine.execute()`'s signature *does* accept and correctly execute `windowQueries` (`queryEngine.ts:133-135`) — the engine itself is not a shell. Of 11 non-test call sites across the app, only `DataTable.tsx` populates `windowQueries` when building its `Query`. The engine isn't broken; the call sites are inconsistent about using it, and the three raw-`setState` sites above make it worse by skipping the evaluation pipeline entirely rather than just omitting one query parameter.

### 3.2 Column-type/role consistency

**Answer: the 7-value `role` enum is, in practical terms, inert across the whole codebase**, not merely "some switches have a gap." All six subagents were independently asked to find every `.role` branch site in their scope; combined, the only real consumers found anywhere in ~165 files are:
- `formulaEngine.ts:735` — excludes `role === 'calculated'` when rebuilding metadata (a binary exclude, not an enumeration of the other six values).
- `PivotBuilder.tsx:102-115` (`renderTypeIcon`) — checks `role === 'calculated'` for an icon choice; no `'window'` case, so a window-derived measure renders with the same icon as any raw numeric column.
- `window/engine.ts` — the one place that *assigns* `'window'`, conditionally, only `if (metadata)` exists.
- `parsingService.ts:278-285` — the one place that assigns `'identifier'`, via an exact-name match on `"id"`/`"key"` only, never fed by `uniqueValueCount` which sits one function away and is already computed.

`'hidden'` is declared in `metadata.ts` and **never assigned anywhere in the entire codebase** — a live-but-unused value today, not a risk, but dead weight. Every numeric/categorical/date picker across Stats, Charts, KPI, Pivot, Window, AI, Filters, Export, and DataTable — confirmed independently by all six subagents, zero exceptions found — branches only on `inferredDataType`/`columnTypes`, never `.role`. Concrete consequence, stated once instead of six times: an `identifier`-role numeric column (had the heuristic been broadened) or a `hidden`-role column (had it ever been assigned) would not be excluded from a single picker anywhere in the app. `'window'`-role columns happen to be safe from a *crash* perspective because `windowEngine.evaluate()` correctly tags their `inferredDataType` as `'numeric'` too, so they fall through to the same numeric-picker default path as everything else — safe, but indistinguishable in the UI from a raw imported measure (no "(computed)" badge anywhere).

**Verdict:** this isn't a switch-statement completeness gap to patch case-by-case. `role` is a data-model field with almost no readers. Either wire it into every numeric/categorical picker's exclusion logic (hide `hidden`, opt-in for `identifier`, badge `window`/`calculated`) as one pass, or accept it's cosmetic and stop computing it as if it mattered — the current state (computed carefully, read almost nowhere) is the actual bug.

### 3.3 Aggregation-default consistency — every "pick when unspecified" site found, and whether they agree

| Site | Heuristic | Cardinality/role aware? |
|---|---|---|
| `KPIBuilder.tsx:38-39,89-90` | `allColumns[0]` (zero type/role filter) + hardcoded `"sum"` | No |
| `StatsExplorer.tsx:63-67` | `numericColumns[0]` (first *numeric*-typed column) | No — better-scoped than KPI, still positional |
| `PivotExplorer.tsx:19-62` | first categorical/date row-dim + first numeric value-field, auto-`sum`, **auto-applied with zero clicks** | No |
| `PivotBuilder.tsx:137-140` | manual add: `numeric ? 'sum' : 'count'` | No |
| `WindowExplorer.tsx:86-101` | auto-fills target column to `numericColumns[0]` on form open | No |
| `queryEngine.ts:383-388` | no-aggregations-specified (groupBy path only): sum **every** numeric column | No |
| `llmService.ts:177-179` (offline AI fallback) | first categorical + first numeric column, hardcoded `sum`, `desc` | No |
| `aggregations/adapter.ts:36` | `percentile` defaults `percentileValue = 90` when omitted | N/A (parameter default, not column pick) |
| `ChartBuilder.tsx` | **no auto-select at all** — `xAxis`/`yAxis` start empty, Create stays disabled until manual pick | N/A — most conservative in the app |
| `forecasting` (`ChartBuilder.tsx:53-55`) | `method:'linear'`, `periods:3`, fixed constants | No |
| `datasetStore.ts:175` (`deleteDataset`) | `nextActive = updatedDatasets[0]` | No |
| `GlobalFilterBar.tsx:83-89` | default operator: `equals` (categorical/numeric), `between` (date) | Type-aware, not cardinality-aware |
| `templateEngine.ts:35` | unmatched column defaults `dataType = 'categorical'` | No |
| `StatsExplorer.tsx:70-72` | outlier threshold: `1.5` for IQR, `3.0` for zscore | **Method-aware — the one genuinely "smart" default found anywhere in this sweep** |

**Verdict:** at least seven independent sites pick a default column/aggregation by raw positional order ("first numeric column," "first column, period") with zero cardinality or role signal, and they were clearly built independently — KPIBuilder doesn't even restrict to numeric columns first, while StatsExplorer and WindowExplorer do, and PivotExplorer's version is the most consequential because it auto-*applies* rather than just pre-filling a form. None of the seven consult `uniqueValueCount` or `role`, which is consistent with §3.2's finding that `role` has no real readers. ChartBuilder's refusal to auto-select anything is the one place in the app that took the opposite, more conservative design decision — itself an inconsistency worth naming, since it means the exact same underlying risk (a misclassified numeric column) is silently acted on in six places and manually gated in one, with no stated design rule explaining the split.

### 3.4 Terminology consistency

- **"Column" is the universal base noun** everywhere in the canonical types (`Dataset.columns`, `QueryAggregation.column`, `QueryGroupBy.column`, `ChartConfig.xAxis/yAxis` — all plain column-name strings) — confirmed independently by the core-services subagent reading every file in `shared/types/`. This part of the codebase is more disciplined than "field vs. column vs. attribute" made it sound.
- **"Field" is narrowed but leaks across two unrelated scopes in the same file**: `PivotBuilder.tsx` labels its whole sidebar section "Fields" (any column) while its own `PivotValueField` type uses "Field" specifically for a configured aggregate — same word, two scopes, one file.
- **StatsExplorer is internally inconsistent**: its correlation tab header says "Fields" (`StatsExplorer.tsx:279`) while every sibling tab in the exact same component says "Column."
- **KPIBuilder** says "Measure Column"; **ChartBuilder** says "X Axis"/"Y Axis" (and reuses "Y Axis" for two different semantics — a numeric value for most chart types, a second grouping dimension for heatmap, same label, no in-context distinction); **ConditionalFormattingBuilder** says "Target Column / Metric" and "Quick Insert Fields." Four different nouns for "pick a column" within one closely-related module group (Stats/Charts/KPI), confirmed by the subagent that read all of them together.
- **The AI subsystem names itself three different things**: system prompt calls it "AI Data Translation Layer" (`llmService.ts:5`); the settings UI calls it "AI Co-Pilot" (`AiSettingsModal.tsx:74`); the summary panel calls it "Automated Analyst Insights" (`ExecutiveSummaryPanel.tsx:83`). No shared name anywhere.
- **Type-level drift, not just copy drift**: `GlobalFilter`, `DrillFilter` (`drill.ts:5-9`), `filterManager`'s `FilterCondition`, and `FilterState.categoricalFilters/dateRangeFilters` are four independently-declared shapes for what a user experiences as one "filter" concept — new evidence beyond the previously-known "three filtering mechanisms" (product-relevance), this time at the type-definition level, not just the UI-surface level. `FilterState.groupByPeriod` (3 values) vs `QueryGroupBy.period` (5 values) is the same pattern in miniature (§1.27).

### 3.5 Error/empty/loading state consistency

No shared `Skeleton`/`EmptyState` component exists anywhere in `shared/components/ui` (confirmed independently by two subagents). What's actually used, compiled across all six reports:

- **ErrorBoundary coverage**: exactly one boundary at `App.tsx`'s root (wraps everything), plus, inside `Dashboard.tsx`, individual wraps around Pivot/Stats/Window Explorer and `AiSettingsModal` (`fallback={null}`). **Confirmed with zero boundary anywhere** for `FilterPanel`, `ExportPanel`, `DataTable`, `ChartGrid`/`ChartVisualization`, and the entire 539-line `DashboardSummary` — by two independent subagents reading disjoint file sets, so this is now confirmed from both the "core services" side (nothing above `Dashboard.tsx`) and the "dashboards" side (nothing inside `Dashboard.tsx` for those five surfaces).
- **Empty-state "tiers" are inconsistent within a single module, not just across modules**: `Dashboard.tsx`'s no-dataset state is a rich hero with 3 feature cards + 2 CTAs; `DashboardSummary.tsx` has two bespoke, plainer cards ("Dataset Not Found" with an icon, "No Data Loaded" plain text, no CTA); `FilterPanel.tsx`/`ExportPanel.tsx` are bare centered text with nothing; `PivotExplorer`/`WindowExplorer` use a centered icon+heading pattern but pick **different icons for the equivalent "no dataset yet" situation** (`AlertCircle` for Pivot, reading as a warning, vs `HelpCircle` for Window, reading as neutral) — and `StatsExplorer` mixes both idioms *inside itself*, using the icon+heading pattern for its main empty states but a bare italic table-row for the outlier tab's empty case.
- **Zero-configuration state exists for Pivot, not for Window**: `PivotExplorer.tsx:131-140` shows an explicit "Pivot Table Unconfigured" placeholder; `WindowExplorer` has no equivalent — with zero window columns configured, it just falls straight through to an ordinary-looking `DataTable` with no visual cue that nothing's been built yet.
- **Error vs. never-configured is indistinguishable specifically for Pivot** (§2.2) — DataTable's own errors (file parse failures etc.) do surface a `toast`; Pivot's don't, it silently degrades to the same placeholder as "nothing configured."
- **KPICard silently returns `null`** (`!dataset || !kpiData) return null`) rather than rendering any placeholder — the one component in this whole sweep that disappears instead of saying anything.
- **AI error channels are inconsistent across the app's three AI entry points**: `CommandPalette`/`CalculatedFieldsManager` both do inline-text-plus-destructive-toast on failure (consistent with each other); `summaryEngine.generateExecutiveSummary` catches internally and never surfaces anything — no toast, no inline message, just a silent fallback to the offline heuristic (§1.8/§2.1 compounding this with the anomaly-narration issue).

---

## 4. Unified priority list

One list, merging everything new/compounding from this pass with everything still open across all four prior audits, re-ranked by *how silently it fails × how much of the app it can reach* — not by each source audit's own severity label. Items fully covered by a prior audit are cited by number, not re-explained; items from §1–§3 above are cited by section.

**Tier 1 — silent, high-reach, no error surface at all**

1. Window-column-zeroing trio, now root-caused (Investigation doc, confirmed today) + §1.2 (`datasetStore.ts`, the upstream cause) + §1.3 (`snapshotStore.ts`, third site) — reaches Pivot, Stats, Charts, KPI, and now (§2.1) manufactures fabricated anomaly narration in the AI Executive Summary.
2. Pivot Min/Max crash-into-silence (§1.1 / §2.2) — `queryEngine.ts`'s unrepaired spread-crash, caught and hidden behind the identical "Unconfigured" placeholder shown for a pivot nobody's touched.
3. Formula `+` operator string-concatenation, masked by the resulting string still parsing as numeric (§1.6) — corrupts calculated-field values with the type system actively hiding it.
4. Leading-zero numeric-string data loss at ingest (§1.5) — permanent, unrecoverable, on first upload.
5. Date-column filter NaN-collapse + AI auto-execute + match-all fallback (§1.4 / §2.3) — two opposite silent failure modes on the one unguarded, auto-executed path.
6. Shell-completeness #3/#5 (PDF/PNG/SVG export always fails, reports success for the PDF case) — still open, unchanged.
7. AUDIT-2026-09-10 #21/product-relevance AI privacy disclosure — **now confirmed only partially fixed**: covers NL query/AI formula, not the Executive Summary's silent auto-trigger (§1.8) or calculated-field expressions (§1.9).

**Tier 2 — silent but narrower reach, or loud-but-undiscoverable**

8. WindowExplorer's unvalidated numeric fields (§1.7) — crash on LAG/LEAD, silent garbage on NTILE, silent unbounded-frame widening.
9. Type-inference root cause (AUDIT-TYPE-INFERENCE #1) + its full downstream list (#2a–#2m, #3a–#3e), all still open by design (audit-only, no fix attempted) — now with two new compounding instances (§2.1, §2.4) and confirmation that `role` (§3.2) will not incidentally fix any of it, since nothing reads `role` today.
10. Shell-completeness #8 (calculated fields/window queries stale on dashboards) — root-caused precisely to §1.2 in this pass, no longer just "a desync," a specific 4-line bug.
11. Shell-completeness #4 (Snapshot Manager command stub), #7 (plugin chart type can never be created), #12 (LAG/LEAD custom frame silently ignored), #13 (invisible command-palette results, mechanism now fully traced) — all still open, unchanged.
12. Shell-completeness #6 (Filters page missing numeric-range/contains) — still open.
13. Shell-completeness #9 (AI system prompt advertises non-existent formula functions) — confirmed **worse than documented**: AND/OR/NOT are also advertised and don't exist (§AI subagent finding), on top of the previously-known SUM/AVG/MIN/MAX/TODAY.
14. Shell-completeness #10 (AI insights panel doesn't disclose offline-heuristic mode) — still open, now compounded by §1.8's silent-failure path producing the identical undifferentiated UI either way.
15. §1.11 comparator tie-break bug (null/undefined ties, `partitioner.ts` + `hierarchyBuilder.ts`) — deterministic-looking but not truly ordered, feeds directly into window-frame correctness.
16. §2.5's triple-independent "trust the stale cache" bug (`descriptive.ts` tautology §1.12, `DataTable.tsx` §1.16, `DashboardSummary.tsx` avg×count already known) — three files, one root pattern, worth fixing as one pass rather than three tickets.
17. §1.13 PivotTable duplicate-header sibling defect (2+ value fields, no column dimensions).
18. Shell-completeness #11 (template schema ignores column types) + §1.18 (templates: live, currently-failing typecheck against real KPI/Chart shapes) — same feature area, now with harder evidence.
19. AUDIT-2026-09-10 #23 (orphaned `db.filters`/`uiState` rows never deleted) — still open, confirmed.
20. §1.20 persisted `activeView` whitelist missing pivot/stats/window-builder — silent, low-severity, but a real everyday annoyance (any pivot/stats/window session is lost on refresh).

**Tier 3 — real but low-blast-radius, cosmetic, or already well-contained**

21. §3.3's seven ungoverned "pick a default" sites — not urgent individually, but worth a single consistency pass now that they're enumerated together rather than fixed piecemeal per-module.
22. §3.5's error/empty/loading-state inconsistencies — no wrong data, just visual incoherence; lowest-risk item in this list to defer, but cheapest to fix as one shared component now that the inventory exists.
23. §1.14 forecasting engine issues (unsorted-row regression, month-granularity labels, interactive fake future points) — real, newly found, but forecasting is an opt-in secondary feature on line/area charts only.
24a. **Data-correctness smalls**: §1.14 forecasting-adjacent already covered above; §1.23 locale-formatted numbers (commas/currency/percent) misclassified categorical; §1.24 possible "count"-column-name collision in the default-aggregation fallback (unconfirmed exact trigger); §1.27's DATEDIFF month/year naive calendar-field subtraction.
24b. **UI/display smalls**: §1.15 stale chart-anomaly badge (frozen `chart.data` snapshot); §1.17 Sidebar active-dataset highlight broken + unstable list key; §1.25 KPICard currency-detection regex false positive/negative; §1.26 ChartBuilder Pie "Values" picker offers non-numeric columns; §1.27's forecast points staying click-to-drill-interactive despite being fabricated projections.
24c. **Type-drift/config smalls**: §1.19 `db.ts`'s `DashboardConfig` stale against real `Dashboard` (5 live tsc errors); §1.21/§1.22 aggregation-adapter inconsistencies (sum_if/count_if default-0 vs weighted_average default-null; operator-enum triplication); §1.27's `FilterState.groupByPeriod`/`QueryGroupBy.period` union drift and toast-limit-of-1; §1.27's `CalculatedFieldsManager` never excluding `role==='hidden'` columns (currently inert since nothing assigns that role, per §3.2).
25. AUDIT-2026-09-10 LOW items still open (#27 population-formula variance labeling, #28 no `^` operator, #29 no store-migration scaffolding, #30 missing `useShallow`, #31 depcheck unused deps, #32 chunk-splitting/dual-import) — unchanged, no new evidence found or needed.
26. Product-relevance's non-bug findings (no dataset join, no VLOOKUP-equivalent, no workspace export/import, AI discoverability, Overview-screen overload, terminology narrowing — confirmed accurate at the type level in §3.4) — product/design decisions, not code defects, correctly left as-is by this pass.

**Not a defect, worth stating once:** AUDIT-2026-09-10's "typecheck: clean" health-check result should be read as *the naive command's* result, not the codebase's — `tsc -p tsconfig.app.json` is red today (§1.18/§1.19). If a CI gate exists or is added, it must target the `-p` form or it will keep passing over real errors.

---

*Generated as part of a comprehensive cross-cutting audit requested 2026-09-14, synthesizing six parallel full-read subagent passes (formula+calculated-fields; pivot+window; stats+charts+KPI+forecasting; AI co-pilot; dashboards+filters+export+persistence; command-palette+templates+onboarding+core-services+orphans) against the four prior audits and the same-day window-zeroing investigation. No files were modified.*
