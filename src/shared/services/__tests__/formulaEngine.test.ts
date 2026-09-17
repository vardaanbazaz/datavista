import { describe, it, expect } from "vitest";
import { formulaEngine } from "../formulaEngine";
import { Dataset } from "../../types";

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
