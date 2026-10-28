import { describe, it, expect } from "vitest";
import { formulaEngine } from "../formulaEngine";
import { Dataset } from "../../types";
import { processRawData } from "../parsingService";
import { mightBeCategorical } from "../../utils/columnType";

describe("formulaEngine.evaluateCalculatedFields - stale column reconciliation (backlog item 3)", () => {
  it("strips the materialized column when the LAST calculated field is deleted", () => {
    // Simulates the post-deletion state: calculatedFields is now empty, but dataset.data
    // and metadata still carry the previously materialized 'Diff' column (role: 'calculated')
    // from before the field was removed.
    const dataset: Dataset = {
      id: "ds1",
      name: "test",
      data: [
        { A: 10, B: 4, Diff: 6 },
        { A: 20, B: 5, Diff: 15 },
      ],
      columns: ["A", "B", "Diff"],
      columnTypes: { A: "numeric", B: "numeric", Diff: "numeric" },
      calculatedFields: [], // field deleted from config
      metadata: {
        datasetId: "ds1",
        name: "test",
        createdAt: 0,
        updatedAt: 0,
        rowCount: 2,
        columnCount: 3,
        originalFileName: "test.csv",
        originalFileType: "text/csv",
        parsingStatistics: { processingTimeMs: 0 },
        version: 1,
        columns: [
          {
            id: "ds1_A", name: "A", displayName: "A", originalHeader: "A",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 2, missingValueCount: 0, role: "measure", allIntegerValues: true,
          },
          {
            id: "ds1_B", name: "B", displayName: "B", originalHeader: "B",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 2, missingValueCount: 0, role: "measure", allIntegerValues: true,
          },
          {
            id: "ds1_Diff", name: "Diff", displayName: "Diff", originalHeader: "Diff",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 2, missingValueCount: 0, role: "calculated", allIntegerValues: true,
          },
        ],
      },
    };

    const result = formulaEngine.evaluateCalculatedFields(dataset);

    expect(result.columns).not.toContain("Diff");
    expect(result.columnTypes.Diff).toBeUndefined();
    expect(result.data.every((row) => !("Diff" in row))).toBe(true);
    expect(result.metadata!.columns.some((c) => c.name === "Diff")).toBe(false);
  });

  it("still recomputes a renamed/kept field correctly while dropping an unrelated removed one", () => {
    const dataset: Dataset = {
      id: "ds1",
      name: "test",
      data: [{ A: 10, B: 4, Diff: 999, Kept: 999 }], // both stale from a prior evaluation
      columns: ["A", "B", "Diff", "Kept"],
      columnTypes: { A: "numeric", B: "numeric", Diff: "numeric", Kept: "numeric" },
      calculatedFields: [{ name: "Kept", expression: "[A] + [B]" }], // 'Diff' was removed
      metadata: {
        datasetId: "ds1",
        name: "test",
        createdAt: 0,
        updatedAt: 0,
        rowCount: 1,
        columnCount: 4,
        originalFileName: "test.csv",
        originalFileType: "text/csv",
        parsingStatistics: { processingTimeMs: 0 },
        version: 1,
        columns: [
          {
            id: "ds1_A", name: "A", displayName: "A", originalHeader: "A",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 1, missingValueCount: 0, role: "measure", allIntegerValues: true,
          },
          {
            id: "ds1_B", name: "B", displayName: "B", originalHeader: "B",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 1, missingValueCount: 0, role: "measure", allIntegerValues: true,
          },
          {
            id: "ds1_Diff", name: "Diff", displayName: "Diff", originalHeader: "Diff",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 1, missingValueCount: 0, role: "calculated", allIntegerValues: true,
          },
          {
            id: "ds1_Kept", name: "Kept", displayName: "Kept", originalHeader: "Kept",
            inferredDataType: "numeric", nullableStatus: false,
            uniqueValueCount: 1, missingValueCount: 0, role: "calculated", allIntegerValues: true,
          },
        ],
      },
    };

    const result = formulaEngine.evaluateCalculatedFields(dataset);

    expect(result.columns).not.toContain("Diff");
    expect(result.columns).toContain("Kept");
    expect(result.data[0].Diff).toBeUndefined();
    expect(result.data[0].Kept).toBe(14); // freshly recomputed, not the stale 999
  });
});

describe("formulaEngine.evaluateCalculatedFields - NaN normalization (audit #16)", () => {
  it("writes null, not NaN, when a calculated field produces a non-numeric result", () => {
    const dataset: Dataset = {
      id: "ds1",
      name: "test",
      data: [
        { A: "foo", B: "bar" }, // subtracting non-numeric strings -> NaN
        { A: 10, B: 4 }, // normal numeric case stays numeric
      ],
      columns: ["A", "B"],
      columnTypes: { A: "categorical", B: "categorical" },
      calculatedFields: [{ name: "Diff", expression: "[A] - [B]" }],
    };

    const result = formulaEngine.evaluateCalculatedFields(dataset);

    expect(result.data[0].Diff).toBeNull();
    expect(Number.isNaN(result.data[0].Diff)).toBe(false);
    expect(result.data[1].Diff).toBe(6);
  });
});

describe("formulaEngine `+` operator - numeric-string coercion (audit comprehensive #2)", () => {
  it("adds two numeric-looking strings instead of concatenating", () => {
    const dataset: Dataset = {
      id: "ds1",
      name: "test",
      data: [{ A: "5", B: "10" }],
      columns: ["A", "B"],
      columnTypes: { A: "categorical", B: "categorical" },
      calculatedFields: [{ name: "Sum", expression: "[A] + [B]" }],
    };

    const result = formulaEngine.evaluateCalculatedFields(dataset);

    expect(result.data[0].Sum).toBe(15);
  });

  it("adds a numeric-looking string and a real number", () => {
    const dataset: Dataset = {
      id: "ds1",
      name: "test",
      data: [{ A: "5", B: 10 }],
      columns: ["A", "B"],
      columnTypes: { A: "categorical", B: "numeric" },
      calculatedFields: [{ name: "Sum", expression: "[A] + [B]" }],
    };

    const result = formulaEngine.evaluateCalculatedFields(dataset);

    expect(result.data[0].Sum).toBe(15);
  });

  it("still concatenates when either operand is genuinely non-numeric", () => {
    const dataset: Dataset = {
      id: "ds1",
      name: "test",
      data: [
        { A: "foo", B: "bar" },
        { A: "5", B: "abc" },
      ],
      columns: ["A", "B"],
      columnTypes: { A: "categorical", B: "categorical" },
      calculatedFields: [{ name: "Combined", expression: "[A] + [B]" }],
    };

    const result = formulaEngine.evaluateCalculatedFields(dataset);

    expect(result.data[0].Combined).toBe("foobar");
    expect(result.data[1].Combined).toBe("5abc");
  });
});

describe("formulaEngine.validate - function argument arity (audit #17)", () => {
  it("errors when a function call is missing a required argument", () => {
    const errors = formulaEngine.validate("Result", "IF([A] > 0, 1)", ["A"], []);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("syntax");
    expect(errors[0].message).toMatch(/IF.*expects at least 3 argument/i);
  });

  it("passes when a function call has all required arguments", () => {
    const errors = formulaEngine.validate("Result", "IF([A] > 0, 1, 2)", ["A"], []);

    expect(errors).toEqual([]);
  });

  it("does not flag variadic-style functions for extra optional-slot arguments", () => {
    const errors = formulaEngine.validate("Result", "CONCAT([A], [A], [A])", ["A"], []);

    expect(errors).toEqual([]);
  });

  it("errors when a fixed-arity function call has too many arguments", () => {
    const errors = formulaEngine.validate("Result", "IF([A] > 0, 1, 2, 3)", ["A"], []);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].type).toBe("syntax");
    expect(errors[0].message).toMatch(/IF.*expects at most 3 argument/i);
  });

  it("still catches missing required args nested inside another function call", () => {
    const errors = formulaEngine.validate("Result", "ROUND(IF([A] > 0, 1))", ["A"], []);

    expect(errors.some(e => /IF.*expects at least 3 argument/i.test(e.message))).toBe(true);
  });
});

describe("formulaEngine.evaluateCalculatedFields - allIntegerValues metadata", () => {
  // Regression: calculated-column metadata omitted allIntegerValues, so mightBeCategorical
  // (which fails closed on a missing value) never offered the numeric->categorical override
  // hint for an integer-code calculated column until a page reload backfilled the field.
  const base = (): Dataset => processRawData([1, 2, 3, 4, 5].map((n) => ({ Score: String(n) })), "scores.csv");

  it("marks an integer-valued calculated column allIntegerValues=true", () => {
    const result = formulaEngine.evaluateCalculatedFields({
      ...base(),
      calculatedFields: [{ name: "Level", expression: "[Score] - 1" }],
    });
    const col = result.metadata!.columns.find((c) => c.name === "Level")!;
    expect(col.allIntegerValues).toBe(true);
    expect(mightBeCategorical(col)).toBe(true);
  });

  it("marks a fractional calculated column allIntegerValues=false", () => {
    const result = formulaEngine.evaluateCalculatedFields({
      ...base(),
      calculatedFields: [{ name: "Half", expression: "[Score] / 2" }],
    });
    expect(result.metadata!.columns.find((c) => c.name === "Half")!.allIntegerValues).toBe(false);
  });
});
