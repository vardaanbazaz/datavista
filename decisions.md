# Decisions

Newest first. Entries marked `Source: inferred` were reconstructed from existing code; their "Why" is a guess and should be corrected by the author.

### 2026-10-28 — Expanded chart view re-renders via `fitHeight`, using Radix Dialog
- **Decision:** Add an opt-in `fitHeight` prop to `ChartVisualization` that measures the plot area's height (ResizeObserver) and draws at it, instead of the fixed 300px viewBox height. The full-screen viewer (`ChartExpandButton`) is a Radix `Dialog` that mounts a second `ChartVisualization chart={...} fitHeight`. The Charts view grid (`ChartGrid`) also uses `fitHeight` with a definite card height (`clamp(360px, 60vh, 600px)`) and one chart per row below `2xl`.
- **Why:** With a fixed viewBox, a bigger container only scales the drawing up (fonts and strokes included). Redrawing at the real size keeps axes and labels legible and hit areas correct. Radix Dialog already provides the focus trap, Esc/backdrop/close dismissal and focus return to the trigger, so none of that is hand-rolled.
- **Alternatives considered:** Making every chart fit its container's height — rejected for now. Containers with auto height (e.g. the Export panel's off-screen render) would make the measured height follow the SVG's own size; opt-in keeps current behaviour everywhere else. CSS-scaling the existing SVG into the modal — rejected, it is the scaled-bitmap look the request rules out. A separate fullscreen route — rejected as heavier than a dialog.
- **Tradeoff accepted:** While the modal is open there are two mounted instances with the same `data-chart-id`. `exportUtils` takes the first match in DOM order, which is the in-page one (the dialog portals to the end of `<body>`). Dashboard grid cards (react-grid-layout) still use the fixed height.
- **Source:** `made-now`

### 2026-10-28 — Single shared tooltip wrapper `Hint` for icon-only controls
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
