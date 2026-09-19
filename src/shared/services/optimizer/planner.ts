import { Query, Dataset } from "@/shared/types";
import { ExecutionPlan } from "./types";
import { hashQuery } from "./hash";
import { filterCache, processCache } from "./cache";

export const executionPlanner = {
  /**
   * Generates an optimal execution plan for a query against a dataset.
   */
  generatePlan(dataset: Dataset, query: Query): ExecutionPlan {
    const datasetId = dataset.id;

    // 1. Compute deterministic filter sub-hash
    const filterInput = {
      filters: query.filters || {}
    };
    const filterHash = hashQuery(filterInput);
    const filterCacheKey = `${datasetId}::FILTER::${filterHash}`;

    // 2. Compute deterministic process sub-hash (filters + sorting + aggregations + grouping + windowing)
    const processInput = {
      filters: query.filters || {},
      sorting: query.sorting || [],
      groupBy: query.groupBy || null,
      aggregations: query.aggregations || [],
      windowQueries: query.windowQueries || []
    };
    const processHash = hashQuery(processInput);
    const processCacheKey = `${datasetId}::PROCESS::${processHash}`;

    // 3. Try to hit processed cache first
    const cachedProcess = processCache.get(processCacheKey);
    if (cachedProcess) {
      return {
        planId: `plan::${processHash}`,
        filterCacheKey,
        processCacheKey,
        steps: ["REUSE_PROCESS", "PAGINATE"],
        reuseFilterData: null,
        reuseProcessResult: cachedProcess.data
      };
    }

    // 4. Try to hit filtered cache second
    const cachedFilter = filterCache.get(filterCacheKey);
    if (cachedFilter) {
      return {
        planId: `plan::${processHash}`,
        filterCacheKey,
        processCacheKey,
        steps: ["REUSE_FILTER", "PROCESS", "PAGINATE"],
        reuseFilterData: cachedFilter.data,
        reuseProcessResult: null
      };
    }

    // 5. Cache miss across all intermediate states
    return {
      planId: `plan::${processHash}`,
      filterCacheKey,
      processCacheKey,
      steps: ["FILTER", "PROCESS", "PAGINATE"],
      reuseFilterData: null,
      reuseProcessResult: null
    };
  }
};
export default executionPlanner;
