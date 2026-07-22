import { DataRow } from "@/shared/types";

export interface ForecastConfig {
  enabled?: boolean;
  periodsToProject: number; // e.g. 3, 5, 10
  method: 'linear' | 'moving_average';
  confidenceInterval?: boolean;
}

export interface ForecastPoint extends DataRow {
  isForecast?: boolean;
}
