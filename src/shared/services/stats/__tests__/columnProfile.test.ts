import { describe, expect, it } from "vitest";
import { profileNumericColumns, numericStatRole } from "../columnProfile";
import type { Dataset } from "@/shared/types";

const rows = [
  { EmployeeNumber: 1, Age: 30, EmployeeCount: 1, Score: "N/A" },
  { EmployeeNumber: 2, Age: "ERROR", EmployeeCount: 1, Score: 5 },
  { EmployeeNumber: 2, Age: 50, EmployeeCount: 1, Score: "" },
];

function datasetWith(columns: string[]): Dataset {
  return {
    id: "d",
    name: "d",
    data: rows,
    columns,
    columnTypes: Object.fromEntries(columns.map((c) => [c, "numeric"])),
    metadata: {
      columns: columns.map((name) => ({
        name,
        inferredDataType: "numeric",
        uniqueValueCount: 0,
        missingValueCount: 0,
        allIntegerValues: true,
        minimumValue: 1,
        maximumValue: 50,
      })),
    },
  } as unknown as Dataset;
}

describe("profileNumericColumns", () => {
  const cols = ["EmployeeNumber", "Age", "EmployeeCount", "Score"];
  const profiles = Object.fromEntries(profileNumericColumns(rows, cols, datasetWith(cols)).map((p) => [p.column, p]));

  it("flags ID columns by name and counts their distinct values", () => {
    expect(profiles.EmployeeNumber.role).toBe("id");
    expect(profiles.EmployeeNumber.distinct).toBe(2);
  });

  it("counts missing (blank, null tokens) and invalid (non-numbers) separately", () => {
    expect(profiles.Age).toMatchObject({ role: "measure", count: 2, missing: 0, invalid: 1, mean: 40, sum: 80 });
    expect(profiles.Score).toMatchObject({ missing: 2, invalid: 0 });
  });

  it("marks a single-valued column constant, before the ID rule", () => {
    expect(profiles.EmployeeCount.role).toBe("constant");
    expect(profiles.Score.role).toBe("constant");
    expect(numericStatRole(null, "CustomerID", 7, 7, 3)).toBe("constant");
  });
});
