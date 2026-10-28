import { Dataset, ChartConfig, FilterState, Dashboard } from "@/shared/types";
import { isViewType, type ViewType } from "@/store/viewTypes";

export function isValidDataset(obj: unknown): obj is Dataset {
  if (!obj || typeof obj !== "object") return false;
  const d = obj as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id.trim()) return false;
  if (typeof d.name !== "string" || !d.name.trim()) return false;
  if (!Array.isArray(d.data)) return false;
  if (!Array.isArray(d.columns)) return false;
  if (!d.columnTypes || typeof d.columnTypes !== "object") return false;

  // Validate that all columns list elements are strings
  const columnsValid = d.columns.every((col: unknown) => typeof col === "string");
  if (!columnsValid) return false;

  // Validate that all columnTypes mapping values are valid categories
  const allowedTypes = ["numeric", "categorical", "date"];
  const typesValid = Object.entries(d.columnTypes as Record<string, unknown>).every(
    ([key, val]: [string, unknown]) => typeof key === "string" && typeof val === "string" && allowedTypes.includes(val)
  );
  if (!typesValid) return false;

  return true;
}

export function isValidChartConfig(obj: unknown): obj is ChartConfig {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id.trim()) return false;
  if (typeof c.title !== "string" || !c.title.trim()) return false;
  if (typeof c.datasetId !== "string" || !c.datasetId.trim()) return false;
  if (!Array.isArray(c.data)) return false;

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
  if (typeof c.type !== "string" || !allowedTypes.includes(c.type)) return false;

  return true;
}

export function isValidFilterState(obj: unknown): obj is FilterState {
  if (!obj || typeof obj !== "object") return false;
  const f = obj as Record<string, unknown>;
  
  // Verify categoricalFilters structure
  if (!f.categoricalFilters || typeof f.categoricalFilters !== "object") return false;
  const categoricalValid = Object.entries(f.categoricalFilters as Record<string, unknown>).every(
    ([_, val]) => Array.isArray(val) && val.every((v: unknown) => typeof v === "string")
  );
  if (!categoricalValid) return false;

  // Verify dateRangeFilters structure
  if (!f.dateRangeFilters || typeof f.dateRangeFilters !== "object") return false;
  const dateRangeValid = Object.entries(f.dateRangeFilters as Record<string, unknown>).every(
    ([_, val]: [string, unknown]) => {
      if (!val || typeof val !== "object") return false;
      const v = val as { start?: unknown; end?: unknown };
      const startValid = v.start === undefined || v.start === null || v.start instanceof Date || !isNaN(Date.parse(String(v.start)));
      const endValid = v.end === undefined || v.end === null || v.end instanceof Date || !isNaN(Date.parse(String(v.end)));
      return startValid && endValid;
    }
  );
  if (!dateRangeValid) return false;

  // Verify numericRangeFilters structure (optional)
  if (f.numericRangeFilters !== undefined) {
    if (typeof f.numericRangeFilters !== "object" || f.numericRangeFilters === null) return false;
    const numericRangeValid = Object.entries(f.numericRangeFilters as Record<string, unknown>).every(
      ([_, val]: [string, unknown]) => {
        if (!val || typeof val !== "object") return false;
        const v = val as { min?: unknown; max?: unknown };
        const minValid = v.min === undefined || typeof v.min === "number";
        const maxValid = v.max === undefined || typeof v.max === "number";
        return minValid && maxValid;
      }
    );
    if (!numericRangeValid) return false;
  }

  // Verify textSearchFilters structure (optional)
  if (f.textSearchFilters !== undefined) {
    if (typeof f.textSearchFilters !== "object" || f.textSearchFilters === null) return false;
    const textSearchValid = Object.values(f.textSearchFilters as Record<string, unknown>).every(
      (val) => typeof val === "string"
    );
    if (!textSearchValid) return false;
  }

  // Optionals
  if (f.groupByColumn !== undefined && typeof f.groupByColumn !== "string") return false;
  if (
    f.groupByPeriod !== undefined &&
    f.groupByPeriod !== null &&
    typeof f.groupByPeriod === "string" &&
    !["day", "month", "year"].includes(f.groupByPeriod)
  ) {
    return false;
  }

  return true;
}

/**
 * Value types guaranteed for the known uiState keys once isValidUIState has accepted them.
 * Keys not listed here pass validation unchecked and stay `unknown`.
 */
export interface ValidatedUIState {
  theme: "light" | "dark" | "system";
  activeView: ViewType;
  showWelcome: boolean;
  activeDatasetId: string;
  activeDashboardId: string | null;
}

export function isValidUIState(key: string, value: unknown): boolean {
  if (typeof key !== "string" || !key) return false;
  
  switch (key) {
    case "theme":
      return value === "light" || value === "dark" || value === "system";
    case "activeView":
      return isViewType(value);
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

export function isValidDashboard(obj: unknown): obj is Dashboard {
  if (!obj || typeof obj !== "object") return false;
  const d = obj as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id.trim()) return false;
  if (typeof d.name !== "string" || !d.name.trim()) return false;
  if (typeof d.datasetId !== "string" || !d.datasetId.trim()) return false;
  if (!Array.isArray(d.chartIds)) return false;
  if (typeof d.createdAt !== "number") return false;
  if (typeof d.updatedAt !== "number") return false;
  return true;
}

