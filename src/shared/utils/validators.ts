import { Dataset, ChartConfig, FilterState, Dashboard } from "@/shared/types";

export function isValidDataset(obj: any): obj is Dataset {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.id !== "string" || !obj.id.trim()) return false;
  if (typeof obj.name !== "string" || !obj.name.trim()) return false;
  if (!Array.isArray(obj.data)) return false;
  if (!Array.isArray(obj.columns)) return false;
  if (!obj.columnTypes || typeof obj.columnTypes !== "object") return false;

  // Validate that all columns list elements are strings
  const columnsValid = obj.columns.every((col: any) => typeof col === "string");
  if (!columnsValid) return false;

  // Validate that all columnTypes mapping values are valid categories
  const allowedTypes = ["numeric", "categorical", "date"];
  const typesValid = Object.entries(obj.columnTypes).every(
    ([key, val]: [string, any]) => typeof key === "string" && allowedTypes.includes(val)
  );
  if (!typesValid) return false;

  return true;
}

export function isValidChartConfig(obj: any): obj is ChartConfig {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.id !== "string" || !obj.id.trim()) return false;
  if (typeof obj.title !== "string" || !obj.title.trim()) return false;
  if (typeof obj.datasetId !== "string" || !obj.datasetId.trim()) return false;
  if (!Array.isArray(obj.data)) return false;

  const allowedTypes = [
    "bar",
    "line",
    "pie",
    "scatter",
    "histogram",
    "heatmap",
    "area",
    "bubble"
  ];
  if (!allowedTypes.includes(obj.type)) return false;

  return true;
}

export function isValidFilterState(obj: any): obj is FilterState {
  if (!obj || typeof obj !== "object") return false;
  
  // Verify categoricalFilters structure
  if (!obj.categoricalFilters || typeof obj.categoricalFilters !== "object") return false;
  const categoricalValid = Object.entries(obj.categoricalFilters).every(
    ([_, val]) => Array.isArray(val) && val.every((v: any) => typeof v === "string")
  );
  if (!categoricalValid) return false;

  // Verify dateRangeFilters structure
  if (!obj.dateRangeFilters || typeof obj.dateRangeFilters !== "object") return false;
  const dateRangeValid = Object.entries(obj.dateRangeFilters).every(
    ([_, val]: [string, any]) => {
      if (!val || typeof val !== "object") return false;
      const startValid = val.start === undefined || val.start === null || val.start instanceof Date || !isNaN(Date.parse(val.start));
      const endValid = val.end === undefined || val.end === null || val.end instanceof Date || !isNaN(Date.parse(val.end));
      return startValid && endValid;
    }
  );
  if (!dateRangeValid) return false;

  // Optionals
  if (obj.groupByColumn !== undefined && typeof obj.groupByColumn !== "string") return false;
  if (
    obj.groupByPeriod !== undefined &&
    obj.groupByPeriod !== null &&
    !["day", "month", "year"].includes(obj.groupByPeriod)
  ) {
    return false;
  }

  return true;
}

export function isValidUIState(key: string, value: any): boolean {
  if (typeof key !== "string" || !key) return false;
  
  switch (key) {
    case "theme":
      return value === "light" || value === "dark" || value === "system";
    case "activeView":
      return ["overview", "upload", "charts", "data", "filters", "export"].includes(value);
    case "showWelcome":
      return typeof value === "boolean";
    case "activeDatasetId":
      return typeof value === "string";
    case "activeDashboardId":
      return value === null || typeof value === "string";
    default:
      return true; // Unknown/custom keys allowed but fallback to basic true
  }
}

export function isValidDashboard(obj: any): obj is Dashboard {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.id !== "string" || !obj.id.trim()) return false;
  if (typeof obj.name !== "string" || !obj.name.trim()) return false;
  if (typeof obj.datasetId !== "string" || !obj.datasetId.trim()) return false;
  if (!Array.isArray(obj.chartIds)) return false;
  if (typeof obj.createdAt !== "number") return false;
  if (typeof obj.updatedAt !== "number") return false;
  return true;
}

