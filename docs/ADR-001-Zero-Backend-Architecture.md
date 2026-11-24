# ADR-001: Zero-Backend Offline-First Architecture

## Status
Accepted

## Context
DataVista imports, filters, aggregates, and visualizes CSV, TSV, and Excel files (import cap: 100 MB, `src/features/upload/lib/importLimits.ts`).

Why: not recorded. (The earlier cost, latency, and privacy reasons have no support in the code or git history.)

## Decision
We adopted a **Zero-Backend Architecture**: data parsing, storage, and queries run in the client's web browser. (The "offline-first" in the title is not backed by code: there is no service worker or web app manifest.)
1. **Client-Side Persistence**: Dexie.js over IndexedDB stores datasets, their row chunks, removed rows, charts, filters, dashboards, and UI state (`src/shared/lib/db.ts`). UI preferences (including theme), AI settings, templates, saved views, and snapshots are in localStorage.
2. **In-Memory Query Engine**: Data parsing (Papa Parse, SheetJS, in a web worker), filtering, aggregations, statistical summaries, and window functions run locally in TypeScript engines.
3. **Static hosting**: Static assets are deployed to GitHub Pages (`.github/workflows/deploy.yml`); no API server. The optional AI copilot calls a provider the user chooses.

## Consequences

### Positive
- **No backend to run**: no server or database to host or maintain.
- **No network round-trip**: filtering, sorting, and cross-filtering run locally. No timing is measured or recorded for this.
- **Privacy**: files and rows stay in the browser (IndexedDB). With the optional AI copilot, the default "Queries" level sends column names, summary stats, and query results, never rows (README).

### Negative
- **Browser Memory Boundaries**: Maximum dataset size is bound by client device RAM and browser storage quotas (the table is virtualized and rows are stored in IndexedDB in chunks).
- **CPU Constraints**: Queries run on the main thread. Only file import and column metadata run in web workers.
