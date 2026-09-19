import { describe, it, expect, beforeEach } from "vitest";
import { aiEngine, AiEngineError } from "../aiEngine";
import { Dataset } from "@/shared/types";
import { Query } from "@/shared/types/query";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useUiStore } from "@/store/uiStore";

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

// Regression tests for: the AI Co-Pilot's query path used to apply a generated query to
// filterStore and auto-create a chart in one unreviewable step (audit #22b). It's now
// split into a preview step (generateAIQueryPreview, read-only) and a commit step
// (applyAIQueryResult, called only once the user reviews and accepts the preview).
// No API key is configured in these tests, so callLLM deterministically falls back to
// the offline heuristic — no network mocking needed.
describe("aiEngine query preview/apply split (item #8)", () => {
  beforeEach(() => {
    useUiStore.setState({ llmApiKey: "", llmProvider: "gemini" });
    useFilterStore.setState({ filteredData: [] });
    useChartStore.setState({ charts: [] });
  });

  it("generateAIQueryPreview computes a result without touching filterStore or chartStore", async () => {
    const dataset = makeDataset();
    const { response, queryResult } = await aiEngine.generateAIQueryPreview("top regions by revenue", dataset);

    expect(response.type).toBe("query");
    expect(queryResult.rows.length).toBeGreaterThan(0);
    expect(useFilterStore.getState().filteredData).toEqual([]);
    expect(useChartStore.getState().charts).toEqual([]);
  });

  it("applyAIQueryResult commits the previewed result to filterStore and creates the suggested chart", async () => {
    const dataset = makeDataset();
    const { response, queryResult } = await aiEngine.generateAIQueryPreview("top regions by revenue", dataset);

    aiEngine.applyAIQueryResult("top regions by revenue", response, queryResult, dataset);

    expect(useFilterStore.getState().filteredData).toEqual(queryResult.rows);
    expect(useChartStore.getState().charts).toHaveLength(1);
    expect(useChartStore.getState().charts[0].type).toBe(response.chartType);
  });

  it("discarding a preview (never calling applyAIQueryResult) leaves no trace in either store", async () => {
    const dataset = makeDataset();
    await aiEngine.generateAIQueryPreview("top regions by revenue", dataset);

    // Simulates the user clicking Discard: the preview is just dropped, applyAIQueryResult
    // is never called.
    expect(useFilterStore.getState().filteredData).toEqual([]);
    expect(useChartStore.getState().charts).toEqual([]);
  });
});
