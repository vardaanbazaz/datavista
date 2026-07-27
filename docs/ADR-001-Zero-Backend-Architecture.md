# ADR-001: Zero-Backend Offline-First Architecture

## Status
Accepted

## Context
DataVista requires the capability to import, filter, aggregate, and visualize high-cardinality datasets (such as CSVs, TSVs, and Excel spreadsheets up to 100MB / tens of thousands of rows) in real-time. Traditional web architectures rely on server-side databases (PostgreSQL, BigQuery, Elasticsearch) to parse and process data. However:
- Hosting and scaling server-side data processing infrastructure incurs continuous cloud infrastructure costs.
- Network round-trips for data filtering, sorting, and drill-downs introduce latency and depend on active internet connectivity.
- Transferring unencrypted user datasets to cloud backends poses data privacy and compliance risks.

## Decision
We adopted a **Zero-Backend, Offline-First Architecture** executing entirely within the client's web browser environment:
1. **Client-Side Persistence**: Utilized Dexie.js over IndexedDB for persistent, structured storage of datasets, saved dashboards, custom color palettes, and global configuration.
2. **In-Memory Query Engine**: Executed all data parsing (Papa Parse, SheetJS), filtering, aggregations, statistical summaries, and window functions locally via TypeScript calculation engines.
3. **Offline Capability**: Hosted static application assets via GitHub Pages with no active API server requirements.

## Consequences

### Positive
- **Zero Operating Costs**: Eliminates cloud server, database, and backend maintenance expenses.
- **Sub-Millisecond Interactivity**: Local data manipulation eliminates network latency for instantaneous UI feedback during filtering, sorting, and cross-filtering.
- **Privacy & Security**: User datasets never leave the browser local storage environment.
- **Full Offline Functionality**: Users can run analytics without an internet connection.

### Negative
- **Browser Memory Boundaries**: Maximum dataset size is bound by client device RAM and browser storage quotas (mitigated via virtualized tables and streaming row chunking).
- **CPU Constraints**: Heavy analytical computations rely on client CPU single-thread capacity.
