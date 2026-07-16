import { Dataset } from "@/shared/types";
import { PivotConfig } from "./types";
import { buildRowHierarchy, buildColumnHierarchy, computeHierarchyValues, sortHierarchyByValue } from "./hierarchyBuilder";
import { PivotResultModel } from "./resultModel";
import { aggregationAdapter } from "./aggregationAdapter";
import { flattenRowHierarchy, flattenColumnHierarchy } from "./utilities";

export const pivotEngine = {
  /**
   * Executes the pivot aggregation process on the dataset data, building rows, columns, and cell values.
   */
  execute(dataset: Dataset, config: PivotConfig): PivotResultModel {
    const startTime = performance.now();

    // 1. Map pivot value fields to unified query aggregations
    const queryAggs = aggregationAdapter.toQueryAggregations(config.valueFields);

    // 2. Build row and column hierarchy trees
    const rowHierarchy = buildRowHierarchy(dataset.data, config.rowDimensions, config.dimensionSorts);
    const columnHierarchy = buildColumnHierarchy(dataset.data, config.columnDimensions, config.dimensionSorts);

    // 3. Compute cell values (aggregations) recursively
    computeHierarchyValues(rowHierarchy, config.columnDimensions, queryAggs);

    // 4. Apply value-based sorts if specified
    if (config.valueSorts && config.valueSorts.length > 0) {
      for (const sortRule of config.valueSorts) {
        sortHierarchyByValue(
          rowHierarchy,
          sortRule.valueFieldAlias,
          sortRule.columnPath,
          sortRule.direction
        );
      }
    }

    // 5. Flatten trees to arrays for rendering
    // By default, we include the root node in flat lists so totals are easily renderable
    const flatRows = flattenRowHierarchy(rowHierarchy);
    const flatCols = flattenColumnHierarchy(columnHierarchy);

    const executionTimeMs = performance.now() - startTime;

    return new PivotResultModel(
      config,
      rowHierarchy,
      columnHierarchy,
      flatRows,
      flatCols,
      {
        rowCount: flatRows.length,
        columnCount: flatCols.length,
        processingTimeMs: executionTimeMs
      }
    );
  }
};
export default pivotEngine;
