import { ComponentType } from "react";
import { ChartConfig, DataRow } from "./index";
import { FunctionDefinition } from "../services/formula/library/types";

export interface CustomChartTypeDefinition {
  type: string;
  label: string;
  description?: string;
  iconName?: string;
  component: ComponentType<{ chart: ChartConfig; data: DataRow[] }>;
}

export interface PluginContext {
  registerChartType: (chartConfig: CustomChartTypeDefinition) => void;
  registerFormula: (formulaConfig: FunctionDefinition) => void;
}

export interface DataVistaPlugin {
  name: string;
  version: string;
  init: (context: PluginContext) => void;
}
