import { datasetRowCount } from "@/shared/services/datasetRows";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useTemplateStore } from "@/features/dashboards/store/templateStore";
import { useViewStore } from "@/features/dashboards/store/viewStore";
import { SavedView } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";

export interface SearchResultItem {
  id: string;
  type: "dashboard" | "dataset" | "column" | "template" | "view";
  title: string;
  subtitle: string;
  datasetId?: string;
  dashboardId?: string;
  columnName?: string;
  templateId?: string;
  viewId?: string;
  savedView?: SavedView;
}

export interface CategorizedSearchResults {
  dashboards: SearchResultItem[];
  datasets: SearchResultItem[];
  columns: SearchResultItem[];
  templates: SearchResultItem[];
  views: SearchResultItem[];
}

export const searchEngine = {
  search(query: string): CategorizedSearchResults {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return {
        dashboards: [],
        datasets: [],
        columns: [],
        templates: [],
        views: [],
      };
    }

    const datasetsStore = useDatasetStore.getState();
    const dashboardStore = useDashboardStore.getState();
    const templateStore = useTemplateStore.getState();
    const viewStore = useViewStore.getState();

    const results: CategorizedSearchResults = {
      dashboards: [],
      datasets: [],
      columns: [],
      templates: [],
      views: [],
    };

    // 1. Datasets & Columns
    for (const dataset of datasetsStore.datasets) {
      if (dataset.name.toLowerCase().includes(trimmed)) {
        results.datasets.push({
          id: `ds-${dataset.id}`,
          type: "dataset",
          title: dataset.name,
          subtitle: `${datasetRowCount(dataset)} rows, ${dataset.columns?.length || 0} columns`,
          datasetId: dataset.id,
        });
      }

      for (const col of dataset.columns) {
        if (col.toLowerCase().includes(trimmed)) {
          const colType = getEffectiveColumnType(dataset, col);
          results.columns.push({
            id: `col-${dataset.id}-${col}`,
            type: "column",
            title: col,
            subtitle: `Column in "${dataset.name}" (${colType})`,
            datasetId: dataset.id,
            columnName: col,
          });
        }
      }
    }

    // 2. Dashboards
    for (const dash of dashboardStore.dashboards) {
      const nameMatches = dash.name.toLowerCase().includes(trimmed);
      const matchedKpis = (dash.kpis || []).filter((k) =>
        k.title.toLowerCase().includes(trimmed)
      );

      if (nameMatches || matchedKpis.length > 0) {
        let subtitle = `${dash.chartIds?.length || 0} charts, ${(dash.kpis || []).length} KPIs`;
        if (!nameMatches && matchedKpis.length > 0) {
          subtitle = `Matched KPI: ${matchedKpis.map((k) => k.title).join(", ")}`;
        }
        results.dashboards.push({
          id: `dash-${dash.id}`,
          type: "dashboard",
          title: dash.name,
          subtitle,
          dashboardId: dash.id,
        });
      }
    }

    // 3. Templates
    for (const tpl of templateStore.templates) {
      if (
        tpl.name.toLowerCase().includes(trimmed) ||
        (tpl.description && tpl.description.toLowerCase().includes(trimmed))
      ) {
        results.templates.push({
          id: `tpl-${tpl.id}`,
          type: "template",
          title: tpl.name,
          subtitle: tpl.description || "Dashboard Template",
          templateId: tpl.id,
        });
      }
    }

    // 4. Saved Views
    for (const view of viewStore.savedViews) {
      if (view.name.toLowerCase().includes(trimmed)) {
        const parentDash = dashboardStore.dashboards.find(
          (d) => d.id === view.dashboardId
        );
        results.views.push({
          id: `view-${view.id}`,
          type: "view",
          title: view.name,
          subtitle: parentDash
            ? `Saved View on "${parentDash.name}"`
            : "Saved View",
          viewId: view.id,
          dashboardId: view.dashboardId,
          savedView: view,
        });
      }
    }

    return results;
  },
};
