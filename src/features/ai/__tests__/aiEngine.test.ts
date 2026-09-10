import { describe, it, expect } from "vitest";
import { aiEngine, AiEngineError } from "../aiEngine";
import { Dataset } from "@/shared/types";
import { Query } from "@/shared/types/query";

function makeDataset(): Dataset {
  return {
    id: "ds1",
    name: "Test Dataset",
    data: [{ Revenue: 100, Region: "North" }],
    columns: ["Revenue", "Region"],
    columnTypes: { Revenue: "numeric", Region: "categorical" },
  };
}

describe("aiEngine.validateQueryColumns", () => {
  it("throws a clean AiEngineError (not a raw TypeError) when an aggregation is missing its alias", () => {
    const dataset = makeDataset();
    // Shape an LLM would routinely produce by omitting `alias`
    const query = {
      aggregations: [{ column: "Revenue", operator: "sum" } as unknown]
    } as unknown as Query;

    let caught: unknown;
    try {
      aiEngine.validateQueryColumns(dataset, query);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AiEngineError);
    expect((caught as Error).message).not.toMatch(/Cannot read propert/i);
    expect((caught as Error).message).toMatch(/missing a required field/i);
  });

  it("throws a clean AiEngineError when an aggregation is missing column or operator", () => {
    const dataset = makeDataset();
    const missingColumn = { aggregations: [{ operator: "sum", alias: "total" } as unknown] } as unknown as Query;
    const missingOperator = { aggregations: [{ column: "Revenue", alias: "total" } as unknown] } as unknown as Query;

    expect(() => aiEngine.validateQueryColumns(dataset, missingColumn)).toThrow(AiEngineError);
    expect(() => aiEngine.validateQueryColumns(dataset, missingOperator)).toThrow(AiEngineError);
  });

  it("does not throw for a well-formed aggregation, and still validates column existence", () => {
    const dataset = makeDataset();
    const validQuery: Query = {
      aggregations: [{ column: "Revenue", operator: "sum", alias: "total_revenue" }]
    };
    expect(() => aiEngine.validateQueryColumns(dataset, validQuery)).not.toThrow();

    const badColumnQuery: Query = {
      aggregations: [{ column: "NotARealColumn", operator: "sum", alias: "total" }]
    };
    expect(() => aiEngine.validateQueryColumns(dataset, badColumnQuery)).toThrow(AiEngineError);
  });
});
