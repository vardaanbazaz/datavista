# ADR-003: Deterministic Query Hashing and LRU Cache

## Status
Accepted

## Context
Repeated dataset queries re-filter and re-process the same rows.

Why: not recorded. (The earlier claim of frame drops and high CPU has no support in the code or git history.)

## Decision
We implemented a **Deterministic Query Hashing and Dual LRU Cache System** (`queryEngine`):
1. **Deterministic Hashing**: Query parts are serialized with sorted keys (`stableStringify`) and hashed with 32-bit FNV-1a (`optimizer/hash.ts`). The filter key hashes `filters` (search is inside it). The process key hashes `filters`, `sorting`, `groupBy`, `aggregations`, and `windowQueries`. Pagination is not hashed.
2. **Dual LRU Cache**: Maintained two Least Recently Used (LRU) cache layers:
   - Intermediate Filter Cache (stores filtered row arrays).
   - Process Cache (stores the full result of the sort, group, aggregate, and window step).
3. **Automatic Invalidation**: Entries for a dataset are invalidated when its rows or columns are updated (`datasetStore`, two call sites). Deleting a dataset does not invalidate; its entries age out by LRU.
4. **Memory Guardrails**: Each cache holds at most 5 entries and skips results over 100,000 rows (`optimizer/cache.ts`).

## Consequences

### Positive
- **Skipped work on repeat**: a repeated query reuses the cached process result, or the cached filter result and re-runs only the process step. No timing is recorded for this.
- **Visible**: `QueryPerformanceBadge` (in `DataTable`) shows "Cache Hit" with the time saved.

### Negative
- **Memory Overhead**: Caching intermediate datasets consumes additional browser heap memory (mitigated by LRU eviction policy and strict row caps).
