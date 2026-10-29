# Decisions

Newest first. Entries marked `Source: inferred` were reconstructed from existing code; their "Why" is a guess and should be corrected by the author.

### 2026-10-29 — One date rule: calendar strings from parts, never through `toISOString` (`src/shared/utils/dates.ts`)
- **Decision:** Dates are stored as calendar strings, `"YYYY-MM-DD"` or `"YYYY-MM-DDTHH:mm[:ss]"` when the source has a time. They are parsed by matching the string and reading its year/month/day/time parts. Grouping (year/quarter/month/ISO week/day via `periodKey`), sorting (`compareCells`: query ORDER BY, table sort, window ORDER BY), min/max metadata, date-range and global filters, chart date axes (`d3.scaleUtc` + `utcFormat` over `dateKeyMs`, which also orders period keys like "2008-Q1"), `sortAxisKeys`, forecast labels (`stepDateKey`), formula YEAR/MONTH/DAY/DATEADD/DATEDIFF, calculated-column date typing and the chart's type fallback all read the parts. ISO weeks use UTC arithmetic on the parts. A trailing "Z"/UTC offset is ignored and the wall-clock time is kept as written. Fractional seconds are dropped. A year on its own ("2019") is not a calendar date any more.
- **Why:** Audit A4. `Date.parse("January 1, 2008")` is local midnight, and `toISOString()` of that is 2007-12-31 anywhere east of UTC (all Netflix/Play Store dates were a day early in IST). Grouping then read "YYYY-MM-DD" as UTC midnight with local getters, which moved dates back a day west of UTC. Both zones got Netflix year 2007 = 1, 2008 = 1 where pandas gives 0 and 2. Parts have no time zone, so there is nothing to shift.
- **Alternatives considered:** Store UTC-midnight `Date`s / epoch numbers — rejected: every consumer would have to remember to use UTC getters, which is the bug class we had. date-fns `parse` — rejected: it builds local `Date`s. A Temporal polyfill — rejected as a large dependency for string arithmetic.
- **Tradeoff accepted:** Time zones in the source are discarded (a "…Z" timestamp shows its UTC wall clock, not the viewer's). Pivot row/column ordering still uses `localeCompare`, which orders canonical strings correctly but isn't routed through the module. App timestamps (PDF "Generated", dashboard/snapshot created/updated, `Date.now()` ids, `optimizer/hash.ts`) and filter-state validation (`validators.ts` `Date.parse`) are instants or validation, not dataset values, and are unchanged. `NOW()` now returns the local wall clock in the stored form ("2026-10-29T14:05:00") instead of a UTC ISO instant, so `YEAR(NOW())` agrees with the user's calendar.
- **Source:** `made-now`

### 2026-10-29 — Date formats and day/month order are decided per column
- **Decision:** Accepted: year-first (`-`, `/`, `.`), numeric D/M with a 4-digit year (`/`, `-`, `.`), `D-Mon-YY`, `D-Mon-YYYY`, `D Month YYYY`, `Month D, YYYY`, each with an optional time (24h or AM/PM). Each value is matched by its own pattern, so a column may mix formats. For numeric D/M values only (year-first and month-name values don't vote): any first field > 12 → day-first; any second field > 12 → month-first; both → the column is `ambiguous-mixed` and stays text (`ColumnMetadata.dateAmbiguity`); neither → the browser locale (`localeDayFirst`, read from `Intl.DateTimeFormat(navigator.language)`; en-IN/en-GB day-first, en-US month-first). The decision is stored as `dayFirst` + `dayFirstSource` (`data` / `locale` / `user`) and `detectedFormat` lists the formats seen, most common first. Two-digit years (month-name forms only) follow strptime `%y`: 00–68 → 2000s, 69–99 → 1900s. The date vote runs before the leading-zero rule, so "05/06/2024" no longer forces a column to text. The 80% threshold is unchanged. `processRawData(rows, name, { dayFirstDefault })` makes the locale injectable for tests.
- **Why:** Audit B ("Ambiguous dates") product decision: infer from the column, fall back to the locale, offer a toggle. Lab's "03/16/2021" and "24-Feb-21" now parse; the only type changes across all 6 local CSVs are Lab `signout_date` and `creation_date` (categorical → date, 92.6% and 96.0% valid).
- **Alternatives considered:** Two-digit numeric years ("05/06/24") — rejected: version strings like "1.0.19" and codes would start parsing as dates. Letting "2023/13/01" vote — rejected: its first field (2023) and second (13) are both > 12 and would make Lab ambiguous-mixed.
- **Tradeoff accepted:** "05/06/24" stays text. An undecidable column follows whoever opened it first: the same file imported on an en-US and an en-IN machine reads differently until someone uses the toggle.
- **Source:** `made-now`

### 2026-10-29 — Invalid dates stay as text, are counted, and are outside every date operation
- **Decision:** In a date column, a value that isn't a valid calendar date (month 13, Feb 30, day 0, "invalid", "NaN", "ERROR") keeps its original text in the cell, is counted in `ColumnMetadata.invalidDateCount` (shown on the column badge as "· N invalid"), and is ignored by grouping, min/max, sorting (sorts after dates), charts and filters. No rollover: `2023-02-30` is rejected, not turned into March 2. An active date-range filter now excludes rows whose date is invalid (it used to keep them).
- **Why:** Audit B: "null plus an invalid-count badge, no rollover". Keeping the text, like batch 4a did for numbers, leaves `missingValueCount` unchanged and lets the user see the bad value.
- **Alternatives considered:** Nulling invalid cells at ingest — rejected: changes missing counts and hides the value.
- **Tradeoff accepted:** Invalid strings sit in a date-typed column; any new consumer must read dates through `parseStoredDate`/`calendarDay`, never `String(cell)`.
- **Source:** `made-now`

### 2026-10-29 — Day/month toggle re-reads kept original text (`Dataset.dateSourceValues`)
- **Decision:** For date columns that contain numeric D/M values, ingest keeps the original text per row in `dataset.dateSourceValues[column]`. The DataTable column badge opens a popover (format, range, invalid count, order and where it came from) with "Read as month/day / day/month", which calls `datasetStore.setDateDayFirst` → `parsingService.reparseDateColumn` through `applyActiveDatasetUpdate` (caches, calculated and window columns refresh). The column's metadata is recomputed and `dayFirstSource` becomes `user`. Replacing data carries the new file's source values (old ones would misalign).
- **Why:** The stored calendar string can't be swapped back safely: a day-first-only value becomes invalid, and in mixed columns only some cells came from the numeric pattern.
- **Alternatives considered:** Swapping month and day on the stored strings — rejected for the reason above. Reusing the type-override UI — it only covers numeric↔categorical; the popover sits on the same badge to keep it minimal until the redesign.
- **Tradeoff accepted:** Extra storage (one string per row) only for those columns. Datasets imported before this version have no source text, so the popover asks for a re-import instead.
- **Source:** `made-now`

### 2026-10-29 — Saved datasets with shifted dates get a re-import notice, not a migration
- **Decision:** New imports carry `metadata.dateParserVersion = 2` (`parsingService.DATE_PARSER_VERSION`). A dataset without it that has a date column shows a one-time notice at the top of the Data view ("Re-import file" / "Dismiss"); dismissing sets `metadata.dateReimportNoticeDismissed`, persisted through the normal IndexedDB subscriber.
- **Why:** Nothing keeps the original text: `processRawData` overwrote each date cell with the shifted `toISOString` day and Dexie stores the `Dataset` as is. Undoing the shift isn't possible either: whether a cell moved depended on the importing machine's zone and on its source format (ISO values didn't move).
- **Alternatives considered:** Shifting stored dates +1 day — rejected, it would corrupt datasets imported in UTC/west zones or from ISO sources.
- **Tradeoff accepted:** Users must re-import to fix old datasets; old text columns that would now be dates (Lab) get no notice.
- **Source:** `made-now`

### 2026-10-29 — XLSX dates from serial + number format, not `cellDates`
- **Decision:** `src/features/upload/lib/xlsxDates.ts:readWorkbookWithCalendarDates` reads with `cellNF: true`. Each numeric cell whose format `XLSX.SSF.is_date` accepts is converted with `XLSX.SSF.parse_date_code` (whole days, honouring `Workbook.WBProps.date1904`) plus rounded seconds from the fraction, then rewritten as a calendar string before `sheet_to_json`. Used by FileUpload and the DataTable "replace data" input. Times are kept (seconds when the format shows them or they're non-zero). Excel's fake 1900-02-29 stays a number.
- **Why:** Audit A9: without date handling, InvoiceDate came in as 40148.32 and was typed numeric. `cellDates` would produce local-time JS `Date`s, which `String()` turns into "Tue Dec 01 2009 … GMT+0530" and which are zone-sensitive in SheetJS itself.
- **Alternatives considered:** `cellDates: true` — rejected for the reason above. Putting the helper in `src/shared/services` — rejected: it would pull xlsx into the `engine-core` chunk; it lives next to the upload UI, and the build shows xlsx only in `vendor-export` with no new chunk cycle.
- **Tradeoff accepted:** Only the first sheet is imported and header naming still comes from `sheet_to_json` (later batches).
- **Source:** `made-now`

### 2026-10-29 — Line/area charts draw gaps for blank or non-numeric values
- **Decision:** `chartAggregation.ts:lineSeries` keeps rows whose y isn't a valid number (`toNumberOrNull`) with `y = null`; line, area and the area's stroke use `.defined(p => p.y !== null)`, null points get no dot, and the y domain uses valid values only. With an aggregation, a group with no valid numbers is null (`aggregateValuesOrNull`) instead of the 0 an empty sum/avg returns; counts stay numbers. `aggregateRows` (batch 4a's shared rule) is unchanged.
- **Why:** Item 0 left over from 4a: `Number(cell)` plotted blanks as 0, and filtering null rows out silently joined the line across them.
- **Alternatives considered:** Dropping the rows — rejected, it joins the neighbours and hides the hole.
- **Tradeoff accepted:** A single valid point between two gaps shows as a dot with no line segment.
- **Source:** `made-now`

### 2026-10-29 — Date tests run under three time zones in CI (`npm run test:tz`)
- **Decision:** Date tests live in `*.tz.test.ts` files (dates module, ingest/query/filter/window/forecast/formula, chart line series, XLSX) plus `golden.messy.test.ts`. `npm run test:tz` runs them under `TZ=Asia/Kolkata`, `America/New_York` and `UTC`, stopping at the first failure. CI runs it right after the unit tests. A sanity test checks the runtime actually uses the requested zone, so a run where `TZ` didn't apply can't pass vacuously. `generate_messy_golden.py` now also writes `dateStats` (pandas `to_datetime` with an explicit format per column: valid/invalid/missing counts, min, max, per-year counts) for Netflix `date_added`, Play Store `Last Updated` and Cafe `Transaction Date`; regenerating only added those keys.
- **Why:** The shift bug only appears in some zones; a single-zone run can't catch it.
- **Alternatives considered:** Selecting files by the substring "date" — rejected, it matches "update". Mocking time zones inside tests — rejected, Node reads `TZ` once at start.
- **Tradeoff accepted:** About three extra short vitest runs per CI push. The year-boundary Netflix rows (2008) aren't in the 64-row fixture, so 2007 = 0 / 2008 = 2 is checked with those two values inline and on the full local file.
- **Source:** `made-now`

### 2026-10-28 — One numeric rule for every aggregation (`src/shared/utils/numeric.ts`)
- **Decision:** `toNumberOrNull` is the only cell → number conversion for aggregations: statsEngine (descriptive, outliers, correlation), queryEngine (`aggregateRows`, used by `computeAggregations`, group-by, KPI cards, pivot), chart `aggregateValues` (now delegates to `aggregateRows`), Overview (`DashboardSummary`), DataTable column stats, PDF export summary, window functions, advanced aggregations (`aggregations/core.ts`), anomaly detector mean, forecasting input, gauge plugin, and filter comparisons (`toComparableNumber`). A finite JS number, or a string that after ASCII trimming matches `^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`, is a number. Everything else — blanks, null tokens ("", n/a, na, nan, null, none, #n/a, -, undefined; case-insensitive), junk, hex, Infinity, currency, thousands separators, booleans — is null and excluded. Never 0. Loop-based `minMax`/`sum`/`sampleVariance` live in the same module so engines agree to the bit.
- **Why:** The audit found three different means for one column (charts counted junk and blanks as 0; queryEngine counted blanks as 0 via `Number(null)`; Overview's sum was average × a count that included junk). One function removes the room for drift.
- **Alternatives considered:** Turning null tokens into null at ingest (`cleanValue`) — rejected: it changes missing counts and the type-vote denominator, which is type-inference scope (a later batch). Per-engine fixes — rejected, that is how they drifted apart.
- **Tradeoff accepted:** "NaN"/"-"/"none" cells stay in the data as text (they show in the table and count as non-missing in column metadata) but are excluded from every number. Persisted datasets keep any value an older version converted with `Number()` (e.g. "0x1A" stored as 26); re-upload to re-parse.
- **Source:** `made-now`

### 2026-10-28 — Strict number parsing at ingest and in the type vote
- **Decision:** `processRawData` converts a cell to a number with the same strict parser (`parseStrictNumber`), and `detectColumnType`'s numeric vote uses it too. The 80% threshold and every other type rule are unchanged.
- **Why:** Ingest and aggregation must agree on what a number is; `Number()` accepted "0x1A" (26), "Infinity" and Unicode-whitespace-padded values.
- **Alternatives considered:** Strict only at aggregation — rejected, a column of hex strings would be typed numeric but every value would aggregate to null.
- **Tradeoff accepted:** A value with a non-breaking space next to the digits ("12\u00a0") is now text, not 12. Checked on all 6 local audit CSVs and the HR fixture: no column changed type or name.
- **Source:** `made-now`

### 2026-10-28 — Sample (n − 1) variance and std everywhere
- **Decision:** statsEngine, queryEngine/KPI/pivot, charts and z-score outliers all use the sample variance/std (`numeric.ts:sampleVariance`). Labels read "Variance (sample)" and "Std. deviation (sample)". With n < 2 the value is 0, not NaN. Skewness and kurtosis keep their population-moment definitions (they use the population std internally). `generate_hr_golden.py` moved to `ddof=1`; regenerating changed the three variances/std values and no z-score outlier counts.
- **Why:** User decision "A" on audit A11: the same column showed different std on the Stats page (population) and in charts (sample, d3). Sample matches pandas, Excel STDEV.S and what analysts expect.
- **Alternatives considered:** Population everywhere — rejected by the user. Keeping both with a toggle — not asked for.
- **Tradeoff accepted:** Every std/variance the app shows moved slightly (e.g. Cafe Total Spent 6.009603 → 6.009919).
- **Source:** `made-now`

### 2026-10-28 — `count` counts valid numbers; new explicit `count_rows`
- **Decision:** `count` on an (effective) numeric column counts its valid numbers; on any other column it counts non-blank cells (pivot counts of categories keep working). New operator `count_rows` counts every row and is offered as "Count of rows" in KPI and Pivot builders and the LLM query schema. Charts label `count` as "Count of <column>" and `count_rows` as "Count of rows". The type set comes from `queryEngine.numericColumnSet(dataset)` (honours user type overrides) and is passed to `computeAggregations`, group-by, pivot and chart `aggregateValues`.
- **Why:** The user's rule: "count of a column = count of valid numbers; Count of rows stays separate and explicitly named". A blanket valid-number count would have turned every pivot count of a text column into 0.
- **Alternatives considered:** Type-free `count` = valid numbers always — rejected for the pivot reason above. Inferring "numeric" from the slice's values — rejected, it would flip per group.
- **Tradeoff accepted:** Saved charts/KPIs with `count` change meaning on numeric columns (a chart that showed row counts now shows valid-number counts; switch to "Count of rows" to get the old value). ChartBuilder has no aggregation picker, so `count_rows` reaches charts only via AI queries and saved configs.
- **Source:** `made-now`

### 2026-10-28 — Overview and DataTable stats computed from rows, no metadata shortcut
- **Decision:** `DashboardSummary` and `DataTable` column stats (and the PDF export summary) call `stats/columnSummary.ts:summarizeNumericColumns` on the rows shown. The unfiltered fast path that read `metadata.average` and `rowCount − missingValueCount` is gone.
- **Why:** Metadata has no valid-number count, so the shortcut counted junk strings and its sum (average × count) was wrong (Cafe Total Spent 87,699.61 vs 84,763.5). It would also have kept stale numbers for datasets already in IndexedDB.
- **Alternatives considered:** Adding `validNumericCount`/`numericSum` to `ColumnMetadata` with a load-time backfill — rejected, two code paths to keep in agreement plus a migration, for a loop that costs ~tens of ms on 1M rows.
- **Tradeoff accepted:** One O(rows × numeric columns) pass per change of the shown rows, instead of a metadata read.
- **Source:** `made-now`

### 2026-10-28 — One shared CSV parse path with pandas header names
- **Decision:** `src/shared/services/csvParse.ts` (`parseCsvFile` / `parseCsvText`) runs Papa with `header: false`, strips a BOM, names headers with `parsingService.ts:normalizeHeaders` (pandas C-parser rule: blank → "Unnamed: <i>", repeats → "Name.1", "Name.2", skipping suffixes already in the file) and builds the records itself. FileUpload, DataTable "replace data", and both golden suites use it. `processRawData` no longer drops blank header keys (that re-indexed every later column onto the wrong name); it names them the same way. Field-count mismatches are still reported (`TooFewFields`/`TooManyFields`); a short row's missing cells become null, extra fields are dropped.
- **Why:** Audit A10 (highest severity): pandas' default `df.to_csv()` writes a blank first header, which shifted every column. Papa's header mode had already keyed blanks as "" and renamed duplicates "Name_1" before `processRawData` ran, so the fix had to own the header row.
- **Alternatives considered:** A stateful `transformHeader` — rejected, Papa calls it from two places (parser and streamer), so dedup state would double-apply. Fixing only `processRawData` — rejected, it can't produce "Name.1".
- **Tradeoff accepted:** Duplicate columns are now named "Name.1" instead of "Name_2" (saved charts on a re-uploaded file with duplicate headers would need re-pointing). XLSX import still uses `sheet_to_json` keys ("__EMPTY") — XLSX is a later batch.
- **Source:** `made-now`

### 2026-10-28 — Trimming removes ASCII whitespace only
- **Decision:** `cleanValue` and header trimming use `numeric.ts:trimAscii` (space, \t, \n, \v, \f, \r) instead of `String.prototype.trim`.
- **Why:** Audit A20: `.trim()` silently stripped non-breaking spaces that are part of the value (Netflix "Consequences\u00a0").
- **Alternatives considered:** None worth keeping; `.trim()` also strips U+FEFF, so the BOM is now stripped explicitly in `csvParse.ts`.
- **Tradeoff accepted:** Values padded with NBSP/em spaces keep them, so they don't match their unpadded twins in filters and group-by.
- **Source:** `made-now`

### 2026-10-28 — Messy-data golden fixtures with their own pandas oracle
- **Decision:** `tests/fixtures/messy/{cafe,playstore,netflix,glassdoor}.csv` (byte-exact subsets, rows from the audit's section C; licences in `tests/fixtures/README.md`; `.gitattributes` keeps them `-text`). `scripts/golden/generate_messy_golden.py` (`npm run golden:regen-messy`) re-implements the numeric rule in Python (reads `dtype=str, keep_default_na=False`) and writes `messy.golden.json`. `golden.messy.test.ts` loads each file through `parseCsvText` → `processRawData` and checks row/column counts, header names, the expected numeric-column set, and that statsEngine (full and filtered path), queryEngine/KPI, chart `aggregateValues`, Overview (`summarizeNumericColumns`) and group-by totals all equal the oracle. Glassdoor Rating/Founded (-1 sentinels) and Play Store Rating (shifted row 10473) are only checked for engine-vs-engine agreement; their oracle check, "$" prices and dates are `it.todo`.
- **Why:** The HR fixture is clean, so it couldn't catch the junk/blank bugs. A separate script keeps the HR oracle unchanged in purpose.
- **Alternatives considered:** Extending `generate_hr_golden.py` — rejected, different inputs and rules. Including the Lab file — rejected, licence unknown.
- **Tradeoff accepted:** The oracle JSON encodes the current rule, including -1 sentinels and the shifted row; the suite deliberately doesn't compare those three columns with it until the later batches. Play Store `Price` is categorical in this subset (it oversamples "$" prices), so it isn't checked as numeric.
- **Source:** `made-now`

### 2026-10-28 — e2e suite runs in CI before the build
- **Decision:** `deploy.yml` runs `npm run test:e2e` right after the unit tests. The Playwright Chromium install moved up to run before it; the production smoke gate still runs after the build.
- **Why:** The e2e suite had rotted (3 of 5 failing) because nothing ran it. Running it before the build fails fast without building a deploy artifact.
- **Alternatives considered:** A separate parallel job — rejected for now, it would repeat `npm ci` and the browser install, and the deploy job would need a `needs:` dependency anyway. Running it against `vite preview` (prod build) — rejected, the smoke gate already covers the prod bundle and the specs are written against the dev server config.
- **Tradeoff accepted:** About 1.5–2 min more per push (17 tests in 106s locally with `CI=1`: 1 worker, dev server start included).
- **Source:** `made-now`

### 2026-10-28 — Golden numeric tests use a pandas oracle and a committed JSON file
- **Note:** The "population variance" convention below is superseded by "Sample (n − 1) variance and std everywhere".
- **Decision:** `scripts/golden/generate_hr_golden.py` (pandas, pinned in `scripts/golden/requirements.txt`) computes expected values for `tests/fixtures/hr-attrition.csv` into `tests/fixtures/hr-attrition.golden.json`. `golden.hrAttrition.test.ts` loads the CSV through PapaParse + `processRawData` (the upload path) and checks queryEngine, pivotEngine, statsEngine and windowEngine against it. Floats use `|a−b| ≤ 1e-9·max(1,|a|,|b|)`; counts and ranks must match exactly. `npm run golden:regen` reruns the script.
- **Why:** The oracle must not share code with the engines under test. Committing the JSON keeps Python out of CI.
- **Alternatives considered:** Hand-computed expected values — rejected, they can't cover 1,470 rows. A JS reference implementation — rejected, not independent. Pure relative tolerance — rejected, it fails when the expected value is 0.
- **Tradeoff accepted:** Regenerating needs Python with pandas. The oracle matches the app's conventions on purpose (population variance, linear quantiles, original-row-order ROW_NUMBER ties, peer-inclusive running total), so the suite catches regressions and arithmetic bugs but doesn't question those conventions.
- **Source:** `made-now`

### 2026-10-28 — Icon controls get an invisible 24px / 44px (touch) pointer target
- **Decision:** `Hint` adds a `hit-area` class (in `src/index.css`, `@layer components`): an invisible `::before` centred on the control, at least 24×24px, or 44×44px under `@media (pointer: coarse)`. Where controls sit side by side (pivot up/down/remove, KPI edit/remove, chart card Expand/Delete in `ChartGrid` and `DashboardGrid`), the gap widens on touch screens so the 44px targets don't overlap. Pivot cards get extra right padding on touch so the scroll viewport doesn't clip the targets. The saved-view delete button (inside a `DropdownMenuItem`, and deleting immediately) becomes a real 44px button on touch, so its target can't spill over neighbouring views. `TooltipProvider` `delayDuration` stays at 200ms.
- **Why:** Meets WCAG 2.5.8 without changing how anything looks. The control and its icon keep their size and layout. Putting it in `Hint` covers every icon-only control in one place.
- **Alternatives considered:** Padding with negative margin, or a real `min-w-6 min-h-6` — rejected, either one grows the hover background and changes chip and row heights. Raising the delay to 300ms — rejected, the prompt asked for ~300ms only if the delay was higher, and it was already lower.
- **Tradeoff accepted:** `boundingBox()` doesn't include `::before`, so the e2e test measures the target as element ∪ `::before` and hit-tests its corners. A clipping ancestor (overflow hidden, scroll viewport) can still cut the target short; the pivot cards needed padding for that reason.
- **Source:** `made-now`

### 2026-10-28 — Disabled icon controls use `aria-disabled` inside `Hint`
- **Decision:** When `Hint`'s child has `disabled`, `Hint` renders it with `aria-disabled="true"` instead, blocks `onClick`, and dims it with `opacity-50 cursor-not-allowed`. A new `disabledReason` prop is appended to the tooltip, e.g. "Undo last change — nothing to undo yet".
- **Why:** Every disabled control `Hint` wraps today is a plain `Button` (Undo/Redo, pivot move up/down), so blocking `onClick` is enough. Enter and Space on a button also fire `click`. With `aria-disabled` the control stays in the tab order, screen readers announce it as dimmed, and the tooltip opens on both hover and focus. There is no extra element to break flex layouts or `asChild` composition.
- **Alternatives considered:** Wrapping the disabled child in a focusable `<span>` (the Radix-documented pattern) — rejected, it adds an unlabelled tab stop with no role, and a wrapper element can break the parent's flex/gap and hover-group styling.
- **Tradeoff accepted:** If a disableable Radix trigger is ever wrapped in `Hint`, the pointerdown/keydown it opens on would also need blocking (today none is). Hover background styles still apply to an `aria-disabled` button.
- **Source:** `made-now`

### 2026-10-28 — Chart axis/tooltip labels name the aggregation; numeric/date X keys sorted
- **Note:** `count` labelled "Count of rows" and `aggregateValues` "same behaviour" are superseded by "`count` counts valid numbers; new explicit `count_rows`" and "One numeric rule for every aggregation".
- **Decision:** New `src/features/charts/lib/chartAggregation.ts`: `chartYValueLabel` / `aggregationLabel` ("Sum of Education", "Average of …", "Count of rows"), `aggregateValues` (moved out of `ChartVisualization`, same behaviour), and `sortAxisKeys` (numeric ascending, dates chronological, categorical unchanged). Bar, line and area Y axes, every chart's SVG `<title>` tooltip, and the screen-reader summary use them. The histogram's Y label "Frequency" became "Count of rows". The heatmap's x/y sort is numeric or chronological for those types and stays alphabetical for categories. The non-functional `title` attributes on SVG shapes were replaced with `<title>` children.
- **Why:** A bar chart of Age × Education showed "Education" while plotting SUM per age, and bars came out in first-appearance order (41, 49, 37…). Pure helpers can be unit-tested under Vitest's node environment.
- **Alternatives considered:** A sort option in ChartBuilder — not added. Neither `ChartConfig` nor the builder has one, and the request said to respect it only if one existed.
- **Tradeoff accepted:** Line/area charts without an aggregation still plot raw rows under the plain column name, and their categorical order stays alphabetical. `sum_if`/`count_if`/`weighted_average`/`percentile` are labelled "Sum of …" because the chart computes a sum for them.
- **Source:** `made-now`

### 2026-10-28 — Expanded chart view re-renders via `fitHeight`, using Radix Dialog
- **Decision:** Add an opt-in `fitHeight` prop to `ChartVisualization` that measures the plot area's height (ResizeObserver) and draws at it, instead of the fixed 300px viewBox height. The full-screen viewer (`ChartExpandButton`) is a Radix `Dialog` that mounts a second `ChartVisualization chart={...} fitHeight`. The Charts view grid (`ChartGrid`) also uses `fitHeight` with a definite card height (`clamp(360px, 60vh, 600px)`) and one chart per row below `2xl`.
- **Why:** With a fixed viewBox, a bigger container only scales the drawing up (fonts and strokes included). Redrawing at the real size keeps axes and labels legible and hit areas correct. Radix Dialog already provides the focus trap, Esc/backdrop/close dismissal and focus return to the trigger, so none of that is hand-rolled.
- **Alternatives considered:** Making every chart fit its container's height — rejected for now. Containers with auto height (e.g. the Export panel's off-screen render) would make the measured height follow the SVG's own size; opt-in keeps current behaviour everywhere else. CSS-scaling the existing SVG into the modal — rejected, it is the scaled-bitmap look the request rules out. A separate fullscreen route — rejected as heavier than a dialog.
- **Tradeoff accepted:** While the modal is open there are two mounted instances with the same `data-chart-id`. `exportUtils` takes the first match in DOM order, which is the in-page one (the dialog portals to the end of `<body>`). Dashboard grid cards (react-grid-layout) still use the fixed height.
- **Source:** `made-now`

### 2026-10-28 — Single shared tooltip wrapper `Hint` for icon-only controls
- **Note:** Tradeoff "disabled buttons do not show a tooltip" superseded by "Disabled icon controls use `aria-disabled` inside `Hint`".
- **Decision:** All icon-only controls use `src/shared/components/Hint.tsx`, which wraps the existing shadcn/Radix tooltip, sets the control's `aria-label` from the same text, and appends a platform-formatted shortcut (`src/shared/lib/platform.ts`, now also the source of `modKey` for `commandRegistry`). Hover-revealed controls (`opacity-0 group-hover:opacity-100`) are only hidden on devices that can hover (`[@media(hover:hover)]:`). The mobile section menu and the chart Expand button show visible text on small/touch screens.
- **Why:** One place to restyle for the upcoming redesign. The label and aria-label can't drift apart. Radix opens tooltips on keyboard focus as well as hover. Touch users get the aria-label and visible text instead.
- **Alternatives considered:** An `IconButton` component that owns the button too — rejected, many icon controls are Radix triggers (`DropdownMenuTrigger`, `DialogTrigger`) that need `asChild` composition; a wrapper composes with all of them. Native `title` attributes — rejected, they don't appear on keyboard focus and can't show shortcuts consistently.
- **Tradeoff accepted:** Disabled buttons (e.g. Undo with empty history) do not show a tooltip, because disabled elements get no pointer/focus events; their aria-label is still set.
- **Source:** `made-now`

### 2026-10-28 — `VIEW_TYPES` const array as single source for views
- **Decision:** `src/store/viewTypes.ts` exports `VIEW_TYPES` (as const), `ViewType` derived from it, and `isViewType`. `uiStore` re-exports the type, and `isValidUIState` uses `isViewType` instead of its own list.
- **Why:** The validator's hardcoded list had drifted (missing `pivot`, `stats`, `window-builder`), so those views were rejected when restoring from IndexedDB. A TS union has no runtime value to check against, so the array has to be the source.
- **Alternatives considered:** Keeping the union and adding a test that compares it to the validator's list — rejected, that still leaves two lists to keep in sync.
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-28 — e2e tests seed "tour seen" via a shared helper
- **Decision:** `tests/e2e/helpers.ts:startFreshSessionWithoutTour` clears storage and marks the onboarding tour and welcome dialog as seen, matching what `global-filter-bar-regression.spec.ts` already did inline. `dashboard.spec.ts` now uses it, and three stale assertions in it were corrected (dataset name has no `.csv`; wait for sample load before navigating, because `uploadDataset` forces Overview after its 1s delay; Export heading is "Export Dashboard").
- **Why:** 3 of 5 e2e tests were failing before this change because the Joyride overlay intercepted clicks. The stale assertions behind it were never reached.
- **Alternatives considered:** Disabling the tour in test builds via an env flag — rejected, it changes app code for test convenience.
- **Tradeoff accepted:** The tour itself has no e2e coverage.
- **Source:** `made-now`

### 2026-10-28 — Type check gate in CI (`npm run typecheck`), strict still off
- **Decision:** Fix all 44 `tsc --noEmit -p tsconfig.app.json` errors, add `"typecheck"` script, and run it in `deploy.yml` right after Lint. `strict` stays `false`.
- **Why:** `vite build` uses SWC and never type-checks, so type errors (including ones hiding real bugs: malformed built-in template KPIs, KPI columns missing from extracted template schemas) shipped unnoticed.
- **Alternatives considered:** Turning on `strict` in the same change — rejected, separate decision with a much larger blast radius. Running `tsc -b` on the root config — rejected, `tsconfig.app.json` is the app's real compile unit.
- **Tradeoff accepted:** Adds ~10–20s to CI. Test files under `src/` are type-checked too, so test fixtures must keep up with type changes.
- **Source:** `made-now`

### 2026-10-28 — `lib` bumped from ES2020 to ES2021 in tsconfig.app.json
- **Decision:** `lib: ["ES2021", "DOM", "DOM.Iterable"]`; `target` unchanged (ES2020).
- **Why:** The SUBSTITUTE formula uses `String.prototype.replaceAll`, which already works in every browser the app supports; only the type declarations were missing.
- **Alternatives considered:** Rewriting with `split().join()` — rejected, differs from `replaceAll` for an empty search string (a runtime change for a type-only problem).
- **Tradeoff accepted:** Other ES2021 APIs now type-check without a polyfill; acceptable since no polyfills are used and supported browsers have them.
- **Source:** `made-now`

### 2026-10-28 — Template store persist version 2 with migration for built-in templates
- **Decision:** Fix the built-in "Sales & Revenue Overview" template's KPIs to the real `KPICardConfig` shape (`primaryMetric`, `sparkline`, `datasetId`) and bump the `datavista-dashboard-templates` persist version to 2; `migrateTemplateState` replaces persisted copies of built-in templates (matched by id) with the current definition and leaves user templates untouched.
- **Why:** The template had always been persisted to localStorage, so fixing the source constant alone would not repair existing users' stored copy, which crashes every KPI card it creates.
- **Alternatives considered:** Field-level rewriting of any `metricColumn` KPI — rejected, only built-in templates ever had that shape (user templates come from `extractTemplate` over real KPIs).
- **Tradeoff accepted:** A user who somehow edited a built-in template's persisted copy loses those edits (no UI exists for that today).
- **Source:** `made-now`

### 2026-10-28 — Dexie `dashboards` table typed as `Dashboard`; `DashboardConfig` removed
- **Decision:** Replace the stale `DashboardConfig` interface in `src/shared/lib/db.ts` with the app's real `Dashboard` type.
- **Why:** The store always wrote full `Dashboard` objects; `DashboardConfig` (id/name/layout/chartIds) never matched what was stored, causing 4 type errors and hiding fields like `datasetId`/`settings` that hydration reads. No schema/index change, so no Dexie version bump.
- **Alternatives considered:** Keeping both types and mapping between them — rejected, no runtime difference exists to map.
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-28 — Production smoke gate in CI (Playwright against `vite preview`)
- **Decision:** Add `playwright.prod.config.ts` + `tests/smoke/prod-boot.spec.ts`, run in `deploy.yml` after "Build Artifact" and before "Upload Artifact". The test boots the built `dist/` via `vite preview` on :4173 under `/datavista/`, requires the sidebar (`data-testid="sidebar"`) and "DataVista" title to render, and fails on any `pageerror` or `console.error`.
- **Why:** The vendor-react ⇄ engine-core TDZ blank page only reproduces in the production bundle; unit tests and `vite build` pass on a broken build. Verified: removing the `commonjsHelpers` manualChunks rule makes this test fail with `ReferenceError: Cannot access 'qe' before initialization`; restoring it makes it pass.
- **Alternatives considered:** Reusing the existing e2e config — rejected, it runs against the dev server, which does not chunk and cannot hit the bug. A Node-side static chunk-cycle check — rejected as narrower (only catches cycles, not other boot crashes).
- **Tradeoff accepted:** CI installs Chromium on every deploy (extra ~1 min). Errors are checked before shell visibility so a boot crash reports the real exception, at the cost of a 15s wait on failure. Zero-tolerance for `console.error` means a future noisy-but-harmless error will block deploys until fixed or explicitly allowed.
- **Source:** `made-now`

### 2026-10-28 — Pin Rollup's CJS helper to the vendor-react chunk
- **Decision:** In `vite.config.ts` `manualChunks`, route the `\0commonjsHelpers.js` virtual module to `vendor-react`.
- **Why:** Unassigned, Rollup placed the helper in `engine-core` (dexie, a CJS dependency pulled in by `src/shared/services/`, also needs it). `vendor-react` (react/react-dom are CJS) then imported `getDefaultExportFromCjs` from `engine-core`, while `engine-core` imported zustand's `create` from `vendor-react`. With the entry loading `vendor-react` first, `engine-core` evaluated before `vendor-react` finished, and `const useUiStore = create()(...)` threw a TDZ ReferenceError — blank page in production only (dev server does not chunk). After the fix `vendor-react` has zero imports, and no static chunk cycle remains.
- **Alternatives considered:** Breaking a source-level import cycle — rejected, there is none at runtime (madge only reports type-only cycles under `src/shared/types/`, which are erased). Dropping `manualChunks` entirely — rejected as more invasive (changes caching/split strategy). Routing every `\0`-prefixed virtual module — rejected, CJS proxy modules carry package paths and are already routed correctly; moving them could create new cross-chunk edges.
- **Tradeoff accepted:** Relies on the helper's internal id containing `commonjsHelpers`; a future Rollup rename would silently undo the fix, so a production-build smoke test in CI is the real guard.
- **Source:** `made-now`

### Custom manualChunks split (engine-core, vendor-react, vendor-viz, vendor-export, vendor-dates)
- **Decision:** Hand-assigned chunks for `src/shared/services/` and major vendor groups.
- **Why:** Likely: keep the heavy export libraries (xlsx/jsPDF/html2canvas) and the computation engine out of the main chunk and improve cache reuse across deploys.
- **Alternatives considered:** Rollup's default automatic chunking.
- **Tradeoff accepted:** Manual chunks can create cross-chunk cycles (see entry above).
- **Source:** `inferred`

### Vite + React 18 + TypeScript SPA, deployed to GitHub Pages under `/datavista/`
- **Decision:** Client-only SPA built with Vite (`@vitejs/plugin-react-swc`), `base` from `VITE_BASE_PATH` defaulting to `/datavista/`, deployed by `.github/workflows/deploy.yml`.
- **Why:** Likely: free static hosting with no backend needed for an offline-first tool.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** No server-side logic; all data processing and API calls happen in the browser.
- **Source:** `inferred`

### Zustand stores, some persisted to localStorage
- **Decision:** App state in Zustand stores (`src/store/`, `src/features/dashboards/store/`); `uiStore` uses `persist` (`datavista-ui-storage`) for preferences including the LLM API key.
- **Why:** Likely: minimal boilerplate compared with Redux, selector-based subscriptions.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** User-supplied API key sits in localStorage in plaintext.
- **Source:** `inferred`

### IndexedDB via Dexie for offline-first persistence
- **Decision:** `src/shared/lib/db.ts` defines a Dexie database; `src/shared/services/persistenceService.ts` hydrates stores from it on startup and writes back on store changes.
- **Why:** Likely: datasets are too large for localStorage, and the app is meant to work offline without a backend.
- **Alternatives considered:** localStorage only; a remote DB.
- **Tradeoff accepted:** Data is per-browser; no sync across devices.
- **Source:** `inferred`

### In-browser query/formula/stats engines
- **Decision:** Filtering, aggregation, pivot, window functions, formulas, forecasting and anomaly detection are implemented in TypeScript under `src/shared/services/`.
- **Why:** Likely: keep the app backend-free and fast on client-side datasets.
- **Alternatives considered:** Unknown (e.g. DuckDB-WASM, server compute).
- **Tradeoff accepted:** Bounded by browser memory/CPU.
- **Source:** `inferred`

### PapaParse + SheetJS for file import, D3 for charts, jsPDF/html2canvas for export
- **Decision:** CSV/TSV via `papaparse`, XLSX via `xlsx`, chart rendering via `d3`, PDF/image export via `jspdf` + `html2canvas`.
- **Why:** Likely: mature, widely used client-side libraries for each job.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** Large bundle contributions (hence the vendor-export chunk).
- **Source:** `inferred`

### Optional direct browser calls to LLM providers (Gemini default)
- **Decision:** `src/features/ai/llmService.ts:callLLM` calls the provider API directly from the browser using a user-supplied key.
- **Why:** Likely: no backend to proxy requests; users bring their own key.
- **Alternatives considered:** Server-side proxy.
- **Tradeoff accepted:** Key exposed to the browser; dataset content is sent to a third party when AI features are used.
- **Source:** `inferred`

### shadcn/ui (Radix) + Tailwind for UI
- **Decision:** UI primitives in `src/shared/components/ui/` built on Radix, styled with Tailwind (`components.json`, `tailwind.config.ts`).
- **Why:** Likely: scaffolded from a Lovable/shadcn template (package name `vite_react_shadcn_ts`, `lovable-tagger` dev plugin).
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** Component code owned and maintained in-repo.
- **Source:** `inferred`

### Vitest for unit tests, Playwright for e2e
- **Decision:** `vitest run` for unit tests (node env); Playwright specs in `tests/e2e/` against the dev server.
- **Why:** Likely: Vitest shares the Vite config; Playwright for real-browser flows.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** e2e runs against the dev server only, so production-bundle-only failures are not caught.
- **Source:** `inferred`
