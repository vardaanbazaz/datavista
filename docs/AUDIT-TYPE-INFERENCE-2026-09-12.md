# Type-Inference & Semantic Product-Design Audit — 2026-09-12

Scope: read-only audit of column type inference and its downstream consumers. This is
**not** a correctness/bug audit (see `docs/AUDIT-2026-09-10.md` for that); every
computation described below runs and returns a number — the question here is whether
that number *means* anything. No files were modified for this report.

Trigger case: uploading the IBM HR Attrition dataset
(`WA_Fn-UseC_-HR-Employee-Attrition.csv`) and opening Data Insights / Pivot / KPI /
Charts / AI Co-Pilot on it. Findings reference exact files and line numbers as seen
in the working tree at the time of this audit (base commit `96b9bb0`, plus the
uncommitted changes already staged/modified per `git status` — several of the cited
files, e.g. `formulaEngine.ts`, `pivot/engine.ts`, have pending local edits, so line
numbers reflect the working tree, not `96b9bb0` alone).

The CSV itself is not checked into this repo (confirmed via `find . -iname
"*HR-Employee-Attrition*"` — no match), so column facts not given directly by the
user (e.g. exact distinct-value counts for `MonthlyIncome`/`PercentSalaryHike`) are
described structurally below rather than asserted as measured numbers.

---

## 1. Column type inference itself

**Location:** `src/shared/services/parsingService.ts`

Type detection happens in `detectColumnType()` (lines 42–74), called once per column
from `processRawData()` (lines 136–141) at ingestion time. The heuristic:

```ts
if (numericCount / total > 0.8) return 'numeric';
if (dateCount / total > 0.8) return 'date';
return 'categorical';
```

`numericCount` is incremented whenever `!isNaN(Number(strVal))` — i.e. "parses as a
JS number." That's the entire signal. Concretely:

- **No cardinality check.** A column with 5 distinct integer values (`Education`,
  `JobSatisfaction`, ...) and a column with hundreds of distinct values
  (`MonthlyIncome`) go through the identical test and both pass as `numeric` if >80%
  of values parse.
- **No distinct-value-ratio check.** `uniqueValueCount` *is* computed later in
  `generateDatasetMetadata()` (line 263, `stats.uniqueValuesMap.size`) and stored on
  `ColumnMetadata.uniqueValueCount` / `categoryCardinality` — but it is never fed back
  into `detectColumnType()` or used to challenge the numeric verdict. The signal
  exists in the data model and is computed for every column; it's simply unused for
  classification.
- **No user override anywhere in the UI.** Searched the full component tree
  (`DataTable.tsx`, `DatasetUpdateModal.tsx`, dataset/dashboard stores) for any
  "change column type" affordance — none exists. `columnTypes` is written once at
  import (`processRawData`) and read everywhere downstream as ground truth. The only
  place type even shows up as "changed" is `DatasetUpdateModal` / `schemaDiff.ts`,
  which flags a type change between two *file versions* as a breaking change — it
  has no concept of a user-initiated correction.
- **Role field is a dead end.** `ColumnMetadata.role` (`dimension | measure | date |
  identifier | calculated | hidden`, `parsingService.ts:278–285`) looks like it could
  carry this distinction, but the only rule that sets `identifier` is an exact
  case-insensitive name match on `"id"` or `"key"` (line 283) — it does not fire for
  `EmployeeNumber`, `EmployeeID`, etc., and does not consider uniqueness. Downstream,
  `role` is read in exactly two places (`PivotBuilder.tsx:242` for an icon,
  `formulaEngine.ts:735` to exclude `'calculated'` fields from something unrelated) —
  never to change aggregation defaults or flag identifier-like columns.
- **The heuristic is also duplicated, not centralized.** `ChartVisualization.tsx:222–243`
  (`getColumnType`) reimplements the identical ">80% parses as Number" rule from
  scratch as a fallback for when chart metadata isn't resolvable, independently of
  `parsingService.ts`. The two copies happen to agree today, but they're two separate
  pieces of code that must be kept in sync by hand — any future fix to the heuristic
  in one place silently leaves the other unfixed unless someone remembers both.

**Verdict:** the root cause described in the trigger case is exactly this — "all
values parse as Number" is necessary and sufficient for `numeric` in this codebase,
full stop. No secondary signal, no correction path, and the one heuristic that exists
is copy-pasted rather than shared.

---

## 2. Downstream consumers that inherit the misclassification

Every numeric-type consumer in the codebase was located (`grep` for `'numeric'` /
`inferredDataType` / `columnTypes[` across `src/`) and triaged. Two files that merely
pass the type through without branching on it were confirmed inert and are not
findings: `src/shared/utils/validators.ts` (only validates that `columnTypes` values
are one of the three allowed strings) and `src/shared/services/searchEngine.ts`
(defaults an unknown column's type to `"categorical"` for search matching, no
numeric-specific branch). Every other consumer below does branch on the type in a way
that matters.

### 2a. KPI Cards — highest-severity finding

`src/features/kpi/components/KPIBuilder.tsx`: the "Measure Column" dropdown
(lines 151–166) lists **`allColumns`** — every column in the dataset, with **no type
filtering at all** (contrast with `dateColumns`, which *is* filtered to
`inferredDataType === 'date'` for the trend-comparison picker, lines 57–67). A new
KPI card defaults `aggregation` to `"sum"` (line 39, and again at line 90 for a fresh
card). Nothing stops — or even discourages — a user from creating a KPI card titled
"Avg Job Satisfaction" with Measure Column = `JobSatisfaction`, Aggregation =
`Average`; `kpiEngine.calculateKPIData()` (`src/features/kpi/kpiEngine.ts:13–36`)
executes it via `queryEngine` exactly like any other metric and returns a plain
number with a trend/sparkline if configured.
- **Kind:** display/interpretation issue — the aggregation is arithmetically correct.
- **Severity: highest in this audit.** A KPI card is the most decontextualized,
  most "trusted-by-design" surface in the app: it's a big number on a dashboard with
  a title the user chose, no surrounding table, no column list to double-check
  against, often pinned front-and-center for other stakeholders to read. "Total Sum"
  or "Average" of an ordinal code rendered as a headline metric is the single most
  likely place in DataVista for this bug to mislead someone who never opens
  StatsExplorer at all.

### 2b. PivotExplorer — silent, zero-click default

`src/features/pivot/components/PivotExplorer.tsx:19–55`: the very first time the
Pivot tab is opened for a dataset (`pivotConfig` not yet set), it **auto-generates and
auto-applies** a pivot config with no user action: `defaultVal = columns.find(c =>
c.inferredDataType === 'numeric')?.name` (line 33) — the *first* numeric column in
column order — wired to `operator: 'sum'` (line 42) and immediately rendered
(`React.useEffect` at line 58 pushes it straight into the store). For this specific
dataset, `Age` happens to be the first column and is a legitimate continuous measure,
so the *current* trigger case doesn't visibly misfire here — but the selection logic
has no cardinality/role awareness at all, so a dataset whose first numeric-looking
column is an ordinal code (or any dataset where columns are reordered) would render a
"SUM of `<ordinal column>`" pivot table with **zero user interaction**, before the
user has touched anything.
- **Kind:** display/interpretation issue.
- **Severity: high** — more severe than the manual `PivotBuilder` "+ Val" default
  (§2d below) precisely because no click is required to produce it; it's what the
  user sees on first paint.

### 2c. StatsExplorer / "Data Insights" (confirmed trigger case)

`src/features/stats/components/StatsExplorer.tsx:50–59` builds `numericColumns` by
filtering `inferredDataType === 'numeric'`. Every such column gets the full
descriptive suite from `computeDescriptive()`
(`src/shared/services/stats/descriptive.ts`): Sum, Mean, Median, Mode, Min, Max,
Range, Variance, StdDev, Q1/Q3, IQR, **Skewness, Kurtosis**. For `Education`,
`JobSatisfaction`, etc. this renders as e.g. "Total Sum: 4,282", "Skewness: -0.42" —
all computed correctly, all semantically empty for an ordinal code.
- **Kind:** display/interpretation issue.
- **Severity: high** — likely to be *trusted*, though slightly less decontextualized than a KPI tile since the full stat sheet (Mode, Unique Value Count) sits right next to it as a hint something's off, for a user who looks closely.

### 2d. PivotBuilder — manual value-field aggregation default

`src/features/pivot/components/PivotBuilder.tsx:285`:
`onClick={() => addValueField(col.name, col.type === 'numeric' ? 'sum' : 'count')}`.
Dragging/adding `Education` into Values defaults its operator to `sum`. This is a bad
default, not a locked mistake — the operator select at line ~446 lets the user change
it to `avg`/`min`/`max`/`count`/`median`/`stddev` afterward.
- **Kind:** display/interpretation issue (correctable in-UI).
- **Severity: medium** — requires a deliberate user action to trigger (contrast §2b), giving slightly more chance of the user noticing before trusting the number.

### 2e. Chart type gating — enables, doesn't suggest

No rule-based "recommend a chart type" feature exists anywhere in the codebase
(`templateEngine.ts` was checked specifically for this — it only clones an *existing*
dashboard's charts into a reusable template and re-validates that a target dataset
has the referenced columns; it does not choose chart types or aggregations for new
content). `ChartBuilder.tsx` requires the user to manually pick `chartType` (default
`'bar'`) and manually pick `xAxis`/`yAxis`.

What *does* exist, and is a real symptom: `ChartVisualization.tsx:250–281` gates which
chart types are allowed based on inferred column type — e.g. Scatter/Bubble/Histogram
require `xType === 'numeric'` (and Y/size, respectively), Bar/Line/Area/Pie require
`yType === 'numeric'`. Since an ordinal Likert column passes this same `'numeric'`
gate, a user *can* successfully build a scatter plot or histogram treating
`Education` or `JobSatisfaction` as a continuous axis — e.g. a histogram of
`Education` bucketing 5 discrete codes into bins, or a scatter of
`JobSatisfaction` vs. `MonthlyIncome` implying a continuous relationship — with no
warning that one axis is a small fixed set of categories wearing numeric clothing.
- **Kind:** display/interpretation issue — the chart renders correctly per its own
  axis math; the misleading part is that the *type gate* treats an ordinal code as
  equivalent to a true continuous measure for chart-type eligibility.
- **Severity: medium** — requires deliberate chart-type and axis selection by the
  user, so some self-correction opportunity exists, but a rendered scatter/histogram
  looks visually authoritative in a way a stats table doesn't.

### 2f. Formula engine / calculated fields

`formulaEngine.validate()` (`src/shared/services/formulaEngine.ts:527` onward) checks
duplicate names, syntax via `compile()`, unknown functions/arity, and unknown column
references. It does **not** check operand semantics at all — no code path inspects
whether a `[Column]` used inside `+`, `AVG(...)`, etc. is ordinal-coded, an
identifier, or a real magnitude. `[JobLevel] + [Education]` or
`AVG([JobSatisfaction])` evaluates cleanly with zero warning.
- **Kind:** display/interpretation issue — the engine has no type-semantics layer for *any* column type, so this isn't a special-case gap, it's the whole design.
- **Severity: medium** — a more deliberate, engaged action than glancing at a stats tile, but the resulting field then persists and can silently feed charts/KPIs/pivots downstream where the original oddity is no longer visible.

### 2g. AI Co-Pilot (query/formula generation)

`aiEngine.buildContext()` (`src/features/ai/aiEngine.ts:21–38`) sends the LLM, per
column: `name`, `type` (one of the three inferred buckets), five `sampleValues`,
`minimumValue`, `maximumValue`, `uniqueValueCount`. The LLM could in principle notice
"type: numeric, min 1, max 5, uniqueValueCount 5" looks like a Likert scale, but
nothing instructs it to: `SYSTEM_PROMPT` (`src/features/ai/llmService.ts:4–57`)
gives the response schema and available functions but contains no language
distinguishing ordinal/coded numeric columns from continuous ones, and no instruction
to caveat `sum`/`avg` on low-cardinality numeric fields. A prompt like "average job
satisfaction by department" would plausibly generate `{"operator": "avg", "column":
"JobSatisfaction"}`, executed via `queryEngine` with no guard, then auto-charted
(`executeAIQuery`, `aiEngine.ts:207–223`) as if it were a real KPI. The **offline
fallback heuristic** (`llmService.ts:171–222`, used whenever no API key is set) picks
`numCol = columns.find(c => c.type === 'numeric')` with the same blindness — if
`Education` happened to be the first numeric column, "top 5 X by Y"-style prompts
would default to summing it.
- **Kind:** display/interpretation issue, least visible of all — the AI path
  auto-executes a query and auto-creates a chart in one step, with no intermediate
  "here's the aggregation I picked, does this look right" surface.
- **Severity: high** — same trust profile as a KPI tile, plus reduced user agency (the user asked a question in English and got a chart back, never having chosen the column themselves).

### 2h. Anomaly Detection + AI Executive Summary — narrated, not just numeric

`src/features/ai/anomalyDetector.ts`: `detectDatasetAnomalies()` (lines 77–118) runs
IQR-based outlier detection (`computeOutliers`, borrowed from the stats module) over
**every** `inferredDataType === 'numeric'` column, with no cardinality check.
`detectChartAnomalies()` (lines 21–60) does the same for whatever column is plotted
on a chart's Y-axis. Both produce narrated `DetectedAnomaly` objects with alarm-toned
language baked into the `description` string, e.g. (constructed from the actual
template at line 57, with `diffPct = |((value − mean) / mean) × 100|` and a plausible
mean of ~2.7 on a 1–4 scale): `"JobSatisfaction dropped to 1 on Sales (63% deviation
from average)."` — a completely expected low code on an ordinal 1–4 scale, framed as
a statistically significant "drop." Worth noting: because `diffPct` for any drop from
a positive mean is mathematically bounded at 100% while a spike is not, an ordinal
column's low-end "anomalies" can never cross the `severity: 'high'` threshold
(`diffPct > 100`, line 45) the way a high-end spike on the same column can — a real
asymmetry in how these get ranked, on top of the underlying misclassification.

This feeds directly into `summaryEngine.generateExecutiveSummary()`
(`src/features/ai/summaryEngine.ts:10–103`): anomaly descriptions are concatenated
into the LLM prompt context (line 39–42) *and*, in the **offline fallback** path with
no API key (`generateOfflineSummary`, lines 108–130), the top anomaly's description is
spliced **verbatim** into a headline "Executive Summary" sentence shown in the UI —
e.g. "`Dataset "HR Data" (1,470 rows) shows active performance across 6 widgets.
JobSatisfaction dropped to 1 on Sales (63% deviation from average). Overall
performance remains steady outside of these localized deviations.`" The LLM path
additionally receives only `{name, type}` per column (`summaryEngine.ts:70`) — same
missing ordinal signal as §2g, so an online LLM call could independently reach for
`JobSatisfaction`'s "average" or narrate its "spike" too.
- **Kind:** display/interpretation issue — `computeOutliers`'s IQR math is correct;
  the interpretation ("anomaly," "spike," "dropped," a deviation percentage) applied
  to a 4–5-value ordinal scale is not.
- **Severity: high** — arguably worse than a raw stats number, because it is
  packaged as confident natural-language narrative in an "Executive Summary" panel
  explicitly designed to be read at a glance and trusted without further digging.

### 2i. Export (PDF report)

`src/shared/utils/exportUtils.ts:160–190`: PDF export builds a "Data Summary" section
that computes Min/Max/Avg for every `columnTypes[col] === 'numeric'` column and
writes lines like `Education: Min=1.00, Max=5.00, Avg=2.91` directly into the
generated PDF.
- **Kind:** display/interpretation issue.
- **Severity: medium-high** — distinct from the in-app findings because this
  *persists* the misleading number into a standalone document handed to someone
  outside the tool, with no surrounding UI (Mode, Unique Value Count, correlation
  matrix) that might otherwise hint at the ordinal nature of the column.

### 2j. DataTable footer summary

`src/features/datasets/components/DataTable.tsx:251–294` (`summaryStats`): computes
Min/Max/Mean per `numeric`-typed column for a footer row under the raw data table.
Same root pattern as 2c/2i.
- **Kind:** display/interpretation issue.
- **Severity: low-medium** — shown directly beneath the raw column values the user is already looking at, which gives the most context of any surface in the app for self-correcting ("oh, that's just the 1–5 codes again").

### 2k. Window functions (running sum, moving average, etc.)

`src/features/window/components/WindowExplorer.tsx:63–66` filters column pickers to
`inferredDataType === 'numeric'`; `src/shared/services/window/engine.ts:92–195`
executes `RUNNING_TOTAL`, `MOVING_AVG`, `WINDOW_MIN`, `WINDOW_MAX`, `FIRST_VALUE`,
`LAST_VALUE` over whatever column is selected. A running total or moving average of
an ordinal code (e.g. cumulative sum of `JobLevel` down a sorted list of rows) is the
same category of nonsense as a plain Sum, just accumulated row-by-row.
- **Kind:** display/interpretation issue.
- **Severity: medium** — same root cause, no new mechanism; noted for completeness rather than as a distinct code path to fix.

### 2l. Query engine backward-compatibility fallback

`src/shared/services/queryEngine.ts:382–388`: when a `Query` is executed with no
explicit `aggregations`, the engine auto-generates one `sum` aggregation for **every**
numeric column in the dataset (`allColumns.filter(col => columnTypes[col] ===
'numeric').map(col => ({ operator: 'sum', ... }))`). This is a core-engine default,
not a UI default — any caller that omits `aggregations` (a legacy/simplified query
path) silently gets "sum everything numeric," misclassified columns included.
- **Kind:** display/interpretation issue.
- **Severity: low-medium** — narrow blast radius (only triggers when a caller deliberately omits aggregations), but worth flagging since it's in the shared engine rather than a single UI surface.

### 2m. Correlation / statistics engine — related but distinct finding

`src/shared/services/stats/correlation.ts` (`computeCorrelationMatrix` /
`calculatePearson`) runs **Pearson r only** — no Spearman/rank-correlation option
exists anywhere in the stats module, and `StatsExplorer.tsx:271` hard-labels the UI
tab "Pearson Correlation Matrix" with no method selector.

This is **independent of the misclassification bug**: even if `JobSatisfaction`,
`WorkLifeBalance`, etc. were correctly flagged as ordinal, computing Pearson
correlation between two 4–5-point Likert scales (or between an ordinal scale and a
true continuous variable) is statistically questionable — Pearson assumes
interval-scale, linear relationships; Spearman's rank correlation is the standard
recommendation for ordinal data. Today, every numeric column (ordinal or not) goes
into the same Pearson matrix with no caveat.
- **Kind:** display/interpretation issue (methodology gap, compounded by — but separate from — the classification bug: misclassified columns silently join the matrix too).
- **Severity: medium** — the color-coded strength badges ("Strong positive" ≥ 0.7, `StatsExplorer.tsx:259`) actively editorialize the number, which raises the stakes above a plain coefficient table.

---

## 3. Related misclassification patterns beyond the exact trigger case

### 3a. ID-like columns — `EmployeeNumber` (all-unique per the user-confirmed trigger case)

All values parse as integers → `numeric` (same code path as §1). `role` stays
`'measure'` since the identifier rule only matches the literal names `"id"`/`"key"`
(§1). Consequence: `EmployeeNumber` is included in every §2 consumer — StatsExplorer
Sum/Average/Skewness, PivotBuilder/PivotExplorer `sum` defaults, KPI metric picker,
the Pearson correlation matrix, export PDF summary. Averaging or summing an ID is
exactly as meaningless as summing `Education` — same root cause, different concrete
symptom (near-uniform/high-cardinality rather than few-valued).
- **Kind:** display/interpretation issue.
- **Severity: medium** — an ID column's "Average EmployeeNumber: 1035.5" is a more obviously nonsensical number than a Likert-scale sum, so a user is somewhat more likely to self-catch it, but it still silently pollutes every default listed above.

### 3b. Constant columns — `EmployeeCount`, `StandardHours`, `Over18`

`EmployeeCount`/`StandardHours` are constant integers per the user-confirmed trigger
case → `numeric`, `uniqueValueCount === 1`. `Over18` is a constant string → correctly
`categorical` (no numeric-detection issue there). The engine handles the numeric pair
gracefully at the *math* level — `calculatePearson` explicitly guards `denX === 0 ||
denY === 0` and returns `null` rather than `NaN` (`correlation.ts:29`, with an inline
comment noting this was a deliberate prior fix) — so no crash or garbage output. But
there is no "zero-variance / low-information column" detection anywhere: these
columns still appear in every numeric-column picker (KPI, Pivot, Stats, Charts,
Export), still get a full descriptive-stats card (Sum, Mean, StdDev = 0, Skewness =
0 — all technically correct, all zero information), and still occupy a slot in the
correlation matrix (an all-`null` row/column). Nothing surfaces "this column never
varies."
- **Kind:** display/interpretation issue — no wrong numbers, no crashes, just wasted UI surface and no signal that these columns carry zero information.
- **Severity: low** — mildly wasteful, not misleading; a constant Mean/StdDev=0 tile is unlikely to be misread as insight.

### 3c. Boolean-like columns stored as strings — `Attrition` (Yes/No), `OverTime` (Yes/No)

Confirmed correctly detected as `categorical`: `"Yes"`/`"No"` fail
`!isNaN(Number(...))`, so `numericCount` stays at 0% and the >80% numeric threshold is
never met — these fall through to the `categorical` default (`detectColumnType`, line
73). No bug here.

Flagged as a **related, not-yet-triggered risk**: a 0/1-encoded boolean column (not
present in this dataset, but common in others) would hit the identical
misclassification as `Education` — 100% numeric parse, only 2 distinct values — and
inherit every symptom in §2. Same root cause at the extreme low-cardinality end (2
categories instead of 4–5); no separate code path handles it, so it's covered by
whatever eventually addresses §1.

### 3d. High-cardinality categorical columns / filter UI

No column in this specific dataset is a genuine high-cardinality free-text/ID column
stored as a string — every string column here (`Department`, `JobRole`,
`EducationField`, `BusinessTravel`, `MaritalStatus`, etc.) has a small handful of
distinct values, which is exactly what "categorical" should mean. So this dataset
doesn't trigger the failure mode itself, but the **UI has no cardinality guard on the
categorical side either** — worth recording as the mirror-image gap:

`FilterPanel.tsx:156–161` (`getUniqueValues`) computes
`Array.from(new Set(dataset.data.map(...)))` with **no cap**, and
`FilterPanel.tsx:224–248` renders one checkbox per distinct value inside a fixed
`h-32` scroll area for *every* categorical column, unconditionally. If a string
column with hundreds/thousands of distinct values (a free-text or high-cardinality ID
field in a different dataset) were classified `categorical` — which it would be,
since `detectColumnType` has no upper-cardinality bound for the categorical branch
either — the filter panel would render hundreds of checkboxes with no
warning/pagination/search. (`categoryCardinality` in metadata is capped to the first
100 entries for storage, `parsingService.ts:266–275`, but `FilterPanel` doesn't use
that field — it recomputes uncapped directly from `dataset.data`.)
- **Kind:** display/UX issue, not a computation issue — filtering itself still works correctly on whichever values are checked; it's a scalability/usability gap.
- **Severity: low-medium** — no misleading number, but a user would immediately notice a broken-feeling UI (a giant unsearchable checkbox list), so it's more "annoying" than "trust-damaging." Flagged as the same missing-cardinality-signal root cause, mirrored on the categorical side of the boundary.

### 3e. Currency/percentage-shaped columns — `MonthlyIncome`, `PercentSalaryHike` (control check)

This is the key tension the audit was asked to surface, and it's confirmed as real —
described structurally since the CSV isn't in this repo to measure directly.
`MonthlyIncome` is a per-employee salary figure, which in the standard version of
this dataset is high-cardinality (close to unique per row) and is correctly `numeric`
today under the current heuristic — safe, because the >80%-parses-as-number rule
doesn't care about cardinality either way. `PercentSalaryHike` is a percentage-style
column with a narrower, small-integer range — this is the shape that matters for the
tension: **a genuinely continuous or ratio-scale quantity can still have low
cardinality** (a percentage that only ever lands on a handful of integer values in a
given dataset, a rating scored out of 10, a price bucketed to round numbers).

The risk is prospective, not present: **any fix that adds a low-cardinality signal to
`detectColumnType` (e.g. "few distinct integer values ⇒ maybe categorical") must not
fire on a column shaped like `PercentSalaryHike`,** nor on any legitimately-continuous
column that happens to have few distinct values in a particular dataset. Cardinality
alone is not sufficient signal in either direction — it under-flags Likert-scale
columns with borderline cardinality (a 10-point scale looks a lot like a legitimate
small-integer measure) and would over-flag genuinely discrete-but-real quantities if
applied naively. No code today attempts this, so there is nothing to regress yet —
this is recorded as a constraint on any future fix design, not a bug to fix in this
pass.

---

## 4. Summary table (prioritized, most severe first)

| # | Finding | Kind | Severity | Fix shape |
|---|---|---|---|---|
| 2a | KPI Cards: Measure Column picker has **no type filter at all**, defaults to `sum`; headline-number surface with least surrounding context (`KPIBuilder.tsx:38-39,89-90,151-166`) | Display/interpretation | **Highest** — most decontextualized, most-trusted surface in the app | **Product decision required** first (§1), then contained: filter/warn the picker once a richer type signal exists |
| 1 | `detectColumnType` uses only "% parses as Number" — no cardinality signal, no user override anywhere in UI, duplicated (not shared) heuristic (`parsingService.ts:42-74`, `ChartVisualization.tsx:222-243`) | Root cause | — (root cause) | **Product decision required** — auto-detect heuristic change vs. manual type-override UI vs. both; §3e shows naive cardinality-only fixes will misfire on real data |
| 2b | PivotExplorer auto-renders a `SUM` pivot on first tab open using the *first* numeric column, with **zero user interaction** (`PivotExplorer.tsx:19-55`) | Display/interpretation | **High** — no click required to produce the misleading default | Contained once §1 provides a better column to pick from |
| 2h | Anomaly detection (IQR outliers on every numeric column) narrates ordinary Likert-scale values as "spikes"/"drops" with a deviation %, and the offline Executive Summary quotes this **verbatim** as headline narrative (`anomalyDetector.ts:77-118`, `summaryEngine.ts:39-42,108-130`) | Display/interpretation | **High** — confident natural-language narrative, designed to be read and trusted at a glance | Contained: exclude/caveat low-cardinality numeric columns from outlier scanning, once §1 exists |
| 2g | AI Co-Pilot has no signal distinguishing ordinal-coded numeric columns from real numeric columns; system prompt gives no guidance; offline fallback picks first numeric column blindly (`aiEngine.ts:21-38`, `llmService.ts:4-57,171-222`) | Display/interpretation | **High** — auto-executes + auto-charts with no review step, reduced user agency | Contained: extend the `type` signal sent to the LLM/fallback once §1 exists; needs the §1 decision first |
| 2c | StatsExplorer computes full descriptive stats (Sum/Mean/Skewness/...) on ordinal Likert columns — the confirmed trigger case (`StatsExplorer.tsx:50-59`, `descriptive.ts`) | Display/interpretation | High | Contained once §1 is resolved (gate the numeric-stats view on the corrected type, or add an ordinal-aware view) |
| 2i | PDF export bakes Min/Max/Avg for every numeric column into a standalone document handed outside the app, with none of the in-app context that might hint at the issue (`exportUtils.ts:160-190`) | Display/interpretation | Medium-high | Contained once §1 exists |
| 3a | ID-like columns (`EmployeeNumber`) get averaged/summed/correlated same as Likert columns; `role: 'identifier'` detection only matches literal names `"id"`/`"key"` (`parsingService.ts:278-285`) | Display/interpretation | Medium | Contained: broaden identifier heuristic (e.g. 100% unique + integer) — a smaller, more surgical version of the §1 decision |
| 2d | PivotBuilder defaults numeric columns to `sum` on manual add, including ordinal/ID columns (`PivotBuilder.tsx:285`) | Display/interpretation (user-correctable via existing operator select) | Medium | Contained: change default resolution to consult cardinality/role once available |
| 2e | Chart-type gating treats ordinal codes as fully-qualified numeric axes, permitting scatter/histogram/bubble charts that imply continuous magnitude (`ChartVisualization.tsx:250-281`); no auto-chart-type-suggestion feature exists to separately audit | Display/interpretation | Medium | Contained once §1 exists |
| 2f | Formula engine performs zero semantic/type-appropriateness checking on arithmetic (`formulaEngine.ts:527` validate) | Display/interpretation (by design — no semantics layer for any column type) | Medium | Product decision — would require inventing a "warn on ordinal arithmetic" concept that doesn't exist today for any type |
| 2k | Window functions (running sum, moving average, etc.) apply to any numeric-typed column with the same blindness (`window/engine.ts:92-195`, `WindowExplorer.tsx:63-66`) | Display/interpretation | Medium | Contained once §1 exists — no new mechanism, same root cause |
| 2m | Stats engine hardcodes Pearson correlation with no Spearman option or ordinal caveat, independent of misclassification (`correlation.ts`, `StatsExplorer.tsx:271`) | Display/interpretation (methodology gap) | Medium | Product decision — adding a second correlation method / auto-selection is a feature, not a one-line fix |
| 2l | Query engine's no-aggregations-specified fallback silently sums every numeric column, misclassified ones included (`queryEngine.ts:382-388`) | Display/interpretation | Low-medium | Contained once §1 exists |
| 3d | Categorical-side cardinality is equally unchecked — `FilterPanel` renders an uncapped checkbox list per categorical column, ignoring the already-capped `categoryCardinality` metadata (`FilterPanel.tsx:156-161,224-248`) | Display/UX (not computation) | Low-medium | Contained: cap/paginate/search the filter checkbox list, reuse `categoryCardinality` |
| 2j | DataTable footer computes Min/Max/Mean per numeric column, same root pattern but shown right next to the raw values (`DataTable.tsx:251-294`) | Display/interpretation | Low-medium | Contained once §1 exists |
| 3b | Constant columns (`EmployeeCount`, `StandardHours`) get full stats cards and a matrix slot with zero information; no zero-variance detection | Display/interpretation | Low | Contained: flag/hide columns with `uniqueValueCount === 1` |
| — | `ColumnMetadata.role` is computed but functionally inert (only used for one icon and one unrelated exclusion) | Design gap / dead weight | Low | Contained: either wire it into aggregation defaults & type overrides, or accept it's cosmetic |
| 3c | Boolean-like 0/1-encoded columns would hit the identical bug as Likert columns (not present in this dataset, same code path as #1) | N/A — no current instance in this dataset | N/A | Covered by whatever fixes #1 |
| 3e | Currency/percentage columns (`MonthlyIncome`, `PercentSalaryHike`) are correctly numeric today — recorded as a **constraint**, not a bug: any cardinality-based fix to #1 must not flag columns of this shape | N/A — control check, currently correct | N/A | Constrains the design of the #1 fix |

**Overall:** every finding here is a *display/interpretation* issue — the underlying
arithmetic is correct in every case checked (including the graceful zero-variance
guard already present in `calculatePearson`, and the fact that no code path was found
that crashes, throws, or silently corrupts a value because of a type
misclassification). Nothing found produces a wrong number from a
computation-correctness standpoint; the gap is entirely in the app failing to
represent categorical/ordinal/identifier semantics that its own metadata
(`uniqueValueCount`, `categoryCardinality`) already computes but never uses, and in
narrating meaningless statistics (§2h) as if they were significant findings. The
highest-severity items (KPI cards, the zero-click Pivot default, and the narrated
anomaly/executive-summary text) are the ones most likely to be mistaken for a
trustworthy insight without the user ever opening a raw data table. The root cause
(§1) and the two "needs a human decision" items (§2f formula-arithmetic warnings,
§2m correlation methodology) are explicitly **not** contained code fixes and
shouldn't be resolved by an autonomous pass.
