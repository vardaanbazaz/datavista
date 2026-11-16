import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "@/shared/services/csvParse";
import { processRawData } from "@/shared/services/parsingService";
import { anomalyChipText, anomalyDetector, anomalyLabel, isNearUniqueColumn } from "../anomalyDetector";
import type { ChartConfig } from "@/shared/types";

const csv = readFileSync(resolve(__dirname, "../../../../tests/fixtures/playstore-insights.csv"), "utf8");
const ds = processRawData(parseCsvText(csv).rows, "playstore-insights.csv", { dayFirstDefault: true });

describe("anomalies on Play Store (near-unique label column)", () => {
  it("treats App as near-unique and Category as a grouping column", () => {
    expect(isNearUniqueColumn(ds, "App", ds.data)).toBe(true);
    expect(isNearUniqueColumn(ds, "Category", ds.data)).toBe(false);
    expect(isNearUniqueColumn(ds, "Type", ds.data)).toBe(false);
  });

  it("reports outliers as rows, never 'for App = …'", () => {
    const found = anomalyDetector.detectDatasetAnomalies(ds);
    expect(found.length).toBeGreaterThan(0);
    for (const a of found) {
      expect(a.description).not.toMatch(/for App =/);
      if (a.dimensionColumn === "App") expect(a.rowLevel).toBe(true);
    }
    const reviews = found.filter((a) => a.columnName === "Reviews");
    expect(reviews[0].description).toMatch(/^Reviews: 78,158,306 \(App: Facebook\), ×[\d.,]+ the average\.$/);
    expect(anomalyLabel(reviews[0])).toBe("Reviews (App: Facebook)");
    expect(anomalyChipText(reviews[0])).toBe("Reviews: 78,158,306 (App: Facebook)");
  });

  it("lists each app once, although the file repeats Facebook, WhatsApp and Instagram", () => {
    const reviews = anomalyDetector.detectDatasetAnomalies(ds).filter((a) => a.columnName === "Reviews");
    expect(reviews.map((a) => a.dimensionKey)).toEqual(["Facebook", "WhatsApp Messenger", "Instagram"]);
  });

  it("chart anomalies with App on the x axis are row-level and deduplicated too", () => {
    const chart = { id: "c1", title: "Reviews by app", type: "bar", xAxis: "App", yAxis: "Reviews", aggregation: "avg", datasetId: ds.id } as unknown as ChartConfig;
    const found = anomalyDetector.detectChartAnomalies(chart, ds.data, ds);
    const keys = found.map((a) => a.dimensionKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(found.every((a) => a.rowLevel)).toBe(true);
    expect(keys.slice(0, 3)).toEqual(["Facebook", "WhatsApp Messenger", "Instagram"]);
  });
});

describe("anomalies with a low-cardinality label column", () => {
  it("keeps the 'for Column = value' grouping wording", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ Dept: i % 2 ? "Sales" : "R&D", Pay: i === 7 ? 99_000 : 1000 + (i % 5) }));
    const small = processRawData(rows, "small.csv");
    const [a] = anomalyDetector.detectDatasetAnomalies(small);
    expect(a.rowLevel).toBeUndefined();
    expect(a.description).toMatch(/^Pay for Dept = Sales: 99,000, ×[\d.,]+ the average\.$/);
  });
});
