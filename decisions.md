# Decisions

Newest first. Entries marked `Source: inferred` were reconstructed from existing code; their "Why" is a guess and should be corrected by the author.

### 2026-11-25 — README screenshots retaken in Taupe with Effects off, by a standalone script
- **Decision:** `scripts/screenshots/capture.ts` (run with `npx vite-node`) builds, serves `dist/` with `vite preview` on :4173, seeds `datavista-ui-storage` v4 before boot (theme `taupe`, Transparency off, Motion "Reduce motion"), and overwrites the four existing `docs/images/*.webp` with the same names (PNG at 1440×900 ×2, then ImageMagick WebP quality 82). Same views and fixtures as `scripts/design/portfolio.spec.ts`: Data Explorer's data-quality shot keeps the messy Play Store fixture; the KPI shot is clipped to the main column from the Dashboard Filters bar to below the three cards (scrolling cannot move the categorical table's tail out of view). No Charts or copilot image: nothing references one.
- **Why:** User request: screenshots that match the portfolio's wabi-sabi look. File names unchanged so the README needs no edit.
- **Alternatives considered:** Hiding the aurora ribbon with injected CSS (rejected: no Effects setting turns it off, so the image would show a look the app cannot produce; app source was not to be changed); PNG files in the repo (rejected: names are `.webp`, and the 2x PNGs are 0.5-0.6 MB each vs 30-160 KB WebP); the clean `playstore-insights.csv` for the data-quality shot (not used: the messy fixture shows duplicates, a shifted row and convertible text columns).
- **Tradeoff accepted:** The aurora ribbon gradient still shows, muted, behind view headers (user chose to keep the real look). README alt text now says Taupe; the file name `dashboard-light` is kept, so it no longer describes the theme. `docs/ARCHITECTURE.md` points at the new script.
- **Source:** `made-now`

### 2026-11-24 — README cut to a 30-second page; detail in docs/ARCHITECTURE.md; investigation notes and old screenshots moved out
- **Decision:** README.md reduced to ~60 lines: pitch, live demo, CI badge, hero image, 6 one-line features, 5 one-line highlights (one number each), the other 3 images in one table row, 3 run commands, one tests line, one-line stack, two-line privacy, links. The Mermaid diagram, how-it-works bullets, detailed features, highlights with where they were measured, the privacy table per AI level, full run/test commands, project structure and full dataset credits moved to `docs/ARCHITECTURE.md` (links rewritten relative to `docs/`; it also links the ADRs). The copilot screenshot placeholder is dropped; the copilot stays as a feature bullet. Display name now "Vardaan Bajaj"; URLs keep the `vardaanbazaz` GitHub handle (demo, badge, clone, `package.json`, `index.html`, `registry.json` origin). `docs/INVESTIGATION-*.md` and `docs/screenshots/` moved to `~/Git Projects/datavista-notes/docs/` (same structure); the four code comments that cite the investigation now point there. `scripts/design/readme.spec.ts` deleted (it only wrote `docs/screenshots/`); flow.md no longer lists it.
- **Why:** User request: the README was too theory-heavy for a 30-second read; the detail is kept, not deleted. `portfolio.spec.ts` already produces the README images, so `readme.spec.ts` had no remaining use.
- **Alternatives considered:** Pointing `readme.spec.ts` at `docs/images/` (rejected: duplicates `portfolio.spec.ts` with a dev server and the HR fixture, already rejected for README images); replacing `vardaanbazaz` everywhere (rejected: it is the GitHub handle, and changing it breaks the demo, badge, clone URL and the CORS origin).
- **Tradeoff accepted:** README highlights carry no measurement context; readers follow the link to ARCHITECTURE.md for it. Numbers there and in the README must be updated by hand.
- **Source:** `made-now`

### 2026-11-24 — README rewritten for portfolio readers; screenshots from the production build as WebP
- **Partly superseded by** "README cut to a 30-second page; detail in docs/ARCHITECTURE.md; investigation notes and old screenshots moved out" (README content, copilot placeholder, `readme.spec.ts`, `docs/screenshots/`). **Partly superseded by** "README screenshots retaken in Taupe with Effects off, by a standalone script" (Dark/Light images, 45–69 KB sizes).
- **Decision:** README.md replaced: pitch, live demo, CI badge, hero screenshot, grouped feature list, "Engineering highlights" whose numbers come only from this log and from test runs on this branch (1,746 unit tests in 76 files, 127 date tests × 3 time zones, 80 e2e tests in 20 files, 2 production smoke tests, 1,020 contrast checks), a Mermaid diagram, a privacy table per AI level, run/test commands, top-level structure, dataset credits. Screenshots: `scripts/design/portfolio.spec.ts` + `playwright.portfolio.config.ts` (production build via `vite preview`, Play Store fixtures, 1 worker) → PNG → `scripts/design/to-webp.sh` (ImageMagick, quality 82) → `docs/images/*.webp` (45–69 KB each). The copilot screenshot is left as a marked gap (`docs/images/copilot.webp`, to be added by hand with a real provider).
- **Why:** User request (portfolio run): recruiters skim the README for ~30 s; numbers must be traceable to where they were measured.
- **Alternatives considered:** Reusing `docs/screenshots/*` from `readme.spec.ts` (rejected: dev server, HR fixture, and its AI image is a settings dialog, not the copilot); a mocked provider for the copilot shot (rejected by the user: it would show an answer no model gave); PNG (rejected: 2-4x larger than WebP at the same look).
- **Tradeoff accepted:** `docs/screenshots/` and `readme.spec.ts` stay in the repo but are no longer linked from the README. Toasts are hidden in the screenshots by an injected style. Numbers in the README must be updated by hand when tests are added.
- **Source:** `made-now`

### 2026-11-24 — Audit reports, plans/specs and design review screenshots moved out of the repo
- **Partly superseded by** "README cut to a 30-second page; detail in docs/ARCHITECTURE.md; investigation notes and old screenshots moved out" (`docs/INVESTIGATION-*.md` also moved out).
- **Decision:** `docs/AUDIT-*.md`, `docs/superpowers/` (plans and specs) and `docs/design/` (batch 7 review screenshots) moved to `~/Git Projects/datavista-notes/docs/` with the same structure (git history keeps the old copies; not rewritten). References in code comments, `tests/fixtures/README.md`, flow.md and this log now say where they are. `docs/design/` is git-ignored, since `scripts/design/batch7-*.spec.ts` and `scripts/brand/logo-options.ts` still write there by default. `docs/ADR-*.md` and `docs/INVESTIGATION-*.md` stay (not in the move list).
- **Why:** User request: the public repo shows the product, not internal working notes.
- **Alternatives considered:** Deleting them (rejected: the notes are still useful to the author); changing the design scripts' output folder (rejected: ignoring the folder keeps them working unchanged).
- **Tradeoff accepted:** Readers of older log entries that link those files need the notes folder; the files are still in git history.
- **Source:** `made-now`

### 2026-11-24 — CI runs on pull requests; deploy only for a push to main; e2e in the Playwright container
- **Decision:** `deploy.yml` also runs on `pull_request` to `main`. The `deploy` job and the "Upload Artifact" step run only when `github.event_name == 'push' && github.ref == 'refs/heads/main'`; the `pages` concurrency group and the `pages: write` / `id-token: write` permissions moved from the workflow to the `deploy` job (workflow default `contents: read`). A workflow-level concurrency group `ci-<ref>` cancels superseded runs only for pull requests. The `e2e` job runs in `mcr.microsoft.com/playwright:v1.62.0-noble` (matches `@playwright/test` 1.62.0 in package-lock.json) and no longer runs `npx playwright install --with-deps chromium`. The `build` job keeps its install step (it is not containerised).
- **Why:** User request: PRs get the same gates without deploying; the container skips the apt install of browser libraries on every run.
- **Alternatives considered:** Keeping the workflow-level `pages` group (rejected: a PR run would cancel or wait on a deploy); running the build job in the container too (not asked; the smoke step is short).
- **Tradeoff accepted:** The image tag must be bumped with `@playwright/test`, or the e2e job fails with missing browsers. A manual `workflow_dispatch` run no longer deploys (the request says push to main only). Not yet verified on GitHub; the first PR run will show whether the container job works (setup-node inside the container, npm cache).
- **Source:** `made-now`

### 2026-11-24 — Dev server bound to localhost
- **Decision:** `vite.config.ts` `server.host` changed from `"::"` (all interfaces) to `"localhost"`. `npm run dev -- --host` still exposes it for phone testing.
- **Why:** User request; also closes the exposure noted in "Remaining audit findings accepted" (esbuild dev-server advisory applies while the dev server is reachable from the network).
- **Alternatives considered:** `127.0.0.1` (rejected: Playwright and the docs use `http://localhost:8080`, which may resolve to `::1` first).
- **Tradeoff accepted:** Testing on a phone needs the `--host` flag.
- **Source:** `made-now`

### 2026-11-24 — Numeric-columns table: no Sum for per-item columns
- **Decision:** `NumericSummaryTable` shows "—" in the Sum cell (screen-reader text "no sum: each value is a per-item level") for columns where `columnRoles.ts:isPerItemName` is true (Rating, Price, Age, a "%" in the name…), on the Overview and in Data Explorer; sorting by Sum puts them last, as with ID/year columns. Checked in `tests/e2e/data-quality.spec.ts` (Price and Rating show "—", Reviews shows a number).
- **Why:** User request: "Sum of Rating" is meaningless, and the KPI builder already defaults these columns to Average.
- **Alternatives considered:** Hiding the Sum column entirely (rejected: it is right for real measures such as Reviews).
- **Tradeoff accepted:** The name heuristic can hide a sum the user wanted (e.g. a "Price" column that is really a line total); the KPI builder and pivot still offer Sum.
- **Source:** `made-now`

### 2026-11-24 — Copilot actions are proposals through tool calls; Apply/Undo by id through the existing stores
- **Decision:** Three tools, `propose_chart`, `propose_kpi`, `propose_filter` (`features/ai/copilot/actions.ts`), offered at every privacy level and routed in `tools.ts:runCopilotTool` before the Queries gate. Arguments are checked against real columns, effective types and `aggregationsForColumn`; an omitted aggregation takes `defaultAggregationForColumn`; Sum of a column whose default isn't Sum is refused unless the user's question asks for a total; at most 3 valid proposals per answer. The model gets back only "proposed: <its own description>, not applied yet" (no counts, no values; filter values are never checked against the rows). Each proposal renders as a card (description, columns, Apply / Dismiss). Apply (`applyActions.ts`) uses `chartStore.createChart` (+ the open dashboard's chartIds, like ChartBuilder), the KPI builder's placement (extracted to `dashboards/services/kpiPlacement.ts:addKpiToWorkspace`, now shared with `DashboardSummary`), and `filterStore.setFiltersChange` with rows recomputed via `buildFilterQuery`. What Apply did (`AppliedRecord`: chart id, KPI id, dashboard id + whether Apply created it, previous filters as JSON) is stored in the proposal, so Undo is a targeted inverse by id and still works after a reload; something the user already deleted is left alone.
- **Why:** Requested (Run C): actions via tools, not text parsing; nothing changes without Apply; existing stores so the app's own state and dashboard history see it. Undo by id because `chartStore` has no history and `dashboardStore.undo()` pops whatever is on top (it could undo an unrelated change, and leave the chart in `charts`).
- **Alternatives considered:** Parsing chart suggestions out of the answer text (rejected by the request, fragile); Undo via `dashboardStore.undo()` (rejected, see Why); per-chart filters (rejected: `ChartConfig` has none, so a chart's `filters` set the workspace filters together with the chart, and the card says so); allowing `greaterThan`/`lessThan`/`startsWith`/`endsWith` in proposals (rejected: a `FilterState` can't hold them; the model is told to use inclusive `between`).
- **Tradeoff accepted:** A filter proposal replaces earlier filters of any kind on the same column. Bar charts over a category with more than 15 known values get Top 10 unless the model sets `topN`. Undo of filters needs the proposal's dataset open.
- **Source:** made-now

### 2026-11-24 — Copilot chats saved per dataset in IndexedDB (Dexie v5 `copilotChats`)
- **Decision:** New table `copilotChats` (key `datasetId`, Dexie v5, no data migration). `features/ai/copilot/chatHistory.ts` (startup bundle) restores a dataset's chat when its chat opens and saves on change with a 400 ms debounce, only after that dataset's saved chat has been read (an earlier write would replace it). Stored: the last 50 messages, steps with results cut to a 300-character preview, proposals with their applied record; a streaming answer is stored as stopped. The model gets only the last 10 turns. Clear chat deletes the record; `deleteDataset` deletes it (pending save cancelled); "Clear all local data" stops chat writes before deleting the database (chats listed in `CLEARED_ITEMS`). Nothing else reads the table, so chats are never in exports or PDFs (a unit test scans the source for readers).
- **Why:** Requested (Run C). Separate table so a 50-message chat isn't rewritten with every dataset metadata save, and so export code can't pick it up by accident. Debounce keeps a streaming answer from writing per chunk.
- **Alternatives considered:** localStorage (rejected: 5 MB shared origin quota on GitHub Pages, sync writes); storing in the dataset record (rejected: rewritten on every rename/override, and part of what persistence copies around); saving full tool results (rejected: up to 50 aggregate rows per step; the numbers are in the answer text).
- **Tradeoff accepted:** After a reload, expanded query steps show a truncated result preview. Chat text (questions about the user's data) now persists on the device until cleared: privacy notice already covers "data stays in this browser"; the clear paths are Clear chat, deleting the dataset, and Clear all local data.
- **Source:** made-now

### 2026-11-24 — Injectable AI timeouts for tests; CI e2e slowdown was the runner's apt mirror
- **Decision:** `features/ai/timeouts.ts:aiTimeout(key, default)` reads `window.__DATAVISTA_AI_TIMEOUTS__` in development builds only (`import.meta.env.DEV`; production always uses the real values) for the first-response (90 s), stream-idle (30 s), still-waiting (15 s) and retry-base (1 s) waits. The copilot "slow provider" e2e injects `stillWaitingMs: 2000` and keeps every check (not shown before the delay, shown after, Stop works): 18.2 s → 5.5 s. The "key kept for the session" e2e gets `test.setTimeout(60_000)`: it makes four full app loads (goto, reload, two new tabs) and no provider request; 25-27 s on cold CI runners against the 30 s default (one CI timeout, passed on retry), 6-7 s locally.
- **Why:** Run C asked for injectable timeouts. Investigation (`gh run view` of the runs before and after Run B2): the tests themselves went 3.8 → 4.1 min; the job went 4:46 → 10:58 because `npx playwright install --with-deps chromium` spent ~5 min in apt on a slow mirror (us-east-2.ec2.archive.ubuntu.com instead of azure.archive.ubuntu.com). That is runner-side, not caused by the code.
- **Alternatives considered:** Reading overrides from a URL parameter or localStorage (rejected: would also work in production); making the constants mutable exports (rejected: tests run against the dev server, not the module); changing the CI e2e job to the Playwright container image to avoid apt (not done: can't be verified from here; suggested in the report).
- **Tradeoff accepted:** Dev builds honour a window global that a page script could set; it only shortens waits.
- **Source:** made-now

### 2026-11-24 — Offline heuristic: hint instead of a guess; default aggregation; CommonMark intraword underscores
- **Decision:** `llmService.ts:generateOfflineFallback` returns `{type: "hint"}` ("Try something like 'average Rating by Category'", built from the dataset's own columns) when the question names no column and has no operator or intent word; `aiEngine` throws `OfflineHintError`, which the palette shows as a neutral line (no error toast). Without an operator word the measure uses `defaultAggregationForColumn` (carried as `AIPromptColumn.defaultAggregation` from `offlineContext`), so Rating gets Average, not Sum. Copilot Markdown inline parsing moved to `markdownParse.ts:parseInline` with CommonMark's flanking rules: `_`/`__` can't open or close next to a letter or digit (ART_AND_DESIGN stays literal), `*` still works inside words.
- **Why:** User reports: "/ai j" produced a confident guess; "Sum of Rating" is meaningless; Play Store categories rendered as "ART*AND*DESIGN" in italics.
- **Alternatives considered:** Escaping underscores in the model's text before rendering (rejected: also breaks real `_emphasis_`); a full Markdown library (rejected: bundle size, and the renderer must stay React-elements-only).
- **Tradeoff accepted:** `***both***`-style mixed runs aren't parsed exactly like CommonMark.
- **Source:** made-now

### 2026-11-18 — One AI path for Ctrl+K "/ai"; no silent offline fallback; offline heuristic picks real categories
- **Decision:** With a provider connected, the palette's "/ai <question>" (and its AI item) hands the question to the copilot panel (`copilotStore.ask` → `pendingQuestion`, sent by `CopilotPanel` once ready) instead of the separate query-JSON request. Without a provider the palette keeps the local heuristic, labelled "Offline guess (no AI provider connected)" (`offlineLabel.ts`). A failed provider call is never replaced by an offline result: the executive summary now returns `source: "error"` with the typed message and offers "Use offline summary" as a button; palette and formula builder already showed errors. The heuristic (`llmService.ts:generateOfflineFallback`) groups by a column the question names (word match via `nameWords`, plurals, joined names, a match inside a longer column's match dropped) or else the first categorical column with 2–50 distinct values, never one with more than 50 distinct values or an ID flag; operator from the wording (average/median/count/total/max/min), "lowest" sorts ascending.
- **Why:** User report (Run B2): "Which category has the highest average rating?" showed "Offline AI Heuristic: Aggregated [Rating] grouped by [App]" (9,660 groups) with a provider connected. Two AI paths for one question gave different answers; the summary's catch-to-offline hid provider failures.
- **Alternatives considered:** Keeping the palette's own AI request and fixing its errors (rejected: duplicate path without tools, streaming or Stop); falling back to the offline guess automatically but labelled (rejected: the request says never silently replace).
- **Tradeoff accepted:** The palette's Apply-a-query-to-the-view flow now exists only offline; with a provider the answer is a chat answer, not a filter/chart applied to the view. The heuristic is still keyword-based (e.g. "most apps" doesn't become a count).
- **Source:** `made-now`

### 2026-11-18 — AI timeouts: 90 s first response, 30 s idle, one retry of an early timeout
- **Decision:** `client/index.ts:timedFetch` arms `FIRST_RESPONSE_TIMEOUT_MS` (90 s) until the first stream chunk (headers alone no longer restart the clock) or, not streaming, for the whole reply (was 60 s), then `STREAM_IDLE_TIMEOUT_MS` (30 s) between chunks. A timeout before any output is retried once (`MAX_TIMEOUT_RETRIES`) on the same backoff as 503/429 (`retryDelayMs`, shared attempt counter; `onRetry` with status 0); an idle timeout (text already shown) and Stop are not retried. Messages differ: "did not answer within 90 s" vs "stopped sending the answer for 30 s". `ChatOptions.firstResponseTimeoutMs` overrides; "Test connection" keeps 30 s. The copilot shows "Still waiting for <provider>…" with a Stop button after 15 s without new output (`CopilotPanel.tsx:STILL_WAITING_MS`).
- **Why:** User report: Gemini (gemini-flash-latest, with tools) hit "did not answer within 30 s" before it started streaming.
- **Alternatives considered:** One longer timeout for everything (rejected: a stalled stream would hang 90 s); retrying idle timeouts (rejected: the answer would restart after text was shown).
- **Tradeoff accepted:** A provider that never answers now fails after ~3 minutes (90 s + 1 s + 90 s) instead of 30 s; the "Still waiting" note and Stop cover the wait.
- **Source:** `made-now`

### 2026-11-18 — Ctrl/Cmd+J always handled; copilot panel opens without a dataset
- **Decision:** `CopilotHost`'s capture-phase Ctrl/Cmd+J listener is always attached and always calls `preventDefault`; the panel renders without a dataset and `CopilotPanel` shows "Load a dataset to start" with Upload / Try sample. The sidebar's Co-Pilot button opens the panel (it used to open the palette with "/ai "). The round button still shows only with a dataset.
- **Why:** User report: Ctrl+J with no dataset fell through to the browser (Chrome opens Downloads).
- **Alternatives considered:** Preventing the default but opening nothing (rejected: the key then looks broken).
- **Tradeoff accepted:** The browser's own Ctrl+J never works while the app has focus.
- **Source:** `made-now`

### 2026-11-16 — Copilot panel: docked aside on large screens, sheet on phones, button above toasts
- **Decision:** `features/ai/copilot/CopilotHost.tsx` (startup bundle) renders a round button bottom-right and, when open, a glass `<aside>` docked after the main column (≥1024 px; resizable 320–560 px with a keyboard-operable splitter, width in localStorage `datavista-copilot`) or a full-screen Radix Dialog sheet below 1024 px. Ctrl/Cmd+J toggles; Esc closes. The panel contents (`CopilotPanel`, the client, tools) load on first open. The chat sits on `.surface-solid` inside the glass frame. The button's z-index is above sonner's toasts, and while it shows (`html[data-copilot-fab]`) both toast viewports (Radix `.toast-viewport`, sonner bottom) move up by its height so it never covers a toast's buttons; it hides while a modal has locked the page (`body[data-scroll-locked]`) so it never covers a dialog; the main column gets `pb-24` when a dataset is loaded so the end of a view (e.g. the Data Explorer table's scrollbar) can scroll clear of it. Answers render through a small Markdown renderer to React elements (no innerHTML, links as text); chat history is in memory per dataset.
- **Why:** User request (Run B). "Above toasts" read as stacking order (a toast never hides the button). Model output is untrusted, so no HTML injection path.
- **Alternatives considered:** Overlay panel at every width (rejected: request says it shrinks the main content); a Markdown library (rejected: bundle weight for lists/bold/tables/code); placing the button higher than the toast area (rejected: permanent odd position for a transient overlap); docking between 768 and 1024 px (rejected: the workspace is a column layout there, so a sheet is clearer).
- **Tradeoff accepted:** Tablets (768–1023 px) get the full-screen sheet. The button hides under every modal, including ones unrelated to AI, and while the onboarding tour runs (its phone bottom sheet's buttons were under it; caught by `onboarding.spec.ts`).
- **Source:** `made-now`

### 2026-11-16 — Privacy level "Queries" (new default) and local query tools
- **Decision:** New level between Summaries and Sample rows, default for new users: same context as Summaries, plus the copilot may call `describe_column`, `aggregate` (filters, groupBy + date period, ≤5 aggregations of count_rows/count/count_distinct/sum/avg/min/max/median/stddev, sort, limit clamped to 50) and `value_counts` (limit clamped to 20); `get_rows` (≤20, masked) only at Sample rows (`copilot/tools.ts`). Tools run on the full dataset via `queryEngine.execute` (`bypassCache`, so AI queries don't evict UI caches); descriptions and the system prompt say active filters are not applied unless passed. Every argument is validated against real columns/operators (errors returned to the model). Personal-data columns: masked in results, rejected as groupBy, filter or sort column, and limited to count / count_distinct (`describe_column` gives only count, missing and distinct), so a numeric phone column's min/max/median can't reveal one person's number; the shared context builder likewise sends no stats for a masked numeric column. Filter values use a typed schema (`value` string, `values` array for in, `start`/`end` for between; numeric text converted) because Gemini's OpenAPI subset may reject an untyped property. Gating is enforced in the executor as well as the tool list. `levels.ts` gained `levelAtLeast`, `isPrivacyLevel` (used by the settings store's merge), per-level "sends" wording and `contextSends`. Saved levels are kept; only new users get Queries.
- **Why:** User request. Filtering on a masked column would let the model test whether a given person is in the data, so it is refused rather than masked; `sum_if`/`count_if`/`weighted_average`/`percentile` are left out (expressions, extra arguments) to keep the argument surface small.
- **Alternatives considered:** Masking group keys of personal columns (rejected: collapses every group into one label, useless and misleading); erroring on limit > max (rejected: clamping with a "Showing N of M" note is friendlier and still bounded).
- **Tradeoff accepted:** The model may quote full-data numbers while the user looks at a filtered view unless it passes the filters; the context lists the active filters so it can.
- **Source:** `made-now`

### 2026-11-16 — Tool calling for all three API styles; every round streams; step cap; no-tools fallback
- **Decision:** `ChatMessage` carries assistant `toolCalls` and `role: "tool"` results; `client/styles.ts` shapes them per style (openai `tool_calls`/`tool_call_id`; anthropic `tool_use` blocks and a user turn of `tool_result`s; gemini `functionCall` with the part's `thoughtSignature` echoed, and `functionResponse` with an object `response`). `copilot/toolLoop.ts:runCopilotTurn` streams every round (the existing stream accumulators already collect tool calls), so the final answer is streaming without a second request. Max 6 tool calls per answer; then one more round with tools still defined but `toolChoice: "none"` (openai `"none"`, anthropic `{type:"none"}`, gemini `functionCallingConfig.mode: "NONE"`). A first-round 400/404/422 whose message says tools / tool use / function calling are not supported or not enabled is sent again without tools (other tool-related 400s, e.g. schema errors, are shown as errors) and the answer gets a one-line note.
- **Why:** User request; Anthropic rejects tool history without `tools`; Gemini 3 models reject tool turns without the thought signature; OpenRouter's "No endpoints found that support tool use" would otherwise read as model-not-found.
- **Alternatives considered:** Non-streaming tool steps then a separate streamed final request (rejected: one extra request per answer, and the model may answer in the step that was not streamed).
- **Tradeoff accepted:** Text a model writes before a tool call ("Let me check…") stays in the answer. Earlier answers are sent back as plain text, without their tool turns.
- **Source:** `made-now`

### 2026-11-16 — Auto-retry 503 and 429 in the client
- **Decision:** `client/index.ts:chat` retries 503/429 up to 2 times before reading any body, waiting `Retry-After` (seconds or HTTP date) or 1 s then 2 s; a wait over 20 s isn't retried (the typed rate-limit error already says when to try again). `onRetry` lets the panel show "Provider busy, retrying…". The wait is cancelled by the request's signal. Applies to every AI feature.
- **Why:** User request.
- **Alternatives considered:** Retrying in the copilot only (rejected: palette, formula and summary hit the same transient errors).
- **Tradeoff accepted:** A rate-limited request can take up to ~40 s longer before failing.
- **Source:** `made-now`

### 2026-11-16 — Sample rows: seeded random sample per dataset
- **Decision:** `contextBuilder.ts:sampleRowIndices(total, n, dataset.id)`: FNV-1a hash of the id seeds mulberry32; partial Fisher-Yates over a sparse swap map; indices returned in row order. Replaces "first N rows". Preview uses the same builder, so it shows the same rows.
- **Why:** User request: the first rows are often unrepresentative (sorted files); a fixed seed keeps the preview reproducible.
- **Alternatives considered:** `Math.random` sample (rejected: preview ≠ request); every k-th row (rejected: aliasing with periodic data).
- **Tradeoff accepted:** The sample is drawn from the rows passed (all rows for the copilot and palette), not the filtered view.
- **Source:** `made-now`

### 2026-11-16 — Text columns keep numeric-looking text as written
- **Decision:** `parsingService.ts:processRawData`, after column types are final: every categorical column that wasn't converted by a column fix is re-read from the raw rows (`cleanValue`), so "1.10", "1.0", "1e5" stay text (they had become 1.1, 1, 100000). "007"/"00123" already survived (leading-zero rule). An ID-named column (`isIdName`) typed numeric becomes categorical when any cell's text isn't its number's own spelling ("1.10", "1e5"); plain-integer IDs (HR EmployeeNumber) stay numeric. Other numeric and date columns are unchanged; golden tests unchanged. Two leading-zero tests that asserted the old coercion (`90210`, `5000` as numbers in a categorical column) now expect text.
- **Why:** User report: Play Store "Current Ver" mixed 1.1 (number) with "1.0.0" (text); "1.0" and "1" were merged and "2.20" shown as 2.2.
- **Alternatives considered:** Deciding types before converting cells (rejected: larger rewrite of the ingest order, same result); keeping the original text per cell (rejected: doubles memory on large files; the raw rows are still in scope).
- **Tradeoff accepted:** XLSX cells stored as numbers in the workbook stay numbers (their text isn't in the file). Datasets saved before this keep their old values until re-imported.
- **Source:** `made-now`

### 2026-11-16 — AI provider registry and one fetch client for three API styles
- **Decision:** `src/features/ai/providers/registry.json` (data) + `registry.ts` (types): OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Together, Ollama, LM Studio, Custom (any OpenAI-compatible base URL). One client, `src/features/ai/client/` (plain `fetch`, no SDKs): `chat(messages, { model, stream, tools, json, onText })` with request/response/SSE handling per style (openai-compatible, anthropic, gemini) and typed errors (`blocked`, `bad-key`, `model-not-found`, `rate-limited`, `other`). Tools are accepted and put in each style's request shape; no feature uses them yet. `response_format: json_object` only for providers known to accept it (OpenAI, Groq, Mistral, DeepSeek, Together, OpenRouter); local and custom servers get the JSON instruction in the prompt only, and `aiEngine.cleanJsonString` keeps the outermost `{...}`. Timeouts: 60 s whole request, or 30 s idle between stream chunks (the old 30 s whole-request limit would cut long streams). Request options come from one function, `aiRequests.ts:requestOptions(kind, model, style)`, used by the features and by "Test connection", so a passing test means the features work; openai-compatible requests carry no `temperature` or `max_tokens` (newer OpenAI reasoning models reject both), anthropic/gemini keep 0.1/1500 (query, formula) and 0.3/400 (summary). The previous `llmService.ts:callLLM` / `fetchWithTimeout` were removed; `llmService.ts` keeps the system prompt and offline heuristic. Default models stay `gemini-flash-latest` / `gpt-4o-mini`, so migrated users get the same model.
- **Why:** User request (Run A): many providers, one client, streaming, typed errors, no vendor SDKs, lazy-loaded.
- **Alternatives considered:** Vendor SDKs or the Vercel AI SDK (rejected: user asked for plain fetch; SDK weight in the bundle); registry as a TS literal (rejected: the browser-access script must write results back, JSON is safe to rewrite).
- **Tradeoff accepted:** Gemini invalid-key detection relies on the 400 body text (`API_KEY_INVALID` / "API key not valid"), checked against the documented error format, not against a live bad key. Anthropic `max_tokens` defaults to 1024. Suggested model lists will age; "Load models" and free text cover it.
- **Source:** `made-now`
- **Superseded in part by:** 2026-11-18 — AI timeouts: 90 s first response, 30 s idle, one retry of an early timeout (the timeout values only).

### 2026-11-16 — Browser access checked by a local script, written into the registry
- **Decision:** `scripts/ai/check-browser-access.mjs` (not in the app, no keys) sends each hosted provider a CORS preflight with Origin `https://vardaanbazaz.github.io` and the headers the app sends, then an unauthenticated POST to the same chat endpoint. "ok" only when the preflight allows the origin, POST and every header (a `*` does not count for Authorization) and the POST response (401/403) also carries `Access-Control-Allow-Origin`; otherwise "needs-proxy" (still selectable, with a warning in settings). Run 2026-11-16: all eight hosted providers "ok" (OpenAI, Anthropic, Gemini 403 without a key, OpenRouter, Groq, Mistral, DeepSeek, Together). Ollama / LM Studio are "local" with notes on `OLLAMA_ORIGINS` and LM Studio's CORS switch; Custom is "unchecked".
- **Why:** User request; a provider that blocks browsers would fail with a CORS error users can't diagnose.
- **Alternatives considered:** Checking from the app at runtime (rejected: would send requests before the user connects); trusting docs (rejected: CORS policies change).
- **Tradeoff accepted:** Results are a dated snapshot; rerun the script to refresh.
- **Source:** `made-now`

### 2026-11-16 — AI key kept for the session by default, outside every persisted store
- **Decision:** Keys live only in `src/features/ai/settings/keyStorage.ts`: sessionStorage `datavista-ai-keys` by default, localStorage `datavista-ai-keys` with the opt-in "Remember on this device" (one-line warning: unencrypted, readable by anyone using this browser profile); "Forget key" removes both. `aiSettingsStore` (persisted `datavista-ai-settings`) holds provider, model, base URL and privacy settings, and keeps keys in memory only (`partialize` leaves them out). `uiStore` no longer has `llmApiKey`/`llmProvider`. An old key (`datavista-ui-storage`.state.llmApiKey) is moved to "remembered" (same device-wide storage it already had) by `migrateLegacyKey`, run from `uiStore`'s `merge` and at `aiSettingsStore` load (idempotent, so module order doesn't matter), and a toast says so once (`datavista-ai-key-migrated`). "Clear all local data" also clears `datavista*` sessionStorage keys. AI settings is one dialog (`AiSettingsHost` in `Dashboard`, lazy `AiSettingsModal`), opened via `uiStore.setIsAiSettingsOpen`.
- **Why:** User request: session-only by default, opt-in remember, never in IndexedDB, exports, PDFs, logs or errors; don't silently drop an existing key.
- **Alternatives considered:** Keeping the key in `uiStore` (rejected: any future serialization of the store would leak it); encrypting at rest (rejected: the decryption key would sit beside it in the same origin).
- **Tradeoff accepted:** Users who don't tick "Remember" re-enter the key per tab/session. First-run setup saves the key for the session only (remember is in AI settings).
- **Source:** `made-now`

### 2026-11-16 — AI privacy levels with one context builder and a personal-data guard
- **Decision:** `src/features/ai/privacy/contextBuilder.ts:buildAiContext(dataset, settings, {rows})` is the only source of dataset content in AI requests (query, formula, executive summary, settings preview). Levels (per app, default Summaries — superseded by "Privacy level \"Queries\" (new default) and local query tools"): Schema (column names + types + calculated-field formulas), Summaries (+ numeric min/max/mean/missing/distinct and top 5 values of text columns), Sample rows (+ first N rows, 20–200; superseded by "Sample rows: seeded random sample per dataset"). `privacy/pii.ts:detectPii` flags emails, phones and person names by column name and by value (≥50% emails, ≥60% phones, ≥60% "Firstname Lastname" with ≥80% distinct); numeric and date columns are never flagged by value. Flagged columns are masked (`[masked email]`…) in top values and sample rows at every level unless the user ticks "Send unmasked". The executive summary's filter values and unusual-value labels pass through `valueForAi` (masked, or left out at Schema). "Preview what will be sent" builds the real request (`aiRequests.ts:previewNextRequest` → the same message builder and `client/styles.ts:buildRequest`), key shown as •••. Disclosure text in AI settings, setup, command palette, formula builder and summary consent now describes the level instead of "first 5 rows".
- **Why:** User request; DPDP: notice at the collection point and data minimisation.
- **Alternatives considered:** Masking by name only (rejected: misses `Contact` columns full of emails); dropping masked columns entirely (rejected: the model needs their names to write queries).
- **Tradeoff accepted:** The default Summaries level sends more than the old executive summary (stats and top values) but less than the old query context (no rows). Value-based name detection can mask product-like columns of two capitalised words; the user can unmask. Unmask choices are per column name, app-wide.
- **Source:** `made-now`

### 2026-11-16 — No provider connected: Connect card, offline heuristics kept, no request
- **Decision:** `isAiConnected` (key present, or keyless Ollama / LM Studio; base URL and model set) gates every AI request. When not connected, the command palette and formula builder show `ConnectProviderCard` (opens AI settings) and still run the local offline heuristic (`llmService.ts:generateOfflineFallback`); the executive summary's offline insights are unchanged. A keyless local provider counts as connected, so the summary's one-time consent applies to it too.
- **Why:** User request: no key → no request; AI features point to settings; offline insights unchanged.
- **Alternatives considered:** Hiding the offline query heuristic behind the card (rejected: removes a working offline feature and breaks existing tests for no privacy gain, it sends nothing).
- **Tradeoff accepted:** The palette shows both the card and the offline "Ask AI" option.
- **Source:** `made-now`

### 2026-11-16 — Data Explorer numeric stats use the Overview's NumericSummaryTable
- **Decision:** `DataTable.tsx` "Numeric columns" renders `features/dashboard/components/NumericSummary.tsx:NumericSummaryTable` with the same `profileNumericColumns` profiles of the shown (filtered) rows it already computed, replacing the per-column Count/Min/Max/Mean boxes. E2E helper `tests/e2e/helpers.ts:numericStat(page, column, stat)` reads a cell by header; specs that read `column-stats-*` now read `numeric-row-*`.
- **Why:** User request: the boxes printed raw `toFixed(2)` values ("78158306.00"); the table already sorts, groups thousands and trims decimals (max 2), and one component keeps both views consistent.
- **Alternatives considered:** Restyling the boxes (rejected: duplicates formatting the table already has); moving the table to `shared/` (rejected for a small fix: one import across features is enough).
- **Tradeoff accepted:** Data Explorer now imports from `features/dashboard`. Values show at most 2 decimals with trailing zeros dropped ("20.9", "400"), so e2e expectations changed. The ID/year "Distinct" line moves next to the column name, as on Overview.
- **Source:** made-now

### 2026-11-16 — Data-quality notice wording: real examples, misaligned rows described by what is flagged
- **Decision:** `dataQuality.ts:columnQuality` keeps up to two of the column's own values that need the suffix reader in `suffixCandidate.examples` (file order; the second of a different suffix shape when there is one: Size "19M", "201k"; Installs "10,000+", "500,000+"); `suffixOfferText` words the offer, and falls back to "<column> holds numbers written as text" for datasets saved before examples existed. The misaligned notice (`misalignedNoticeText`) now reads "N row(s) with 2+ values that don't fit their column (often a row shifted by a column)"; button and preview unchanged.
- **Why:** User request: the hard-coded "10,000+" or "19M" showed on every column, and the detector also flags rows with junk tokens (cafe "ERROR"/"UNKNOWN"), not only shifted rows.
- **Alternatives considered:** Taking examples from `topValues` (rejected: only categorical columns have them, and they include plain numbers that need no reader); backfilling examples on old datasets (rejected: the fallback wording is accurate without them).
- **Tradeoff accepted:** Older saved datasets show the generic wording until re-imported or a column fix recounts them.
- **Source:** made-now

### 2026-11-16 — KPI builder ignores empty values from Radix Select
- **Decision:** `KPIBuilder.tsx`: the Measure and Aggregation Selects return early on `onValueChange("")`. E2E `tests/e2e/kpi-builder.spec.ts` opens the real dialog on `tests/fixtures/playstore-insights.csv`.
- **Why:** Cause of "Aggregation empty, title 'Rating'" on the Play Store file. Not the once-per-opening init guard: logging showed it ran once with the dataset ready (measure Rating). Inside a `<form>`, Radix Select renders a hidden native `<select>` and relays its change events; when the builder opened, the value went "sum" → "avg" while the native select still held the counts-only options of no column, so it fell back to "" and Radix called `onValueChange("")`. That set the aggregation to "" ("Select agg") and the title to `kpiAutoTitle("", "Rating")` = "Rating". Unit tests of the helpers could not see it. The new spec fails without the guard ("Select agg") and passes with it.
- **Alternatives considered:** Moving the Selects out of the `<form>` (rejected: changes submit/required behaviour); keying the Select on the column so it remounts (rejected: still racy, and resets focus); upgrading Radix (not checked as a fix; larger change).
- **Tradeoff accepted:** An empty value can never be chosen in these two Selects (none of their options is empty).
- **Source:** made-now

### 2026-11-16 — Big-file check (run 3): retail sheet on the production build
- **Decision:** New local bench `scripts/bench/startup/bigfile-retail.spec.ts` (prod build via `vite preview`, fresh browser profile, 1 worker). Measured, after the fix below. XLSX `online_retail_II.xlsx`, sheet "Year 2009-2010", 525,461 rows: sheet picker 13.1 s after the file is chosen; import 36.2 s from the sheet pick (49.4 s from the file); peak main-thread JS heap 218 MB (the import worker's heap is not included), peak browser RSS 1,744 MB; longest main-thread block during import 0.96 s; Data Explorer first render 0.24 s; table scroll top to bottom (30 steps) 0.51 s, no long task; Filters 0.39 s; Pivot 0.28 s (longest block 0.15 s); KPI builder 0.06 s, save to card 0.93 s; reload (rows from IndexedDB) 3.1 s to the KPI card, longest block 1.19 s. The same rows as CSV (first 525,461 data rows of `online_retail_II.csv`): import 11.3 s, RSS 1,248 MB, longest block 0.94 s, the views within ±30 ms of the XLSX run, reload 3.2 s (block 1.24 s).
- **Why:** User request: measure first, fix only regressions or freezes over 2 s. Earlier numbers come from different setups and are compared like for like where possible: Node `bookSheets` + preview 11.6 s vs the picker at 12.1-13.1 s in the browser; Node one-sheet read 33.3 s and browser whole-workbook 45-47 s vs 36.2-45.3 s here; transfer block 1.1-2.9 s on the XLSX (dev, headless) vs 0.96 s; 1M generated rows reload 2.4-2.5 s, block 0.9-1.0 s (different data) vs 3.1 s, 1.19 s.
- **Alternatives considered:** Running the 1,067,371-row CSV (both years) — not run: the 525k XLSX already peaked at 1.74 GB browser RSS, and twice the rows would pass the ~2.9 GB budget of this machine (`~/.claude/global.md`).
- **Tradeoff accepted:** Headless timings on one laptop; the full 1M CSV was not measured in this run.
- **Source:** made-now

### 2026-11-16 — Executive summary describes only the anomalies it keeps (5 s freeze on 525k rows)
- **Decision:** `anomalyDetector.ts:detectDatasetAnomalies` builds findings without text, dedupes, keeps the top 3 per column, and only then calls `describeAnomaly`. `formatAmount` / `formatRatio` use cached `Intl.NumberFormat`s (`formatDigits`) instead of `toLocaleString(undefined, options)`. `dedupeAnomalies` is generic over the fields it reads. Output text is unchanged.
- **Why:** Regression from "Insight wording: multiples…" (same day): describing every outlier with a new formatter per call blocked the main thread for 5.0 s after importing the retail sheet and 4.8 s after a reload (CPU profile: `formatRatio` + `describeAnomaly` ≈ 85% of the block; retail Quantity/Price have tens of thousands of IQR outliers). After: 0.96 s and 1.19 s longest blocks, reload 6.9 s → 3.1 s to the KPI card.
- **Alternatives considered:** Moving anomaly detection to a worker (rejected for this run: larger change; the remaining ~1 s blocks are the row transfer and first stats pass, documented earlier).
- **Tradeoff accepted:** `detectChartAnomalies` still describes every outlier it returns (chart rows are grouped, so few; not measured slow).
- **Source:** made-now

### 2026-11-16 — KPI value in Inter with tabular figures
- **Decision:** The KPI card's big number (`KPICard.tsx`) was `font-mono` (JetBrains Mono); it is now `font-sans tabular-nums`, like the Overview row count and table numbers.
- **Why:** User check: JetBrains Mono is reserved for formulas, code and shortcuts (`tailwind.config.ts`).
- **Alternatives considered:** None.
- **Tradeoff accepted:** Digits are narrower, so long values truncate later.
- **Source:** made-now

### 2026-11-16 — Misaligned rows: detect 2+ type failures, exclude through the removed-rows path
- **Decision:** `dataQuality.ts:findMisalignedRows`: a row whose non-blank cells fail their column's type in at least 2 numeric/date columns (`toNumberOrNull` / `parseStoredDate`, same rule as the metadata pass; blanks and text columns never fail). `columnFixes.ts:misalignedRowsOf` runs it on the current rows with effective types, skipping columns whose metadata counts no invalid cell (so most datasets, including the retail sheet, scan nothing), cached per rows array + metadata. Data view shows "N misaligned rows" with a preview of 5 (first column + the failing cells) and "Exclude rows"; nothing changes until clicked. Removal model: one array, `Dataset.removedDuplicates`, holds rows removed for either reason (`RemovedRow.reason: "misaligned"`, absent = duplicate), indices are positions in the full data; `removeRows` / `restoreRemovedRows(reason)` map between full and current positions, so either action can come first and each undo puts back only its own rows. Counts: `removedDuplicateCount` + new `removedMisalignedCount`; `db.ts:removedRowCount` (their sum) gates the `removedRows` read and its length check on load. No schema change.
- **Why:** User request: the shifted Play Store row (Rating 19, Price "Everyone") skewed Rating. Counts: messy fixtures playstore 1 (that row), cafe 2, glassdoor 0, netflix 0; hr-attrition 0. Cafe's 2 are rows with two "ERROR"/"UNKNOWN" tokens, not shifted rows: the rule flags them too. Local full files (not tuned, reported): googleplaystore 1, dirty_cafe_sales 55 (same ERROR/UNKNOWN pattern), messy_cancer_lab 8 (invalid dates "2023/13/01" / "invalid" in both date columns), Uncleaned_DS_jobs 0, netflix_titles 0.
- **Alternatives considered:** Storing the finding in import metadata (rejected: changes the import output the golden tests compare, and datasets already saved would need a backfill); blocking the second removal until the first is undone (rejected: awkward on the full Play Store file, which has both); a separate removed-rows field (rejected: needs its own persistence trigger and load check).
- **Tradeoff accepted:** The field keeps its old name `removedDuplicates` though it holds both kinds (no migration). Rows with two junk tokens are labelled "misaligned". Detection skips a column for the moment between a fix and its metadata recount. A duplicate index already removed as misaligned is skipped, so undoing the misaligned rows can bring back a duplicate while duplicates stay removed.
- **Source:** made-now

### 2026-11-16 — KPI builder: Average for per-item columns, title follows until edited
- **Decision:** `columnRoles.ts:isPerItemName`: whole words of `nameWords` (case-insensitive) rating, score, rate, percent, percentage, pct, price, age, avg, average, mean, ratio, each also with a plain plural "s"; or "%" anywhere in the name. `defaultAggregationForColumn`: Count for ID/year/constant/non-numeric (unchanged), Average for a per-item name, else Sum. Card title: `kpi/lib/kpiTitle.ts:kpiTitleReducer`; "Total X", "Average X", "Count of X", "Distinct X", "Minimum/Maximum/Median X", "Std. deviation of X", "Row count"; it follows every column/aggregation change until the user types in the field, then never changes. Editing a saved card starts as typed unless its title equals the suggestion for its own settings. Supersedes the "Sum for a plain measure" part of "KPI measure defaults to a real measure".
- **Why:** User report: "Sum of Rating" = 39.3K on Play Store. Word matching keeps "Usage", "Stage", "Corporate", "Generated", "Accurate", "Rated" out.
- **Alternatives considered:** Average for every non-integer column (rejected: Price × Quantity totals are real sums); "Sum of X" titles like chart axes (rejected: "Total X" reads better on a card; the user's example "Average Rating" has no "of").
- **Tradeoff accepted:** "percentage" and plurals were added beyond the listed words. Amount-like names with a listed word ("MonthlyRate" in HR, which is an amount) default to Average. No component test (no React testing library); the title logic is a pure reducer with unit tests.
- **Source:** made-now

### 2026-11-16 — Tooltips portalled with collision handling
- **Decision:** `ui/tooltip.tsx:TooltipContent` renders in `TooltipPrimitive.Portal` with `collisionPadding` 8 (Radix flips to the other side when there is no room and shifts to stay in the viewport); `ui/popover.tsx` gets the same padding. Audit: every tooltip goes through that one component (`Hint`, DataTable headers, PivotBuilder, FilterPanel, CalculatedFieldsManager, AI panels), popovers, selects and dropdowns were already portalled, chart hovers are SVG `<title>` (native). e2e: the Price header badge tooltip is inside the viewport and `elementFromPoint` at its top, middle and bottom hits it (fails with the old component).
- **Why:** User report: Data Explorer header badge tooltips were clipped by the table's scroll box (only the bottom edge showed).
- **Alternatives considered:** Per-call `side="bottom"` on header badges (rejected: still clipped in other scroll boxes and at other scroll positions).
- **Tradeoff accepted:** Tooltip DOM lives at the end of `<body>` (inherits only global styles; none relied on local ones).
- **Source:** made-now

### 2026-11-16 — Background ribbon animation removed
- **Decision:** The aurora ribbon is always still. Removed the `aurora-sway` keyframes and the per-strand timing, `AuroraRibbon`'s IntersectionObserver / visibility tracking and `data-paused`, the "Background animation" toggle in Appearance and in first-run setup, `Appearance.backgroundAnimation`, `displayPrefs.ts:animationBlockedReason` and the `data-animation` attribute on `<html>`. UI store persist v3 → v4: `readStoredPrefs` rebuilds `appearance` field by field, so a stored `backgroundAnimation` (v2/v3) is dropped on the next write; the pre-paint script and the store share that function, so they agree. The static ribbon, glass and themes are unchanged. The glass-perf bench now compares glass on/off only.
- **Why:** User request (cleanup run 2): the animation is not wanted. It was opt-in and its measured cost (GPU 54-70% of a core with glass on, see the superseded entry) was the reason it was off by default.
- **Alternatives considered:** Keeping the code behind a hidden flag (rejected: dead code, and the setting's tests and docs would stay).
- **Tradeoff accepted:** People who had turned it on lose it without notice.
- **Source:** made-now

### 2026-11-16 — Tour and view loading: prefetch next view, opacity-only 150 ms view enter, delayed skeletons instead of spinners
- **Decision:** (1) The three lazy views live in `features/dashboard/lazyViews.ts` with `preloadView(view)`; each tour step's `before` hook preloads its own view and the next step's. (2) Views enter with `animate-view-in` (opacity 0→1, 150 ms, no translate) instead of framer-motion fades of 0.4-0.5 s with a y/x offset and the 0.3 s `animate-fade-in`. (3) `OnboardingTour.waitForSteady` waits for the header to be painted (opacity > 0) and still for 2 frames, not fully opaque for 3: with no translate, the header is in its final place from the first frame. (4) `ViewSkeleton` (nothing for 300 ms, then still grey blocks, `role="status"`, no spin or pulse) replaces the `LoadingState` spinner in the three Suspense fallbacks and the `isLoading` state; `LoadingSpinner` / `LoadingState` deleted (no other users). Button-level spinners for running AI requests are left as they are (an action in progress, not content loading).
- **Why:** Measured with `scripts/bench/startup/tour-steps.spec.ts` (prod build via `vite preview`, googleplaystore.csv, fresh context per run, 3 runs, click → next step's text, polled every animation frame in the page): before 420-720 ms per step, with a spinner flashing on Pivot→Stats and Stats→Window; after 81-197 ms per step, no spinner or skeleton painted. The floor before was the fades, which the tour must wait out, not the chunk download.
- **Alternatives considered:** Prefetching every lazy chunk at startup (rejected: costs first-load bandwidth for views many people never open); keeping the fades and not waiting for them in the tour (rejected: the popover would be placed against a header that is still moving).
- **Tradeoff accepted:** Views appear with a shorter, plainer fade. The 2-3 s the user saw was not reproduced on the prod build here (dev server lazy chunks or a slower machine are likely); the measured gain is on the prod build.
- **Source:** made-now

### 2026-11-16 — KPI measure defaults to a real measure; counts only for categorical columns
- **Status:** Superseded in part (default aggregation) by "KPI builder: Average for per-item columns, title follows until edited".
- **Decision:** `columnRoles.ts:defaultMeasureColumn` picks the first numeric column that is not ID-like, not year-like and not constant (import metadata min = max), else the first numeric column, else the first column. `aggregationsForColumn` offers Sum/Average/Min/Max/Median/Std. dev only for numeric columns; other columns get Count, Count of rows, Distinct count. `defaultAggregationForColumn`: Sum for a plain measure, Count otherwise. Changing the column resets a picked aggregation that no longer fits.
- **Why:** The builder defaulted to the first column ("Invoice", categorical) with Sum.
- **Alternatives considered:** Hiding non-numeric columns from Measure (rejected: counting invoices is a valid KPI).
- **Tradeoff accepted:** Constant detection uses import metadata, so a column made constant by a later fix is not skipped.
- **Source:** made-now

### 2026-11-16 — Insight wording: multiples for large spikes, plain difference where a percentage misleads
- **Decision:** `anomalyDetector.ts:compareToAverage(value, mean)`: "×N the average" from 2× the average up; "N% above/below average" otherwise; the signed plain difference "−53,594 vs average 4.69" when the value is negative with a positive average, or the average is zero or negative.
- **Why:** "1143121% below average" and "17497% above average" are unreadable, and a percentage below −100% has no meaning.
- **Alternatives considered:** Capping at ">100% below" (rejected: still hides the size of the gap).
- **Tradeoff accepted:** Two styles of wording side by side in one list.
- **Source:** made-now

### 2026-11-16 — Compact data-quality header badges; filtered "constant"; one plural helper
- **Decision:** (1) Data Explorer header badges are one-line buttons ("$ · undo", "-1 → missing · undo", "1 invalid"; `fixLabel.ts:fixShortLabel`), `whitespace-nowrap`, with the full text as the `Hint` tooltip and accessible name; below the `sm` breakpoint only an icon shows; the header row is `flex-nowrap`. (2) `profileNumericColumns` marks a constant profile `constantIn: "dataset" | "shown"`; under a filter that leaves one value in a varying column the stats say "same value in the N rows shown: X" with no "constant" tag (Data Explorer, Overview ledger, PDF). (3) `shared/utils/plural.ts` (`plural`, `countOf`) for count wording, verbs included ("1 row … was kept"); applied to the import notices, "(s)" strings and fixed "N rows/columns/charts" strings.
- **Why:** User report: badges wrapped into tall pills; "constant 4.1" for a filter artefact; "1 row … were kept".
- **Alternatives considered:** Container queries for the icon-only badge (rejected: no Tailwind container-query plugin; the table auto-sizes columns, so the viewport breakpoint is the practical limit).
- **Tradeoff accepted:** On wide screens a long column name plus badges widens that column instead of wrapping.
- **Source:** made-now

### 2026-11-15 — Filters and Pivot render a bounded number of elements (Play Store freeze)
- **Decision:** (1) Filters: each categorical column lists the selected values plus the 50 most common (`FILTER_VALUE_LIMIT`), with counts; the rest are reached through the column's search box and a "N more values" line. Distinct values and counts come from `shared/utils/valueCounts.ts:columnValueCounts`, computed once per rows array and column (WeakMap keyed by the rows array, so an edit or re-import recomputes) instead of a `Set` + sort per column on every render. (2) `FilterPanel` re-runs the filter query on mount only if the dataset, the filters or the store's `filteredData` changed since it last wrote them (module-level `lastApplied`); before, every visit handed Pivot a new `filteredData` and Pivot recomputed. (3) Pivot: row virtualisation above 200 rows (`@tanstack/react-virtual`, measured row heights so the Reading comfort text size works, spacer rows keep the table's column layout), at most 100 leaf columns (grand total kept, a note says how many were cut), no `transition-*` classes on cells. (4) Pivot's default row dimension is the first categorical/date column with 2-50 distinct values (else the one with the fewest), not simply the first (App, ~9.7k groups). (5) The Filters card and the Pivot settings panel are solid surfaces, not glass.
- **Why:** With googleplaystore.csv (10,841 rows) Filters built 39.8k DOM nodes (App 9,660 values, Current Ver 2,784, each a Checkbox + Label) and Pivot 29.5k (one row per App). Chrome trace, production build, headless: Filters 3.4 s to interactive, ~2.9 s of it script (React render) and ~1.3 s style + layout; Pivot 2.4 s, longest block 953-987 ms. Glass on vs off changed Filters by ~10% in headless; DOM size is the main cause. After: Filters 0.17 s (1.6k nodes), Pivot 0.05 s (0.6k), Pivot grouped by App 0.16 s cold, every one of the 9 views < 180 ms, no long task over 61 ms.
- **Alternatives considered:** Virtualising the filter value lists (rejected: a 9,660-item checkbox list is not usable even when fast; top-N + search is the better picker); computing value counts in the import worker and storing them in metadata (rejected for now: needs a schema change and a re-import of existing datasets; the per-rows-array cache gives the same speed after the first visit); keeping glass on the Filters card (rejected: the task asks for no blur behind long scrolling lists and the measured cost, while small in headless, is paid on every scroll frame on a GPU-less laptop).
- **Tradeoff accepted:** A value outside the top 50 needs a search to find. Very wide pivots show 100 columns. The pivot header widths can shift slightly the first time a virtualised pivot scrolls new rows in (auto table layout; CLS 0.012 measured). Headless timings only; the user's 15-20 s on a real GPU/compositor was not reproduced headed.
- **Source:** made-now

### 2026-11-04 — Logo final: option 1, faceted prism with rising bars
- **Decision:** Option 1 (`facet-bars`) is the final mark. `logoGeometry.ts:ACTIVE_LOGO` was already option 1; the "placeholder" wording is gone, options 2 and 3 stay in `logoVariants.ts` only so `scripts/brand/logo-options.ts` can redraw the options sheet. `npm run brand:assets` re-run: favicon.svg/.ico, logo.svg, apple-touch-icon.png and og-image.png came out byte-identical to the staged files; the PDF mark (`exportUtils.drawMonoLogo`) reads the same geometry. Supersedes the "option 1 placeholder" part of "Logo redrawn as our own mark; option 1 placeholder (batch 7 phase B)".
- **Why:** User picked option [1] after the npm run dev review.
- **Alternatives considered:** Deleting options 2 and 3 (rejected: the options sheet script uses them; they cost nothing at runtime, nothing imports them but `ACTIVE_LOGO`'s index).
- **Tradeoff accepted:** Two unused variants stay in the source.
- **Source:** made-now

### 2026-11-04 — Tour popover beside its target: sidebar item on desktop, bottom sheet below 1024 px
- **Decision:** At ≥ 1024 px (the sidebar's `lg` breakpoint) each view step highlights the view's sidebar item (`sidebar-nav-<view>`), the popover sits to its right (Floating UI flip/shift) and a `belowHeader` middleware moves it down until it clears the view's page header; the arrow is hidden on those steps (it could no longer point at the item), the dim is lighter (0.25 instead of 0.45). Appearance: `bottom-end` of the header button. Below 1024 px the sidebar is folded into the Menu button, so the step highlights the view header and the popover is a bottom sheet (fixed strategy, final `bottomSheet` middleware, width `min(32rem, 100vw - 16px)`). The mode is fixed when the tour starts. The sidebar's Tour tool now closes the phone menu first (an open menu pushed every view below the fold). The `before` hook still waits on the view header, not the sidebar item (the item never moves, so it would resolve before the view is in). e2e asserts, per step at 1280x720 and 390x844, that the popover box does not intersect its target, stays inside the viewport, is right of the sidebar item and does not cover the view title (desktop), and is pinned to the bottom edge (phone).
- **Why:** User review: the popover (placement `bottom` under the page header) hid what it explained.
- **Alternatives considered:** Keeping the header as target with `right`/`left` placement (rejected: headers span the view, there is no side to put it on); a bottom sheet on every screen size (rejected: on desktop the sidebar item is the better anchor and the page stays readable).
- **Tradeoff accepted:** On desktop the popover can cover the top-left of the view body (below the header), e.g. part of the Chart builder's chart-type buttons; on phones the sheet covers the lower ~25% of the screen.
- **Source:** made-now

### 2026-11-04 — Phone layout no longer widened by sr-only text in the Overview tables
- **Decision:** The Numeric and Categorical summary scroll boxes are `relative`. Their cells' `sr-only` spans are `position: absolute`; with no positioned ancestor inside the scroll box they escaped its clipping and widened a phone's layout viewport (HR on a 390 px iPhone emulation: 578 px; visible as a 1734 px-wide `overview-light-390.png` in batch7-b). Found while the tour's bottom sheet failed to receive clicks under mobile emulation.
- **Why:** The page must not scroll sideways at phone width.
- **Alternatives considered:** `overflow-x: clip` on main (rejected: hides the symptom, other absolute children would still be mis-clipped).
- **Tradeoff accepted:** None found.
- **Source:** made-now

### 2026-11-04 — XLSX: sheet list first, then only the chosen sheet
- **Decision:** `importCore.ts:xlsxRecords` reads `XLSX.read(bookSheets: true)` (names only), and for several sheets `previewSheets` (`sheetRows: 3`, row counts from SheetJS's `!fullref` = the declared `<dimension>`, headers from the first rows) → sheet picker → `readWorkbookWithCalendarDates(bytes, chosen)` with SheetJS `sheets` (only the chosen sheets are parsed; the date rewrite now loops over `Object.keys(workbook.Sheets)`, since `SheetNames` still lists every sheet). Progress text is a new `detail` on progress messages (`XLSX_DETAIL`): "Reading workbook — large files can take a minute", for several sheets "…; you'll choose a sheet next", after the pick "Reading sheet “…” — large files can take a minute", then "Converting rows" with %. A sheet whose 3-row preview fills up with no longer range reported (exactly 2 data rows, or no declared range) is read again with 1,001 rows: exact up to 1,000, otherwise "1,000+ rows" (`rowCountUnknown`; not covered by a test, since SheetJS always writes the range). Measured in Node (SheetJS 0.20.3, online_retail_II.xlsx, 44 MB, 2 sheets): full read of both sheets 59.5 s (old: picker after this); `bookSheets` 3.3 s; `sheetRows` preview 8.3 s; one sheet with `sheets` 33.3 s. In the browser (headless Chromium, screenshot run) the sheet-list step began 4.5 s after the file was chosen; the time to the picker was not timed separately.
- **Why:** User saw "Parsing: working… 7.8 s" and no picker; it only appeared after the whole workbook was read (~45-60 s).
- **Alternatives considered:** `sheetRows` preview for every file (rejected: a one-sheet file would pay ~8 s for nothing; `bookSheets` is ~3 s); counting rows by scanning sheet XML ourselves (rejected: SheetJS already exposes the declared range).
- **Tradeoff accepted:** Several-sheet files read the zip up to three times (names, preview, chosen sheet), about 12 s more CPU than one pass for a single chosen sheet, but less than before (≈45 s vs ≈60 s) and the question comes first. "Append all sheets" still parses every sheet. Row counts in the picker are the declared ranges (trailing formatted blank rows count); the imported count is exact.
- **Source:** made-now

### 2026-11-04 — Import dialog: indeterminate bar, plain Cancel, raw values wrap between values
- **Decision:** `ui/progress.tsx` gets `indeterminate` (Radix `value={null}`, no aria-valuenow): a 35% segment sliding with `transform` only; with reduced motion a still, striped full bar (explicit rules, since the global reduced-motion rule would park the segment off the track). The progress line reads "<detail or stage> · <seconds or %>". Cancel is a plain button with the disabled reason written beside it; its `Hint` tooltip opened on the dialog's initial focus (Cancel is the first focusable element) and sat over the progress bar, which is the most likely source of the reported overlap (not reproduced on the old build; the e2e now checks Cancel is below the bar and text and no tooltip is open). Import summary raw values: no `break-all`; each word is `whitespace-nowrap`, so lines break only at " | " or spaces inside a value.
- **Why:** User review items 3b-3d.
- **Alternatives considered:** `overflow-wrap: anywhere` (rejected: still splits "3.0M"); keeping the tooltip with `onOpenAutoFocus` moved to the title (rejected: the label already says Cancel).
- **Tradeoff accepted:** A single very long token (a URL) makes the summary table scroll sideways inside its box instead of wrapping.
- **Source:** made-now

### 2026-11-04 — "Add KPI" on the Overview; first KPI creates a dashboard
- **Decision:** Before: the KPI builder opened only from "Add KPI Card" in the Overview header while a dashboard was open (Sidebar → Dashboards → create/open one), or by editing a card in the dashboard grid; on the plain Overview there was no way in. After: "Add KPI" is always in the Overview header (`overview-add-kpi`). With a dashboard open it adds to it; without one, saving creates "<dataset> KPIs" (numbered if taken) for the active dataset via `createDashboard`, opens it and adds the card, so the card shows at once; Cancel creates nothing. The builder says so (`saveNote`).
- **Why:** User review item 4: KPI cards had lost their entry point in the redesign. KPI cards are stored per dashboard (`dashboardStore.addKpiCard(dashboardId, …)`), so a builder opened without one would save nothing.
- **Alternatives considered:** KPI cards on the Overview without a dashboard (rejected: a new storage model); creating the dashboard when the builder opens (rejected: Cancel would leave an empty dashboard).
- **Tradeoff accepted:** The new dashboard starts with no charts (the Overview's chart count switches to that dashboard's 0).
- **Source:** made-now

### 2026-11-04 — Overview bento in one row; tile subtitles describe their tile
- **Decision:** Large screens: one row of four tiles, `1.35fr 1.15fr 1fr 1fr` (Rows a little wider: it carries the filter bar), all the same height; below `lg` a 2 x 2 grid with Rows across the top. Rows was a 2-row tile with a 44 px number and empty space. Subtitles: Rows "All rows shown · no filters" / "All shown · N filters active" / "N shown (x%) · N filters"; Columns unchanged ("3 numeric · 9 categorical · 1 other"); Charts "None yet: build one in Charts" / "On this dashboard" / "Saved for this dataset" (was the filter count, "No filters"); Missing values "x% of cells · N invalid numbers" / "No blank cells · no invalid numbers" (cells = rows shown × numeric and categorical columns).
- **Why:** User review item 6.
- **Alternatives considered:** Keeping Rows as the big tile but shorter (rejected: still unbalanced next to three small tiles).
- **Tradeoff accepted:** The row count is no longer visually larger than the other numbers.
- **Source:** made-now

### 2026-11-04 — Missing-value text is null in every column at import; shares below 0.1% read "<0.1%"
- **Decision:** `utils/numeric.ts:MISSING_TEXT_TOKENS` = "", n/a, nan, null, none, #n/a, undefined (case-insensitive, after ASCII trim). `parsingService.ts:cleanValue` stores such cells as null in every column (was "", null, undefined, n/a), so they count as missing in categorical and date columns too, and charts, filters and pivots no longer show "NaN" as a category. "NA" and "-" are not in the set (real categories, e.g. North America); in numeric columns they are still non-numbers via `NULL_TOKENS`. The messy golden generator's `INGEST_NULLS` matches (regenerated with pandas 3.1.0: unchanged). Affected columns in test-data-local (missing before → after; distinct): googleplaystore Rating 0 → 1,474 ("NaN" was counted as an invalid number, now missing; 41 → 40 distinct), Type 0 → 1, Current Ver 1 → 8, Android Ver 1 → 3; messy_cancer_lab signout_date 248 → 494 and creation_date 113 → 244 (were invalid dates), price 339 → 697. No change in Uncleaned_DS_jobs, dirty_cafe_sales, netflix_titles (csv/xlsx), netflix-test.xlsx, online_retail_II.csv (creditcard.csv and online_retail_II.xlsx not checked). New `utils/percent.ts:formatShare` / `formatPercent`: one decimal, "<0.1%" for a non-zero share under 0.05%, ">99.9%" for a partial share that would round to 100.0%; used by the Categorical table, the Rows tile and Stats "Missing Records".
- **Why:** User review item 7: "NaN" was missing in numeric columns but a category in Type.
- **Alternatives considered:** Treating the tokens as missing only in the summaries (rejected: charts, filters and pivots would still group "NaN"); including "na" and "-" (rejected by the brief).
- **Tradeoff accepted:** The original text of those cells is not kept (the Data Explorer shows them blank). Datasets already stored in IndexedDB keep the old strings until they are imported again.
- **Source:** made-now

### 2026-11-04 — Insights: near-unique label columns give row-level findings, one per label
- **Decision:** `anomalyDetector.ts:isNearUniqueColumn`: an ID-like name, the `identifier` role, or more than `HIGH_CARDINALITY_SHARE` (50%) of non-blank values distinct, decided from import metadata (all rows) so a filter can't make an ordinary column look unique. When the label column (the first categorical column, or the chart's X / group-by) is near-unique, a finding is row-level: "Reviews: 78,158,306 (App: Facebook), 17497% above average.", chip "Reviews: 78,158,306 (App: Facebook)" (`anomalyChipText`), never "for App = Facebook". `dedupeAnomalies` keeps one finding per value column and label (the most extreme, since outliers are now ranked by deviation in chart detection too) before the top 3: Play Store lists Facebook twice (78,158,306 and 78,128,208 reviews) and WhatsApp twice with identical rows. Low-cardinality labels keep "MonthlyIncome for Attrition = No". Tests on a new 309-row Play Store excerpt, `tests/fixtures/playstore-insights.csv` (CC BY-SA 4.0, rows listed in tests/fixtures/README.md).
- **Why:** User review item 5.
- **Alternatives considered:** Labelling by the next low-cardinality column (Category) (rejected: a row's outlier is not the group's); deduplicating only identical values (rejected: Facebook's two rows differ by 30,098 reviews).
- **Tradeoff accepted:** Two different apps with the same name would merge into one finding.
- **Source:** made-now

### 2026-11-03 — Surface rule sharpened: forms and short info cards are glass (batch 7 phase B)
- **Decision:** GLASS = frame (sidebar, header), KPI/bento tiles, dialogs, popovers, menus, forms and short info cards. SOLID = dense data only: tables, data grid, pivot grid, numeric/categorical summaries, chart cards/plots, long value lists. Changed to glass: Upload panel (`FileUpload`, drop zone kept as a subtle inner fill), Filters panel (its value lists became small solid insets), Chart builder, Data Explorer controls card, Pivot settings, Pivot empty/error states, Stats column/outlier/pivot pickers and their empty state, Window builder form and "configured columns" card, Export cards, Global filter bar, AI insights card, Overview error/empty cards, and every dialog that forced `surface-solid` / `bg-background` over the float glass (calculated fields, conditional formatting, dataset update, drill-through, snapshots, save view, create/instantiate template, KPI builder). The drill-through table got a solid inset. `Card` and `DataPanel` take `surface="glass"`. Inside glass, CSS remaps `--muted-foreground` to `--frame-muted` and restores the data value (`--data-muted-foreground`, generated) inside `.surface-solid`, `.bg-card` and inputs, so moving a form onto glass needs no per-class edits. Selected options on glass use foreground text with a `primary-ink` border instead of `primary-ink` text on a 10-20% accent tint. Data numbers in Stats / Pivot / Data Explorer stats use Inter tabular figures instead of JetBrains Mono (per the batch 7 type decision). Contrast audit extended: status colours and primaryInk on frame glass, text on the 10% accent tint, frameMuted on bg-muted, borderStrong and the selected bar on the accent fill (1081 checks); Clay, Taupe and Dusk status colours were darkened/lightened by 4-17% to pass. New `tests/e2e/glass-text.spec.ts` fails on any text drawn on glass in a colour the audit does not cover. Supersedes the "forms with small text are solid" part of "Glass frame, solid data (batch 7)".
- **Why:** User feedback: the upload box was solid in every theme while everything else was glass. The token remap and the guard make the rule safe to apply without auditing each class by hand.
- **Alternatives considered:** Replacing every `text-muted-foreground` inside new glass surfaces by hand (rejected: easy to miss, no guard); keeping builders solid (rejected by the brief).
- **Tradeoff accepted:** The Pivot Grand Total row and correlation heat cells keep their batch 6 styling; the global `.bg-card` reset assumes `bg-card` always marks a data/input surface.
- **Source:** made-now

### 2026-11-03 — Borderless controls: icon ≥3:1, hover draws an inset edge (batch 7 phase B)
- **Decision:** Ghost buttons (nav items, icon buttons, the dialog close button) stay borderless at rest. Icons are frameMuted or foreground (≥4.5:1 on glass, audited); hover adds the accent fill plus a 1px inset `border-strong` edge (≥3:1 on the accent, audited); focus keeps the 2px ring; the selected nav item keeps fill + 3px `primary-ink` bar + semibold label. Batch 6 button aliases (`premium`, `engraved`, `plate`, `glass`) removed and callers renamed.
- **Why:** User decision 4: keep them borderless, but every state must be clearly visible; the accent fill alone is ~1.1:1 against glass.
- **Alternatives considered:** A darker accent fill (rejected: would need ≥3:1 against glass, i.e. a heavy block on every hover).
- **Tradeoff accepted:** Hover has a visible edge, slightly busier than a fill-only hover.
- **Source:** made-now

### 2026-11-03 — First-run setup replaces the welcome dialog and the auto-started tour (batch 7 phase B)
- **Decision:** `SetupFlow` (dialog, 3 screens + an end screen): Look (Light / Dark / Automatic with day/night pickers and device/schedule switch, then every theme by group), Effects & comfort (transparency, background animation (off), reduce motion, high contrast, text size, each with a one-line hint, plus a live preview built from the real surface classes), AI key (optional, provider + key, privacy note next to the field: data stays in the browser, key stored unencrypted in localStorage, what an AI call sends). End: "Take the tour" / "Start with sample data" / "Just explore". "Use recommended settings" on any screen resets that screen and later ones to defaults, keeps earlier choices, and jumps to the end. Choices apply live through the same store as Appearance; controls are shared (`appearanceControls.tsx`). Shown only when `hasCompletedSetup`, `hasSeenTour` and `datavista-visited` are all unset and there are no datasets (`shouldOfferSetup`); finishing or closing sets `hasCompletedSetup` (persisted, store v3) and `datavista-visited`. "Run setup again" in Appearance. `WelcomeOverlay` deleted; `uiStore.onRehydrateStorage` no longer starts the tour. Sample data moved to `features/datasets/sampleData.ts`. `uiStore.showWelcome` is left in place (unused) because persistence and validators still read the old IndexedDB row.
- **Why:** User decision 5. Without removing the welcome dialog and the auto-tour a new user would get three overlays at once.
- **Alternatives considered:** A full-page onboarding route (rejected: more surface, the app shell behind a dialog shows the theme choice live).
- **Tradeoff accepted:** Older installs that never saw the tour but have `datavista-visited` set do not get setup (they are returning users).
- **Source:** made-now

### 2026-11-03 — Tour rebuilt: one step per view in sidebar order, each step waits for its target (batch 7 phase B)
- **Decision:** `OnboardingTour` steps come from `TOUR_STOPS` (Overview → Upload → Filters → Charts → Data Explorer → Pivot → Statistics → Window Functions → Export), then Appearance (header button; on phones the menu button). Each step's Joyride v3 `before` hook switches to the view and waits (`waitForSteady`) until the target, the view's page header (`PageHeader tourId` → `data-tour="view-<id>"`, or the Overview hero / empty states), is laid out, fully opaque and unmoved for 3 frames (framer entrances, lazy Pivot/Stats/Window chunks). `skipBeacon`, close button = skip, Esc / Skip / close / finish all set `runTour` false and the component unmounts Joyride, so no beacon or overlay can remain. Old sidebar `data-tour` attributes and the duplicate `dataset-grid` removed. e2e runs the whole tour, checks the order against the sidebar DOM and that each target is visible and in the viewport, and that closing mid-way or Esc leaves no beacon or overlay.
- **Why:** User decision 6: the old tour jumped between unrelated views and, with `continuous`, the close button advanced to the next step's pulsing beacon.
- **Alternatives considered:** Controlled `stepIndex` with our own navigation (rejected: v3 `before` hooks do the same with less state).
- **Tradeoff accepted:** Sidebar-only items (datasets, dashboards, Co-Pilot) are not in the tour; per-section tutorials are a later batch.
- **Source:** made-now

### 2026-11-03 — Logo redrawn as our own mark; option 1 placeholder (batch 7 phase B)
- **Status:** Placeholder part superseded by 2026-11-04 — Logo final: option 1, faceted prism with rising bars.
- **Decision:** Three options drafted as flat polygons (`src/shared/brand/logoVariants.ts`, sheet `docs/design/batch7-b/logo-options.png` (archived outside the repo in `datavista-notes/` since 2026-11-24) at 16/32/128 px on Light, Clay and Dark, full colour and single colour): 1 faceted triangular prism at an angle with three rising bars; 2 rounded tilted prism with a fan of chart wedges; 3 hexagonal crystal with four slanted-top stepped bars. Each has a 16-23 px version (prism + 2 bands). Option 1 is live (`logoGeometry.ts:ACTIVE_LOGO`): app `Logo`, favicon/ico/apple-touch/og via `npm run brand:assets`, PDF via `drawMonoLogo` (shape list, tints by mono opacity). One fixed spectrum (coral, amber, teal, blue) in every theme; single colour for favicon, high contrast and PDF. Supersedes "Prism logo from one geometry (batch 7)".
- **Why:** User decision 3: the beam-in / rainbow-out equilateral prism read as Pink Floyd's "Dark Side of the Moon". The new marks have no incoming beam and the spectrum leaves as data (bars or a fan chart).
- **Alternatives considered:** Keeping the prism with a rounded outline only (rejected: still a light-beam motif).
- **Tradeoff accepted:** Option 1 is a placeholder until the user picks; switching is one line plus `npm run brand:assets`.
- **Source:** made-now

### 2026-11-03 — Ribbon still by default; opt-in drift as a compositor animation (batch 7 phase B)
- **Superseded by:** 2026-11-16 — Background ribbon animation removed
- **Decision:** Background animation is off by default (`DEFAULT_APPEARANCE`; store v3: a stored v1/v2 `true` was the old default, not a choice, so `readStoredPrefs` reads it as off, in the pre-paint script and the store alike). When a person turns it on, each strand gets a CSS `aurora-sway` animation of `transform` only (translate, alternate ease-in-out, per-strand duration and phase via custom properties) at the display's rate; the strand's SVG blur is rasterised once in its layer, nothing animates blur, filters or gradients, and the 8 fps timer is gone. The animation is attached only while `data-paused="false"` (on screen, tab visible, motion not reduced, high contrast off). Removed three endless idle animations that kept glass re-compositing: the pulsing Sparkles icon in the AI insights card (now glass), the drill-through title icon, the spinning icon on Pivot's "Filtered view" chip; `glass-text.spec.ts` now fails on any endless animation at idle. Measured idle on Overview with the HR template, headed Chromium, Intel UHD (CometLake GT2), hardware raster + compositing, CPU % of one core over 10 s (two runs each): default (glass on, animation off) renderer 1.0-1.3, GPU 0 (before: renderer 5.9-6.6, GPU 9.8-10.4, from the pulsing icon); glass on + animation on renderer 8.6-9.8, GPU 54-70 (old 8 fps stepping: renderer 6.5-13.8, GPU 19-31); animation on, glass off GPU 24-29. Smooth motion under glass costs about 2-3x the stepped drift because every frame re-blurs the sidebar, header and tiles; that is why it is opt-in and the setting says to leave it off if things feel slow or on battery.
- **Why:** User feedback: the animation made the app feel clunky; stepped 8 fps looked choppy. Decision 1: static by default, smooth compositor-only motion when chosen.
- **Alternatives considered:** Keeping 8 fps stepping (rejected: visibly choppy); animating only where no glass sits above (not possible: the sidebar and header span the ribbon); a canvas/WebGL ribbon (main-thread or GPU work every frame, larger code).
- **Tradeoff accepted:** With animation on, an Intel iGPU spends over half a core on the drift.
- **Source:** made-now

### 2026-11-03 — CI e2e: a11y split into three parallel tests, two workers, toasts at the bottom on phones (batch 7 phase B)
- **Decision:** `tests/e2e/a11y.spec.ts` = three independent tests (views without data, views with HR, dialogs), each opening the app and importing HR once and switching Light → Dark → Light high contrast in the page through the Appearance panel; `settle()` waits for finite animations and the view's entrance (opacity 1, position still for 2 frames) instead of a fixed 1.5 s; axe's `incomplete` color-contrast notes on glass are no longer printed (the contrast audit covers them). CI runs on 2 workers (`playwright.config.ts`). The full theme × contrast × view survey stays local (`scripts/design/axe-survey.spec.ts`, now failing on violations). Mobile-nav slowdown (3.6 s → 8.3 s per test): the Radix toast viewport was `top-0` full width on phones and covered the sticky mobile header (sticky since batch 7) for the toast's 5 s, so each first `tap()` on the menu button retried until it closed; the toast viewport is now bottom-right on every screen. Measured locally (8-core laptop, `CI=1`): full suite 11.0 min wall on 1 worker (10.9 min of test time) → 4.7 min wall on 2 workers (9.0 min of test time, with 8 new tests: setup, tour, glass-text guard); a11y 6.4 min → about 1.5 min wall; mobile-nav 8.8-9.3 s → 3.4-4.1 s per test. The CI job adds `npm ci` and the Chromium install (about 1-1.5 min); GitHub's public-repo runners have 4 vCPU, so the first real CI run is the number to check against the ~5 min target.
- **Why:** User decision 7 (target: e2e job back under ~5 min).
- **Alternatives considered:** Matrix shards (rejected: each shard pays `npm ci` and the Chromium install again); disabling toasts in tests (rejected: the overlap was a real phone bug).
- **Tradeoff accepted:** CI covers one high-contrast set (Light); Dark high contrast and the other themes are covered by the contrast audit and the local survey.
- **Source:** made-now

### 2026-11-02 — Glass frame, solid data (batch 7)
- **Status:** Partly superseded by 2026-11-03 — Surface rule sharpened: forms and short info cards are glass (batch 7 phase B); button aliases removed in Borderless controls (batch 7 phase B).
- **Decision:** Replace the Dark Academia look. Frame surfaces (sidebar, sticky top header, KPI/bento tiles, page-header toolbars, empty states, dialogs, popovers, menus, tooltips, toasts) are glass: `.surface-glass` (tint at `--glass-alpha`, 18px backdrop blur, thin highlight edge) or `.surface-float` (tint at `--float-alpha`, 24px blur, stronger shadow). Data surfaces (tables, summaries, chart cards and plots, cards/forms with small text) are `.surface-solid` (card colour at 95%, no blur). Overview is a Bento grid of glass tiles over solid "Numeric columns" / "Categorical columns" tables. Removed: `src/shared/components/ornament/*`, Simple frames, roman numerals, tracked capitals (`catalogue-label` → plain `text-caption font-semibold`), Ex Libris / Ledger wording, parchment/oxblood/gold tokens and the zinc/gray remap, docs/design/phase-a and phase-b. Controls never sit straight on the ribbon: page-header actions are on a glass toolbar and hero buttons on a glass panel. New `src/shared/components/surface/` (GlassPanel, DataPanel, PageHeader, EmptyState, CountBadge, AuroraRibbon). Desktop gets a sticky glass top header (breadcrumb, Global search, Appearance); on phones the sidebar's compact row stays the header (sticky; not sticky while its menu is open, so the menu pushes the view down and a tap outside still reaches it). Batch 6 button variant names (`plate`, `engraved`, `premium`, `glass`) are kept as aliases until phase B renames callers.
- **Why:** The user rejected Dark Academia for a data tool; agreed direction is Fluent-like glass for the frame, solid opaque data, PostHog/Linear density without playfulness.
- **Alternatives considered:** Glass on data panels too (rejected: blur behind small text hurts legibility and costs a re-blur per scroll frame over large areas); keeping `.glass` as the class name (rejected: it was a solid card in ~20 call sites, so redefining it would silently make them translucent; out-of-scope uses were mapped to `.surface-solid`).
- **Tradeoff accepted:** Ghost buttons (nav items, icon buttons) have no resting border; they are identified by icon + label and get a fill on hover/focus. The brief says "every interactive control has a visible boundary"; inputs, selects, outline/secondary buttons and checkboxes have a ≥3:1 boundary, ghost buttons do not. Flagged for the user. Line charts still have no Group by (existing limitation), so the Charts screenshot's line is single-series.
- **Source:** made-now

### 2026-11-02 — Theme registry in TypeScript, generated CSS, composited contrast audit (batch 7)
- **Decision:** `src/shared/theme/themes.ts` holds every theme (Light, Dark; Mist, Mint; Clay, Taupe, Dusk; Graphite, Midnight, Carbon) as one typed token set: frame (`background`, `frameMuted`, `glass`, `glassAlpha`, `floatAlpha`, `glassBorder`), data (`card`, `muted`, `mutedForeground`), accent (`primary`, `primaryForeground`, `primaryInk`, `accent`), boundaries (`border`, `borderStrong`, `ring`), status, `chart[5]`, `ribbon[4]` + `ribbonOpacity`, and `scheme` (data-surface polarity → `.dark`, `color-scheme`). `npm run theme:css` renders `themes.generated.css` (HSL triplets with the hex in a comment; `:root[data-theme]` + `[data-contrast="high"]` blocks); `tokens.generated.test.ts` fails if it is stale. `contrastAudit.ts` checks each theme and its high-contrast variant on the colour actually drawn: frame text on background and every ribbon stop and gradient midpoint at peak opacity; frame glass composited over those; floating glass over those plus data surfaces, filled buttons and chart marks, and under the dialog overlay; data text on the 95% card over the frame; accent fills; control boundaries, ring and filled buttons on glass and data (3:1). 822 checks, all pass. High contrast is derived (`highContrastTokens`): opaque glass and data, `border = borderStrong`, secondary text = pure black/white text, ribbon off. Mid-tone themes keep frame luminance near 0.28-0.33 (Clay, Taupe: near-black text) or 0.075 (Dusk: near-white text); secondary text on the frame (`frameMuted`) is close to the main text there, and muted data text is only used on data surfaces. Values were tuned with a search script; Mist/Mint/Clay/Taupe/Dusk/Midnight names and hues drew on the colour reference (Neutral Gray, Light Brown Drab, Ivory Buff, Dull Violet Black, Peacock Blue, Coral Red).
- **Why:** One schema so adding a theme is one entry; the test must prove glass contrast against the worst point behind it, which a CSS-only token file could not express. Tailwind `/alpha` modifiers keep working with HSL triplets.
- **Alternatives considered:** Hand-written CSS blocks parsed by the test (batch 6; rejected: no types, no derived high contrast); a Vite plugin that generates CSS at build time (rejected: harder to review, PostCSS/HMR ordering); measuring text behind floating glass (rejected as unrealistic: thin strokes blur into their surface; large areas such as bars and buttons are included).
- **Tradeoff accepted:** Contrast is computed on unblurred stops, which is stricter than what the eye sees; the `saturate()` that Fluent uses on the backdrop is left out because the audit cannot model it. axe reports text on glass as "incomplete" (it cannot compute a translucent background); the audit is the gate for that.
- **Source:** made-now

### 2026-11-02 — Appearance panel and Automatic theme (batch 7)
- **Decision:** "Reading comfort" becomes "Appearance": theme (Default: Light, Dark, Automatic; then Light / Neutral & warm / Dark groups, each a swatch showing ribbon + glass + accent), Transparency effects, Background animation, Text size, High contrast, Motion. Automatic = a Day and a Night theme from any group, switched by "Follow device" (`prefers-color-scheme`, live) or "Schedule" (local times, default 07:00 / 19:00; day is [dayStart, nightStart), wrapping past midnight; equal times = always day). Store: `uiStore.themeSetting` + `appearance` (persist v2; v1 `theme`/`readingComfort` migrated by `boot.ts:readStoredPrefs`; `simpleFrames` dropped). Pre-paint: `vite.config.ts:themeBootPlugin` inlines `boot.ts` (`bootTheme`, `resolveThemeId`, `readStoredPrefs`, `applyAttributes`, serialised with `Function#toString`) as the first `<head>` script; `main.tsx` and `ThemeProvider` call the same functions; `boot.test.ts` runs the real script text against a fake window and compares. Transparency is forced off (CSS) by high contrast, `prefers-reduced-transparency` and missing `backdrop-filter`, and the panel says why; the ribbon is still with reduced motion and hidden in high contrast. The theme is no longer stored in IndexedDB `uiState` (an old row is ignored). Alt+T fixes Light or Dark. `next-themes` removed (sonner reads the resolved scheme).
- **Why:** Brief. The boot script must exist because `main.tsx` is a deferred module (a dark or mid-tone theme would flash light first); sharing the functions removes drift. IndexedDB hydration could flip the theme after first paint.
- **Alternatives considered:** Geolocation sunrise/sunset (out of scope by brief); storing a resolved background colour for the boot script (rejected: duplicates the registry).
- **Tradeoff accepted:** A schedule switch while the tab sleeps happens when it becomes visible again (visibilitychange), not at the exact minute.
- **Source:** made-now

### 2026-11-02 — Aurora ribbon: three blurred SVG strands, drift stepped at 8 fps (batch 7)
- **Status:** Superseded by 2026-11-03 — Ribbon still by default; opt-in drift as a compositor animation (batch 7 phase B).
- **Decision:** `AuroraRibbon` renders three SVG strands (our own S-curve shapes; gradients from `--ribbon-1..4`; blur as an SVG `feGaussianBlur` inside each strand) in an absolutely positioned layer at the top of the page, behind sidebar, header and tiles; it scrolls away and fades into `--background` (bottom 38%) before the data. The drift (sine sway, 27-46 s periods, transform only) is stepped by a timer at 8 fps, not a 60 fps CSS animation. No timer runs when off-screen (IntersectionObserver), the tab is hidden, motion is reduced, Background animation is off or high contrast is on; `display: none` in high contrast. Hero size (44rem) on the empty Overview and Upload, 26rem elsewhere. Peak opacity per theme is part of the contrast audit.
- **Why:** Brief: lightweight, no WebGL/canvas library. Blur inside the strand's own paint plus transform-only animation keeps the drift on the compositor without repaints.
- **Alternatives considered:** CSS keyframes at display rate (first version; rejected after measuring: with glass above the ribbon every frame re-blurs the sidebar, header and tiles, about half a core of GPU-process time idle on Intel UHD for a drift of ~3 px/s, i.e. < 0.1 px per frame); CSS `filter: blur()` on the moving layer (re-applied per frame by the compositor); canvas noise gradient (main-thread work every frame).
- **Tradeoff accepted:** At 8 fps each step is < 0.5 px, so stepping is not visible at this speed; a faster drift would need a higher rate. A small timer runs on the main thread while the ribbon moves.
- **Source:** made-now

### 2026-11-02 — One chart palette per theme, validated in CI (batch 7)
- **Decision:** Each theme has a five-slot categorical palette in fixed hue order (blue, red-orange, teal, magenta, gold) tuned to its own data surface (card at 95% over the background) with per-theme hue shifts. The dataviz skill's `validate_palette.js` is ported to `colorMath.ts:validatePalette` and run by `palette.cvd.test.ts` (lightness band, chroma floor, protan/deutan ΔE ≥ 8 on adjacent pairs including the wrap-around pair, normal-vision ΔE ≥ 15, every mark ≥ 3:1 on the plot). All ten pass the target (worst adjacent CVD ΔE 11.1-12.1).
- **Why:** Batch 6 ran the validator from outside the repo, so nothing re-checked it; the brief asks for a palette per theme.
- **Alternatives considered:** One palette for all light and one for all dark themes (rejected: mid-tone and tinted surfaces shift contrast; per-theme hues give each theme its character).
- **Tradeoff accepted:** All-pairs CVD separation is not enforced (legends are always shown for grouped charts). Colours still repeat after five groups.
- **Source:** made-now

### 2026-11-02 — Inter (variable) for UI and data, JetBrains Mono for code only (batch 7)
- **Decision:** `@fontsource-variable/inter` (one latin woff2, 48 KB, every weight; latin-ext 85 KB loads only when a glyph needs it) for all UI and data text, with tabular figures on tables, KPI tiles and chart text. JetBrains Mono kept only at 400 (21 KB) for formulas, code and keyboard shortcuts. Numbers in tables use Inter `tnum`, not mono. Removed `@fontsource/source-serif-4`, `@fontsource/cormorant-garamond`, JetBrains Mono 500/700.
- **Why:** Brief (modern sans, offline). Inter's tabular figures align columns as well as a mono face while being ~25% narrower and easier to read in dense tables; mono is clearer only where character-exact reading matters (formulas, code).
- **Alternatives considered:** Geist (larger variable file for the same coverage); static Inter 400/500/600 (≈ 69 KB for three weights vs 48 KB variable).
- **Tradeoff accepted:** Variable font rendering differs slightly between platforms.
- **Source:** made-now

### 2026-11-02 — Prism logo from one geometry (batch 7)
- **Status:** Superseded by 2026-11-03 — Logo redrawn as our own mark; option 1 placeholder (batch 7 phase B).
- **Decision:** New mark: a beam enters a gradient prism (violet → indigo) and leaves its right face as a fan of five bands (coral, amber, teal, blue, violet, top to bottom as real refraction orders them; three wider bands below 24px). One fixed brand gradient in every theme; a single-colour version (bands as stepped opacity or tints) for the favicon (switches colour with `prefers-color-scheme`), high contrast (`Logo` follows `appearance.highContrast`) and the PDF report (`exportUtils.ts:drawMonoLogo`, jsPDF polygons). Geometry in `src/shared/brand/logoGeometry.ts`; `npm run brand:assets` writes `public/favicon.svg|ico`, `logo.svg`, `apple-touch-icon.png`, `og-image.png`; `og:image` now points at the Pages URL (was a lovable.dev image).
- **Why:** Brief. One geometry keeps app, favicon and PDF identical.
- **Alternatives considered:** Outline-only prism (rejected: disappears at 16px).
- **Tradeoff accepted:** "Light through a prism" is a well-known motif; this version's filled gradient prism and widening flat fan are ours, but the user should judge the resemblance to other prism marks.
- **Source:** made-now

### 2026-11-01 — Phase B rollout: defaults flipped, roles on stats, ledger Overview (batch 6)
- **Status:** Superseded (visual parts: buttons, cards, dialogs, ledger look) by 2026-11-02 — Glass frame, solid data (batch 7). Kept: column roles, legends, offline wording, jsx-a11y as errors.
- **Decision:** `Button` default/premium = engraved oxblood, outline = embossed plate; `Card` = double rule; `DialogContent` ornate by default (`corners={false}` for edge-to-edge content such as the command palette). New `primary-ink` token (dark `#D97A8B`, light `#7C2438`) replaces `text-primary` for text and icons (Main was 1.8:1 on dark). Raw zinc/gray/status-hue literals moved to tokens; status keeps an icon + words, colour is never the only signal (gold included, per the user's answer). `services/stats/columnProfile.ts` gives every numeric column a role (constant / id / year / measure) used by the Overview ledger, Data view column stats and the PDF summary: ID/year columns get count, distinct, min and max (no sum or average), constant columns one line. Overview: one sortable numeric ledger (sticky header, double header rule, count/average/min/max/sum/missing/invalid) and a categorical ledger (chosen over compact tiles after comparing both: `docs/design/phase-b/compare-categories-*.png`, no longer kept). Offline AI summary names the grouping column and drops filler. Charts: HTML legend for grouped/multi-series charts, Y title placed from the measured tick width, chart text and margins scale with Reading comfort, theme-coloured outlier badge. Light chart gold `#8D6300` and forest `#1C5F31` (warmer gold, CVD kept). Column names are never uppercased; tracked capitals only on section labels. jsx-a11y recommended rules are errors.
- **Why:** User review of phase A and the phase B brief.
- **Alternatives considered:** Compact category tiles (kept as a screenshot only); per-call-site `text-primary` fixes (86 sites, a token is one place).
- **Tradeoff accepted:** Ledger adds a Count column beyond the requested list (needed for ID/constant rows). Chart colours still repeat after 5 groups (legend says so).
- **Source:** made-now

### 2026-11-01 — `cn` knows the custom type scale (tailwind-merge config)
- **Decision:** `src/shared/lib/utils.ts` builds `cn` from `extendTailwindMerge` with a `font-size` group for `text-display|h1|h2|h3|body|caption|kpi|dataTable`; `src/shared/lib/__tests__/cn.test.ts` covers it.
- **Why:** Found while checking the phase A dialogs: tailwind-merge read `text-h2` as a text colour, so `cn("text-h2", "text-destructive")` silently dropped the size (e.g. `CardTitle` with a colour class) and `cn("text-lg", "text-h1")` kept both sizes.
- **Alternatives considered:** Avoiding the combinations at call sites — rejected: the bug is in the merge, every caller would have to know.
- **Tradeoff accepted:** Pre-existing elements on other pages that combined a custom size with a colour now get the size they were written with (slightly larger titles in places).
- **Source:** made-now

### 2026-11-01 — Chart marks draw at full opacity
- **Decision:** `ChartVisualization` bar, pie and point marks default to opacity 1 (was 0.85 / 0.75); cross-filter dimming of unselected marks is unchanged; forecast points stay 0.9.
- **Why:** At 0.85 on the plot background three palette slots composited below 3:1 (light ink-blue 2.70, light oxblood 2.78, dark oxblood 2.75); the validated contrast only holds for the colour as drawn.
- **Alternatives considered:** Darker palette steps — they would fall out of the lightness band or lose CVD separation.
- **Tradeoff accepted:** The selected-vs-default difference on a cross-filter is now carried by dimming the others only.
- **Source:** made-now

### 2026-11-01 — Chart categorical palette: ink-blue, aged gold, mulberry, forest, oxblood (batch 6)
- **Status:** Superseded by 2026-11-02 — One chart palette per theme, validated in CI (batch 7).
- **Decision:** `--chart-1..5` per theme, in this fixed order. Light (card `#FBF7EE`, plot background `#F2EADB`): `#4C82C6`, `#8A6E1F`, `#93398E`, `#036639`, `#C45F6A`. Dark (surface `#1E1814`): `#3986E4`, `#9B7802`, `#B873B2`, `#3FA66B`, `#A64B51`. High-contrast sets reuse them. Found by searching OKLCH steps per hue family with the dataviz skill's `validate_palette.js`: both modes pass lightness band, chroma floor, normal-vision floor and contrast ≥ 3:1; worst adjacent CVD ΔE 8.8 light / 10.0 dark (target ≥ 8), all-pairs 7.4 light / 7.8 dark (6–8 floor band: legal only with a legend or labels), including the wrap-around pair (d3's ordinal scale cycles).
- **Why:** User direction for a theme palette (aged gold, oxblood, forest, ink-blue, ochre…) that stays colour-blind safe in both themes.
- **Alternatives considered:** Ink-blue, gold, oxblood, forest, **ochre** — rejected: ochre vs oxblood and ochre vs gold collapse under deuteranopia (all-pairs ΔE 4.0 light, 5.7 dark); no ochre step fixed it inside the lightness band, so mulberry took its slot. Keeping the 2026-09 dataviz default (blue/orange/aqua/yellow/magenta) — rejected by the new direction.
- **Tradeoff accepted:** Supersedes in part the 2026-09 redesign plan's Decision 4 ("series colour must not reuse Main or gold"): the oxblood and gold series are lighter/darker steps than the UI's Main `#7C2438` and gold `#D4AF37`, but the same families. Awaiting the user's confirmation at the phase A stop. Scatter/bubble (all pairs) need the legend.
- **Source:** made-now

### 2026-11-01 — Ornament is opt-in in phase A: new variants instead of changing primitives
- **Status:** Superseded by 2026-11-02 — Glass frame, solid data (batch 7): ornament removed.
- **Decision:** `src/shared/components/ornament/` (`Ornament.Corner(s)`, `Ornament.Fleuron`, `Rule`, `Panel`, `SectionHeading`, `Bookplate`, `Seal`), inline SVG in `currentColor` of `--ornament`, `aria-hidden`, `focusable="false"`, `pointer-events: none`. New `Button` variants `engraved` (embossed oxblood, gilt edge) and `plate` (embossed card), and `DialogContent ornate` (double rule, corners except top-right where the close button sits). `card.tsx`/`dialog.tsx` defaults are unchanged; phase B flips them. "Simple frames" hides every ornament through one attribute (`html[data-frames="simple"]`), not a prop threaded through components. Data areas (category/numeric tiles, chart plots, numbers) get plain borders only.
- **Why:** User rule: ornament on the frame, data clean; phase A must not restyle other pages yet.
- **Alternatives considered:** Restyling `Card`/`DialogContent` defaults now — rejected: every page would change in phase A. Icon fonts or raster flourishes — excluded by the brief.
- **Tradeoff accepted:** Two styles coexist until phase B (old `premium`/`outline` buttons and plain dialogs on other pages).
- **Source:** made-now

### 2026-11-01 — Reading comfort: text size, high contrast, motion, simple frames, theme in one panel
- **Status:** Superseded by 2026-11-02 — Appearance panel and Automatic theme (batch 7).
- **Decision:** `uiStore.readingComfort` ({textSize default|large|xlarge, highContrast, motion system|reduce|full, simpleFrames}), persisted in localStorage with the other UI prefs; a custom `merge` fills missing fields from `DEFAULT_READING_COMFORT`. `shared/theme/displayPrefs.ts:applyDisplayPrefs` writes the theme class and `data-text-size`/`data-contrast`/`data-motion`/`data-frames` on `<html>` synchronously in `main.tsx` before the first render and on every change. Text size changes the root font size (100% / 118.75% / 137.5% = 16 / 19 / 22 px), so the rem-based type scale and spacing scale together; Overview grids use `repeat(auto-fit, minmax(<rem>, 1fr))` so columns drop as text grows. Reduced motion: CSS (both `prefers-reduced-motion` unless "Allow motion", and `data-motion="reduce"`) plus framer `MotionConfig` (`user`/`always`/`never`). The theme moved into the panel; the sidebar's theme dropdown (`ThemeToggle.tsx`, deleted) became the "Reading comfort and theme" button, keeping `data-tour="header-theme"`; Alt+T still toggles.
- **Why:** User requirement for older users / poor eyesight. Applying before the first paint avoids a flash of default-size text for the people who need Extra large.
- **Alternatives considered:** `useEffect` in `ThemeProvider` (old approach) — rejected: flashes. A fifth icon in the sidebar header — rejected: overflows at 390px and at Extra large.
- **Tradeoff accepted:** framer-motion keeps opacity fades under reduced motion (only movement is removed). Chart SVG text uses fixed px sizes and does not scale with the setting until phase B.
- **Source:** made-now

### 2026-11-01 — Fonts: Source Serif 4 for UI and body, Cormorant Garamond for display, JetBrains Mono for data; Inter removed
- **Status:** Superseded by 2026-11-02 — Inter (variable) for UI and data, JetBrains Mono for code only (batch 7).
- **Decision:** Own `@font-face` rules in `src/index.css` pointing at `@fontsource/*/files/*.woff2` (no `.woff`, no unused subsets in `dist/`): Source Serif 4 400 (covers 100–500) and 600 (600–900), latin + latin-ext by `unicode-range`; Cormorant Garamond 600 latin (display only, never below 18px); JetBrains Mono 500 (100–600) and 700. The Tailwind key `sans` now resolves to Source Serif 4 so every component switches without a class change; `font-display` is Cormorant. Body text 14 → 16px, captions 11 → 12px tracked capitals. Section labels are tracked capitals (`.catalogue-label`), not `small-caps`. Seals use the 500 mono face so the 700 face is not on the first load.
- **Why:** User direction (display serif + readable text serif, mono for numbers, offline). Source Serif 4 checked at 1× in dense controls (buttons, inputs, selects, 13–14px): legible, so it is used for UI too, not only prose; only the existing 10px helper texts read poorly (in any face) and go in phase B. fontTools shows the fontsource subsets have no `smcp` feature, so `font-variant: small-caps` would be synthesised.
- **Alternatives considered:** EB Garamond for display — Cormorant chosen for the engraved, high-contrast look at heading sizes. Libre Baskerville for text — wider and heavier at 13px. Keeping Inter for controls — not needed after the specimen check.
- **Tradeoff accepted:** Weight ranges map 500 onto the 400 face (no separate medium); serif UI is denser than Inter at equal size. Font bytes on first load 120,176 → 88,128.
- **Source:** made-now

### 2026-11-01 — Dark Academia tokens: four sets from one hex table, checked by a contrast test
- **Status:** Superseded by 2026-11-02 — Theme registry in TypeScript, generated CSS, composited contrast audit (batch 7).
- **Decision:** `src/index.css` token blocks: `:root` (parchment `#F2EADB`, ivory card `#FBF7EE`, ink-brown `#2A1C13` text, oxblood Main `#7C2438`, bronze `#7D5F14` for gold text), `.dark` (ink `#15100C`, walnut card `#1E1814`, parchment text `#F2E9D8`, Main `#7C2438`, gold `#D4AF37`), `:root[data-contrast="high"]` and `html.dark[data-contrast="high"]`. New `--ornament` token. Values stay HSL (Tailwind `hsl(var(--x) / α)`, chart code uses `hsl(var(--chart-n))`) with the hex in a comment. `src/shared/theme/__tests__/tokens.contrast.test.ts` checks each HSL round-trips to its hex and every text pair ≥ 4.5:1 and UI pair (ring, input border, ornament, chart colours vs card) ≥ 3:1 in all four sets. Dark `--ring` is gold (oxblood on near-black was ~2:1). Tailwind `zinc` and `gray` scales are remapped to the same warm neutrals so pages not yet migrated don't sit cold beside the new shell (supersedes the 2026-09 zinc remap values); phase A files (sidebar, Dashboard shell, Overview, AI summary banner, privacy dialog) use tokens only.
- **Why:** User direction: evolve Maroon/Black/Gold into Dark Academia, dark + light from one token set, WCAG AA in both and in high contrast. axe only sees rendered text, so non-text pairs need their own check.
- **Alternatives considered:** Switching tokens to `rgb()` triplets — rejected: chart code and CSS reference `hsl(var(...))`. Leaving gold sparse/AI-only (2026-09 rule) — the new direction uses aged gold for the frame; gold stays off data.
- **Tradeoff accepted:** Raw `bg-white`/`text-white` literals on other pages are still white until phase B. Active nav and buttons on oxblood rely on text plus the gilt bar, not on oxblood-vs-card contrast (1.8:1).
- **Source:** made-now

### 2026-11-01 — Accessibility gates: axe-core e2e, jsx-a11y as warnings until phase B
- **Decision:** `tests/e2e/a11y.spec.ts` (`@axe-core/playwright`, WCAG 2.0/2.1/2.2 A+AA tags) on the empty Overview, Overview with the HR fixture, and the privacy and Reading comfort dialogs, in four themes; fails on any violation and prints `incomplete`. `eslint-plugin-jsx-a11y` recommended rules at `warn` (24 at the start, 22 now: the two `heading-has-content` in `ui/card.tsx`/`ui/alert.tsx` fixed). The sidebar search button's shortcut badge is CSS generated content so its accessible name contains its visible text (WCAG 2.5.3).
- **Why:** User requirement. `error` would fail `npm run lint` until the remaining 22 (14 in `CommandPalette`) are fixed in phase B.
- **Alternatives considered:** `aria-hidden` on the `<kbd>` — axe still counts its text; adding the shortcut into the name — axe joins flex children without a space, so it never matched.
- **Tradeoff accepted:** Lint passes with 22 warnings in phase A.
- **Source:** made-now

### 2026-11-01 — First-load bench and design screenshots as local Playwright configs
- **Decision:** `scripts/bench/startup/first-load.spec.ts` (under the existing startup bench config): new browser context per run, CDP `encodedDataLength` per response grouped JS/CSS/font, time to the sidebar and to `document.fonts.ready`, unthrottled and Slow 4G. `scripts/design/` (own config, dev server) writes the review screenshots to `docs/design/<phase>/` (git-ignored since 2026-11-24, earlier sets archived in `datavista-notes/`); vitest excludes `scripts/design/**`.
- **Why:** User asked for before/after first-load cost and screenshots per theme; both should be re-runnable for phase B.
- **Alternatives considered:** Lighthouse — not installed, and the app shell (sidebar) is the milestone asked for.
- **Tradeoff accepted:** Times are noisy on a loaded machine: compare only runs taken under the same conditions (the phase A report re-measured HEAD in a worktree for that reason).
- **Source:** made-now

### 2026-10-29 — CI: build and production smoke run in parallel with checks and e2e; deploy ships only that artifact
- **Decision:** `deploy.yml` has four jobs. `checks`, `e2e` and `build` run in parallel; `build` does `npm ci` → build → Playwright Chromium → production smoke gate → `upload-pages-artifact`. `deploy` (`needs: [checks, e2e, build]`) has one step, `actions/deploy-pages`: no checkout, no rebuild, so the bundle the smoke gate checked is the one that ships.
- **Why:** User request: the run was ~6m15s because the build and smoke waited behind e2e. Now wall-clock is roughly the slowest of the three jobs (e2e) plus the deploy step. Estimate: ~4–4.5 min, not yet measured on GitHub.
- **Alternatives considered:** Keep the build inside the deploy job — rejected: it is what serialised the run. Build in `checks` — rejected: keeps the smoke gate apart from the artifact upload.
- **Tradeoff accepted:** An artifact is uploaded even on runs where checks or e2e then fail (it just isn't deployed). `npm ci` runs three times and Chromium is installed twice (runner time, not wall time).
- **Source:** `made-now`

### 2026-10-29 — Node 24 LTS for CI and the project (`.nvmrc`), `engines.node >=22.13.0`
- **Decision:** `.nvmrc` = `24`; every CI job uses `setup-node` with `node-version-file: '.nvmrc'`; `package.json` `engines.node` is `>=22.13.0`; README prerequisite updated.
- **Why:** Node 20 reached end of life on 2026-04-30. On 2026-10-29 the Node release schedule had 26 entering Active LTS on 2026-10-28 (one day old), 24 in Maintenance LTS until 2028-04-30 and 22 in Maintenance until 2027-04-30. 24 is supported for 18 more months. Checked locally on 24.22.2: typecheck, lint, test, test:tz, build and the prod smoke all pass. The floor of 22.13 keeps the author's Node 22 laptop working and is what `pdfjs-dist` 6 requires.
- **Alternatives considered:** 26 — rejected for now: one day into Active LTS and not tried with this toolchain; revisit in 2027. 22 — rejected: maintenance ends in six months.
- **Tradeoff accepted:** Laptop (22) and CI (24) run different majors until the laptop moves.
- **Source:** `made-now`

### 2026-10-29 — SheetJS 0.20.3 from the SheetJS CDN instead of npm `xlsx@0.18.5`
- **Decision:** `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` in `package.json`; the lockfile pins `resolved` and `integrity`. `xlsxDates.ts:readWorkbookWithCalendarDates` now also deletes `cell.z` from every date-formatted cell.
- **Why:** npm `xlsx` stops at 0.18.5, which has GHSA-4r6h-8v6p-xvw6 (prototype pollution, fixed in 0.19.3) and GHSA-5pgg-2g8v-p4x9 (ReDoS, fixed in 0.20.2), and it parses user uploads. SheetJS's install docs name its CDN as the authoritative source; `cdn.sheetjs.com/xlsx.lst` lists 0.20.3 as the newest. 0.20's `sheet_to_json` turns any cell with a date number format (text included) into a local-time JS `Date`, which broke our rewritten calendar strings; dropping the format keeps them text and keeps unconvertible serials (60, negatives) as plain numbers, as with 0.18.5.
- **Alternatives considered:** Vendoring the tarball in the repo (SheetJS's "recommended for stability" option) — rejected for now: adds a 2.4 MB binary to git; the CDN URL + lockfile integrity is reproducible while the CDN is up. Staying on 0.18.5 — rejected: known vulnerabilities.
- **Tradeoff accepted:** `npm ci` depends on cdn.sheetjs.com being reachable. `npm audit` does not check URL dependencies, so future SheetJS advisories must be watched by hand (their advisories page / RSS).
- **Source:** `made-now`

### 2026-10-29 — jsPDF 4; the PDF report is built by a DOM-free `buildPDFReport` and tested with pdfjs-dist
- **Decision:** `jspdf` ^3.0.1 → ^4.2.1. `exportUtils.ts` splits `generatePDFReport` into `buildPDFReport(dataset, rows, charts, capture)` (returns the jsPDF document) and `captureChart` (html2canvas). `pdfjs-dist` (devDependency) parses the output in `exportUtils.pdf.test.ts` (page count, text, one image per chart, failed-capture note).
- **Why:** jsPDF ≤4.2.0 has several advisories (AcroForm/addJS injection, GIF/BMP DoS, HTML injection in output). The only breaking change in 4.0 is that the Node build no longer reads the file system by default; none of the APIs the report uses (constructor, `internal.pageSize`, `setFont`, `setFontSize`, `text` with `align`, `addPage`, `addImage`, `save`, `output`) changed. The split makes the report testable in vitest's node environment.
- **Alternatives considered:** Checking only the `%PDF-` header — rejected: wouldn't catch lost text or pages. A jsdom test of the whole flow — rejected: html2canvas needs a real layout.
- **Tradeoff accepted:** pdfjs-dist is a large dev-only dependency. The html2canvas capture is still only checked by hand.
- **Source:** `made-now`

### 2026-10-29 — Dependency cleanup
- **Decision:** Removed `@tanstack/react-query` (and `QueryClientProvider` in `App.tsx`; nothing used queries), `lovable-tagger` (and its dev-mode plugin in `vite.config.ts`), `@types/react-grid-layout` (RGL 2 ships types). Moved all `@types/*` and `tailwindcss-animate` (used only by `tailwind.config.ts`) to devDependencies. Package name `datavista`, version `1.0.0`.
- **Why:** User request. knip reported exactly the three removed packages; depcheck's other hits (`@fontsource/*` used in `index.css`, `postcss`/`autoprefixer` in `postcss.config.js`, `fake-indexeddb` in vitest setup) were checked by grep and are false positives. `tailwindcss-animate` in `dependencies` pulled the whole Tailwind/PostCSS toolchain into the runtime audit although none of it ships in `dist/`.
- **Alternatives considered:** None.
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-29 — Dev server pre-bundles the import worker's deps (`optimizeDeps.include: ["xlsx", "papaparse"]`)
- **Decision:** `vite.config.ts` lists `xlsx` and `papaparse` in `optimizeDeps.include`.
- **Why:** Vite's dependency scan doesn't follow `new Worker(new URL(...))`. On a cold cache (every CI run) the first import found both packages, re-optimised them and reloaded the page mid-test: the first e2e test timed out (30 s) and passed only on CI's retry. Reproduced on HEAD as well as on this branch; with the include, two cold runs and the full cold suite pass.
- **Alternatives considered:** `optimizeDeps.entries` with the worker file — not tried; the explicit list is shorter and names exactly what was being found late.
- **Tradeoff accepted:** A new worker-only dependency must be added to the list by hand.
- **Source:** `made-now`

### 2026-10-29 — Remaining audit findings accepted (react-router 6, dev-only vitest/vite/esbuild)
- **Decision:** After `npm audit fix` (non-breaking only), keep `react-router-dom` 6.30.6 and vitest 2 / Vite 5.
- **Why:** The two react-router advisories (GHSA-wrjc-x8rr-h8h6 open redirect via backslash in `<Link>`/`useNavigate`; GHSA-337j-9hxr-rhxg SSR `deserializeErrors`) have no 6.x fix and aren't reachable: the app has no `<Link>` or `useNavigate`, only `/` and `*` routes, and no SSR/hydration. The rest (tinypool, vitest, @vitest/mocker, vite-node, vite, esbuild dev-server advisory, and the minimatch GHSA-g3hv-75wg-m249 ReDoS reached through eslint/typescript-eslint, published 2026-10-30/31) are dev/test tooling that doesn't ship in `dist/`; their only fixes are breaking (vitest 5, Vite 8, a forced typescript-eslint change).
- **Alternatives considered:** `npm audit fix --force` — rejected: breaking majors, out of scope for this batch.
- **Tradeoff accepted:** The esbuild dev-server advisory applies while `npm run dev` is running on a reachable host (`server.host: "::"`); keep the dev server off untrusted networks until Vite is upgraded.
- **Source:** `made-now`
- **Superseded in part by:** 2026-11-24 — Dev server bound to localhost (`server.host` is no longer `"::"`).

### 2026-10-29 — ID columns with letter codes import as categorical; "invoice" is an ID word
- **Decision:** `columnRoles.ts` adds "invoice" to the ID words and exports `isIdName`. In `processRawData`, a column the type vote makes numeric becomes categorical when `isIdName` is true and at least one of its cells is a letter code (letters and digits only, both present: "C570867", "85123A"; `parsingService.ts:hasLetterCodes`). Junk without a digit ("ERROR") or with punctuation doesn't count; non-ID names keep the numeric vote.
- **Why:** Audit A8 and user request: retail `Invoice` (19,500 "C…" cancellations) and `StockCode` (134,986 "85123A"-style codes) were numeric with "invalid" badges, dropping real codes from stats. Run over the 6 local CSVs + HR fixture, the only type changes are retail Invoice numeric → categorical (53,628 distinct) and StockCode numeric → categorical (5,304 distinct). Customer ID (5,942 distinct, numbers and blanks) and HR EmployeeNumber stay numeric (Count by default).
- **Alternatives considered:** Any non-numeric value in an ID column → categorical — rejected: a junk token ("ERROR") in a numeric ID column would flip it.
- **Tradeoff accepted:** Numbers in those columns are stored as JS numbers inside a categorical column (as for any mixed text column); a numeric-looking ID column with an unlisted name ("Ref") isn't covered.
- **Source:** `made-now`

### 2026-10-29 — Removed duplicate rows live in their own table (`removedRows`, Dexie v4)
- **Decision:** The rows "Remove duplicates" takes out are `Dataset.removedDuplicates` (with their `dateSourceValues`/`fixSourceValues` cells), stored in a new table `removedRows` (key `datasetId`, one record per dataset); the metadata keeps only `removedDuplicateCount`. The row save writes or deletes that record inside its transaction only when the array changed since the last write (by reference: remove / undo), so calculated-column row saves and metadata saves (rename, override, dismiss) never carry it. Loading reads it with the chunks; a count with no matching record fails the load like a missing chunk. Deleting a dataset deletes the record. `upgradeToV4` moves existing `metadata.removedDuplicates` into the table.
- **Why:** User fix: batch 4c.1 made metadata writes cheap, and 34,335 retail rows in the metadata record undid that. Measured (retail CSV, Node + fake-indexeddb, rename after removing duplicates, main-thread part of the `datasets.put`): before 250–407 ms, 7.55 MB record; after 2–7 ms, 0.25 MB (mostly the 34,335 duplicate indices).
- **Alternatives considered:** Putting removed rows in the row chunks — rejected: every row save would rewrite them.
- **Tradeoff accepted:** One more table and version. The duplicate indices stay in metadata (0.2 MB at retail size).
- **Source:** `made-now`

### 2026-10-29 — Column fixes are applied to the rows, originals kept per column (`services/columnFixes.ts`)
- **Decision:** One model for every value change from batch 4d-2: `metadata.columnFixes: ColumnFix[]` (kinds `sentinel`, `currency`, `thousands`, `numberSuffix`, `mergeLabels`; each with `previousType`, `changedCount`, `auto`) plus `Dataset.fixSourceValues[column]`, the column's original cells, one per row. `addColumnFix` / `removeColumnFix` replay all of a column's remaining fixes from the originals in order (`columnFixTransforms.ts:transformColumn`), so undo is exact for stacked fixes (currency then -1). The fixed values are written into `dataset.data`, so stats, query/KPI, charts, pivot, filters, window functions, export and AI read them with no engine change; formula/window columns are re-evaluated after (`applyActiveDatasetUpdate`). Converting fixes set the column numeric; removing the last fix restores the first fix's `previousType` and drops the originals. `fixSourceValues` travel in the row chunks like `dateSourceValues` (`StoredDataset.fixSourceColumns`, no schema change), so applying or undoing a fix is one debounced row save; "Don't ask again" is a metadata-only write. Replacing data takes the new file's fixes and originals (old ones would misalign, as for `dateSourceValues`).
- **Why:** User principle: never change data silently, every conversion undoable from stored original text, all engines see the same values.
- **Alternatives considered:** Keeping raw rows and computing effective values at read time — rejected: dozens of `dataset.data` readers, each a chance to drift (the 4a problem). Undo by re-deriving text from numbers — rejected: "ksh 6976" vs "Ksh6976" can't be rebuilt.
- **Tradeoff accepted:** A fixed column stores its cells twice (originals + values). Rows of a fixed column are copied only where the cell changed.
- **Source:** `made-now`

### 2026-10-29 — Currency and comma-grouped columns convert on import; mixed ones stay text with a warning
- **Decision:** `dataQuality.ts:detectImportConversion` runs in the worker (`processRawData`) on each column's cleaned cells. Currency: ≥ 80% of non-blank cells are numbers with one currency mark before/after (`$`, `₹`, `€`, `£`, `¥`, `Rs`, `Rs.`, `INR`, `USD`, `KES`, `ksh`, `kshs`…, case-insensitive, optional space; `numberFormats.ts:parseCurrency`) or plain numbers, and every mark maps to one code ($/USD, ₹/Rs/INR, ksh/KES…). Then the column converts (fix `auto: true`, `currency: { code, symbol }`, symbol = the most common mark as written), is typed numeric even when it sits exactly on the 80% type-vote line, and the Data view shows values with the symbol (`formatCurrency`) and a "converted from $ — undo" badge. Two or more codes: no conversion, `quality.currencyWarnings[col]`. Thousands: same 80% share with plain numbers + values whose grouping is valid for the whole value (western 1,234,567 or Indian 12,34,567, optional decimals; "1,2,3" and "12,3456" rejected); a comma-decimal value (1.234,56 / 12,5) or both western-only and Indian-only values in the column → no conversion, `quality.groupingWarnings[col]`. Plain-text cells are skipped without regexes and the scan stops once 20% of cells can't be numbers.
- **Why:** Approved items 3 and 4. Full files: Play Store Price → USD, mean 1.027368, max 400 (pandas); Lab price → KES, mean 4,846.34.
- **Alternatives considered:** A currency badge without converting — rejected by the spec. Treating western and Indian values in one column as consistent — rejected: "1,234,567" and "12,34,567" in one column means mixed sources.
- **Tradeoff accepted:** "$" is read as USD (could be AUD/CAD). Retail 1M CSV: detection adds ~3.5 s to the worker import (no main-thread cost).
- **Source:** `made-now`

### 2026-10-29 — Missing-value codes (-1, -99, 9999) are offered, never applied; "No" is for the session
- **Decision:** `dataQuality.ts:detectSentinel` (numeric columns, from the metadata value counts): one negative value that is the column's only negative and > 5% of its numbers; -1 in a column whose other values are all whole numbers 1800–2100 (any share); an all-nines value ≥ 999 that is the column's maximum and > 5%. The Data view asks "-1 appears 118 times in Founded. Treat -1 as missing?" — Yes adds a `sentinel` fix (cells → null for every engine, originals kept); No hides it until the page reloads (module state); "Don't ask again for this column" stores the key in `metadata.quality.dismissed` (metadata write).
- **Why:** Approved item 2; "No" vs "Don't ask again" had to differ. Full Glassdoor: Founded 1,635.53 → 1,984.104693, Rating 3.518601 → 3.881833 (pandas).
- **Alternatives considered:** Persisting "No" — rejected: then it is the same as "Don't ask again".
- **Tradeoff accepted:** Glassdoor's text columns holding the number -1 (Competitors, 74.5%) are not prompted: the rule is numeric columns only.
- **Source:** `made-now`

### 2026-10-29 — "Convert to number…" for "10,000+", "19M", "512k": offered with a preview, never automatic
- **Decision:** Offered on a non-date column when ≥ 50% of non-blank cells read with `numberFormats.ts:parseSuffixNumber` (optional grouping, k/M/G ×1e3/1e6/1e9 case-insensitive, "+" = lower bound) and ≥ 10% need that reader. The dialog shows the first 10 distinct values before → after and how many can't be read ("Varies with device" → missing); the fix records `unconvertible` and `lowerBound` for the badge.
- **Why:** Approved item 5. The 10% floor: retail `StockCode` has a few "85049G"-style codes that would read as 85,049 × 10⁹; without it the column was offered.
- **Alternatives considered:** Offering whenever any value needs the reader — rejected (StockCode, and Play Store Reviews for one "3.0M" cell).
- **Tradeoff accepted:** "19M" in Play Store Size means megabytes; the conversion gives 19,000,000, as specified.
- **Source:** `made-now`

### 2026-10-29 — Label variants: case and whitespace only, columns with ≤ 1,000 distinct values
- **Decision:** In categorical columns, text values whose `labelKey` (whitespace runs → one space, trimmed, lower-case) is equal form a group (`quality.labelVariants`, most common first). Each group is a suggestion "Merge 'lab a' (1,689) into 'Lab A' (1,579)?" with the most common spelling preselected and a picker; Merge adds a `mergeLabels` fix. Columns with more than 1,000 distinct values are not scanned.
- **Why:** Approved item 7. The distinct cap keeps names/IDs (Lab patient_name: 8,876) out of the list.
- **Alternatives considered:** Unicode normalization or spelling distance — out of scope (Hematology/Haematology).
- **Tradeoff accepted:** Case variants in high-cardinality columns aren't suggested.
- **Source:** `made-now`

### 2026-10-29 — Exact duplicate rows: counted on the imported text, removable and restorable
- **Superseded in part by** "Removed duplicate rows live in their own table" (where the removed rows are stored).
- **Decision:** `dataQuality.ts:findDuplicateRows` runs in the worker on the raw records (every column compared as text, like pandas `duplicated()` on a dtype=str frame; hashed, collisions checked exactly), after any "Exclude rows" choice. `metadata.quality.duplicateRowCount` / `duplicateIndices`. Shown in the import summary when it appears (parse problems: the review dialog counts duplicates among all rows read, before any exclusion, computed in the worker before the review; the reopened "View import summary" shows the stored count), in the success toast on every import ("… · 483 duplicate rows · converted to numbers: Price (see Data view)"), and in the Data view, which shows "483 duplicate rows" with "Remove duplicates" (first occurrences kept). Removed rows, with their `dateSourceValues`/`fixSourceValues` cells, are kept for undo; Undo puts them back at their indices and re-applies column fixes made since.
- **Why:** Approved item 6 (Play Store full file: 483, pandas agrees; fixture: 8). The review dialog still appears only when rows have parse problems ("Parse problems are shown before analysis", unchanged), so a clean file's count is in the toast, not a dialog.
- **Alternatives considered:** A summary dialog after every import — rejected: a modal on every clean upload. Recounting duplicates on processed cells — rejected: "1.0" and "1" would collide.
- **Tradeoff accepted:** The count is from import time; merges or conversions that later make rows equal are not recounted.
- **Source:** `made-now`

### 2026-10-29 — Invalid-value badges and the other findings come from the metadata pass
- **Decision:** `generateDatasetMetadata` collects, per numeric/date column, the non-blank cells that aren't valid (strict number rule / calendar date) by text, and `dataQuality.ts:columnQuality` turns its value counts into `ColumnMetadata.quality` (invalid count + top 5 samples, top 5 values, label variants, sentinel, suffix candidate). The Data view column header shows "329 invalid" with a popover (ERROR ×164, UNKNOWN ×165); the date type badge no longer appends "· N invalid". Datasets saved before this get their `quality` from the recount worker when the Data view opens (`datasetStore.ensureColumnQuality`, metadata-only write).
- **Why:** Approved items 1 and 8: no extra pass over the rows at import; samples were already in the value map.
- **Tradeoff accepted:** Old datasets show no badges for a moment after opening the Data view.
- **Source:** `made-now`

### 2026-10-29 — Column recounts after a fix run in a worker (`services/columnMeta/`)
- **Decision:** The store applies a fix (or duplicate removal) to the rows synchronously with `deferMeta` (only the column's type is updated), then `recountColumns` sends each changed column to `columnMeta.worker.ts` in 100,000-cell slices (one setTimeout between slices) and merges the fresh metadata when it returns, unless `rowsRevision` moved on. Without `Worker` (unit tests, import worker) the recount is inline.
- **Why:** At 1M rows (retail CSV, Node) a column recount takes 130–1,486 ms (date column the longest) and "Remove duplicates" recounted 8 columns in 4.2 s on the main thread; cloning one 1M-cell text column in one message is ~0.43 s. Budget: ~250 ms.
- **Alternatives considered:** Incremental metadata updates — rejected: unique counts and min/max can't be decremented without the full value map.
- **Tradeoff accepted:** Counts, badges and tiles of a fixed column show the old numbers for ~1–2 s at 1M rows. Measured main-thread parts at 1M rows (Node, machine under memory pressure, so browser numbers may differ): convert StockCode 256 ms, its undo 170 ms, -1 on Quantity 295 ms, merge Country 228 ms, remove duplicates 76 ms, restore 49 ms; plus the existing calculated/window re-evaluation.
- **Source:** `made-now`

### 2026-10-29 — Every view reads the effective column type
- **Decision:** `columnType.ts:getEffectiveColumnType` (override, else `columnTypes`, which carries fix conversions, else metadata) and new `columnsOfType(dataset, type)` now back: `ChartBuilder` field lists and `getColumnType`, `FilterPanel` lists and its date group-by, `GlobalFilterBar`, `PivotBuilder` (no-metadata branch), `WindowExplorer`, `queryEngine.numericColumnSet` and the group-by/aggregation type map in `execute` (it read `inferredDataType`), `statsEngine`, `anomalyDetector` (numeric and category columns), `kpiEngine` trend date column, `exportUtils` PDF summary, `searchEngine`, `templateEngine`, `aiEngine` and `summaryEngine` (types sent to the AI).
- **Why:** Approved item 8: the audit found FilterPanel and ChartBuilder reading raw types; a grep found 13 more readers bypassing overrides.
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-29 — Overview tiles for categorical columns
- **Decision:** `stats/columnSummary.ts:summarizeCategoricalColumns`: distinct, missing, top 5 with count and share of the rows shown. Columns with distinct > 50% of non-blank cells get a compact tile with no list. With the whole dataset shown it reads `quality.topValues` and the metadata counts (exact, kept current by the recount); filtered, it counts the rows.
- **Why:** Approved item 8. `categoryCardinality` is the first 100 values seen, not the most common, so it can't be used.
- **Tradeoff accepted:** Metadata path and row path are two code paths; a unit test checks they agree.
- **Source:** `made-now`

### 2026-10-29 — "Clear all local data" deletes only DataVista's storage, after stopping writes
- **Decision:** Sidebar "Data & privacy" (shield icon, `DataPrivacyDialog`, also linked from the upload notice) → confirm step listing what goes → `services/clearLocalData.ts`: `persistenceService.stopWriting()` (subscribers stop, waiting saves are flushed and awaited), `db.delete()` of `DataVistaDatabase`, removal of every `datavista*` localStorage key (UI prefs and AI key, templates, saved views, snapshots, first-visit flag), reload.
- **Why:** Approved item 9. The app is served from `*.github.io`, an origin shared with other sites, so `localStorage.clear()` or deleting every database would touch other apps; a debounced row save landing after the delete would recreate the database.
- **Tradeoff accepted:** After clearing, the onboarding tour shows again (its "seen" flag is a preference and is deleted).
- **Source:** `made-now`

### 2026-10-29 — Privacy notice on upload; AI disclosure lists what is sent
- **Superseded (AI part) by:** "AI privacy levels with one context builder and a personal-data guard" (2026-11-16).
- **Decision:** Upload panel: data is read and stored in this browser, kept until deleted (dataset menu, or Clear all local data), and AI features with your own key send some of it to the provider. AI settings list, from `llmService.ts` contextMessage and `summaryEngine.ts`: query/formula → prompt, dataset name, each column's name, type, first-5-row sample values, min/max, distinct count, calculated fields' names and formulas; executive summary → dataset name, row/chart counts, column names and types, active filters with their values, anomaly descriptions. `metadata` sits in the context object but is not serialized. The key is stored in this browser's localStorage, unencrypted, and sent only to that provider (Gemini: `x-goog-api-key` header).
- **Why:** DPDP checklist: notice at the collection point, retention and deletion, and what leaves the device.
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-29 — Sidebar order is stored (`Dataset.order`, Dexie v3)
- **Decision:** `uploadDataset` sets `order` = last + 1 (upload order, oldest first, as the list showed before a reload). Dexie v3 `upgradeToV3` numbers existing datasets by `metadata.createdAt`, then `lastUpdated`, ties by id; `loadDatasets` sorts with `db.ts:compareDatasetOrder`. No index (sorted in memory). Tests: v1 → v3 and v2 → v3 with fake-indexeddb; the persistence e2e asserts the order across two reloads instead of looking the row up.
- **Why:** Approved item 10: rows came back in primary-key (random UUID) order.
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-29 — Messy golden: pandas computes the values after each approved fix
- **Decision:** `generate_messy_golden.py` gains `AUTO_FIXES` (Play Store Price: "$" stripped — `numericStats` is what a plain import gives) and `USER_FIXES` → `fixedStats` (Glassdoor Rating/Founded -1 → NaN; Play Store rows with the wrong field count dropped, found with the `csv` module, and Installs through "Convert to number…"), plus `duplicateRows` (pandas `duplicated()`). `golden.messy.test.ts`: Play Store numeric columns now include Price; the three `it.todo`s are tests (sentinel Yes → every engine equals `fixedStats`, excluded short row → Rating equals the oracle, Price converted with a USD fix), plus Installs converted and duplicate counts per fixture.
- **Why:** Approved golden requirement.
- **Tradeoff accepted:** The oracle declares which fixture columns are fixed rather than re-implementing the detectors (they are unit-tested separately). Required full-file numbers (Founded 1,984.10, Price 1.027368 / 400, 483 duplicates) are checked by e2e tests that skip when `test-data-local/` is absent (CI), and in the detection run of this batch.
- **Source:** `made-now`

### 2026-10-29 — CI: e2e in its own parallel job; deploy waits for both
- **Superseded by** "CI: build and production smoke run in parallel with checks and e2e; deploy ships only that artifact".
- **Decision:** `deploy.yml` has three jobs. `checks` (lint, typecheck, unit tests, time zone gate) and `e2e` (checkout, `npm ci`, Playwright Chromium, `test:e2e`) run in parallel; `deploy` (`needs: [checks, e2e]`) builds, installs Chromium, runs the production smoke gate on that build, uploads it and deploys.
- **Why:** The last 5 runs took 3m33s–5m46s with e2e 197 s of the last one, and this batch adds 4 e2e tests (~40 s), so the single job would pass 6 min. In parallel, the run is about the e2e job plus the deploy job instead of the sum of everything.
- **Alternatives considered:** Build and smoke in the `checks` job with `deploy` only deploying — rejected: the smoke gate is meant to sit with the deploy, checking the exact bundle that goes out.
- **Tradeoff accepted:** `npm ci` runs three times and Chromium is installed twice (~35 s of runner time each, not wall time). The build no longer starts until e2e has passed.
- **Source:** `made-now`
- **Superseded in part by:** 2026-11-24 — CI runs on pull requests; deploy only for a push to main; e2e in the Playwright container (the e2e job no longer installs Chromium itself).

### 2026-10-29 — Netflix fixture gets the full file's two 2008 rows
- **Decision:** `tests/fixtures/messy/netflix.csv` gains s5958 ("January 1, 2008") and s6612 ("February 4, 2008"), copied byte-for-byte from `netflix_titles.csv` and kept in `show_id` order (64 → 66 rows; list in `tests/fixtures/README.md`); `messy.golden.json` regenerated with the pinned pandas (`golden:regen-messy`). `tests/e2e/chart-density.spec.ts` asserts Year 2008 = 2.
- **Why:** The year-bucket e2e should check the reported case; the fixture had no 2008 row.
- **Alternatives considered:** Running the e2e against the git-ignored full file — rejected: CI doesn't have it.
- **Tradeoff accepted:** Netflix golden numbers moved (release_year count 66, mean 2012.48, earliest date_added 2008-01-01, validCount 62).
- **Source:** `made-now`

### 2026-10-29 — ID-like columns are flagged by name only
- **Superseded in part by** "ID columns with letter codes import as categorical" ("invoice" added to the words; letter-code ID columns change type at import).
- **Decision:** `columnRoles.ts` drops the "more than 95% distinct integers" rule. `id` = a name word in id, code, no, number, zip, pin, phone, index, or pandas' unnamed index column ("Unnamed: N", words `unnamed` + digits). The year rule is unchanged.
- **Why:** The distinct rule flagged HR `MonthlyRate` (97% distinct), an amount; DailyRate, HourlyRate and MonthlyIncome were one threshold away. Keeping "index" and "Unnamed: N" covers the row-number columns it was catching (DS jobs `index`).
- **Alternatives considered:** Raising the threshold or requiring consecutive values — rejected: still guesses from values; names are what people read.
- **Tradeoff accepted:** A numeric ID column with an unusual name (e.g. "Ref", "Key") isn't flagged; the user can still pick Count. Flags now: Netflix `release_year` (year); HR `EmployeeNumber`; DS jobs `index`; retail `StockCode`, `Customer ID`. Nothing in cafe, Play Store, cancer lab.
- **Source:** `made-now`

### 2026-10-29 — Date X axes are bucketed by a period; "auto" = finest period with ≤ 60 buckets
- **Decision:** New `ChartConfig.dateGranularity` (`auto | year | quarter | month | week | day`), chosen in `ChartBuilder` ("Group dates by", shown for a date X on bar/pie and on line/area with an aggregation). `ChartVisualization` keys rows by `chartAggregation.ts:dateBucketKey` (= `utils/dates.ts:periodKey`, no new date logic); "auto", an absent field (saved charts) and unknown values resolve with `resolveDateGranularity`: the finest of day → week → month → quarter → year with at most `AUTO_MAX_BUCKETS` (60) distinct keys, else year. Axis label and tooltips say `date_added (Year)`. Rows with no valid date go to a "(No date)" bar. A click/right-click on a bucket filters `between` its first and last day (`dateBucketRange` → `utils/dates.ts:periodKeyRange`, tested under the time-zone gate); "(No date)" does nothing. Each distinct cell value is bucketed once per render (`dateBucketer`; the auto pass also skips repeated values): at 1M rows / 5,000 distinct days, 1.57 s → 0.18 s per render in Node. Line/area without an aggregation still plot raw rows (no bucket).
- **Why:** The reported Netflix chart drew one bar per distinct day (1,715 bars). Full file: 2008–2021 → auto picks Quarter (44 bars); Year gives 2008 = 2.
- **Alternatives considered:** Bucketing in the query engine's group-by (`FilterState.groupByPeriod`) — rejected: that changes every view's rows, not one chart. Fixed default (Month) — rejected: 168 bars for Netflix, 1 bar for a one-month file.
- **Tradeoff accepted:** Only buckets that have rows get a bar (2009 Q1–Q3 with no titles are not shown as empty slots), since the X axis is still a band scale. Week buckets are ISO weeks.
- **Source:** `made-now`

### 2026-10-29 — Bottom-axis labels: thin, cut, turn only when it fits more; muted colour via CSS
- **Decision:** Every bottom axis (bar, heatmap, line/area) runs `src/features/charts/lib/axisLabels.ts:layoutBottomAxisLabels` after d3 draws it: labels over 16 characters are cut with "…" and get a `<title>` with the full text; `tickLayout(spacing, widestLabel, height)` picks the smallest step N so every Nth label fits, flat or turned -45°, comparing upright (axis-aligned) boxes — turned only when that shows more labels. Hidden labels keep their tick. The old unconditional -45° rotation is gone. `svg.dv-chart` + `src/index.css`: tick text `fill: hsl(var(--muted-foreground))`, axis lines `hsl(var(--border))`.
- **Why:** The dark-mode "white block" was 1,715 rotated labels drawn in d3's `fill="currentColor"`, which inherits the body's near-white text (`rgb(244,244,245)` measured in the before screenshot), all on top of each other. Upright boxes make the e2e check (no visible label boxes intersect) and the visual result agree.
- **Alternatives considered:** Exact glyph-overlap test for turned labels — rejected: denser, but `getBoundingClientRect` boxes would overlap and the check could not be automated. Wrapping labels onto two lines — rejected: SVG text has no wrapping; more code for little gain.
- **Tradeoff accepted:** Short-label charts that used to show every label turned (e.g. 10 products on a narrow card) may now show every 2nd label flat; the bar tooltips still name every key.
- **Source:** `made-now`

### 2026-10-29 — "Top N + Other" for categorical bars, and a hint past 200 bars
- **Decision:** New `ChartConfig.topN` (bar charts with a categorical X): the N keys with the largest value are kept, every other row is re-aggregated into one "Other" bar (aggregating its rows, so avg/median/distinct count are right), largest first, "Other" last, and clicking "Other" does nothing. `ChartBuilder` offers All / Top 10 / Top 20. A chart with more than `MANY_BARS` (200) bars shows an HTML hint above the plot: coarser date buckets (buttons) for a date X, "Show Top 20 + Other" for a categorical X. New `chartStore.updateChart(id, changes)` applies the hint's choice; persistence already writes changed chart objects.
- **Why:** Spec item 2. Summing the folded bars' values would be wrong for any reduction but sum and count.
- **Alternatives considered:** Rejecting unknown `dateGranularity`/`topN` values in `isValidChartConfig` — rejected: that would drop a whole saved chart for a cosmetic field; `ChartVisualization` treats unknown values as auto / no Top N instead.
- **Tradeoff accepted:** Numeric X bars with > 200 keys only get the text hint (no Top N: an "Other" bucket on a numeric axis would misread as a value).
- **Source:** `made-now`

### 2026-10-29 — ChartBuilder gets an aggregation picker
- **Decision:** `ChartBuilder` shows "Aggregation" for bar/pie/line/area once Y is picked: Sum, Average, Median, Minimum, Maximum, Count, Distinct count, Count of rows, plus "None (plot each row)" for line/area. It follows the Y column (Count for year/ID-like, else Sum for bar/pie, None for line/area) until the user picks one; the choice is stored in `ChartConfig.aggregation` (unchanged type).
- **Why:** There was no aggregation control at all, so every bar chart was a Sum; the Count default and the inline note need a picker to exist.
- **Alternatives considered:** Only changing the hidden default — rejected: the user couldn't then pick Sum back, which the spec requires ("don't block").
- **Tradeoff accepted:** New charts now store `aggregation: "sum"` explicitly where they used to leave it unset; labels and results are the same.
- **Source:** `made-now`

### 2026-10-29 — Year- and ID-like numeric columns default to Count, with a note on Sum/Avg
- **Superseded by** "ID-like columns are flagged by name only" (the distinct-integer rule and its 100-row floor).
- **Decision:** `src/shared/utils/columnRoles.ts:aggregationFlag(dataset, column)` reads only import metadata (exact `allIntegerValues`, min/max, `uniqueValueCount`, `missingValueCount`, `rowCount`), cached per metadata object, for columns whose effective type is numeric. `year`: name has the word "year"/"yr" AND every value is a whole number 1800–2100. `id`: name has one of the words id, code, no, number, zip, pin, phone, OR > 95% of at least 100 non-blank cells are distinct integers. Words come from `nameWords` (split on non-alphanumerics, camelCase and letter↔digit steps). `ChartBuilder`, `KPIBuilder`, `PivotBuilder.addValueField` and `PivotExplorer`'s default pivot (first unflagged numeric column, else Count of a flagged one) default flagged columns to Count; Sum/Avg (and Sum If / Weighted average) show `aggregationNote` inline and stay selectable. Column types are not changed (next batch's data-quality UI).
- **Why:** "Sum of release_year" (values to 220,000) is meaningless. Regex `\b` can't be used for the words: `_` is a word character, so `\byear\b` misses `release_year` and `\bid\b` misses `customer_id`; camelCase (`CustomerID`, `StockCode`) has no boundary at all. Whole-word matching keeps `paid`, `valid`, `width` out. The 100-row floor: every column of the 10-row sample (Sales, Profit) is 100% distinct.
- **Alternatives considered:** Year rule on name OR values — rejected: any column of plausible integers in 1800–2100 (prices, counts) would flip. Scanning rows for distinctness — rejected: metadata already has exact counts.
- **Tradeoff accepted:** Flagged across the 6 local CSVs + HR fixture: Netflix `release_year` (year); HR `EmployeeNumber` (id, name) and `MonthlyRate` (id, 97% distinct — a false positive: it is an amount); DS jobs `index` (id, 100% distinct); retail `StockCode`, `Customer ID` (id, name). Not flagged: DS jobs `Founded` (years, but no "year" word and -1 sentinels), retail `Invoice` (5% distinct, no listed word). The "number" word will also catch "Number of employees"-style counts.
- **Source:** `made-now`

### 2026-10-29 — No outlier badge on a sum or count of a year/ID-like column
- **Decision:** `anomalyDetector.detectChartAnomalies(chart, rows, dataset?)` returns nothing when the Y column is flagged and the chart's reduction is sum (also the default), count, count of rows or distinct count. `ChartVisualization` passes the active dataset; `summaryEngine` passes it through `detectDashboardAnomalies`.
- **Why:** The "719 Outliers" badge was IQR over raw `release_year` values: old titles, not anomalies.
- **Alternatives considered:** Running outlier detection on the plotted aggregates — out of scope for this batch (changes every chart's badge).
- **Tradeoff accepted:** The badge still looks at raw row values for every other chart.
- **Source:** `made-now`

### 2026-10-29 — Startup reads only the reopened dataset's rows; others load when selected
- **Decision:** `hydrate` reads filters, prefs and dashboards first, then rows only for the dataset the session reopens on (active dashboard's dataset, else `activeDatasetId`). Every other dataset enters the store as a placeholder: `data: []` plus `Dataset.rowsPending = { rowCount, chunkCount, dateSourceColumns }` (`db.ts:toPendingDataset`). `toStoredDataset` writes a placeholder's stored counts (never `data.length`), `saveRows` skips placeholders, and replacing a placeholder with its loaded rows at the same `rowsRevision` writes nothing. `datasetStore.loadRows(id)` (one read per id, progress in `rowsLoading`, keeps a rename made meanwhile) is used by `selectDataset` (activates only if still the last selection), `deleteDataset`'s next pick, `dashboardStore.loadDashboard`, undo/redo context restore and `snapshotStore.restoreSnapshot` (load, then re-run). The startup spinner is now text (`uiStore.startupStatus`: step, dataset name, rows read / total); a dataset loading after selection shows the same component in `MainContent`. Loader code moved to `src/shared/services/datasetRows.ts` (with `backfillAllIntegerValues`).
- **Why:** A stored 1M-row dataset delayed every reload by ~1.4 s even when another dataset was open. Measured (prod build, real Chromium IndexedDB, `scripts/bench/startup`, 3 reloads each): only small datasets 139–176 ms → 165–403 ms ready (noise; no change expected); 1M stored, not active: 1,525–1,560 ms → 167–265 ms, longest block 63 ms → 60 ms; 1M active: 2,484–2,563 ms → 2,360–2,507 ms (after throttling progress reports to every 5%; 2,816–3,227 ms before that), longest block 919–1,111 ms → 885–1,003 ms. Selecting the unloaded 1M dataset afterwards: progress view with "of 1,000,000 rows", click → usable 3.2 s, longest block 1.43 s.
- **Alternatives considered:** A separate "loaded rows" map outside the dataset objects — rejected: persistence writes from `datasets[]`, so the stored counts must travel with the object to make an unloaded save safe. Loading every dataset in the background after first render — rejected: memory (1M rows ≈ 250 MB) for data the user may never open.
- **Tradeoff accepted:** Selecting a big inactive dataset now waits for its rows (1M: 3.2 s click → usable) with a loading view. The 1M-active case did not improve: the rows read (~1.4 s) and a ~1 s block when the Overview first computes stats over 1M rows remain (not addressed; candidate for a worker); the same block plus re-evaluation is most of the 1.43 s after selecting.
- **Source:** `made-now`

### 2026-10-29 — User Timing marks on slow paths; a local real-browser bench
- **Decision:** `src/shared/lib/perfMarks.ts` (`perfMark`/`perfMeasure`, `dv:` prefix) marks startup steps, each row save (`dv:rows-save`) and the day/month toggle (`dv:date-toggle`). `scripts/bench/playwright.startup.config.ts` + `scripts/bench/startup/startup.spec.ts` run them on `vite preview` in Chromium, seeding big datasets by cloning a real stored record with generated chunks; results to the git-ignored `bench-results/`. Excluded from vitest and CI.
- **Why:** The 4c.1 numbers came from Node + fake-indexeddb, which keeps the database in the same heap; the 147–258 s date-toggle save there does not happen in a browser.
- **Alternatives considered:** Timing from outside only (Playwright timestamps) — rejected: can't split the read, evaluate and render steps.
- **Tradeoff accepted:** Marks stay in production code (a few `performance.mark` calls, no cost worth measuring).
- **Source:** `made-now`

### 2026-10-29 — Day/month toggle parses each distinct date text once
- **Decision:** `utils/dates.ts:analyzeDateColumn` matches each distinct string once and resolves/labels each distinct match once; `parsingService.ts:reparseDateColumn` parses each distinct source text once. Same results (date tests and messy golden unchanged).
- **Why:** In a real browser the toggle was not the 147–258 s seen under fake-indexeddb but still one long block: 300k rows + a calculated column: block 1,147 ms, save 596 ms, click→saved 2.4 s; 600k: block 2,893 ms, save 1,160 ms, click→saved 4.5 s. Split in Node at 600k: `analyzeDateColumn` 1.7 s of the 2.0 s reparse (a regex match, a label string and a resolve per row), then the calculated-column re-evaluation 1.2 s. After: 300k block 873 ms, click→saved 2.1 s; 600k block 2,077 ms, click→saved 4.1 s.
- **Alternatives considered:** Moving reparse + formula evaluation into a worker — rejected for this batch (needs the dataset cloned to the worker and back; bigger change).
- **Tradeoff accepted:** The toggle still blocks ~3.5 µs per row (row copies and the calculated-column re-evaluation); 1M rows was not measured (memory).
- **Source:** `made-now`

### 2026-10-29 — Flaky Undo tooltip e2e: blur before testing keyboard focus
- **Decision:** `tests/e2e/hit-areas.spec.ts` blurs the Undo button and waits for no tooltip before `focus()`.
- **Why:** The forced click left the button focused (12/12 runs), so `focus()` fired no focus event; the check passed only while the hover tooltip from the previous step was still closing, and failed 3/30 when it closed first. Now 20/20.
- **Alternatives considered:** Retries or longer timeouts — rejected (they hide the race).
- **Tradeoff accepted:** None.
- **Source:** `made-now`

### 2026-10-29 — GitHub Actions on Node 24 majors
- **Decision:** `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5` (all `runs.using: node24`, or composite over `upload-artifact@v7`). The app's own `node-version: '20.x'` is unchanged.
- **Why:** Clears the Node 20 deprecation warning. upload-pages-artifact v4+ skips dotfiles; `dist/` has none.
- **Alternatives considered:** Bumping the app's Node to 22/24 in the same change — rejected: not asked, separate risk.
- **Tradeoff accepted:** None here. (The parallel e2e job proposed with this change was applied: see "CI: e2e in its own parallel job; deploy waits for both".)
- **Source:** `made-now`

### 2026-10-29 — Dataset rows stored in chunks apart from metadata; writes only what changed (Dexie v2)
- **Decision:** `datasets` now holds a `StoredDataset` (everything except `data` and `dateSourceValues`, plus `rowCount`, `chunkCount`, `dateSourceColumns`). Rows live in a new `datasetRows` table, key `[datasetId+index]`, `ROW_CHUNK_SIZE` (20,000) rows per record with the same slice of `dateSourceValues`. A new `Dataset.rowsRevision` is bumped (`datasetStore.ts:withNewRows`) only by actions that change cell values: replace data, calculated/window add/delete, day/month toggle. `persistenceService` diffs `(state, prev)` synchronously: removed dataset → delete metadata + chunk range in one transaction; `rowsRevision` differs from what is on disk or queued → row save after 500 ms (debounced, flushed on `pagehide` / `visibilitychange` hidden); otherwise → one metadata `put`. A row save is one rw transaction: each chunk `put` awaited in turn (one structured clone each, so the main thread is free between them), chunks past the new end deleted, then the metadata `put`. A reload mid-save aborts the transaction, so the old version loads whole. While a row save is waiting, the dataset's metadata is only written by that save. All dataset writes run on one queue. Hydrate reads chunks one `get` at a time in one read transaction. Charts and dashboards use the same diff: `bulkPut` of changed objects + `bulkDelete` of removed ids, no `clear()`. `setColumnTypeOverride` passes `changesRows: false` (formula/window evaluation don't read `userOverrideType`), so it writes no rows even when calculated columns are re-materialized in memory.
- **Why:** Batch 4c.1: every rename/override/notice dismiss/import did `clear()` + `bulkAdd` of all datasets with all rows (3.9–5.6 s block at 1M rows); charts stored full row copies (12.5 s for 3 charts).
- **Alternatives considered:** Detecting row changes by `data` reference — rejected: formula/window evaluation rebuilds `data` on a type override. Writing chunks in separate transactions behind a generation pointer (shadow write + garbage collection) — rejected: one transaction with sequential puts gives the same atomicity with no orphan cleanup. `bulkPut` of all chunks — rejected: one clone of everything in one task.
- **Tradeoff accepted:** A new upload is on disk only after the 500 ms debounce and its save; closing the tab inside that window loses it (the flush on `pagehide` is best effort). The `upgrade()` to v2 runs in the versionchange transaction and blocks once, on first open, for as long as the old full-row records take to split. Datasets that fail validation on load stay in the database untouched (before, the next save's `clear()` dropped them). Bench numbers at 1M rows are incomplete — see the 4c.1 report; the date-toggle save after a calculated column was pathological in Node + fake-indexeddb on a 7.6 GB machine and was not diagnosed (diagnosed later: see "Day/month toggle parses each distinct date text once").
- **Source:** `made-now`

### 2026-10-29 — Charts keep no row copy (`ChartConfig.data` removed)
- **Decision:** `ChartConfig.data` is removed from the type, from `ChartBuilder`, `aiEngine`, `templateEngine.instantiateTemplate` and from saved charts (Dexie v2 `upgrade` deletes it). `ChartVisualization` already derived its rows from the active dataset; its `!dataset` fallback now returns `[]`. `anomalyDetector.detectChartAnomalies(chart, rows)` / `detectDashboardAnomalies(charts, rows)` take rows: `ChartVisualization` passes its live query rows, the executive summary passes `filterStore.filteredData`. `isValidChartConfig` no longer requires `data`. Template store persist version 3 strips `widgets[].data` from saved templates (they had copied chart rows into localStorage).
- **Why:** The copy was only read by the anomaly detector and the no-dataset fallback, and it was a snapshot of the filtered rows at creation time (aggregated rows for AI-created charts), so anomalies didn't follow later filter changes.
- **Alternatives considered:** Keeping the copy in memory but not persisting it — rejected, nothing needs it.
- **Tradeoff accepted:** Outlier badges and the summary's anomalies now follow the current filters/drill state instead of the creation-time snapshot (a behaviour change).
- **Source:** `made-now`

### 2026-10-29 — fake-indexeddb for persistence tests; local persistence bench
- **Decision:** `fake-indexeddb` (devDependency) is loaded for every vitest file via `setupFiles: ["fake-indexeddb/auto"]` in `vite.config.ts`. Persistence tests run against the real `db.ts` and spy on the Dexie tables; `persistenceService.whenIdle()` replaces fake timers. `scripts/bench/persistence.bench.ts` (config `scripts/bench/vitest.config.ts`) drives the real stores and service at 1M × 8 rows; local only.
- **Why:** Mocked `db` objects can't show what a transaction writes or that an aborted save leaves the old version. fake-indexeddb schedules on timers, so fake timers would hang it.
- **Alternatives considered:** Per-file `import "fake-indexeddb/auto"` — rejected: it must load before Dexie reads the globals, and `vi.mock` hoisting makes import order fragile.
- **Tradeoff accepted:** Every test file gets an `indexedDB` global, so a test that forgets to mock the DB writes to the in-memory one instead of failing. Bench numbers come from Node + fake-indexeddb, not a browser.
- **Source:** `made-now`

### 2026-10-29 — Import runs in a Web Worker, one worker per import (`src/features/upload/worker/import.worker.ts`)
- **Decision:** CSV/TSV parsing (`csvParse.ts`), XLSX reading (`xlsxDates.ts` + `sheet_to_json`) and `processRawData` run in a module worker created with `new Worker(new URL(...), { type: "module" })`. The pipeline itself is `lib/importCore.ts:runImport`, a plain async function with no DOM or store access; the worker is a thin message shell around it, and the unit tests call it directly in Node. The main thread side is `lib/importClient.ts:importFile` (size/format check, then the worker), driven by `store/importStore.ts`, which both the upload panel and DataTable "replace data" call. A fresh worker is started per import and terminated when it finishes or is cancelled, which frees everything it parsed. The file is read in 4 MB slices (progress by bytes), decoded to one string and parsed by Papa in 1 MB string chunks (progress by characters); `CsvRecordBuilder` turns each chunk into records and shifts Papa's per-chunk row numbers. The browser's day/month default (`localeDayFirst`) is read on the main thread and passed in. `parseCsvFile` (Papa reading the `File` on the main thread) is removed.
- **Why:** Audit A15: parsing froze the tab for 11–15 s (CSV) and 42–45 s (XLSX). Measured after: no main-thread gap over 148 ms while reading and parsing either retail file.
- **Alternatives considered:** Papa's own `worker: true` — rejected: it only moves the tokenizer, `processRawData` and XLSX would still block, and Papa's header-mode issues come back. Streaming Papa over the `File` inside the worker — rejected: `FileReader` streaming can't run in the Node unit tests, and reading slices gives an honest "reading" stage. A long-lived worker — rejected: terminating is the only reliable way to free a cancelled parse.
- **Tradeoff accepted:** The finished `Dataset` (row objects) is structured-cloned back. On the 1,067,371-row retail CSV that is 229.6 MB of structured-clone data (v8.serialize, 215 bytes/row) and took 3.8 s end to end, blocking the main thread for about 2.0 s while it deserializes (1.1–2.9 s on the XLSX across runs). Saving afterwards (`uploadDataset`, the persistence subscriber's `clear` + `bulkAdd` of every dataset, the Overview render) still blocks for 3.4–5.1 s; persistence is outside this batch. The worker is its own 370 kB bundle (xlsx + papaparse + the parsing services), duplicated from the main chunks. Vite builds it as one IIFE, outside `manualChunks`, so it can't join the vendor-react ⇄ engine-core cycle; the prod smoke gate now imports a CSV to prove it loads under `/datavista/`. The whole file text sits in worker memory during parsing (one string), as Papa's chunks did before.
- **Source:** `made-now`

### 2026-10-29 — One size cap: 100 MB decimal, checked before any read
- **Decision:** `lib/importLimits.ts` holds `MAX_IMPORT_BYTES = 100,000,000` and `LARGE_FILE_WARNING_BYTES = 50,000,000`, and `checkImportFile` (format + size, reads only `name` and `size`). `importFile` calls it first, before a worker exists, for every input: upload panel `<input type="file">`, drag and drop on the upload panel, and DataTable's "replace data" `<input type="file">` (the only file entry points; there is no paste handler or imperative input). Sizes are shown in decimal MB with the same number of decimals for the file and the limit, adding decimals until they differ, so "100.0 MB vs 100.0 MB" can't happen. A rejected file never opens the import dialog. The large-file warning toast is shown on every input.
- **Why:** Audit A14 (replace data had no cap and parsed 150 MB) and A19 (the message said "143.8MB" in MiB while the OS shows 150.8 MB, and the cap was really 104.9 MB while the UI said 100 MB).
- **Alternatives considered:** Keeping 100 MiB and labelling it "MiB" — rejected: file managers on Linux/macOS show decimal MB, so the user compares against that.
- **Tradeoff accepted:** Files between 100.0 MB and 104.9 MB, accepted before, are now rejected; the warning moved from 52.4 MB to 50 MB. Windows Explorer labels MiB as "MB", so there the shown size reads about 5% high.
- **Source:** `made-now`

### 2026-10-29 — Parse problems are shown before analysis; keep by default, exclude on request
- **Decision:** Field-count problems (`TooFewFields`/`TooManyFields`) and every other Papa error are collected with their data-row index. When at least one row has a problem, the worker pauses after parsing and the import dialog shows rows and columns read, the number of rows with problems, the first 20 (1-based data row, problem, raw fields) and "Keep all rows" (default, focused; closing the dialog also keeps) / "Exclude N rows" / "Cancel import". Exclude drops those rows before `processRawData`, so metadata, types and `dateSourceValues` are computed without them. `metadata.importIssues` stores counts, file-level messages, the first 100 problems and `excluded`; `parsingStatistics.errorCount` is the real problem count. The Data view shows a notice with "View import summary" that reopens the stored list read-only. XLSX imports store an empty summary (SheetJS reports no row problems).
- **Why:** Audit A7 / B "Shifted/malformed rows": Play Store row 10,473 (Rating 19) was accepted silently and `errorCount: 0` was hardcoded. Keeping matches Power Query. Verified: on the full Play Store file row 10,473 is listed as "Too few fields: expected 13 fields but parsed 12", and Exclude gives Rating max 5.00 (count 9,366, mean 4.19).
- **Alternatives considered:** Showing the summary after the dataset is saved and excluding later — rejected: the raw rows are gone by then, and re-running analysis on processed rows would lose the day/month source text. Showing a summary for every import — rejected: a modal on every clean upload; the success toast already gives the row count.
- **Tradeoff accepted:** Excluding is only offered at import; the reopened summary says to re-import to exclude. Value range checks (A7's "numeric columns fail range checks") are not part of this — only parser problems are listed. Row numbers are data rows, not file lines (they differ when cells contain newlines).
- **Source:** `made-now`

### 2026-10-29 — Multi-sheet XLSX: sheet picker, optional append with a "Source sheet" column
- **Decision:** A workbook with more than one sheet pauses the worker after reading and shows a picker with each sheet's name, data-row count (from its used range) and header names. The user picks one sheet, or "Append all sheets" when every sheet with rows has identical headers; appended rows get a `Source sheet` column (renamed `Source sheet.1` if the name is taken). One sheet imports directly. Records are produced with `sheet_to_json({ header: <the sheet's own keys>, range: <20,000-row block>, defval: "" })`, which gives the same records as the old single call (progress by rows), so XLSX header naming ("__EMPTY", "Name_1") is unchanged; `xlsxDates.ts` is unchanged. DataTable "replace data" now also gets `defval: ""` (it had none).
- **Why:** Audit A16: only the first sheet was imported, silently dropping 541,910 rows of the retail workbook.
- **Alternatives considered:** Appending sheets whose headers only partly match — rejected for now: needs column alignment rules. Switching XLSX to pandas header naming like CSV — deferred, it renames columns in existing saved charts.
- **Tradeoff accepted:** SheetJS reads the whole workbook before the picker can show (45–47 s for the 45.6 MB retail file), with no percentage during that read (the dialog shows elapsed seconds). The row count includes blank rows inside the used range.
- **Source:** `made-now`

### 2026-10-29 — Import state lives in a store, one dialog for every input
- **Decision:** `store/importStore.ts` (`importForUpload`, `importForReplace`, `cancel`, `answerSheet`, `answerReview`) holds the stage, progress, sheet list and review; `features/upload/components/ImportDialog.tsx` is mounted once in `Dashboard` and renders progress (Reading file → Parsing → Analysing columns → Saving, % or elapsed time) with Cancel, the sheet picker and the parse summary. Cancel terminates the worker; nothing reaches `datasetStore`, so the current dataset is untouched. During "Saving" (main-thread `uploadDataset`) Cancel is disabled with a tooltip, because terminating can't undo a write that has started. FileUpload's own fake progress bar is gone.
- **Why:** Audit A17: progress showed 0% then 100%. FileUpload unmounts while `uploadDataset` shows the loading view, so its local state couldn't show "Saving".
- **Alternatives considered:** Separate progress UI in FileUpload and DataTable — rejected, two copies to keep in step.
- **Tradeoff accepted:** "Saving" is reported by the main thread, not the worker, and has no percentage. One import at a time; a second file while one runs gets a toast.
- **Source:** `made-now`

### 2026-10-29 — Big-file checks are local only (`npm run test:bigfiles`)
- **Decision:** `scripts/bigfiles/run.mjs` runs `tests/bigfiles/bigfiles.spec.ts` (config `playwright.bigfiles.config.ts`, 1 worker) once per file in `test-data-local/` (retail CSV, retail XLSX, creditcard, Play Store), each in its own Playwright run with a fresh dev server; missing files are skipped. It records load time, main-thread heartbeat gaps (parse, transfer, save), progress texts, cancel, heap, browser RSS, rows, the sheet picker, rejections on every input, search and the Country × Quantity chart, into `test-results/bigfiles/<file>.json`. Not in CI; vitest excludes `tests/bigfiles/**`.
- **Why:** The files are 45–150 MB and git-ignored; the CI-safe tests use generated data instead.
- **Alternatives considered:** Running all files in one Playwright run — rejected: a 7.6 GB machine already lost a run to memory pressure.
- **Tradeoff accepted:** Numbers vary between runs (the transfer gap on the XLSX ranged 1.1–2.9 s).
- **Source:** `made-now`

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
- **Superseded in part by** 2026-10-29 — Multi-sheet XLSX: sheet picker (the sheet is now chosen); header naming is unchanged.
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
- **Superseded in part by** "Messy golden: pandas computes the values after each approved fix" (the deferred oracle checks and Play Store Price).
- **Decision:** `tests/fixtures/messy/{cafe,playstore,netflix,glassdoor}.csv` (byte-exact subsets, rows from the audit's section C; licences in `tests/fixtures/README.md`; `.gitattributes` keeps them `-text`). `scripts/golden/generate_messy_golden.py` (`npm run golden:regen-messy`) re-implements the numeric rule in Python (reads `dtype=str, keep_default_na=False`) and writes `messy.golden.json`. `golden.messy.test.ts` loads each file through `parseCsvText` → `processRawData` and checks row/column counts, header names, the expected numeric-column set, and that statsEngine (full and filtered path), queryEngine/KPI, chart `aggregateValues`, Overview (`summarizeNumericColumns`) and group-by totals all equal the oracle. Glassdoor Rating/Founded (-1 sentinels) and Play Store Rating (shifted row 10473) are only checked for engine-vs-engine agreement; their oracle check, "$" prices and dates are `it.todo`.
- **Why:** The HR fixture is clean, so it couldn't catch the junk/blank bugs. A separate script keeps the HR oracle unchanged in purpose.
- **Alternatives considered:** Extending `generate_hr_golden.py` — rejected, different inputs and rules. Including the Lab file — rejected, licence unknown.
- **Tradeoff accepted:** The oracle JSON encodes the current rule, including -1 sentinels and the shifted row; the suite deliberately doesn't compare those three columns with it until the later batches. Play Store `Price` is categorical in this subset (it oversamples "$" prices), so it isn't checked as numeric.
- **Source:** `made-now`

### 2026-10-28 — e2e suite runs in CI before the build
- **Superseded by** "CI: e2e in its own parallel job; deploy waits for both" (2026-10-29).
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
- **Why:** Likely: free static hosting with no backend needed for a browser-only tool.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** No server-side logic; all data processing and API calls happen in the browser.
- **Source:** `inferred`

### Zustand stores, some persisted to localStorage
- **Superseded (API key part) by:** "AI key kept for the session by default, outside every persisted store" (2026-11-16).
- **Decision:** App state in Zustand stores (`src/store/`, `src/features/dashboards/store/`); `uiStore` uses `persist` (`datavista-ui-storage`) for preferences including the LLM API key.
- **Why:** Likely: minimal boilerplate compared with Redux, selector-based subscriptions.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** User-supplied API key sits in localStorage in plaintext.
- **Source:** `inferred`

### IndexedDB via Dexie for local persistence
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
- **Decision:** CSV/TSV via `papaparse`, XLSX via `xlsx` (from the SheetJS CDN since "SheetJS 0.20.3 from the SheetJS CDN instead of npm `xlsx@0.18.5`"), chart rendering via `d3`, PDF/image export via `jspdf` + `html2canvas`.
- **Why:** Likely: mature, widely used client-side libraries for each job.
- **Alternatives considered:** Unknown.
- **Tradeoff accepted:** Large bundle contributions (hence the vendor-export chunk).
- **Source:** `inferred`

### Optional direct browser calls to LLM providers (Gemini default)
- **Superseded by:** "AI provider registry and one fetch client for three API styles" (2026-11-16).
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
