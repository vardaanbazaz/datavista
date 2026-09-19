import { Dataset, ChartConfig, Dashboard, DashboardTemplate, RequiredColumnSchema } from "@/shared/types";
import { KPICardConfig } from "@/features/kpi/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";

export interface SchemaTypeMismatch {
  name: string;
  expectedType: RequiredColumnSchema["dataType"];
  actualType: RequiredColumnSchema["dataType"];
}

export class TemplateEngine {
  /**
   * Extract structural configuration of a dashboard into a reusable DashboardTemplate
   */
  extractTemplate(
    dashboard: Dashboard,
    name: string,
    description: string | undefined,
    dataset: Dataset,
    charts: ChartConfig[]
  ): DashboardTemplate {
    // 1. Identify all columns referenced in widgets & KPIs
    const referencedColumnNames = new Set<string>();

    const dashboardCharts = charts.filter((c) => dashboard.chartIds.includes(c.id));
    dashboardCharts.forEach((chart) => {
      if (chart.xAxis) referencedColumnNames.add(chart.xAxis);
      if (chart.yAxis) referencedColumnNames.add(chart.yAxis);
      if (chart.groupBy && chart.groupBy !== "none") referencedColumnNames.add(chart.groupBy);
      if (chart.sizeBy) referencedColumnNames.add(chart.sizeBy);
      if (chart.drillPath) chart.drillPath.forEach((col) => referencedColumnNames.add(col));
    });

    const dashboardKpis = dashboard.kpis || [];
    dashboardKpis.forEach((kpi) => {
      if (kpi.metricColumn) referencedColumnNames.add(kpi.metricColumn);
      if (kpi.trendDateColumn) referencedColumnNames.add(kpi.trendDateColumn);
    });

    // 2. Build required schema with inferred data types
    const requiredSchema: RequiredColumnSchema[] = Array.from(referencedColumnNames).map((colName) => {
      let dataType: 'numeric' | 'categorical' | 'date' = 'categorical';
      if (dataset.metadata?.columns) {
        const colMeta = dataset.metadata.columns.find((c) => c.name === colName);
        if (colMeta) {
          dataType = colMeta.inferredDataType;
        }
      } else if (dataset.columnTypes && dataset.columnTypes[colName]) {
        dataType = dataset.columnTypes[colName];
      }
      return { name: colName, dataType };
    });

    // 3. Clone widgets and strip dataset IDs
    const templateWidgets: ChartConfig[] = dashboardCharts.map((chart) => {
      return {
        ...chart,
        datasetId: "",
      };
    });

    // 4. Clone KPIs and strip dataset IDs
    const templateKpis: KPICardConfig[] = dashboardKpis.map((kpi) => ({
      ...kpi,
    }));

    return {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tpl-${Math.random().toString(36).substring(2, 9)}`,
      name,
      description,
      requiredSchema,
      layout: dashboard.layout ? [...dashboard.layout] : undefined,
      widgets: templateWidgets,
      kpis: templateKpis,
      createdAt: Date.now(),
    };
  }

  /**
   * Validate whether a target dataset possesses all required columns for a template,
   * with the correct data type for each (through getEffectiveColumnType, so a user's
   * manual numeric/categorical override on the target dataset is respected).
   */
  validateSchema(
    templateSchema: RequiredColumnSchema[],
    targetDataset: Dataset
  ): { valid: boolean; missingColumns: string[]; typeMismatches: SchemaTypeMismatch[] } {
    const datasetColumns = new Set(targetDataset.columns || []);
    const missingColumns: string[] = [];
    const typeMismatches: SchemaTypeMismatch[] = [];

    templateSchema.forEach((req) => {
      if (!datasetColumns.has(req.name)) {
        missingColumns.push(req.name);
        return;
      }
      const actualType = getEffectiveColumnType(targetDataset, req.name);
      if (actualType !== req.dataType) {
        typeMismatches.push({ name: req.name, expectedType: req.dataType, actualType });
      }
    });

    return {
      valid: missingColumns.length === 0 && typeMismatches.length === 0,
      missingColumns,
      typeMismatches,
    };
  }

  /**
   * Instantiate a new Dashboard from a DashboardTemplate for a target Dataset
   */
  instantiateTemplate(
    template: DashboardTemplate,
    targetDataset: Dataset,
    name: string
  ): { dashboard: Dashboard; charts: ChartConfig[] } {
    const schemaValidation = this.validateSchema(template.requiredSchema, targetDataset);
    if (!schemaValidation.valid) {
      const problems: string[] = [];
      if (schemaValidation.missingColumns.length > 0) {
        problems.push(`missing required columns: ${schemaValidation.missingColumns.join(", ")}`);
      }
      if (schemaValidation.typeMismatches.length > 0) {
        problems.push(
          `wrong-type columns: ${schemaValidation.typeMismatches
            .map((m) => `${m.name} (expected ${m.expectedType}, found ${m.actualType})`)
            .join(", ")}`
        );
      }
      throw new Error(`Target dataset "${targetDataset.name}" is schema-incompatible: ${problems.join("; ")}`);
    }

    const newDashboardId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `dash-${Math.random().toString(36).substring(2, 9)}`;

    // Map old widget IDs to new widget IDs
    const chartIdMapping: Record<string, string> = {};
    const newCharts: ChartConfig[] = template.widgets.map((widget) => {
      const newChartId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `chart-${Math.random().toString(36).substring(2, 9)}`;
      chartIdMapping[widget.id] = newChartId;
      return {
        ...widget,
        id: newChartId,
        datasetId: targetDataset.id,
        data: targetDataset.data,
      };
    });

    // Remap KPIs
    const newKpis: KPICardConfig[] = (template.kpis || []).map((kpi) => {
      const newKpiId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `kpi-${Math.random().toString(36).substring(2, 9)}`;
      return {
        ...kpi,
        id: newKpiId,
      };
    });

    // Remap layout items
    const newLayout = template.layout
      ? template.layout.map((item) => ({
          ...item,
          i: chartIdMapping[item.i] || item.i,
        }))
      : undefined;

    const newDashboard: Dashboard = {
      id: newDashboardId,
      name: name || `${template.name} (${targetDataset.name})`,
      datasetId: targetDataset.id,
      chartIds: newCharts.map((c) => c.id),
      kpis: newKpis,
      layout: newLayout,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return {
      dashboard: newDashboard,
      charts: newCharts,
    };
  }
}

export const templateEngine = new TemplateEngine();
