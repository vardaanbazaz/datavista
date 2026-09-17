# DataVista — Shell-Completeness Audit (2026-09-12)

**Scope:** Read-only audit for empty-shell / half-baked implementations — features
that look complete in the UI but are not backed by real, working logic. Distinct
from `docs/AUDIT-2026-09-10.md` (correctness bugs) and the type-inference audit
(semantic type-inference gaps). No files were edited as part of this audit.

**Method:** Direct source review across every major module, targeted edge-case
testing via vitest/vite-node (empty dataset, single-row, all-null column,
150-column-wide dataset, non-ASCII column names, duplicate column names,
single/all-distinct partition columns), and cross-referencing README.md / in-app
copy against actual implementation. Every finding below was independently
verified in the actual source (or re-run) before inclusion — several suspected
issues were investigated and ruled out as false alarms (noted in the "Verified
NOT shells" section) rather than included.

**Overall picture:** DataVista's core analytical engines (formula engine, query
engine, stats engine, KPI engine, conditional formatting, cross-filtering,
drill-through, persistence, window-function computation, pivot aggregation) are
genuinely implemented and mostly well-tested — this is not a demo full of stubs.
The real problems are concentrated in a handful of specific integration seams
where one feature's output was never fully wired into another feature that reads
it, plus a few UI defaults/copy claims that don't match what's shipped. Two of
the findings below (#1 and #3) sit at exactly that kind of seam and are the ones
most likely to bite an ordinary user in ordinary use.

---

## Findings, worst first

### 1. Window-function columns are metadata-only phantoms outside the Data Table
**Module:** Window Functions ↔ Pivot / Charts / Stats / KPI / Formula bar
**File:** `src/shared/services/window/engine.ts:213-259` (`augmentMetadata`), `src/store/datasetStore.ts` (`addWindowQuery`, `deleteWindowQuery`, `setActiveDataset`)

**Looks like:** Creating a window-function column (e.g. a running total) via the
Window Functions Explorer adds a real new column to your dataset, usable anywhere
else in the app — pivots, charts, stats, KPIs, formulas — exactly like any other
column.
**Actually does:** `windowEngine.augmentMetadata()` adds the new column's name to
`dataset.columns`, `dataset.columnTypes`, and `dataset.metadata.columns` (tagged
`numeric`) — but never writes any values into `dataset.data`. The Data Table looks
correct only because it separately re-runs the real computation through
`queryEngine`/`windowEngine.execute()` on every render. Every *other* feature that
lists fields straight from `dataset.metadata.columns` (confirmed for Pivot
Builder; the same pattern applies anywhere else that reads dataset columns
directly rather than re-querying) will offer the window column as a normal,
selectable field — and silently return blank/0/NaN when it's actually used,
because the underlying row data was never populated.
**How a user notices:** Nothing warns you. Build a running-total window column,
open Pivot Builder, drag it into Values — the pivot builds without error and
shows zeros or blanks instead of the running total. This directly undercuts the
README's pivot "automated totals" claim whenever the pivot is built on a
window-derived measure.
**Severity:** Normal use — triggers the first time a window column is used in
anything other than the Data Table tab it was created in.

---

### 2. Pivot Table duplicates every value cell in the default (no-column-dimension) view
**Module:** Pivot Builder
**File:** `src/features/pivot/components/PivotTable.tsx:253-289`, `PivotExplorer.tsx:38`

**Looks like:** A working pivot table the moment you add a row dimension and a
value field — this is the literal default configuration (`columnDimensions: []`)
that `PivotExplorer.tsx` builds on first load.
**Actually does:** When there are zero column dimensions, `getVisibleColumns()`
represents the table as one pseudo-column. The main body-cell render loop
(lines 253-271) already renders each value correctly against that pseudo-column
— but a second, separate block gated on the same `columnDimensions.length === 0`
condition (lines 274-289) unconditionally re-renders the identical value again.
Every row ends up with each number shown twice, while the header row only has
enough header cells for one copy — a visibly duplicated, misaligned table.
**How a user notices:** Open Pivot Table, pick any row dimension and value field
without adding a column dimension (the default, most common way to start) — every
value appears twice per row, and the columns don't line up with the headers.
**Severity:** Normal use — this is the default state of a brand-new pivot.

---

### 3. PDF report always ships with zero chart images, but reports success
**Module:** Export
**Files:** `src/features/export/components/ExportPanel.tsx`, `src/shared/utils/exportUtils.ts`, `src/features/dashboard/components/Dashboard.tsx`

**Looks like:** "Generate a comprehensive PDF report with all charts and data
summary" — clicking "Generate PDF Report" succeeds, downloads a PDF, and the
panel lists every chart by name as if it will be included.
**Actually does:** `Dashboard.tsx` renders exactly one `activeView` at a time via
plain conditional JSX (not CSS-hidden tabs). The only component that renders
`data-chart-id={chart.id}` is `ChartVisualization.tsx:1295`, which only mounts
under `activeView === 'charts'`. While the user is on the Export tab, no chart's
DOM node exists anywhere on the page. `generatePDFReport()`'s per-chart
`html2canvas` capture queries for that DOM node, finds nothing, catches the
error, and silently drops in placeholder text — "Chart image could not be
captured" — for every chart, every time. The PDF downloads successfully (numeric
summary section is real) and the toast says "PDF report generated," but the
promised chart images never appear.
**How a user notices:** Open the generated PDF — data summary is present, every
chart is a text placeholder instead of an image. Nothing in the UI warned this
would happen.
**Severity:** Normal use — this is the primary, advertised path for generating a
shareable report, and it silently fails its core visual promise every time.

---

### 4. "Manage Workspace Snapshots" command is a no-op stub
**Module:** Command Palette / Global Shortcuts
**File:** `src/features/dashboard/components/Dashboard.tsx:62-65`

**Looks like:** A documented command-palette entry and shortcut that opens the
Snapshot & History dialog — the dialog itself is fully built and functional.
**Actually does:**
```ts
const handleOpenSnapshots = () => {
  setActiveView("overview");
  // Trigger snapshot manager open via custom event or state
};
```
It only switches the active view to Overview. The comment admits the intended
"open the dialog" step was never implemented. The dialog only opens via a
separate, unrelated local-state button inside `DashboardSummary.tsx` — never
through the palette entry or shortcut that advertises it.
**How a user notices:** Run "Manage Workspace Snapshots" from the command palette
(or its shortcut) from anywhere but Overview — the screen jumps to Overview and
nothing else happens. No dialog, no error.
**Severity:** Normal use — a discoverable, documented command, not an edge case.

---

### 5. Chart PNG/SVG export always fails (same root cause as #3)
**Module:** Export
**Files:** same as #3

**Looks like:** "Export individual charts as PNG or SVG images" — a working
per-chart PNG/SVG button on the Export tab.
**Actually does:** For the same reason as #3 — the chart's DOM node doesn't exist
while on the Export tab — `exportChartAsPNG`/`exportChartAsSVG` immediately throw
"Chart element not found," caught and shown as a generic "Export failed. Failed
to export chart. Please try again." toast.
**How a user notices:** Click "PNG" or "SVG" next to any chart on the Export tab —
immediate failure, unconditionally, regardless of chart or dataset.
**Severity:** Normal use. Ranked below #3 because at least this one fails loudly
rather than silently.

---

### 6. Filters page is missing the numeric-range and "contains" filtering the README promises
**Module:** Filters
**File:** `src/features/filters/components/FilterPanel.tsx`

**Looks like:** README.md step 2 ("Filtering & Narrowing Data") claims the
Filters page lets you "construct multi-layered conditions (equals, contains,
numeric range)."
**Actually does:** `FilterPanel.tsx` computes `numericColumns` via `useMemo`
(lines 49-59) but never renders anything with it — dead computed value. The
page's actual UI only offers exact-value checkbox multi-select for categorical
columns and a date-range picker. There is no numeric-range control and no
substring/"contains" search anywhere on this page. (Numeric between/greater/less
filtering does exist, but only inside the separate "Dashboard Filters" bar that
appears once a named Dashboard is created and selected — not the page the README
tells users to visit first.)
**How a user notices:** Open Filters, look for a way to filter `Sales > 1000` or
search a categorical column by substring — neither exists.
**Severity:** Normal use, for any dataset with numeric columns.

---

### 7. Chart Builder: the one shipped plugin chart type can never actually be created
**Module:** Charts
**File:** `src/features/charts/components/ChartBuilder.tsx:69-75, 165-182`

**Looks like:** The chart-type picker includes "Gauge Chart (Plugin)" — chart
plugins are a real, working extension point (`sampleGaugePlugin.tsx` is
genuinely registered and would render correctly).
**Actually does:** The dropdown is genuinely built from 8 core types plus
`pluginRegistry.getCustomCharts()`, so the plugin type is selectable. But
`isFormValid()` is a switch over only the 8 core type strings, `default: return
false`. A plugin chart type never matches any case, so the function always
returns `false` for it.
**How a user notices:** Select "Gauge Chart (Plugin)," fill in every field
correctly — "Create Chart" stays permanently disabled, with no explanation.
**Severity:** Normal use for anyone who tries the one chart type the plugin
system ships as a demonstration.

---

### 8. Calculated fields / window queries: stale unevaluated dataset silently reaches dashboards
**Module:** Calculated Fields Manager / Dashboards
**File:** `src/store/datasetStore.ts` (`addCalculatedField`:214, `deleteCalculatedField`:242, same pattern at `addWindowQuery`:273 / `deleteWindowQuery`:301)

**Looks like:** Adding or deleting a calculated field immediately and
consistently updates the dataset everywhere it's used.
**Actually does:** These actions write the *raw, unevaluated* dataset object into
the `datasets[]` array, while only `activeDataset` gets the correctly evaluated
version. `dashboardStore.loadDashboard()` reads directly from `datasets[]`,
bypassing evaluation entirely.
**Concrete break:** Add or delete a calculated field, then open/reload a
Dashboard bound to that dataset (without an intervening plain dataset switch,
which would trigger re-evaluation) — the dashboard's active dataset silently
lacks the calculated column, so any chart or KPI referencing it renders
blank/undefined, with no error.
**Severity:** Normal use — calculated fields plus dashboards is a core, expected
workflow combination.

---

### 9. AI Co-Pilot's system prompt advertises formula functions that don't exist
**Module:** AI Co-Pilot / Formula Engine
**File:** `src/features/ai/llmService.ts:47,49` vs. `src/shared/services/formula/library/{math,date}.ts`

**Looks like:** The AI system prompt tells the model `SUM, AVG, MIN, MAX` (Math)
and `TODAY` (Date) are available formula functions it can generate.
**Actually does:** None of these exist in the real registry (only
ROUND/ABS/SQRT/CEIL/FLOOR/POWER/LOG and YEAR/MONTH/DAY/DATEDIFF/DATEADD/NOW do).
With a real API key configured, a natural request like "average of Sales and
Cost" or "days since today" makes the model emit `AVG(...)`/`TODAY()`, which
`formulaEngine.validate()` correctly rejects — surfaced as a visible error toast
(not silent), but avoidable: the AI is told capabilities the engine doesn't have.
Only triggers with a live API key; the offline heuristic fallback never emits
function calls.
**Severity:** Normal use for anyone with a configured LLM key asking an
unremarkable analytical question.

---

### 10. "Automated Analyst Insights" panel doesn't disclose when it's not really AI
**Module:** AI Co-Pilot
**File:** `src/features/ai/summaryEngine.ts`, `src/features/ai/components/ExecutiveSummaryPanel.tsx`

**Looks like:** A Sparkles-icon "Automated Analyst Insights" banner presenting an
AI-generated executive summary.
**Actually does:** The anomaly numbers shown are always genuinely computed (real
IQR outlier detection over the active dataset, not mocked). But when no LLM API
key is configured, the prose sentence comes from a fixed template
(`generateOfflineSummary`) rather than a real model call, with no visual
difference in the panel — same icon, same framing either way. To be fair,
`AiSettingsModal.tsx:161` does disclose "Leave blank to use the built-in offline
smart heuristic engine" — so an attentive user who opens AI Settings can learn
this, it's just not disclosed on the insights panel itself.
**Severity:** Normal use if no API key is set (the default for a new install),
but low-stakes since the numbers underneath are always real.

---

### 11. Template schema validation ignores column data types
**Module:** Templates
**File:** `src/features/dashboards/services/templateEngine.ts:75-92`, `InstantiateTemplateModal.tsx:183-191`

**Looks like:** Instantiating a template against a new dataset checks and
reports schema compatibility, including the required column types shown in the
UI.
**Actually does:** `validateSchema` only checks that a required column *name*
exists on the target dataset — it never checks the required `dataType` it also
carries, even though the UI displays that type as if verified. A same-named but
wrong-typed column (e.g. "Sales" as text instead of numeric) is reported "Schema
Compatible" and can silently produce a broken chart/KPI on instantiation.
**Severity:** Edge case — only affects a coincidentally-named, wrong-typed column.

---

### 12. Window Functions: custom frame silently ignored for LAG/LEAD
**Module:** Window Functions
**File:** `src/features/window/components/WindowExplorer.tsx:354-425`, `src/shared/services/window/engine.ts:153-158`

**Looks like:** The "Use Custom Window Frame" checkbox is offered for every
function, including LAG/LEAD.
**Actually does:** The LAG/LEAD execution branch never reads `query.frame` — only
offset/defaultValue. Configuring a frame for these two functions is a silent
no-op.
**Severity:** Edge case — narrow (2 of 13 function types, only if that checkbox
is used for them).

---

### 13. Command palette: template/view search results are invisible but keyboard-selectable
**Module:** Command Palette
**File:** `src/features/workspace/components/CommandPalette.tsx`

**Looks like:** Searching finds dashboards, datasets, columns, templates, and
saved views.
**Actually does:** `searchEngine.search()` genuinely returns real `templates` and
`views` results, counted for keyboard navigation and correctly executed on
Enter — but the JSX only renders "Dashboards," "Datasets," and "Columns"
sections. Arrowing past "Columns" silently highlights an invisible item.
**Severity:** Edge case — only hit by a user who types a template/view name and
keeps pressing the down arrow.

---

## Verified NOT shells (checked and confirmed genuinely real)

To keep this report honest about what's actually solid — the following were
suspected candidates for shell behavior and were verified, with live edge-case
testing where practical, to be real, working implementations:

- **Formula engine core** (`formulaEngine.ts` + `formula/library/*`): correct on
  non-ASCII columns, duplicate columns, empty datasets, all-null columns,
  150-column-wide datasets, mixed-type coercion, `IF()` short-circuiting, and
  `AND`/`OR`/`NOT` parsing (confirmed via live vitest runs).
- **Query engine** (`queryEngine.ts`): all filter operators and all aggregation
  operators advertised to the AI (including `count_distinct`,
  `weighted_average`, `percentile`) are genuinely implemented and correctly
  routed.
- **Pivot aggregation engine core** (`pivot/engine.ts`, `hierarchyBuilder.ts`,
  `aggregationAdapter.ts`): correct grouping/aggregation on empty dataset,
  single row, all-null numeric column, 150-column-wide dataset, non-ASCII
  names, and dimension-equals-value-column configurations. (The display-layer
  bug in Finding #2 is separate from the engine itself, which computes
  correctly.)
- **Window computation engine** (`window/engine.ts`, `functions.ts`,
  `partitioner.ts`): correct on empty dataset, single row, single-partition,
  all-distinct-partition, all-null target column, and no-orderBy RANK/
  DENSE_RANK. (The metadata/data desync in Finding #1 is a downstream wiring
  issue, not a computation bug.)
- **Stats Explorer** (`shared/services/stats/*`): real mean/median/variance/
  stddev/correlation/IQR/Z-score math; correctly returns `null` rather than a
  misleading `0` for zero-variance correlation; correct on all-null and
  single-value edge cases.
- **KPI Cards** (`kpiEngine.ts`, `KPICard.tsx`): real query execution against
  live data; sparkline/trend/polarity/conditional-formatting all genuinely
  wired.
- **Conditional Formatting** (`formattingEngine.ts`): rules genuinely compiled
  and evaluated against live rows in DataTable, KPICard, and every chart type.
- **Cross-filtering / drill-down / drill-through** (`filterManager.ts`,
  `DrillThroughModal.tsx`): fully wired — clicking chart elements genuinely
  filters other widgets and opens a real raw-data view via `queryEngine`.
- **Snapshot Manager & persistence** (`snapshotStore.ts`, `persistenceService.ts`):
  real IndexedDB (Dexie) sync for datasets/charts/dashboards/filters/
  preferences, with quota-exceeded handling; snapshot restore is correctly
  scoped to what the UI claims it saves.
- **Onboarding Tour**: exactly matches README's "14-step" claim; all 14 step
  targets resolve to real DOM elements.
- **Command palette / global search / shortcuts**: real search over live app
  state; every command except Finding #4 performs a genuine action.
- **Templates feature**: reachable, real store actions, persisted correctly
  (schema-type-check gap aside, Finding #11).
- **8 core chart types** (bar/line/pie/scatter/histogram/heatmap/area/bubble):
  each has a real, distinct render function with its own empty-data guard.
  README's "over 8 visualization types" claim is accurate.
- **Orphan sweep**: essentially clean. The only confirmed dead file in the
  entire codebase is `src/shared/hooks/use-mobile.tsx` (an unused shadcn/ui
  scaffold hook, zero importers) — everything else traces back to the app's
  single real entry point (`main.tsx → App.tsx → Index.tsx → Dashboard.tsx`).

## Minor / cosmetic notes (not misleading, not worth fixing urgently)

- README.md:110 claims charts have "customizable color schemes" — no such
  control exists anywhere; `ChartVisualization.tsx` hardcodes a fixed 5-color
  `d3.scaleOrdinal()` range at all 4 use sites.
- `PivotDisplayOptions.layout` (`'compact'|'tabular'`) is a dead config field —
  defined, never read, never set by any UI.
- `dimensionSorts`/`valueSorts` are backend-complete in the pivot engine but
  have no UI control to set them — an unreachable-but-real capability, not
  misleading since nothing claims it exists.
- `FileUpload.tsx`'s dropzone text says "up to 10MB" while the real limit is
  100MB (under-claiming — the opposite of misleading).
- `<ThemeProvider defaultTheme="dark" storageKey="datavista-theme">` props in
  `main.tsx` are silently ignored; real theme state lives entirely in
  `uiStore` under a different storage key. Theming itself works correctly.
- `KPICard.tsx` subscribes to an unused `filteredData` value (dead variable, no
  behavioral effect).

---

## Priority summary

Ranked by how badly each would actively mislead a user into believing something
worked when it didn't (rather than by raw visibility):

1. **Window-function columns are metadata-only phantoms** (#1) — silently wrong or blank numbers anywhere outside the Data Table, no error, looks like legitimate data.
2. **PDF report ships with zero chart images, reports success** (#3) — silent, high-trust feature, no warning at all.
3. **Pivot Table duplicates every value in the default view** (#2) — extremely high severity and hit on first use, but visibly broken rather than silently wrong, so ranked just below the two silent failures above.
4. **Manage Workspace Snapshots command silently does the wrong thing** (#4) — documented, discoverable, does something, just not the right thing.
5. **Chart PNG/SVG export always fails** (#5) — at least it fails loudly.
6. **Filters page missing numeric/contains filtering the README promises** (#6).
7. **Plugin chart type can never be created** (#7) — button permanently disabled, no explanation.
8. **Calculated fields silently stale on dashboards** (#8) — edge-case trigger condition, real correctness gap, no error surfaced.
9. **AI system prompt advertises non-existent formula functions** (#9) — visible error, but avoidable.
10. **AI insights panel doesn't disclose offline/heuristic mode** (#10) — low stakes, real numbers either way.
11. **Template schema validation ignores column types** (#11) — edge case.
12. **LAG/LEAD custom frame silently ignored** (#12) — narrow edge case.
13. **Invisible command-palette search results** (#13) — cosmetic edge case.
