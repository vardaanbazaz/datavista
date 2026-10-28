import { describe, it, expect } from "vitest";
import { templateEngine } from "../templateEngine";
import { useTemplateStore, migrateTemplateState } from "../../store/templateStore";
import { kpiEngine } from "@/features/kpi/kpiEngine";
import { KPICardConfig } from "@/features/kpi/types";
import { Dashboard, Dataset, DashboardTemplate } from "@/shared/types";

function makeSalesDataset(): Dataset {
  return {
    id: "ds-sales",
    name: "Sales",
    data: [
      { Region: "North", Sales: 100, Profit: 10, OrderDate: "2024-01-15" },
      { Region: "South", Sales: 300, Profit: 30, OrderDate: "2024-02-15" },
    ],
    columns: ["Region", "Sales", "Profit", "OrderDate"],
    columnTypes: { Region: "categorical", Sales: "numeric", Profit: "numeric", OrderDate: "date" },
  };
}

describe("templateEngine - KPI column handling", () => {
  // Regression: the built-in "Sales & Revenue Overview" template declared its KPIs with a
  // non-existent `metricColumn` field instead of `primaryMetric`, so every KPI card it
  // created threw "Cannot read properties of undefined (reading 'column')" on render.
  it("built-in template KPIs survive instantiation and compute a value", () => {
    const template = useTemplateStore
      .getState()
      .templates.find((t) => t.id === "template-sales-overview");
    expect(template).toBeDefined();

    const dataset = makeSalesDataset();
    const { dashboard } = templateEngine.instantiateTemplate(template!, dataset, "From template");

    expect(dashboard.kpis).toHaveLength(2);
    const [revenue, margin] = dashboard.kpis!.map((kpi) => kpiEngine.calculateKPIData(dataset, kpi));
    expect(revenue.primaryValue).toBe(400);
    expect(margin.primaryValue).toBe(20);
  });

  // Regression: extractTemplate read `kpi.metricColumn` / `kpi.trendDateColumn` (fields
  // KPICardConfig never had), so columns used only by KPIs were left out of requiredSchema
  // and validateSchema accepted target datasets that lack them.
  it("extractTemplate records columns referenced only by KPIs in requiredSchema", () => {
    const dataset = makeSalesDataset();
    const kpi: KPICardConfig = {
      id: "kpi-1",
      title: "Total Profit",
      datasetId: dataset.id,
      primaryMetric: { column: "Profit", aggregation: "sum" },
      trendConfiguration: { dateColumn: "OrderDate", comparisonPeriod: "month" },
      sparkline: false,
      polarity: "positive",
    };
    const dashboard: Dashboard = {
      id: "dash-1",
      name: "KPI only",
      chartIds: [],
      kpis: [kpi],
      datasetId: dataset.id,
      createdAt: 0,
      updatedAt: 0,
    };

    const template = templateEngine.extractTemplate(dashboard, "tpl", undefined, dataset, []);

    expect(template.requiredSchema).toEqual(
      expect.arrayContaining([
        { name: "Profit", dataType: "numeric" },
        { name: "OrderDate", dataType: "date" },
      ])
    );

    const withoutProfit: Dataset = {
      ...dataset,
      id: "ds-other",
      columns: ["Region", "Sales", "OrderDate"],
      columnTypes: { Region: "categorical", Sales: "numeric", OrderDate: "date" },
    };
    expect(templateEngine.validateSchema(template.requiredSchema, withoutProfit).missingColumns).toEqual(["Profit"]);
  });

  it("migrates a persisted v1 copy of the built-in template to the fixed KPI shape, keeping user templates", () => {
    const builtIn = useTemplateStore.getState().templates.find((t) => t.id === "template-sales-overview")!;
    const legacyBuiltIn = {
      ...builtIn,
      kpis: [{ id: "kpi-tpl-1", title: "Total Revenue", metricColumn: "Sales", aggregation: "sum", polarity: "positive" }],
    };
    const userTemplate: DashboardTemplate = { ...builtIn, id: "user-tpl", name: "Mine", kpis: [] };

    const migrated = migrateTemplateState({ templates: [legacyBuiltIn, userTemplate] }, 1);

    expect(migrated.templates[0]).toBe(builtIn);
    expect(migrated.templates[0].kpis![0].primaryMetric.column).toBe("Sales");
    expect(migrated.templates[1]).toBe(userTemplate);
  });
});
