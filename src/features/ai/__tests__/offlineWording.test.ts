import { describe, expect, it } from "vitest";
import { anomalyDetector, anomalyLabel } from "../anomalyDetector";
import { summaryEngine } from "../summaryEngine";
import { processRawData } from "@/shared/services/parsingService";

const rows = [
  ...Array.from({ length: 30 }, (_, i) => ({ Attrition: i % 2 ? "Yes" : "No", MonthlyIncome: 5000 + (i % 5) * 10, EmployeeNumber: i + 1, StandardHours: 80 })),
  { Attrition: "No", MonthlyIncome: 19999, EmployeeNumber: 999999, StandardHours: 80 },
];

describe("offline insight wording", () => {
  const ds = processRawData(rows, "hr.csv");

  it("names the grouping column and skips ID and constant columns", () => {
    const found = anomalyDetector.detectDatasetAnomalies(ds);
    expect(found.map((a) => a.columnName)).toEqual(["MonthlyIncome"]);
    expect(anomalyLabel(found[0])).toBe("MonthlyIncome for Attrition = No");
    expect(found[0].description).toMatch(/^MonthlyIncome for Attrition = No: 19,999, \d+% above average\.$/);
  });

  it("says nothing about widgets or steady performance", () => {
    const text = summaryEngine.generateOfflineSummary("hr", 31, 0, anomalyDetector.detectDatasetAnomalies(ds));
    expect(text).toMatch(/^Most unusual values in "hr" \(31 rows\): MonthlyIncome for Attrition = No: 19,999/);
    expect(text).not.toMatch(/widget|steady|performance/i);
  });

  it("gives a short neutral line when nothing stands out", () => {
    expect(summaryEngine.generateOfflineSummary("hr", 31, 0, [])).toBe('No unusual values in the numeric columns of "hr".');
  });
});
