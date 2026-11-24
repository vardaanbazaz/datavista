import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "@/shared/services/csvParse";
import { processRawData } from "@/shared/services/parsingService";
import { aiEngine } from "../aiEngine";
import { generateOfflineFallback } from "../llmService";
import { OFFLINE_GUESS_LABEL } from "../offlineLabel";
import type { AIResponse } from "../types";

/** The offline heuristic's column choice (llmService.ts:generateOfflineFallback) on the Play Store fixture. */

const csv = readFileSync(resolve(__dirname, "../../../../tests/fixtures/playstore-insights.csv"), "utf8");
const ds = processRawData(parseCsvText(csv).rows, "playstore-insights.csv", { dayFirstDefault: true });

const guess = (prompt: string): AIResponse => JSON.parse(generateOfflineFallback(aiEngine.offlineContext(ds, prompt), "query"));

describe("offline heuristic column choice (Play Store)", () => {
  it("the fixture has App with more than 50 distinct values", () => {
    const app = aiEngine.offlineContext(ds, "").columns.find((c) => c.name === "App")!;
    expect(app.uniqueValueCount).toBeGreaterThan(50);
  });

  it('"Which category has the highest average rating?": average Rating by Category, highest first', () => {
    const r = guess("Which category has the highest average rating?");
    expect(r.query?.groupBy).toEqual({ column: "Category" });
    expect(r.query?.aggregations).toEqual([{ column: "Rating", operator: "avg", alias: "Average Rating" }]);
    expect(r.query?.sorting).toEqual([{ column: "Average Rating", direction: "desc" }]);
    expect(r.title).toBe("Average Rating by Category");
    expect(r.explanation).toBe(`${OFFLINE_GUESS_LABEL}: average Rating by Category.`);
  });

  it("runs on the query engine: one row per category, not per app", async () => {
    const { queryResult } = await aiEngine.generateAIQueryPreview("Which category has the highest average rating?", ds);
    const categories = new Set(ds.data.map((r) => r.Category));
    expect(queryResult.rows.length).toBe(categories.size);
    expect(queryResult.rows.length).toBeLessThanOrEqual(50);
  });

  it("names are matched case- and space-insensitively, plurals included", () => {
    expect(guess("average RATING by CATEGORIES").query?.groupBy).toEqual({ column: "Category" });
    expect(guess("total reviews per content rating").query?.groupBy).toEqual({ column: "Content Rating" });
    expect(guess("total reviews per contentrating").query?.groupBy).toEqual({ column: "Content Rating" });
    expect(guess("total reviews per content rating").query?.aggregations?.[0]).toMatchObject({ column: "Reviews", operator: "sum" });
  });

  it("never groups by App (more than 50 distinct values), even when the question names it", () => {
    expect(guess("average rating by app").query?.groupBy?.column).not.toBe("App");
    expect(guess("show me something").query?.groupBy?.column).not.toBe("App");
  });

  it("without a named category: a categorical column with 2-50 distinct values", () => {
    const col = guess("highest average rating").query?.groupBy?.column;
    const ctx = aiEngine.offlineContext(ds, "").columns.find((c) => c.name === col)!;
    expect(ctx.type).toBe("categorical");
    expect(ctx.uniqueValueCount).toBeGreaterThanOrEqual(2);
    expect(ctx.uniqueValueCount).toBeLessThanOrEqual(50);
  });

  it("lowest sorts ascending", () => {
    expect(guess("Which category has the lowest average rating?").query?.sorting?.[0].direction).toBe("asc");
  });
});

describe("offline heuristic: ID columns", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ StoreCode: `S${i % 10}`, Region: ["North", "South", "East"][i % 3], Sales: 100 + i }));
  const small = processRawData(rows, "stores.csv");

  it("never groups by an ID-flagged column, even when named", () => {
    const r: AIResponse = JSON.parse(generateOfflineFallback(aiEngine.offlineContext(small, "total sales by store code"), "query"));
    expect(r.query?.groupBy?.column).toBe("Region");
    expect(r.query?.aggregations?.[0]).toMatchObject({ column: "Sales", operator: "sum" });
  });
});

describe("offline heuristic: no intent gives a hint, a guess uses the column's default aggregation", () => {
  it('"j" (no column, no intent): a hint naming real columns, no query', () => {
    const r = guess("j");
    expect(r.type).toBe("hint");
    expect(r.query).toBeUndefined();
    expect(r.explanation).toBe("Try something like 'average Rating by Category'.");
    expect(guess("show me something").type).toBe("hint");
  });

  it("the hint reaches the caller as OfflineHintError, not an invalid-query error", async () => {
    await expect(aiEngine.generateAIQueryPreview("j", ds)).rejects.toMatchObject({ name: "OfflineHintError", message: "Try something like 'average Rating by Category'." });
  });

  it("a named column without an operator word uses its default: Average for Rating, not Sum", () => {
    const r = guess("rating by category");
    expect(r.type).toBe("query");
    expect(r.query?.aggregations).toEqual([{ column: "Rating", operator: "avg", alias: "Average Rating" }]);
    expect(r.title).toBe("Average Rating by Category");
  });

  it("intent words without a column still guess (with the default aggregation)", () => {
    const r = guess("top 5");
    expect(r.type).toBe("query");
    expect(r.query?.aggregations?.[0].operator).not.toBe("sum");
  });

  it("an explicit word still wins: total reviews is a Sum; Reviews' own default is Sum too", () => {
    expect(guess("total rating by category").query?.aggregations?.[0]).toMatchObject({ column: "Rating", operator: "sum" });
    expect(guess("reviews by category").query?.aggregations?.[0]).toMatchObject({ column: "Reviews", operator: "sum" });
  });
});
