# DataVista messy-data diagnostic (read-only)

Repo HEAD f44b173, clean before and after. Node 22.23.1, PapaParse 5.5.3, SheetJS 0.18.5, pandas (scratchpad venv) as oracle.
Harness: `scratchpad/harness/entry.ts` bundled with esbuild (`@` alias → repo `src`). It decodes with TextDecoder (same as the browser FileReader), then runs `Papa.parse` with FileUpload's exact options (`header:true, skipEmptyLines:'greedy'`), then `processRawData`, then `statsEngine.calculateDatasetStats` (full and non-full), `queryEngine.computeAggregations`, chart `aggregateValues`, and the DashboardSummary formula.
Runs: TZ=Asia/Kolkata (the user's zone) and TZ=America/New_York. Raw outputs are in `scratchpad/out/*.json`. Browser runs are in `scratchpad/bout/*` (JSON and screenshots).

## Files 1–5 vs the verified facts

| File | Rows/cols | Papa errors | Verdict |
|---|---|---|---|
| Cafe | 10,000 / 8 ✔ | 0 | Counts correct. Numbers vary by code path, see A1. |
| Lab | 10,000 / 15 ✔ | 0 | Counts correct. Both date columns stay text. Price is categorical. |
| Play Store | 10,841 / 13 ✔ | 1 (`TooFewFields`, data row 10,473) | The shifted row is accepted silently. Price mean is 0. |
| Netflix | 8,807 / 12 ✔ | 0 | Counts and blanks match. Every date is one day early in IST. |
| Glassdoor | 672 / 15 ✔ | 0 | Embedded newlines are handled correctly. The -1 sentinels go into the stats. |

Blank counts (DataVista missing = pandas): Netflix director 2634, cast 825, country 831, date_added 10, rating 4, duration 3. All exact.

### Per-file detail
**Cafe.** Quantity, Price Per Unit and Total Spent are typed numeric (96.5% numeric, over the 80% threshold). "ERROR"/"UNKNOWN" stay in the column as strings (Total Spent: 165 UNKNOWN, 164 ERROR) and blanks become null (173). Transaction Date is typed date, with 301 ERROR/UNKNOWN strings left in place. Item, Payment Method and Location keep ERROR/UNKNOWN as real category values.

| Total Spent | count | mean | min | std |
|---|---|---|---|---|
| pandas, junk and blanks excluded | 9,498 | **8.924352** | 1 | 6.009603 (ddof 0) |
| statsEngine (full and raw) | 9,498 | 8.924352 ✔ | 1 | 6.009603 ✔ |
| queryEngine.computeAggregations (KPI cards, filter group-by) | **9,827** | **8.764709** (blanks=0, junk dropped) | **0** | 6.071944 |
| chart aggregateValues (bar/line/pie) | **10,000** | **8.476350** (junk and blanks = 0) | **0** | 6.17 (ddof 1) |
| DashboardSummary, unfiltered | 9,827 | 8.924 | — | sum **87,699.61** vs true 84,763.5 |

The same column gives three different means. Quantity and Price Per Unit show the same pattern (full table below). Quantity × Price = Total on all 8,544 clean rows. 1,398 rows have exactly 2 of the 3 values and could be recovered.

**Lab.** `signout_date` and `creation_date` are categorical. Two rules cause this, and each would be enough on its own. (1) The leading-zero rule (`parsingService.ts:59`) matches "03/16/2021" and "08-Mar-21": 3,191 of 9,752 values. (2) Even with that rule removed, only 61.6% and 64.7% of values are recognised dates, which is under 80%. "DD-Mon-YY" fails the regex at `:27`, and "2023/13/01" (247 and 120 rows) gives `Date.parse` NaN, so it is correctly rejected. "invalid" and "NaN" stay as category values. `price` is categorical: 74.7% numeric is under 80%. It holds "ksh 9999" (1,603), "ksh 0" (321) and "NaN" (358), and plain numbers are stored as JS numbers inside a categorical column. Label variants are all kept as distinct categories: test_category has Hematology/Haematology, CYTOLOGY/Cytology, histology/Histology and IHC/Immunohistochemistry/Immunohistochem; receiving_centers has "lab a"/"Lab A"; processing_centers has "central lab"/"Central Lab"; service has routine/Routine. "Unknown" (994–1,658 per column) is a real category value. Only "N/A" is treated as null. "NaN" is not.

**Play Store.** Data row 10,473 is flagged by Papa as `TooFewFields` but only goes to `console.warn` (`FileUpload.tsx:57-58`). `parsingStatistics.errorCount` is hardcoded to 0 (`parsingService.ts:345`). The row is loaded with Rating=19, so Rating max = 19. Rating is typed numeric with 1,474 "NaN" strings: stats mean 4.193338 matches pandas excluding NaN, but the pandas mean that also drops the shifted row is 4.191757. The chart avg is **3.623** because NaN counts as 0. Price is typed **numeric** (92.6% are "0"), so all 800 "$x.xx" values are excluded and mean/min/max/sum are all **0**. The pandas mean after stripping "$" is 1.027368, max 400. Reviews: "3.0M" is excluded. Size and Installs stay categorical text. Last Updated is typed date, and **every value is shifted one day earlier in IST** ("January 15, 2018" becomes 2018-01-14). It is correct in New York. The 483 exact duplicate rows and 1,181 repeated names load without any notice. The one mojibake cell (row 7,141, "opciÃ³n") is already in the source file, not introduced by DataVista. No U+FFFD characters.

**Netflix.** Quoted commas and multi-value cells parse correctly. date_added is typed date and all 8,797 values are one day early in IST, so "January 1, 2008" becomes 2007-12-31 (earliest shows 2007-12-31) and year buckets are wrong. Rows s5542, s5795 and s5814 ("74 min" in rating) are accepted silently and become rating categories. Non-ASCII: 222 vs the expected 223. The difference is `"Consequences "`: `cleanValue`'s `.trim()` strips a trailing NBSP (`parsingService.ts:8`). No mojibake. 13 numeric titles ("1922", "46") are stored as numbers in a text column.

**Glassdoor.** 672 rows ✔. Company Name newlines are kept (622 cells contain "\n3.1"-style ratings, which is a data issue in the source). Rating and Founded are numeric with -1 included: means 3.518601 and 1635.53 (matching pandas *including* -1; excluding gives 3.881833 and 1984.10), min = -1. There is no warning. In Headquarters, Size, Type of ownership, Industry, Sector, Revenue and Competitors, the -1 is stored as the **number** -1 inside a categorical column (Competitors is 74.5% "-1").

### Engine comparison, every numeric-looking column with junk, blanks or -1
Format: count / mean / min / max / std. statsEngine and queryEngine use population std, charts use sample std. Pandas uses ddof=0 and excludes junk, blanks and -1 (and the shifted row, for Play Store Rating).

| column (type) | pandas "clean" | statsEngine | queryEngine (KPI, filters) | chart aggregateValues |
|---|---|---|---|---|
| Cafe Quantity (num) | 9521 / 3.028463 / 1 / 5 / 1.418932 | 9521 / 3.028463 / 1 / 5 / 1.418932 ✔ | 9862 / **2.985195 / 0** / 5 / 1.453880 | 10000 / **2.8834 / 0** / 5 / 1.528214 |
| Cafe Price Per Unit (num) | 9467 / 2.949984 / 1 / 5 / 1.278383 | ✔ same | 9821 / **2.895242 / 0** / 5 / 1.327565 | 10000 / **2.79275 / 0** / 5 / 1.409422 |
| Cafe Total Spent (num) | 9498 / 8.924352 / 1 / 25 / 6.009603 | ✔ same | 9827 / **8.764709 / 0** / 25 / 6.071944 | 10000 / **8.47635 / 0** / 25 / 6.172809 |
| PlayStore Rating (num) | 9366 / 4.191757 / 1 / 5 / 0.515191 | 9367 / 4.193338 / 1 / **19** / 0.537403 | **10841** / 4.193338 / 1 / **19** / 0.537403 | 10841 / **3.62319 / 0 / 19** / 1.521678 |
| PlayStore Reviews (num) | 10840 / 444152.896 / 0 / 78158306 | ✔ same | 10841 / ✔ | 10841 / **444111.93** |
| PlayStore Price (num) | 10840 / **1.027368** / 0 / **400** | 10040 / **0 / 0 / 0 / 0** | **0 / 0 / 0** | **0 / 0 / 0** |
| Glassdoor Rating (num) | 622 / **3.881833** / 2 / 5 / **0.610314** | 672 / 3.518601 / **-1** / 5 / 1.409279 | same as stats | 672 / 3.518601 / -1 / 5 / 1.410329 |
| Glassdoor Founded (num) | 554 / **1984.104693** / 1781 / 2019 / **40.6169** | 672 / 1635.53 / **-1** / 2019 / 756.18 | same | 672 / 1635.53 / -1 / 2019 / 756.75 |
| Glassdoor Competitors (cat; 501 × number -1) | n/a (sentinel) | 501 / -1 | 672 / -1 / -1 / -1 | 672 / -0.7455 / -1 / 0 |
| Lab price (cat; "ksh N" strings) | ksh stripped: 9303 / **4846.34** / 0 / 9998; plain numbers only: 7217 / 5026.20 | 7217 / 5026.20 / 101 / 9998 | 9661 / **4800.70 / 0** | 10000 / **3627.41 / 0** |

Categorical columns are still offered for Y-axis/KPI aggregation, so the last two rows can reach the UI. Lab price excludes every "ksh" value and still reports a plain number mean.

### Type-decision rule (`parsingService.ts:50-90`)
1. Any value matching `/^0\d+/` makes the column categorical, which also catches zero-padded dates.
2. If more than 80% of non-null values satisfy `!isNaN(Number(v))`, the column is numeric (81 good / 19 junk → numeric; 80/20 → categorical).
3. If more than 80% are dates (regex plus `Date.parse`), the column is date.
4. Otherwise it is categorical.

The check runs on all rows, with no sampling. Within a numeric column, junk strings stay as strings. `Number()` quirks: "0x1A" → 26, "1e3" → 1000, "Infinity" → Infinity. Only "", "null", "undefined" and "n/a" become null. "NA", "NaN", "-", "?", "#N/A", "none", "ERROR" and "UNKNOWN" do not.

### Dates
- Local-time formats ("January 15, 2018", "05/06/2024", "08-Mar-21") go through `Date.parse` and then `toISOString().split('T')[0]` (`parsingService.ts:169-172`). This lands on the **previous day** in any zone east of UTC. ISO "2024-01-15" parses as UTC and does not shift, so mixed columns come out inconsistent.
- "05/06/2024" is always read as MM/DD (May 6). DD/MM data ("13/05/2024") gives NaN, so a DD/MM column becomes categorical. If every day is ≤12, the dates are silently swapped.
- Zero-padded dates ("05/06/2024") push the whole column to categorical because of the leading-zero rule.
- Rollover dates are accepted: "2023-02-30" becomes 2023-03-02. Month 13 is rejected and left as text.
- Datetimes are truncated to the date, so time of day is lost (online retail InvoiceDate).

## Files 6–8 (Playwright, Chromium headless, dev server, real `file-upload-input`)

| | 7 · CSV 94.9 MB | 6 · XLSX 45.6 MB | 8 · creditcard 150.8 MB |
|---|---|---|---|
| Result | 1,067,371 rows ✔ | **525,461 rows: only sheet "Year 2009-2010"**. 541,910 rows silently dropped | Rejected in 0.1 s by the sidebar input ✔ |
| Load time | 16–22 s | 46–49 s | — |
| Main thread frozen (heartbeat gap) | 10.8–15.4 s | **41.6–44.6 s** | none |
| Progress UI | "0%" then jumps to "100%". Large-file warning toast shown | "0%" then "100%", no warning (file is under 50 MB) | toast: "File size is 143.8MB…" |
| JS heap after load (CDP JSHeapUsedSize; CDP could not sample during the freeze, so this is not a true peak) | ~1.1 GB | ~1.27 GB | — |
| Max renderer RSS on host (includes the user's other browsers, idle baseline 0.35–0.65 GB, so not attributable) | ~2.0 GB | ~2.4 GB | — |
| Tab crash | no | no | — |
| Table scroll | smooth (paged 25 rows, max gap 296 ms) | smooth | — |
| **Search "United Kingdom"** | **whole app crashes: "Maximum call stack size exceeded"** | **same crash** | — |
| Bar chart Country × Sum(Quantity) | 10.7 s, 43 bars, UK = 8,692,875 (matches pandas exactly) | not completed: the run was killed by OS memory pressure (machine has 7.6 GB) | — |
| Stats view | 17 s. **Invoice typed numeric** (mean 537,608, count 1,047,871: the 19,494 "C" cancellations and 6 "A" invoices excluded). StockCode typed numeric (87.4%; "85123A"-style codes excluded). Overview "insights" report "StockCode spiked to 85,048" | — | — |

File 8 through the **DataTable "replace data" input** (`DataTable.tsx:63-102`): **no size check**. The whole 150 MB file was parsed, with the tab frozen for 31.8 s and the JS heap at 1.5 GB after load, and then the update modal opened.

XLSX dates, confirmed on a 3-row replica built with openpyxl and run through the app's SheetJS + `processRawData`: InvoiceDate comes out as Excel serial numbers (40148.32…) and is typed **numeric**. The cause is `sheet_to_json` with no `cellDates` (`FileUpload.tsx:97-103`).

---

## A. Ranked bugs

### Wrong numbers
1. **Charts treat junk and blanks as 0.** `src/features/charts/lib/chartAggregation.ts:63` (`Number(d[column]) || 0`). Cafe Total Spent avg: expected 8.924352, actual 8.47635, min 0. Play Store Rating avg: expected 4.19, actual 3.62. `count` = rows.length (`:73`) also counts blanks.
2. **queryEngine counts blanks as 0.** `src/shared/services/queryEngine.ts:451-453` and `:507-509` (`Number(null)` = 0 passes the `!isNaN` filter). This feeds KPI cards (`kpiEngine.ts:36`), filter group-by and DrillThrough. Cafe Total Spent avg: expected 8.924352, actual 8.764709, min 0 instead of 1. `count` (`:457`, `:513`) includes "ERROR"/"UNKNOWN" strings (9,827 instead of 9,498).
3. **Play Store Price mean/min/max/sum all 0.** A numeric type is chosen because more than 80% of values are "0", and every "$x.xx" is silently dropped. Expected mean 1.027 (max 400). `parsingService.ts:70,81` + `descriptive.ts:82-84`.
4. **Dates shifted −1 day east of UTC, and date grouping wrong west of UTC.** Ingest: `parsingService.ts:169-172` stores every local-format date one day early in IST (all Netflix date_added and Play Store Last Updated). Grouping: `queryEngine.ts:22-25` parses the stored "YYYY-MM-DD" as UTC midnight, and `:398-404` buckets it with local getters, which moves it back a day in any zone west of UTC. Measured with `queryEngine.execute`, groupBy date_added by year: pandas gives 2007 = 0 and 2008 = 2. DataVista gives **2007 = 1 and 2008 = 1 in both IST and New York** ("January 1, 2008" → 2007, month 2007-12). The causes differ by zone, but year and month bucket counts are wrong in both.
5. **DashboardSummary inflated sum.** `DashboardSummary.tsx:101-102`. sum = average × (rowCount − missing), and that count includes junk strings. Cafe Total Spent: expected 84,763.5, actual 87,699.61. Play Store Rating: expected 39,279, actual 45,460. The same count bug is in `DataTable.tsx:273`.
6. **Sentinel -1 included without warning.** Glassdoor Rating mean 3.5186 vs 3.8818, Founded 1635.5 vs 1984.1, min −1. No code exists for it, so no line to cite. It is a product gap, see B.
7. **Malformed row accepted silently.** Play Store data row 10,473 (Rating 19). Papa error goes to `console.warn` only (`FileUpload.tsx:57-58`). `errorCount: 0` is hardcoded (`parsingService.ts:345`). Same silence for Netflix s5542/s5795/s5814.
8. **ID columns typed as measures.** Online retail Invoice and StockCode are typed numeric, so cancellations and alphanumeric codes are excluded from stats and the overview "insights" quote product codes as spikes. Rule: `parsingService.ts:81` plus role = measure at `:303-304`.
9. **XLSX dates become serial numbers.** `FileUpload.tsx:103` and `DataTable.tsx:102` (no `cellDates`). InvoiceDate is typed numeric.
10. **Empty-header column shift.** `parsingService.ts:103,121-127`. A blank header name re-indexes the columns, so every column after it shows its left neighbour's data and the last column's data is dropped (`,a,b` / `1,2,3` loads as a=1, b=2). None of the 8 test files trigger it, but pandas' default `df.to_csv()` writes exactly this header (a blank index column), so it is likely common in real uploads. **Severity: arguably #1. Every value in the dataset ends up under the wrong column name.**
11. **Std-dev convention differs between paths.** Stats and queryEngine use population std (`descriptive.ts:135`, `queryEngine.ts:32`). Charts use sample std (`chartAggregation.ts:78`, d3.deviation). This is minor, but the same column can show different values.
12. **`Number()` quirks accepted as numbers.** "0x1A" → 26, "Infinity", "1e3" (`parsingService.ts:146`). None of these appear in the test files.

### Crashes and freezes
13. **Search or filter on a large dataset crashes the whole app** with "Maximum call stack size exceeded". Seen at `DataTable.tsx:288-289` (`Math.min(...values)` over 1M values). The same pattern is at `descriptive.ts:118-119` (non-full path), `DashboardSummary.tsx:122-123` and `exportUtils.ts:184-185`. Reproduced on both retail files.
14. **The DataTable replace-data input has no size cap.** `DataTable.tsx:63-102`. It accepted 150 MB, froze for 32 s and used 1.8 GB. It also has no Papa `error` callback, does not use `defval` in sheet_to_json (`:102`), and has no progress UI.
15. **Main-thread parsing freezes the tab.** XLSX freezes for 42–45 s (`FileUpload.tsx:94-107`, synchronous `XLSX.read` + `sheet_to_json` + `processRawData`). CSV freezes for 11–15 s (Papa without `worker`/`chunk`, `FileUpload.tsx:51-55`). Peak RSS is 2.0–2.4 GB, and a second browser run was killed by the OS on a 7.6 GB machine.

### UX
16. **Multi-sheet XLSX imports sheet 1 only, with no notice** (`FileUpload.tsx:98`). 541,910 rows are lost.
17. **The progress bar is fake.** It shows 0% and then 100% after the freeze; the intermediate setUploadProgress calls never get painted.
18. **No data-quality feedback.** There is no surfacing of junk tokens left in numeric columns, duplicate rows, parse errors or sentinel values.
19. **The size message says "143.8MB"**, which is MiB, while the OS and the user see 150.8 MB. The cap is 100 MiB (104.9 MB), not 100 MB.
20. **`.trim()` strips non-ASCII whitespace** (NBSP), so cell text is silently modified (`parsingService.ts:8`).

## B. Product decisions

What the other tools do: the Power Query, Excel and Tableau sampling claims below were checked against vendor docs (sources at the end). Rows marked † are from general knowledge and were not verified.

| Case | Excel (open CSV) / Power Query (Power BI) / Tableau | Recommended DataVista default |
|---|---|---|
| Junk tokens in numeric columns ("ERROR", "UNKNOWN", "NaN", "N/A") | Excel keeps the column General, numbers stay numbers and text is ignored by AVERAGE†. Power Query detects the type from the **first 200 rows**, and a value that fails conversion becomes an *Error* cell the user must Replace/Remove. Tableau types mixed columns from a sample (1,024 rows CSV / 10,000 Excel per docs; another page says a 95% threshold) and non-conforming values become **null**. | Keep the 80% vote, but **convert non-conforming cells to null for aggregation** in every engine, and show a per-column "N invalid values" badge with samples. Never count them as 0. Default null tokens: "", N/A, NA, NaN, null, None, #N/A, "-" (case-insensitive). ERROR/UNKNOWN go only into a configurable list, off by default but offered when detected. |
| Blanks | All three treat blanks as null and exclude them from AVG. | Exclude everywhere (fixes A1, A2). |
| -1 sentinel | None of them treat it specially†. | Do **not** auto-null. Detect a negative value that makes up >5% of an otherwise non-negative column (or year-like columns with -1) and **prompt** "Treat -1 as missing?". |
| "10,000+" | Excel: text†. Power Query: text, needs Replace + type change. Tableau: string†. | Offer a "parse as number (lower bound)" fix in a column menu. Keep categorical by default because it is ordinal. |
| "19M", "512k", "Varies with device" | All: text†. | Keep text. Offer a unit-suffix parser (k/M/G → numeric with a unit) as an explicit transform. |
| "ksh 6976", "$0.99" | Excel converts "$0.99" to currency **only if it matches the locale currency**†. Power Query converts "$0.99" using the locale; "ksh" fails and becomes Error†. Tableau: string†. | Detect a **consistent prefix/suffix currency** pattern (≥80% of values match `^(CUR)?\s?number$`). Type the column numeric with a `currency` format, strip the symbol, and report the stripped symbol(s). Mixed currencies give a warning. |
| Ambiguous dates 05/06/2024 | Excel and Power Query use the **OS/locale** setting (precedence: Change-Type locale > Power Query > OS); a DD/MM file on an MM/DD machine drops days ≥13 as errors. Tableau DATEPARSE uses the computer's locale. | Infer the order from the column itself: if any first field is >12, use DD/MM, and if any second field is >12, use MM/DD. If it can't be decided, use the **browser locale** (en-IN gives DD/MM) and show a one-click toggle. Parse to **calendar dates without a timezone** (no `toISOString`). |
| Invalid dates (month 13, Feb 30, "invalid") | Power Query: Error. Excel: text†. Tableau: null. | null plus an invalid-count badge. No rollover. |
| Multi-sheet XLSX | Power Query Navigator lists every sheet for the user to pick†. Excel opens all sheets. Tableau shows sheets in the data pane†. | Show a sheet picker when there is more than one sheet, with an "append all sheets with the same header" option. Never import silently. |
| Duplicate rows | All keep them. Power Query has an explicit Remove Duplicates step†. | Keep them and show a badge ("483 exact duplicates") with a one-click remove. |
| Shifted/malformed rows | Power Query keeps short rows padded with null†. Excel and Tableau keep them†. | Keep the row but **flag it**: surface Papa field-count errors, report rows whose numeric columns fail range checks, and offer to quarantine them. Replace the hardcoded `errorCount: 0`. |
| Row limit | Excel's sheet holds 1,048,576 rows, so the 1,067,371-row retail CSV prints "File not loaded completely". Power BI/Data Model has no such cap. | Keep the cap, but enforce it on **every** input, and parse in a Worker so the UI stays live. |
| ID-like numeric columns (Invoice, StockCode, Customer ID) | Power Query types them numeric†. Tableau makes them measures†. | If the column name matches /id|code|invoice|zip|phone/ or more than 95% of values are distinct integers, make it a dimension. Also, if any non-numeric pattern like "C123"/"85123A" occurs, use categorical. |

## C. Curated fixture subsets (not created)

Convention: **1-based data-row index** (header excluded; equals Papa `data` index + 1). For Glassdoor, data row ≠ file line because of the embedded newlines, so the `index` column value is listed as well. Stable IDs are given where they exist.

**1 · Cafe (81 rows):** 1–12, 14, 15, 17, 19, 21, 24, 26, 29–32, 34, 36, 37, 40, 43, 50, 52, 53, 56–58, 62, 66–70, 73, 74, 78, 86, 89, 95–97, 104, 105, 116, 118, 119, 121, 141, 144, 146–148, 154, 161–163, 172, 176, 178, 190, 197, 206, 213, 214, 225, 237, 254, 260, 275, 281, 301, 342, 377, 413.
Coverage: clean rows; ""/ERROR/UNKNOWN in each of the 7 columns; 2-of-3 recoverable totals (3, 21, 26, 32); Total min 1 / max 25. No row in the file has all three numerics junk.

**3 · Play Store (80 rows):** 1–7, 10, 16, 24, 37, 38, 43, 46, 53, 59, 60, 63, 68, 86, 89, 90, 114, 124, 127, 140, 153, 165, 193, 194, 205, 210, 235–237, 240, 266, 269, 291–293, 330, 336, 337, 339, 385, 419, 451, 479, 480, 613, 616, 622, 624, 626, 634, 883, 1453, 2034, 2112, 2545, 4096, 4128, 4198, 4242, 4363, 4368, 4454, 4466, 4491, 5152, 5308, 5352, 5487, 5946, 5979, 7028, 7141, 9149, **10473**.
Coverage: shifted row 10473; exact dupes **with all their partner rows** (e.g. "Ebook Reader" 165 + 4096, "Docs To Go" 193 + 293); repeated names that are not exact dupes, also with partners (e.g. 2 + 2034, 24 + 2112); Rating "NaN", 1.0 and 5.0; "$" prices including ≥$399; Size M, k and "Varies"; Installs "0", "0+" and 1B+; Type "NaN" (9149); Android Ver "NaN"; source mojibake (7141); emoji and non-ASCII App names; App with a comma; Reviews 0 and max; numeric-looking Current Ver; multi-genre ";"; single-digit-day Last Updated.

**4 · Netflix (64 rows), show_id:** s1–s8, s11, s13, s15, s30, s39, s58, s59, s86, s141, s622, s859, s1114, s1193, s1196, s1447–s1450, s1471–s1474, s2042, s2225, s2444, s2639, s2640, s2752, s2799, s4154, s4251, s4654, s4915, s5023, **s5542, s5795, s5814**, s5926, s5990, s6067, s6080, s6175, s6178, s6214, s6274, s6280, s6439, **s6530**, s6705, s6796, s6807, s6828, s7313, s7538, s8202, s8420.
Coverage: duration in the rating column; blanks in each of the 6 sparse columns; non-ASCII, CJK/Arabic and NBSP titles (inner NBSP: s622, s1196, s2752, s6439; trailing NBSP that gets trimmed: **s6530** "Consequences "); numeric titles; date_added with a leading space; Jan 1 and Dec 31 (year-boundary shift); multi-country cells and trailing commas; quotes inside titles; newline inside a cell (s8202, s8420); seasons vs minutes; oldest release_year (s4251). Verified across all 8,807 rows: for show_id sN, data row = N. (64 rows.)

**5 · Glassdoor (31 rows), data rows:** 1, 2, 3, 5, 6, 7, 10, 33, 43, 44, 52, 70, 113, 114, 119, 155, 159, 169, 190, 194, 231, 259, 262, 283, 304, 305, 306, 307, 352, 358, 366. The `index` column = data row − 1.
Coverage: -1 in each of the 9 columns; rows with all sentinels (155, 159, 352, 358); Company Name without a rating newline; "Employer est." salary format; Size/Revenue "Unknown"; Rating 5.0; oldest Founded (1781); non-ASCII descriptions.

## DPDP flags (from the CLAUDE.md checklist)
- The Lab file holds `patient_name` plus a diagnosis category. That is health data. Uploads are kept in the browser (Dexie/IndexedDB via `persistenceService`) with no visible retention or deletion notice. If DataVista is offered to Indian users, it needs a privacy notice at the upload point and a clear "delete all local data" control.
- This run did not check whether `src/features/ai/aiEngine.ts` sends row data off-device (a grep for `fetch(`/`https://` found nothing). Confirm before shipping any AI feature.

## D. Git state
Before: clean, HEAD f44b173. After: `git status --porcelain=v1 -uall` is empty and HEAD is still f44b173. Nothing was staged. All scripts and outputs are under the scratchpad. The dev server (`vite`) was stopped by Claude Code because system memory ran low, and the second XLSX browser run was killed for the same reason. No processes remain running.

## Sources
- Power Query data types / 200-row detection: https://learn.microsoft.com/en-gb/power-query/data-types
- Power Query locale precedence: https://support.microsoft.com/en-us/excel/set-a-locale-or-region-for-data-power-query and https://www.myonlinetraininghub.com/change-type-using-locale-with-power-query
- Csv.Document QuoteStyle: https://learn.microsoft.com/en-us/powerquery-m/csv-document
- Tableau data types / sampling: https://help.tableau.com/current/pro/desktop/en-gb/datafields_typesandroles_datatypes.htm and https://help.tableau.com/current/pro/desktop/en-us/upgrading_connection.htm
- Tableau DATEPARSE locale: https://help.tableau.com/current/pro/desktop/en-gb/data_dateparse.htm
- Excel row limit: https://windowsreport.com/file-not-loaded-completely-excel/ and https://learn.microsoft.com/ko-kr/archive/blogs/josebda/loading-csvtext-files-with-more-than-a-million-rows-into-excel

## Appendix · per-column profile from DataVista (TZ=Asia/Kolkata run)

Columns: inferred type, distinct count, missing count (null after cleanValue), numeric share of non-null cells, and values that are not clean for that type (count and top samples). For categorical columns, `num` means JS numbers stored in a text column.

### 1 · Cafe
| column | type | distinct | missing | numeric share | not-clean values |
|---|---|---|---|---|---|
| Transaction ID | categorical | 10000 | 0 | 0 | — |
| Item | categorical | 10 | 333 | 0 | — |
| Quantity | numeric | 7 | 138 | 0.9654 | 341: `UNKNOWN`×171, `ERROR`×170 |
| Price Per Unit | numeric | 8 | 179 | 0.964 | 354: `ERROR`×190, `UNKNOWN`×164 |
| Total Spent | numeric | 19 | 173 | 0.9665 | 329: `UNKNOWN`×165, `ERROR`×164 |
| Payment Method | categorical | 5 | 2579 | 0 | — |
| Location | categorical | 4 | 3265 | 0 | — |
| Transaction Date | date | 367 | 159 | 0 | 301: `UNKNOWN`×159, `ERROR`×142 |

### 2 · Lab
| column | type | distinct | missing | numeric share | not-clean values |
|---|---|---|---|---|---|
| order_id | categorical | 5570 | 516 | 0 | — |
| signout_date | categorical | 4658 | 248 | 0 | — |
| lab_number | categorical | 8203 | 498 | 0 | — |
| assigned_to_pathologist | categorical | 2818 | 1430 | 0 | — |
| patient_name | categorical | 8876 | 549 | 0 | — |
| facility | categorical | 7 | 1264 | 0 | — |
| test_category | categorical | 10 | 0 | 0 | — |
| test | categorical | 9 | 500 | 0 | — |
| sub_category | categorical | 8 | 1089 | 0 | — |
| receiving_centers | categorical | 5 | 1719 | 0 | — |
| processing_centers | categorical | 5 | 1610 | 0 | — |
| creation_date | categorical | 4742 | 113 | 0 | — |
| service | categorical | 6 | 1501 | 0 | — |
| price | categorical | 6764 | 339 | 0.747 | num×7217 |
| payment_method | categorical | 6 | 1397 | 0 | — |

### 3 · Play Store
| column | type | distinct | missing | numeric share | not-clean values |
|---|---|---|---|---|---|
| App | categorical | 9660 | 0 | 0 | — |
| Category | categorical | 34 | 0 | 0.0001 | num×1 |
| Rating | numeric | 41 | 0 | 0.864 | 1474: `NaN`×1474 |
| Reviews | numeric | 6002 | 0 | 0.9999 | 1: `3.0M`×1 |
| Size | categorical | 462 | 0 | 0 | — |
| Installs | categorical | 22 | 0 | 0.0001 | num×1 |
| Type | categorical | 4 | 0 | 0.0001 | num×1 |
| Price | numeric | 93 | 0 | 0.9261 | 801: `$0.99`×148, `$2.99`×129, `$1.99`×73, `$4.99`×72, `$3.99`×63 |
| Content Rating | categorical | 6 | 1 | 0 | — |
| Genres | categorical | 120 | 0 | 0 | — |
| Last Updated | date | 1378 | 0 | 0 | 1: `1.0.19`×1 |
| Current Ver | categorical | 2785 | 1 | 0.33 | num×3577 |
| Android Ver | categorical | 34 | 1 | 0 | — |

### 4 · Netflix
| column | type | distinct | missing | numeric share | not-clean values |
|---|---|---|---|---|---|
| show_id | categorical | 8807 | 0 | 0 | — |
| type | categorical | 2 | 0 | 0 | — |
| title | categorical | 8806 | 0 | 0.0015 | num×13 |
| director | categorical | 4528 | 2634 | 0 | — |
| cast | categorical | 7692 | 825 | 0 | — |
| country | categorical | 748 | 831 | 0 | — |
| date_added | date | 1714 | 10 | 0 | — |
| release_year | numeric | 74 | 0 | 1 | — |
| rating | categorical | 17 | 4 | 0 | — |
| duration | categorical | 220 | 3 | 0 | — |
| listed_in | categorical | 514 | 0 | 0 | — |
| description | categorical | 8775 | 0 | 0 | — |

### 5 · Glassdoor
| column | type | distinct | missing | numeric share | not-clean values |
|---|---|---|---|---|---|
| index | numeric | 672 | 0 | 1 | — |
| Job Title | categorical | 172 | 0 | 0 | — |
| Salary Estimate | categorical | 30 | 0 | 0 | — |
| Job Description | categorical | 489 | 0 | 0 | — |
| Rating | numeric | 32 | 0 | 1 | — |
| Company Name | categorical | 432 | 0 | 0 | — |
| Location | categorical | 207 | 0 | 0 | — |
| Headquarters | categorical | 229 | 0 | 0.0461 | num×31 |
| Size | categorical | 9 | 0 | 0.0402 | num×27 |
| Founded | numeric | 103 | 0 | 1 | — |
| Type of ownership | categorical | 13 | 0 | 0.0402 | num×27 |
| Industry | categorical | 58 | 0 | 0.1057 | num×71 |
| Sector | categorical | 23 | 0 | 0.1057 | num×71 |
| Revenue | categorical | 14 | 0 | 0.0402 | num×27 |
| Competitors | categorical | 108 | 0 | 0.7455 | num×501 |
