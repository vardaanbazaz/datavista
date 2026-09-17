# Investigation: item-3 "running_total zeroes after visiting Window Builder" (2026-09-14)

**Status:** Diagnosis only. No fix applied, per instructions.

**Repro claimed:** Pivot (Rows: Attrition, Columns: BusinessTravel, Values: Sum
of running_total) shows correct non-zero values → user visits Window & Ranking
Builder page (no changes) → returns to the exact same Pivot config → all cells
now 0. `running_total` = MOVING_AVG(Age) partitioned by BusinessTravel, ordered
by Attrition ASC (Order By *is* set — this is not audit item 4's missing-orderBy
case).

## Question 1: does mounting WindowExplorer do anything to the dataset?

No. Traced every effect in `WindowExplorer.tsx`, the `DataTable` it embeds, and
`CalculatedFieldsManager` (rendered inside that DataTable). The only `useEffect`
in `WindowExplorer.tsx` (lines 97-101) sets local `targetColumn` React state
only. `DataTable`'s window-function preview (`DataTable.tsx:155-180`) computes
a local `queryEngine.execute()` result for its own table render and never
writes to `datasetStore`/`filterStore`. Confirmed: **navigating to Window
Builder and back, by itself, calls zero store-mutating functions.**

This also means: a pure store-level test that only replays
`addWindowQuery`/`deleteWindowQuery` calls (the previous investigation's
approach) can never reproduce this — those actions all route through
`windowEngine.evaluate()`, which is correct. The actual bugs live in **paths
that bypass those actions entirely**, listed below.

## Question 2 / 4: mechanism — confirmed via `advisor` + verified against source + reproduced in a real test

Two independent, already-present bugs bypass `windowEngine.evaluate()` by
directly calling `useDatasetStore.setState({ activeDataset: dataset })` with a
dataset pulled from the **raw, unevaluated** `datasets[]` array — the exact
desync audit item #8 already named (`addWindowQuery`/`deleteWindowQuery` write
the raw dataset to `datasets[]` while only `activeDataset` gets the evaluated
copy — `datasetStore.ts:273-278`, `:300-306`). Anything that later re-selects
`activeDataset` from `datasets[]` via raw `setState` (instead of calling
`setActiveDataset`/`selectDataset`, which re-run `windowEngine.evaluate`)
inherits that staleness.

### Mechanism A — `persistenceService.hydrate()` (fires on every page load/refresh, not on navigation)

`persistenceService.ts:109-110`:
```ts
const evaluatedDatasets = validDatasets.map(d => formulaEngine.evaluateCalculatedFields(d));
useDatasetStore.setState({ datasets: evaluatedDatasets });
```
Only `formulaEngine.evaluateCalculatedFields` runs — **no
`windowEngine.evaluate`**. What's in IndexedDB is exactly the raw dataset
object (`datasetStore.ts:317` persists `state.datasets` verbatim). So after
any reload, `activeDataset.windowQueries` still lists `running_total`, but no
row in `activeDataset.data` carries a `running_total` key. `filteredData` is
then set from `queryEngine.execute(activeDataset, query).rows` (`:152`/`:180`)
or `activeDataset.data` directly (`:183`) — that query never sets
`windowQueries`, so nothing re-materializes it. Pivot's `sum` aggregation over
a missing key sums to 0 for every cell. The Data Table still looks correct
because it alone builds its query with `windowQueries: activeDataset?.windowQueries`
(`DataTable.tsx:171`) and recomputes locally on every render — which is exactly
why the symptom looks Pivot-specific.

**Trigger:** any full page reload while `running_total` (or any window column)
exists — not the Window Builder page specifically.

### Mechanism B — `dashboardStore.loadDashboard` / undo-redo's `restoreExternalContext` (mid-session, no reload needed)

`dashboardStore.ts:476`:
```ts
const dataset = useDatasetStore.getState().datasets.find(d => d.id === dashboard.datasetId);
...
useDatasetStore.setState({ activeDataset: dataset });   // raw dataset from datasets[]
```
Same raw-array source, same missing `running_total`. The comment at
`dashboardStore.ts:133-134` ("Raw setState (not setActiveDataset): ... without
re-running formulaEngine/windowEngine augmentation") shows this was a
deliberate choice for `restoreExternalContext` (used by undo/redo) that
`loadDashboard` independently repeats — neither re-materializes window columns.
`filteredData` is then recomputed the same windowQueries-less way
(`dashboardStore.ts:484`).

**Trigger:** clicking a dashboard in the sidebar (`loadDashboard`), or an
undo/redo that crosses a snapshot with a captured dataset context
(`restoreExternalContext`) — not the Window Builder page itself, but plausibly
mis-attributed to "navigation" if the user's session included a dashboard
click they didn't consider part of the repro.

### Empirically confirmed (item 3's requested integration-style repro)

Added `src/shared/services/window/__tests__/navigation-repro.investigation.test.ts`
(scratch — not meant to be kept as-is) that exercises the **real, unmodified**
`datasetStore`, `filterStore`, `dashboardStore`, and `pivotEngine` together
(not mocked):

- **Mechanism B test:** `addWindowQuery` → pivot grand total is non-zero →
  `createDashboard` + `loadDashboard` → re-run the identical pivot config →
  grand total is `0`, and `activeDataset.data` is confirmed to have lost the
  `running_total` key entirely. **Passes**, i.e. reproduces the bug.
- **Mechanism A test:** replicates `hydrate():109` inline (no IndexedDB
  needed) — confirms the raw `datasets[]` entry lacks `running_total`, that
  `formulaEngine.evaluateCalculatedFields` alone doesn't restore it, and that
  the resulting pivot grand total is `0`. **Passes.**

Both ran green against current `main` (uncommitted scratch file — not part of
the kept suite):
```
✓ mechanism B: loadDashboard reads raw datasets[] entry and zeroes the pivot
✓ mechanism A: hydrate()'s evaluate call omits windowEngine, same zeroing
```

True component-mount rendering (RTL/jsdom) isn't available in this repo
(`vitest` config environment is `"node"`, no `@testing-library/react`/`jsdom`
installed) — per `advisor`'s guidance this isn't needed here since neither
mechanism lives in React; both are reachable directly through the real store
code, which is what the test above exercises.

### StrictMode (secondary question)

Not a factor, and **not dev-only**. Checked `main.tsx` — `<StrictMode>` is
enabled, but the only mount-time effect in this whole path
(`persistenceService.init()` in `Dashboard.tsx:82-84`) is guarded by
`this.initialized`, making double-invocation a no-op. Both mechanisms above
are plain non-React function calls (`loadDashboard`, `hydrate`) invoked once
per real trigger; they behave identically in a production build.

### Still open

Neither mechanism is proven to be *the exact* trigger the user hit (that
requires confirming from the user whether a dashboard was loaded / an
undo-redo fired, vs. a reload happened) — but both are real, confirmed,
independently-reachable bugs stemming from the same root cause (raw
`datasets[]` reads bypassing `windowEngine.evaluate`), and either explains the
screenshots exactly. Recommend asking the user to check one discriminating
fact: was any dashboard active/loaded during the repro? Mechanism B forces
`setActiveView('overview')` and shows a "Dashboard Loaded" toast
(`dashboardStore.ts:492-497`) — a visible tell mechanism A doesn't produce.

## Question 3 (secondary finding): tied Order By values and frame bounds

Confirmed via source, not yet a reported bug elsewhere. `resolveFrameBounds`
(`engine.ts:29-36`), no explicit frame + `hasOrderBy = true`:
```ts
return { start: 0, end: idx };
```
This is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — a **positional**
frame keyed on sorted array index. SQL's actual default frame under `ORDER BY`
with no explicit frame clause is `RANGE BETWEEN UNBOUNDED PRECEDING AND
CURRENT ROW`, which includes **all current peers** (every row tied on the
order-by value), not just rows up to one arbitrary index within the tied
block.

With `Attrition` (2-valued: Yes/No) as Order By, every partition splits into
exactly two "peer" blocks. `MOVING_AVG`/`RUNNING_TOTAL`/`WINDOW_MIN`/`WINDOW_MAX`
give each row in a tied block a frame that ends at *that row's own index*
inside the block — so two rows with identical Attrition get *different*
frame-derived aggregates purely because of their position in
`partitionAndSort`'s output, not because of any real ordering the user
specified. That's a meaningful semantic gap, independent of the zeroing bug
above.

**Is it at least deterministic?** Yes. `sortPartitionItems` (`partitioner.ts:12-36`)
uses `Array.prototype.sort`, which is spec-guaranteed stable since ES2019
(V8/Node both compliant) — ties preserve original dataset row order. So the
"wrong" frame is reproducible run-to-run, not randomly flaky. It does **not**
compound with mechanisms A/B above (those zero the whole column; this
mis-shapes it while still non-zero).

**Asymmetry worth noting:** `computeRank`/`computeDenseRank`/`computePercentRank`
already handle this correctly via `arePeers` (`functions.ts:8`, used at
`:30`/`:50` and inside `computePercentRank`) — ranking functions treat tied
rows as a real peer group. Only the frame-based aggregates
(RUNNING_TOTAL/MOVING_AVG/WINDOW_MIN/WINDOW_MAX/FIRST_VALUE/LAST_VALUE) use the
positional `resolveFrameBounds`, which doesn't.

**UX follow-up worth considering (not implemented):** a warning when the
selected Order By column has very low cardinality relative to partition size
(e.g. "orders_by column has only 2 distinct values — MOVING_AVG results may
look arbitrary within tied groups") — item 4's existing "orderBy is set"
validation is necessary but not sufficient; it can't catch a column that's
technically ordered but not meaningfully sequenced. Out of scope to build now
per instructions; flagging for a decision.
