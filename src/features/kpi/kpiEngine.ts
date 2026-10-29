import { queryEngine } from "@/shared/services/queryEngine";
import { Dataset, Query, QueryFilters, GlobalFilter } from "@/shared/types";
import { KPICardConfig } from "./types";
import { filterManager } from "@/features/dashboards/services/filterManager";
import { columnsOfType } from "@/shared/utils/columnType";

export interface KPICardData {
  primaryValue: number;
  trendPercentage: number | null;
  sparklineData: { date: string; value: number }[];
}

export const kpiEngine = {
  calculateKPIData(
    dataset: Dataset,
    config: KPICardConfig,
    filters?: QueryFilters,
    activeGlobalFilters?: GlobalFilter[]
  ): KPICardData {
    // 1. Get primary value
    const primaryQuery: Query = {
      filters,
      aggregations: [
        {
          column: config.primaryMetric.column,
          operator: config.primaryMetric.aggregation,
          alias: "value",
        },
      ],
      pagination: { pageSize: "all" },
    };

    const mergedPrimaryQuery = activeGlobalFilters
      ? filterManager.merge(primaryQuery, activeGlobalFilters, config.id, dataset)
      : primaryQuery;

    const primaryResult = queryEngine.execute(dataset, mergedPrimaryQuery);
    const primaryValue = primaryResult.summary?.["value"] ?? 0;

    let trendPercentage: number | null = null;
    let sparklineData: { date: string; value: number }[] = [];

    // 2. Get trend and/or sparkline data
    if (config.trendConfiguration || config.sparkline) {
      const dateColumn = config.trendConfiguration?.dateColumn || 
        columnsOfType(dataset, 'date')[0];

      if (dateColumn) {
        const period = config.trendConfiguration?.comparisonPeriod || "month";

        const trendQuery: Query = {
          filters,
          groupBy: {
            column: dateColumn,
            period,
          },
          aggregations: [
            {
              column: config.primaryMetric.column,
              operator: config.primaryMetric.aggregation,
              alias: "value",
            },
          ],
          sorting: [
            {
              column: dateColumn,
              direction: "asc",
            },
          ],
          pagination: { pageSize: "all" },
        };

        const mergedTrendQuery = activeGlobalFilters
          ? filterManager.merge(trendQuery, activeGlobalFilters, config.id, dataset)
          : trendQuery;

        const trendResult = queryEngine.execute(dataset, mergedTrendQuery);

        sparklineData = trendResult.rows.map((row) => ({
          date: String(row[dateColumn]),
          value: Number(row["value"]) || 0,
        }));

        if (config.trendConfiguration && sparklineData.length >= 2) {
          const currentVal = sparklineData[sparklineData.length - 1].value;
          const previousVal = sparklineData[sparklineData.length - 2].value;

          if (previousVal !== 0) {
            trendPercentage = ((currentVal - previousVal) / previousVal) * 100;
          } else if (currentVal !== 0) {
            trendPercentage = 100;
          } else {
            trendPercentage = 0;
          }
        }
      }
    }

    return {
      primaryValue,
      trendPercentage,
      sparklineData,
    };
  },
};
