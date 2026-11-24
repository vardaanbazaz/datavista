import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Dataset, DataRow } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { useChartStore } from "@/store/chartStore";
import { useFilterStore } from "@/store/filterStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { createToolEnv, runCopilotTool } from "../copilot/tools";
import { applyProposal, undoProposal, storeFilterState, restoreFilterState } from "../copilot/applyActions";
import type { Proposal } from "../copilot/actions";

/** Apply and Undo of each copilot action through the app's stores (copilot/applyActions.ts). */

vi.mock("@/shared/hooks/use-toast", () => ({ toast: vi.fn() }));

const CATS = ["GAME", "FAMILY", "TOOLS"];
function makeDataset(): Dataset {
  const data: DataRow[] = Array.from({ length: 30 }, (_, i) => ({
    Category: CATS[i % 3],
    Rating: (i % 5) + 1,
    Reviews: i * 10,
    Updated: `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
  }));
  return { id: "ds-apply", name: "apps", data, columns: ["Category", "Rating", "Reviews", "Updated"], columnTypes: { Category: "categorical", Rating: "numeric", Reviews: "numeric", Updated: "date" } };
}

const propose = (name: string, args: unknown): Proposal => {
  const r = runCopilotTool(createToolEnv(makeDataset(), { level: "queries", sampleRows: 50, unmasked: [] }), name, JSON.stringify(args));
  expect(r.ok).toBe(true);
  return r.proposal!;
};
const applied = (p: Proposal) => {
  const r = applyProposal(p, "ds-apply");
  if (!("applied" in r)) throw new Error(r.error);
  return { ...p, status: "applied" as const, applied: r.applied };
};

let dataset: Dataset;
beforeEach(() => {
  dataset = makeDataset();
  useDatasetStore.setState({ datasets: [dataset], activeDataset: dataset });
  useChartStore.setState({ charts: [] });
  useFilterStore.setState({ activeFilters: { categoricalFilters: {}, dateRangeFilters: {} }, filteredData: dataset.data });
  useDashboardStore.setState({ dashboards: [], activeDashboardId: null, past: [], future: [], activeGlobalFilters: [] });
});

describe("apply / undo: chart", () => {
  it("creates the chart in chartStore (and the open dashboard), Undo removes both", () => {
    useDashboardStore.setState({ dashboards: [{ id: "d1", name: "Board", chartIds: ["old"], datasetId: "ds-apply", createdAt: 1, updatedAt: 1 }], activeDashboardId: "d1" });
    const p = applied(propose("propose_chart", { type: "bar", x: "Category", y: "Rating", title: "Avg rating" }));
    const chart = useChartStore.getState().charts[0];
    expect(chart).toMatchObject({ id: p.applied.chartId, type: "bar", title: "Avg rating", xAxis: "Category", yAxis: "Rating", aggregation: "avg", datasetId: "ds-apply" });
    expect(useDashboardStore.getState().dashboards[0].chartIds).toEqual(["old", chart.id]);

    expect(undoProposal(p, "ds-apply")).toEqual({ ok: true });
    expect(useChartStore.getState().charts).toEqual([]);
    expect(useDashboardStore.getState().dashboards[0].chartIds).toEqual(["old"]);
  });

  it("a chart with filters sets them; Undo restores the earlier filters", () => {
    useFilterStore.setState({ activeFilters: { categoricalFilters: { Category: ["TOOLS"] }, dateRangeFilters: {} } });
    const p = applied(propose("propose_chart", { type: "bar", x: "Category", y: "Reviews", title: "t", filters: [{ column: "Rating", operator: "between", start: "4" }] }));
    expect(useFilterStore.getState().activeFilters.numericRangeFilters).toEqual({ Rating: { min: 4, max: undefined } });
    expect(useFilterStore.getState().activeFilters.categoricalFilters).toEqual({ Category: ["TOOLS"] });
    expect(useFilterStore.getState().filteredData.every((r) => r.Category === "TOOLS" && Number(r.Rating) >= 4)).toBe(true);
    undoProposal(p, "ds-apply");
    expect(useChartStore.getState().charts).toEqual([]);
    expect(useFilterStore.getState().activeFilters).toEqual({ categoricalFilters: { Category: ["TOOLS"] }, dateRangeFilters: {} });
  });

  it("Undo after the user deleted the chart does nothing (no error)", () => {
    const p = applied(propose("propose_chart", { type: "pie", x: "Category", y: "Reviews", title: "t" }));
    useChartStore.getState().deleteChart(p.applied.chartId!);
    expect(undoProposal(p, "ds-apply")).toEqual({ ok: true });
  });

  it("refuses to apply when another dataset is open", () => {
    const p = propose("propose_chart", { type: "bar", x: "Category", y: "Reviews", title: "t" });
    useDatasetStore.setState({ activeDataset: { ...dataset, id: "other" } });
    expect(applyProposal(p, "ds-apply")).toEqual({ ok: false, error: "Open this dataset to apply it." });
    expect(useChartStore.getState().charts).toEqual([]);
  });
});

describe("apply / undo: KPI card", () => {
  it("from the plain Overview: creates '<dataset> KPIs' with the card (dashboard undo history records it); Undo removes the dashboard it made", () => {
    const p = applied(propose("propose_kpi", { column: "Rating" }));
    const dash = useDashboardStore.getState();
    expect(dash.dashboards).toHaveLength(1);
    expect(dash.dashboards[0]).toMatchObject({ name: "apps KPIs", datasetId: "ds-apply" });
    expect(dash.dashboards[0].kpis?.[0]).toMatchObject({ id: p.applied.kpiId, title: "Average Rating", primaryMetric: { column: "Rating", aggregation: "avg" } });
    expect(p.applied).toMatchObject({ dashboardId: dash.dashboards[0].id, createdDashboard: true });
    expect(dash.past.length).toBeGreaterThan(0);

    undoProposal(p, "ds-apply");
    expect(useDashboardStore.getState().dashboards).toEqual([]);
  });

  it("on an open dashboard: adds the card; Undo removes only that card", () => {
    useDashboardStore.setState({ dashboards: [{ id: "d1", name: "Board", chartIds: [], datasetId: "ds-apply", createdAt: 1, updatedAt: 1, kpis: [], kpiIds: [] }], activeDashboardId: "d1" });
    const keep = applied(propose("propose_kpi", { column: "Reviews" }));
    const p = applied(propose("propose_kpi", { column: "Rating", aggregation: "max", title: "Best rating" }));
    expect(p.applied).toEqual({ kpiId: p.applied.kpiId, dashboardId: "d1", createdDashboard: false });
    expect(useDashboardStore.getState().dashboards[0].kpis?.map((k) => k.title)).toEqual(["Total Reviews", "Best rating"]);
    undoProposal(p, "ds-apply");
    expect(useDashboardStore.getState().dashboards[0].kpis?.map((k) => k.id)).toEqual([keep.applied.kpiId]);
  });

  it("Undo keeps a dashboard Apply created once the user added something else to it", () => {
    const p = applied(propose("propose_kpi", { column: "Rating" }));
    const id = useDashboardStore.getState().dashboards[0].id;
    useDashboardStore.getState().addKpiCard(id, { id: "mine", title: "Mine", datasetId: "ds-apply", primaryMetric: { column: "Reviews", aggregation: "sum" }, sparkline: false, polarity: "positive" });
    undoProposal(p, "ds-apply");
    expect(useDashboardStore.getState().dashboards[0].kpis?.map((k) => k.id)).toEqual(["mine"]);
  });
});

describe("apply / undo: filter", () => {
  it("sets the filters and recomputes the rows (FilterPanel need not be mounted); Undo restores the earlier state", () => {
    useFilterStore.setState({ activeFilters: { categoricalFilters: { Category: ["TOOLS"] }, dateRangeFilters: {}, textSearchFilters: { Category: "O" }, numericRangeFilters: { Reviews: { min: 0 } } } });
    const before = useFilterStore.getState().activeFilters;
    const p = applied(
      propose("propose_filter", {
        conditions: [
          { column: "Category", operator: "in", values: ["GAME", "FAMILY"] },
          { column: "Updated", operator: "between", start: "2024-03-01", end: "2024-06-30" },
        ],
      })
    );
    const f = useFilterStore.getState().activeFilters;
    expect(f.categoricalFilters).toEqual({ Category: ["GAME", "FAMILY"] });
    // The proposal's column replaces that column's earlier filters of any kind; other columns keep theirs.
    expect(f.textSearchFilters).toEqual({});
    expect(f.numericRangeFilters).toEqual({ Reviews: { min: 0 } });
    // Dates are Date objects (FilterPanel formats them), local midnight.
    expect(f.dateRangeFilters.Updated.start).toBeInstanceOf(Date);
    expect(f.dateRangeFilters.Updated.start?.getDate()).toBe(1);
    expect(f.dateRangeFilters.Updated.end?.getMonth()).toBe(5);
    const rows = useFilterStore.getState().filteredData;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => ["GAME", "FAMILY"].includes(String(r.Category)) && String(r.Updated) >= "2024-03-01" && String(r.Updated) <= "2024-06-30")).toBe(true);
    expect(p.applied.prevFilters).toEqual(storeFilterState(before));

    undoProposal(p, "ds-apply");
    expect(useFilterStore.getState().activeFilters).toEqual(before);
  });

  it("the saved earlier filters survive JSON (a reload) with their dates", () => {
    const state = { categoricalFilters: { A: ["x"] }, dateRangeFilters: { D: { start: new Date(2024, 0, 5), end: undefined } }, numericRangeFilters: { N: { min: 1 } } };
    const back = restoreFilterState(JSON.parse(JSON.stringify(storeFilterState(state))));
    expect(back.dateRangeFilters.D.start).toEqual(new Date(2024, 0, 5));
    expect(back.categoricalFilters).toEqual({ A: ["x"] });
    expect(back.numericRangeFilters).toEqual({ N: { min: 1 } });
  });

  it("Undo of filters with another dataset open changes nothing", () => {
    const p = applied(propose("propose_filter", { conditions: [{ column: "Category", operator: "equals", value: "GAME" }] }));
    useDatasetStore.setState({ activeDataset: { ...dataset, id: "other" } });
    expect(undoProposal(p, "ds-apply")).toEqual({ ok: false, error: "Open this dataset to undo its filters." });
    expect(useFilterStore.getState().activeFilters.categoricalFilters).toEqual({ Category: ["GAME"] });
  });
});
