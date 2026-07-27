# ADR-003: Deterministic Query Hashing and LRU Cache

## Status
Accepted

## Context
Frequent UI state changes (such as pagination, sorting, active view switching, and chart resizing) trigger repetitive dataset query executions. Re-filtering and re-calculating aggregated fields on large datasets during minor UI interactions caused frame drops and high CPU utilization.

## Decision
We implemented a **Deterministic Query Hashing and Dual LRU Cache System** (`queryEngine`):
1. **Deterministic Hashing**: Formatted query payloads (Filters, Search terms, Conditions, Sort rules, Window queries) into a canonical JSON structure and computed a fast 32-bit FNV-1a hash.
2. **Dual LRU Cache**: Maintained two Least Recently Used (LRU) cache layers:
   - Intermediate Filter Cache (stores filtered row arrays).
   - Window & Aggregation Cache (stores window function results and grouping rollups).
3. **Automatic Invalidation**: Invalidates cache entries when underlying datasets are modified, updated, or deleted.
4. **Memory Guardrails**: Applied a strict limit of 100,000 rows per cache entry and max cache depth to safeguard browser memory.

## Consequences

### Positive
- **Near-Instant UI Feedback**: Repeated queries hit the LRU cache with sub-millisecond return times, eliminating frame drops.
- **Reduced Memory & CPU Overhead**: Avoids redundant dataset iterations during view toggling and component re-renders.
- **Measurable Impact**: Displays execution time savings to users via `QueryPerformanceBadge`.

### Negative
- **Memory Overhead**: Caching intermediate datasets consumes additional browser heap memory (mitigated by LRU eviction policy and strict row caps).
