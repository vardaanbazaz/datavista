# Decisions

Newest first. Entries marked `Source: inferred` were reconstructed from existing code; their "Why" is a guess and should be corrected by the author.

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
