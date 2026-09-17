import { CacheEntry } from "./types";
import { DataRow, QueryResult } from "@/shared/types";

class LruCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private totalRowsCount = 0;

  constructor(
    private maxEntries: number = 5,
    // ADR-003: "strict limit of 100,000 rows per cache entry" — this is a
    // per-entry cap, not a cumulative budget across all cached entries.
    private maxRowsPerEntry: number = 100000
  ) {}

  /**
   * Retrieves an item from cache, updating its LRU position.
   */
  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // LRU refresh: move to the end of insertion list
      this.cache.delete(key);
      entry.lastAccessedAt = Date.now();
      entry.hitCount++;
      this.cache.set(key, entry);
    }
    return entry;
  }

  /**
   * Caches an item, evicting oldest accessed items if thresholds are exceeded.
   */
  set(key: string, datasetId: string, data: T, rowCount: number): void {
    // Reject entries that alone exceed the per-entry row cap. Without this,
    // an oversized entry gets admitted whole (the eviction loop below never
    // runs against an empty cache), then every subsequent set() finds the
    // budget already blown and evicts everything down to that one entry.
    if (rowCount > this.maxRowsPerEntry) {
      return;
    }

    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict oldest entries once entry-count capacity is breached.
    while (this.cache.size >= this.maxEntries && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
      }
    }

    const entry: CacheEntry<T> = {
      key,
      datasetId,
      data,
      rowCount,
      insertedAt: Date.now(),
      lastAccessedAt: Date.now(),
      hitCount: 0
    };

    this.cache.set(key, entry);
    this.totalRowsCount += rowCount;
  }

  /**
   * Deletes a specific key.
   */
  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalRowsCount -= entry.rowCount;
      this.cache.delete(key);
    }
  }

  /**
   * Invalidates all cache keys linked to a specific dataset ID.
   */
  invalidateDataset(datasetId: string): void {
    const keysToInvalidate: string[] = [];
    this.cache.forEach((entry, key) => {
      if (entry.datasetId === datasetId) {
        keysToInvalidate.push(key);
      }
    });
    keysToInvalidate.forEach(key => this.delete(key));
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
    this.totalRowsCount = 0;
  }

  /**
   * Returns current statistics.
   */
  getStats() {
    return {
      size: this.cache.size,
      totalRows: this.totalRowsCount
    };
  }
}

export const filterCache = new LruCache<DataRow[]>(5, 100000);
export const processCache = new LruCache<QueryResult>(5, 100000);

export const queryCache = {
  invalidate(datasetId: string): void {
    filterCache.invalidateDataset(datasetId);
    processCache.invalidateDataset(datasetId);
  },
  clearAll(): void {
    filterCache.clear();
    processCache.clear();
  }
};
