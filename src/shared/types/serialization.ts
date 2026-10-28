import { GlobalFilter, DashboardLayoutItem, ChartConfig, DrillState, Dashboard } from "./index";
import { KPICardConfig } from "@/features/kpi/types";

export interface SavedView {
  id: string;
  dashboardId: string;
  name: string;
  globalFilters: GlobalFilter[];
  drillStates: Record<string, DrillState>;
  createdAt: number;
}

export interface RequiredColumnSchema {
  name: string;
  dataType: 'numeric' | 'categorical' | 'date';
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description?: string;
  requiredSchema: RequiredColumnSchema[];
  layout?: DashboardLayoutItem[];
  /** Chart configs; `data` is optional because instantiateTemplate fills it from the target dataset. */
  widgets: (Omit<ChartConfig, "data"> & Partial<Pick<ChartConfig, "data">>)[];
  kpis?: KPICardConfig[];
  createdAt: number;
}

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  dashboardState: {
    dashboards: Dashboard[];
    activeDashboardId: string | null;
    activeGlobalFilters: GlobalFilter[];
  };
  datasetState?: {
    activeDatasetId: string | null;
  };
}

