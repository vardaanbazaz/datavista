import { describe, expect, it } from "vitest";
import { kpiEngine } from "../kpiEngine";
import type { KPICardConfig } from "../types";
import type { Dataset } from "@/shared/types";

const dataset: Dataset = {
  id: "ds",
  name: "Retail",
  data: [
    { Invoice: "536365", Quantity: 6 },
    { Invoice: "536365", Quantity: 8 },
    { Invoice: "536366", Quantity: 2 },
    { Invoice: "", Quantity: 1 },
  ],
  columns: ["Invoice", "Quantity"],
  columnTypes: { Invoice: "categorical", Quantity: "numeric" },
};

const card = (aggregation: KPICardConfig["primaryMetric"]["aggregation"]): KPICardConfig => ({
  id: "k",
  title: "Invoices",
  datasetId: "ds",
  primaryMetric: { column: "Invoice", aggregation },
  sparkline: false,
  polarity: "positive",
});

describe("KPI counts on a categorical column (the only aggregations the builder offers it)", () => {
  it("Distinct count counts distinct non-blank values", () => {
    expect(kpiEngine.calculateKPIData(dataset, card("count_distinct")).primaryValue).toBe(2);
  });
  it("Count counts non-blank cells; Count of rows every row", () => {
    expect(kpiEngine.calculateKPIData(dataset, card("count")).primaryValue).toBe(3);
    expect(kpiEngine.calculateKPIData(dataset, card("count_rows")).primaryValue).toBe(4);
  });
});
