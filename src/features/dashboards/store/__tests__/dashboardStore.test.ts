import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useDashboardStore } from "../dashboardStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useUiStore } from "@/store/uiStore";
import { summaryEngine } from "@/features/ai/summaryEngine";
import { Dashboard, Dataset, FilterState } from "@/shared/types";
import { DetectedAnomaly } from "@/features/ai/anomalyDetector";

function makeDashboard(id: string, overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id,
    name: "Test Dashboard",
    chartIds: [],
    datasetId: "ds1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {},
    ...overrides,
  };
}

function makeDataset(id: string, overrides: Partial<Dataset> = {}): Dataset {
  return {
    id,
    name: id,
    data: [{ A: 1 }],
    columns: ["A"],
    columnTypes: { A: "numeric" },
    ...overrides,
  };
}

function makeAnomaly(columnName: string): DetectedAnomaly {
  return {
    id: `anomaly-${columnName}`,
    columnName,
    value: 0,
    score: 0,
    type: "spike",
    severity: "low",
    description: "",
  };
}

type SummaryResult = Awaited<ReturnType<typeof summaryEngine.generateExecutiveSummary>>;

/** Creates a promise the test controls the resolution of, plus its resolver. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("dashboardStore.saveDashboard - debounced undo history (audit #18)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fixed baseline far from any leftover real-time timestamp from other test files,
    // so the module-level debounce clock in dashboardStore.ts can't bleed across tests.
    vi.setSystemTime(1_700_000_000_000);
    useDashboardStore.setState({
      dashboards: [makeDashboard("d1")],
      activeDashboardId: "d1",
      past: [],
      future: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses rapid filter-triggered saves (debounceHistory=true) into a single history entry", () => {
    const { saveDashboard } = useDashboardStore.getState();

    saveDashboard("d1", { settings: { filterState: { categoricalFilters: { a: ["1"] }, dateRangeFilters: {} } } }, true);
    vi.advanceTimersByTime(100);
    saveDashboard("d1", { settings: { filterState: { categoricalFilters: { a: ["1", "2"] }, dateRangeFilters: {} } } }, true);
    vi.advanceTimersByTime(100);
    saveDashboard("d1", { settings: { filterState: { categoricalFilters: { a: ["1", "2", "3"] }, dateRangeFilters: {} } } }, true);

    expect(useDashboardStore.getState().past.length).toBe(1);
  });

  it("pushes a new history entry once the debounce window elapses", () => {
    const { saveDashboard } = useDashboardStore.getState();

    saveDashboard("d1", { settings: { filterState: { categoricalFilters: { a: ["1"] }, dateRangeFilters: {} } } }, true);
    vi.advanceTimersByTime(700); // past DEBOUNCE_MS (600ms)
    saveDashboard("d1", { settings: { filterState: { categoricalFilters: { a: ["2"] }, dateRangeFilters: {} } } }, true);

    expect(useDashboardStore.getState().past.length).toBe(2);
  });

  it("still pushes every entry for non-debounced updates (e.g. chartIds changes)", () => {
    const { saveDashboard } = useDashboardStore.getState();

    saveDashboard("d1", { chartIds: ["c1"] });
    vi.advanceTimersByTime(10);
    saveDashboard("d1", { chartIds: ["c1", "c2"] });

    expect(useDashboardStore.getState().past.length).toBe(2);
  });
});

describe("dashboardStore.generateExecutiveSummary - race on dataset switch (audit #19)", () => {
  beforeEach(() => {
    useDatasetStore.setState({ datasets: [makeDataset("ds1"), makeDataset("ds2")], activeDataset: makeDataset("ds1") });
    useDashboardStore.setState({
      dashboards: [],
      activeDashboardId: null,
      executiveSummary: null,
      detectedAnomalies: [],
      isGeneratingSummary: false,
      executiveSummaryDismissed: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets the summary panel when the active dataset changes (not just content)", () => {
    useDashboardStore.setState({
      executiveSummary: "stale summary for ds1",
      detectedAnomalies: [makeAnomaly("revenue")],
      executiveSummaryDismissed: true,
    });

    useDatasetStore.getState().setActiveDataset(makeDataset("ds2"));

    const state = useDashboardStore.getState();
    expect(state.executiveSummary).toBeNull();
    expect(state.detectedAnomalies).toEqual([]);
    expect(state.executiveSummaryDismissed).toBe(false);
  });

  it("does not reset the panel when the active dataset object changes but the id stays the same", () => {
    useDashboardStore.setState({ executiveSummary: "current summary", detectedAnomalies: [] });

    // Same id, new object reference (e.g. recalculated calculated fields) - not a "switch".
    useDatasetStore.getState().setActiveDataset(makeDataset("ds1"));

    expect(useDashboardStore.getState().executiveSummary).toBe("current summary");
  });

  it("discards a summary result that resolves after the user has switched datasets", async () => {
    const { promise, resolve } = deferred<SummaryResult>();
    vi.spyOn(summaryEngine, "generateExecutiveSummary").mockReturnValue(promise);

    const genPromise = useDashboardStore.getState().generateExecutiveSummary();

    // Switch datasets while the request for ds1 is still in flight.
    useDatasetStore.getState().setActiveDataset(makeDataset("ds2"));

    resolve({ summary: "stale ds1 summary", anomalies: [makeAnomaly("stale")], source: "offline" });
    await genPromise;

    const state = useDashboardStore.getState();
    expect(state.executiveSummary).not.toBe("stale ds1 summary");
    expect(state.executiveSummary).toBeNull();
    expect(state.isGeneratingSummary).toBe(false);
  });

  it("applies the summary result when the dataset has not changed while in flight", async () => {
    const { promise, resolve } = deferred<SummaryResult>();
    vi.spyOn(summaryEngine, "generateExecutiveSummary").mockReturnValue(promise);

    const genPromise = useDashboardStore.getState().generateExecutiveSummary();
    resolve({ summary: "ds1 summary", anomalies: [], source: "offline" });
    await genPromise;

    const state = useDashboardStore.getState();
    expect(state.executiveSummary).toBe("ds1 summary");
    expect(state.isGeneratingSummary).toBe(false);
  });
});

describe("dashboardStore.generateExecutiveSummary - source tracking (item 5)", () => {
  beforeEach(() => {
    useDatasetStore.setState({ datasets: [makeDataset("ds1")], activeDataset: makeDataset("ds1") });
    useDashboardStore.setState({
      dashboards: [],
      activeDashboardId: null,
      executiveSummary: null,
      detectedAnomalies: [],
      executiveSummarySource: null,
      isGeneratingSummary: false,
      executiveSummaryDismissed: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the 'ai' source when summaryEngine reports it", async () => {
    vi.spyOn(summaryEngine, "generateExecutiveSummary").mockResolvedValue({
      summary: "AI summary",
      anomalies: [],
      source: "ai",
    });

    await useDashboardStore.getState().generateExecutiveSummary();

    expect(useDashboardStore.getState().executiveSummarySource).toBe("ai");
  });

  it("stores the 'offline' source when summaryEngine reports it", async () => {
    vi.spyOn(summaryEngine, "generateExecutiveSummary").mockResolvedValue({
      summary: "Offline summary",
      anomalies: [],
      source: "offline",
    });

    await useDashboardStore.getState().generateExecutiveSummary();

    expect(useDashboardStore.getState().executiveSummarySource).toBe("offline");
  });

  it("resets executiveSummarySource to null when the active dataset switches", () => {
    useDashboardStore.setState({ executiveSummarySource: "ai" });

    useDatasetStore.setState({
      datasets: [makeDataset("ds1"), makeDataset("ds2")],
      activeDataset: makeDataset("ds1"),
    });
    useDatasetStore.getState().setActiveDataset(makeDataset("ds2"));

    expect(useDashboardStore.getState().executiveSummarySource).toBeNull();
  });
});

describe("dashboardStore.loadDashboard - undo/redo restores dataset context (audit #20)", () => {
  const ds1Filters: FilterState = { categoricalFilters: { cat: ["x"] }, dateRangeFilters: {} };
  const d2Filters: FilterState = { categoricalFilters: { cat: ["y"] }, dateRangeFilters: {} };
  const ds1Data = [{ cat: "x", A: 1 }, { cat: "y", A: 2 }];

  beforeEach(() => {
    useDatasetStore.setState({
      datasets: [
        makeDataset("ds1", { data: ds1Data, columns: ["cat", "A"], columnTypes: { cat: "categorical", A: "numeric" } }),
        makeDataset("ds2"),
      ],
      activeDataset: makeDataset("ds1", { data: ds1Data, columns: ["cat", "A"], columnTypes: { cat: "categorical", A: "numeric" } }),
    });
    useFilterStore.setState({ activeFilters: ds1Filters, filteredData: [{ cat: "x", A: 1 }] });
    useUiStore.setState({ activeView: "charts" });
    useDashboardStore.setState({
      dashboards: [
        makeDashboard("d1", { datasetId: "ds1" }),
        makeDashboard("d2", { datasetId: "ds2", settings: { filterState: d2Filters } }),
        makeDashboard("d3", { datasetId: "ds-missing" }),
        makeDashboard("d4", { datasetId: "ds1", settings: { filterState: { categoricalFilters: { cat: ["y"] }, dateRangeFilters: {} } } }),
      ],
      activeDashboardId: "d1",
      past: [],
      future: [],
    });
  });

  it("undo after loadDashboard restores the prior dataset, filters, view and recomputed filteredData", () => {
    useDashboardStore.getState().loadDashboard("d2");

    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds2");
    expect(useFilterStore.getState().activeFilters).toEqual(d2Filters);
    expect(useUiStore.getState().activeView).toBe("overview");

    useDashboardStore.getState().undo();

    expect(useDashboardStore.getState().activeDashboardId).toBe("d1");
    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds1");
    expect(useFilterStore.getState().activeFilters).toEqual(ds1Filters);
    expect(useUiStore.getState().activeView).toBe("charts");
    // Pins that restoreExternalContext actually recomputes via queryEngine rather
    // than trusting stale rows - only the cat:"x" row should survive the filter.
    expect(useFilterStore.getState().filteredData).toEqual([{ cat: "x", A: 1 }]);
  });

  it("undo after switching between two dashboards over the SAME dataset still restores filters/view (id-equal dataset guard)", () => {
    useDashboardStore.getState().loadDashboard("d4"); // d4 also uses ds1, different filterState

    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds1");
    expect(useFilterStore.getState().activeFilters).toEqual({ categoricalFilters: { cat: ["y"] }, dateRangeFilters: {} });

    useDashboardStore.getState().undo();

    expect(useDashboardStore.getState().activeDashboardId).toBe("d1");
    // Dataset id didn't change across the undo, but activeDataset must remain a
    // usable, non-null reference - and filters/view/filteredData must still revert.
    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds1");
    expect(useFilterStore.getState().activeFilters).toEqual(ds1Filters);
    expect(useUiStore.getState().activeView).toBe("charts");
    expect(useFilterStore.getState().filteredData).toEqual([{ cat: "x", A: 1 }]);
  });

  it("redo after undo re-applies loadDashboard's dataset/filter/view context", () => {
    useDashboardStore.getState().loadDashboard("d2");
    useDashboardStore.getState().undo();
    useDashboardStore.getState().redo();

    expect(useDashboardStore.getState().activeDashboardId).toBe("d2");
    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds2");
    expect(useFilterStore.getState().activeFilters).toEqual(d2Filters);
    expect(useUiStore.getState().activeView).toBe("overview");
  });

  it("undo after loading a dashboard with a missing dataset restores the prior dataset context", () => {
    useDashboardStore.getState().loadDashboard("d3");

    expect(useDatasetStore.getState().activeDataset).toBeNull();
    expect(useFilterStore.getState().filteredData).toEqual([]);

    useDashboardStore.getState().undo();

    expect(useDatasetStore.getState().activeDataset?.id).toBe("ds1");
    expect(useFilterStore.getState().activeFilters).toEqual(ds1Filters);
    expect(useUiStore.getState().activeView).toBe("charts");
  });

  it("undo of a plain mutation (renameDashboard) does not touch live filter/view state", () => {
    useDashboardStore.getState().renameDashboard("d1", "Renamed");

    // User keeps exploring after the rename - this must survive the undo below.
    useFilterStore.setState({ activeFilters: { categoricalFilters: { cat: ["live"] }, dateRangeFilters: {} } });
    useUiStore.setState({ activeView: "pivot" });

    useDashboardStore.getState().undo();

    expect(useDashboardStore.getState().dashboards.find(d => d.id === "d1")?.name).toBe("Test Dashboard");
    expect(useFilterStore.getState().activeFilters).toEqual({ categoricalFilters: { cat: ["live"] }, dateRangeFilters: {} });
    expect(useUiStore.getState().activeView).toBe("pivot");
  });
});
