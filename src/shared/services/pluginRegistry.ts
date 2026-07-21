import { DataVistaPlugin, CustomChartTypeDefinition, PluginContext } from "../types/plugins";
import { FunctionDefinition } from "./formula/library/types";
import { registerCustomFormula } from "./formula/library/registry";

class PluginRegistry {
  private plugins = new Map<string, DataVistaPlugin>();
  private customCharts = new Map<string, CustomChartTypeDefinition>();
  private customFormulas = new Map<string, FunctionDefinition>();

  public registerPlugin(plugin: DataVistaPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" is already registered.`);
      return;
    }

    const context: PluginContext = {
      registerChartType: (chartConfig) => {
        this.customCharts.set(chartConfig.type, chartConfig);
      },
      registerFormula: (formulaConfig) => {
        this.customFormulas.set(formulaConfig.name.toUpperCase(), formulaConfig);
        registerCustomFormula(formulaConfig);
      },
    };

    plugin.init(context);
    this.plugins.set(plugin.name, plugin);
  }

  public getPlugins(): DataVistaPlugin[] {
    return Array.from(this.plugins.values());
  }

  public getCustomCharts(): CustomChartTypeDefinition[] {
    return Array.from(this.customCharts.values());
  }

  public getCustomChart(type: string): CustomChartTypeDefinition | undefined {
    return this.customCharts.get(type);
  }

  public getCustomFormulas(): FunctionDefinition[] {
    return Array.from(this.customFormulas.values());
  }
}

export const pluginRegistry = new PluginRegistry();
