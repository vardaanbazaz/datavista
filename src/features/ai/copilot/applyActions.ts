/**
 * Apply and Undo for copilot proposals (copilot/actions.ts), through the same stores the
 * builders use: a chart through chartStore.createChart (and the open dashboard's chartIds, as
 * the Chart builder does), a KPI card through the KPI builder's placement
 * (dashboards/services/kpiPlacement.ts, so dashboardStore's own undo history records it), a
 * filter through filterStore with the rows recomputed the way FilterPanel does. Undo is the
 * targeted inverse by id (delete that chart, that card, restore those filters), never "pop the
 * last history entry", which could undo something else. What Apply did is kept in the
 * proposal (AppliedRecord), so Undo still works after a reload; if the user already deleted
 * the chart or card, Undo does nothing.
 */
import type { Dataset, FilterState } from "@/shared/types";
import { useChartStore } from "@/store/chartStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import type { ViewType } from "@/store/viewTypes";
import { buildFilterQuery, useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { addKpiToWorkspace } from "@/features/dashboards/services/kpiPlacement";
import { queryEngine } from "@/shared/services/queryEngine";
import type { AppliedRecord, FilterPatch, Proposal, StoredFilterState } from "./actions";

/** Where to see the result: "Go to Charts". */
export const PROPOSAL_VIEW: Record<Proposal["kind"], { view: ViewType; label: string }> = {
  chart: { view: "charts", label: "Go to Charts" },
  kpi: { view: "overview", label: "Go to Overview" },
  filter: { view: "data", label: "Go to Data Explorer" },
};

function newId(prefix: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dayString(d: Date | string | undefined): string | undefined {
  if (d === undefined) return undefined;
  if (typeof d === "string") return d;
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A local-midnight Date for "YYYY-MM-DD" (FilterPanel formats these with date-fns). */
function dayDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function storeFilterState(f: FilterState): StoredFilterState {
  const dateRangeFilters: StoredFilterState["dateRangeFilters"] = {};
  for (const [col, r] of Object.entries(f.dateRangeFilters ?? {})) dateRangeFilters[col] = { start: dayString(r?.start), end: dayString(r?.end) };
  return {
    categoricalFilters: JSON.parse(JSON.stringify(f.categoricalFilters ?? {})),
    dateRangeFilters,
    ...(f.numericRangeFilters ? { numericRangeFilters: JSON.parse(JSON.stringify(f.numericRangeFilters)) } : {}),
    ...(f.textSearchFilters ? { textSearchFilters: { ...f.textSearchFilters } } : {}),
    ...(f.groupByColumn ? { groupByColumn: f.groupByColumn } : {}),
    ...(f.groupByPeriod ? { groupByPeriod: f.groupByPeriod } : {}),
  };
}

export function restoreFilterState(s: StoredFilterState): FilterState {
  const dateRangeFilters: FilterState["dateRangeFilters"] = {};
  for (const [col, r] of Object.entries(s.dateRangeFilters ?? {})) dateRangeFilters[col] = { start: dayDate(r.start), end: dayDate(r.end) };
  return {
    categoricalFilters: { ...(s.categoricalFilters ?? {}) },
    dateRangeFilters,
    ...(s.numericRangeFilters ? { numericRangeFilters: { ...s.numericRangeFilters } } : {}),
    ...(s.textSearchFilters ? { textSearchFilters: { ...s.textSearchFilters } } : {}),
    ...(s.groupByColumn ? { groupByColumn: s.groupByColumn } : {}),
    ...(s.groupByPeriod ? { groupByPeriod: s.groupByPeriod } : {}),
  };
}

/** The current filters with `patch` set on its columns, replacing their earlier filters (other columns' filters are kept). */
export function mergeFilters(current: FilterState, patch: FilterPatch): FilterState {
  const next = restoreFilterState(storeFilterState(current));
  const touched = new Set([patch.categorical, patch.numeric, patch.date, patch.text].flatMap((m) => Object.keys(m ?? {})));
  for (const col of touched) {
    delete next.categoricalFilters[col];
    delete next.dateRangeFilters[col];
    if (next.numericRangeFilters) delete next.numericRangeFilters[col];
    if (next.textSearchFilters) delete next.textSearchFilters[col];
  }
  for (const [col, values] of Object.entries(patch.categorical ?? {})) next.categoricalFilters[col] = [...values];
  for (const [col, r] of Object.entries(patch.numeric ?? {})) (next.numericRangeFilters ??= {})[col] = { ...r };
  for (const [col, r] of Object.entries(patch.date ?? {})) next.dateRangeFilters[col] = { start: dayDate(r.start), end: dayDate(r.end) };
  for (const [col, text] of Object.entries(patch.text ?? {})) (next.textSearchFilters ??= {})[col] = text;
  return next;
}

/** Sets the workspace filters and their rows, as FilterPanel does (it may not be mounted). */
function setFilters(dataset: Dataset, state: FilterState) {
  const rows = queryEngine.execute(dataset, buildFilterQuery(state)).rows;
  useFilterStore.getState().setFiltersChange(rows, state);
}

export type ActionOutcome = { ok: true; applied: AppliedRecord } | { ok: false; error: string };

/** The open dataset, if it is the one the proposal was made for. */
function openDataset(datasetId: string): Dataset | null {
  const ds = useDatasetStore.getState().activeDataset;
  return ds && ds.id === datasetId && !ds.rowsPending ? ds : null;
}

export function applyProposal(p: Proposal, datasetId: string): ActionOutcome {
  const dataset = openDataset(datasetId);
  if (!dataset) return { ok: false, error: "Open this dataset to apply it." };
  const missing = p.columns.filter((c) => !dataset.columns.includes(c) && !dataset.metadata?.columns.some((m) => m.name === c));
  if (missing.length) return { ok: false, error: `The dataset no longer has ${missing.join(", ")}.` };

  const prevFilters = p.filters ? storeFilterState(useFilterStore.getState().activeFilters) : undefined;
  if (p.kind === "filter" && p.filters) {
    setFilters(dataset, mergeFilters(useFilterStore.getState().activeFilters, p.filters));
    return { ok: true, applied: { prevFilters } };
  }
  if (p.kind === "chart" && p.chart) {
    const id = newId("chart");
    useChartStore.getState().createChart({ ...p.chart, id, datasetId: dataset.id, drillPath: p.chart.xAxis ? [p.chart.xAxis] : undefined });
    const dash = useDashboardStore.getState();
    const active = dash.dashboards.find((d) => d.id === dash.activeDashboardId && d.datasetId === dataset.id);
    if (active) dash.saveDashboard(active.id, { chartIds: [...active.chartIds, id] });
    if (p.filters) setFilters(dataset, mergeFilters(useFilterStore.getState().activeFilters, p.filters));
    return { ok: true, applied: { chartId: id, ...(active ? { dashboardId: active.id } : {}), ...(prevFilters ? { prevFilters } : {}) } };
  }
  if (p.kind === "kpi" && p.kpi) {
    const kpiId = `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const placed = addKpiToWorkspace(dataset, {
      id: kpiId,
      title: p.kpi.title,
      datasetId: dataset.id,
      primaryMetric: { column: p.kpi.column, aggregation: p.kpi.aggregation },
      sparkline: true,
      polarity: "positive",
    });
    if (!placed) return { ok: false, error: "Couldn't create a dashboard for the card." };
    return { ok: true, applied: { kpiId, ...placed } };
  }
  return { ok: false, error: "Nothing to apply." };
}

/** Reverses what Apply did. Something the user already removed is left alone. */
export function undoProposal(p: Proposal, datasetId: string): { ok: true } | { ok: false; error: string } {
  const a = p.applied;
  if (!a) return { ok: false, error: "Nothing to undo." };
  // Filters belong to the open dataset: check first, so Undo is all or nothing.
  const dataset = a.prevFilters ? openDataset(datasetId) : null;
  if (a.prevFilters && !dataset) return { ok: false, error: "Open this dataset to undo its filters." };
  if (a.chartId) {
    if (useChartStore.getState().charts.some((c) => c.id === a.chartId)) useChartStore.getState().deleteChart(a.chartId);
    const dash = useDashboardStore.getState();
    const d = a.dashboardId ? dash.dashboards.find((x) => x.id === a.dashboardId) : undefined;
    if (d?.chartIds.includes(a.chartId)) dash.saveDashboard(d.id, { chartIds: d.chartIds.filter((c) => c !== a.chartId) });
  }
  if (a.kpiId && a.dashboardId) {
    const dash = useDashboardStore.getState();
    const d = dash.dashboards.find((x) => x.id === a.dashboardId);
    if (d) {
      const otherContent = (d.kpis ?? []).some((k) => k.id !== a.kpiId) || d.chartIds.length > 0;
      if (a.createdDashboard && !otherContent) dash.deleteDashboard(d.id);
      else if ((d.kpis ?? []).some((k) => k.id === a.kpiId)) dash.deleteKpiCard(d.id, a.kpiId);
    }
  }
  if (a.prevFilters && dataset) setFilters(dataset, restoreFilterState(a.prevFilters));
  return { ok: true };
}
