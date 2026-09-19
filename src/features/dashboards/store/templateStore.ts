import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DashboardTemplate } from "@/shared/types";

interface TemplateStore {
  templates: DashboardTemplate[];
  addTemplate: (template: Omit<DashboardTemplate, "id" | "createdAt">) => DashboardTemplate;
  deleteTemplate: (id: string) => void;
  getTemplateById: (id: string) => DashboardTemplate | undefined;
}

const DEFAULT_TEMPLATES: DashboardTemplate[] = [
  {
    id: "template-sales-overview",
    name: "Sales & Revenue Overview",
    description: "Standard executive dashboard with Bar, Line, and KPI metric breakdown across categories.",
    requiredSchema: [
      { name: "Region", dataType: "categorical" },
      { name: "Sales", dataType: "numeric" },
      { name: "Profit", dataType: "numeric" }
    ],
    widgets: [
      {
        id: "widget-tpl-1",
        type: "bar",
        title: "Revenue by Region",
        xAxis: "Region",
        yAxis: "Sales",
        datasetId: "",
        formattingRules: [
          {
            id: "fmt-1",
            targetColumn: "Sales",
            conditionExpression: "Sales > 5000",
            styles: { fill: "#10b981" }
          }
        ]
      },
      {
        id: "widget-tpl-2",
        type: "line",
        title: "Profit Performance",
        xAxis: "Region",
        yAxis: "Profit",
        datasetId: ""
      }
    ],
    kpis: [
      {
        id: "kpi-tpl-1",
        title: "Total Revenue",
        metricColumn: "Sales",
        aggregation: "sum",
        polarity: "positive"
      },
      {
        id: "kpi-tpl-2",
        title: "Average Profit Margin",
        metricColumn: "Profit",
        aggregation: "avg",
        polarity: "positive"
      }
    ],
    createdAt: 1700000000000,
  }
];

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      templates: DEFAULT_TEMPLATES,
      addTemplate: (templateData) => {
        const newTemplate: DashboardTemplate = {
          ...templateData,
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `template-${Math.random().toString(36).substring(2, 9)}`,
          createdAt: Date.now(),
        };
        set((state) => ({
          templates: [newTemplate, ...state.templates],
        }));
        return newTemplate;
      },
      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }));
      },
      getTemplateById: (id) => {
        return get().templates.find((t) => t.id === id);
      },
    }),
    {
      name: "datavista-dashboard-templates",
      version: 1,
      // No-op for now — bump `version` and replace this when the persisted shape
      // changes, so old localStorage data from a prior version gets migrated instead
      // of silently mismatching the new state shape.
      migrate: (persistedState) => persistedState as TemplateStore,
    }
  )
);
