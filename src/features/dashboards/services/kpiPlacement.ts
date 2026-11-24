import type { Dataset } from "@/shared/types";
import type { KPICardConfig } from "@/features/kpi/types";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";

/**
 * Adds a new KPI card where the Overview shows it: to the open dashboard, or, from the plain
 * Overview (no dashboard open), to a new one for this dataset ("<dataset> KPIs", numbered if
 * taken) that is then opened, so the card shows at once. Used by the KPI builder
 * (DashboardSummary) and the copilot's propose_kpi Apply. Null when no dashboard could be made.
 */
export function addKpiToWorkspace(dataset: Pick<Dataset, "id" | "name">, kpi: KPICardConfig): { dashboardId: string; createdDashboard: boolean } | null {
  const store = useDashboardStore.getState();
  const active = store.dashboards.find((d) => d.id === store.activeDashboardId);
  if (active) {
    store.addKpiCard(active.id, kpi);
    return { dashboardId: active.id, createdDashboard: false };
  }
  const taken = new Set(store.dashboards.filter((d) => d.datasetId === dataset.id).map((d) => d.name.toLowerCase()));
  const base = `${dataset.name} KPIs`;
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  store.createDashboard(name, dataset.id);
  const created = useDashboardStore.getState().activeDashboardId;
  if (!created || created === store.activeDashboardId) return null;
  useDashboardStore.getState().addKpiCard(created, kpi);
  return { dashboardId: created, createdDashboard: true };
}
