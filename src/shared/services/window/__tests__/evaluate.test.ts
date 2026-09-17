import { describe, it, expect } from "vitest";
import { windowEngine } from "../engine";
import { Dataset, DatasetMetadata, ColumnMetadata } from "@/shared/types";

function makeMetadataColumn(name: string, role: ColumnMetadata["role"]): ColumnMetadata {
  return {
    id: `d1_${name}`,
    name,
    displayName: name,
    originalHeader: name,
    inferredDataType: "numeric",
    nullableStatus: false,
    uniqueValueCount: 0,
    missingValueCount: 0,
    role,
  };
}

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  const metadata: DatasetMetadata = {
    datasetId: "d1",
    name: "t",
    createdAt: 0,
    updatedAt: 0,
    rowCount: 3,
    columnCount: 2,
    originalFileName: "t.csv",
    originalFileType: "csv",
    parsingStatistics: { processingTimeMs: 0 } as DatasetMetadata["parsingStatistics"],
    columns: [makeMetadataColumn("group", "dimension"), makeMetadataColumn("amount", "measure")],
  };

  return {
    id: "d1",
    name: "t",
    data: [
      { group: "a", amount: 10 },
      { group: "a", amount: 20 },
      { group: "b", amount: 5 },
    ],
    columns: ["group", "amount"],
    columnTypes: { group: "categorical", amount: "numeric" },
    metadata,
    ...overrides,
  };
}

describe("windowEngine.evaluate — materialization into dataset.data", () => {
  it("writes real per-row window values into dataset.data, not just metadata", () => {
    const dataset = makeDataset({
      windowQueries: [
        {
          alias: "running_total",
          functionType: "RUNNING_TOTAL",
          targetColumn: "amount",
          partitionBy: ["group"],
          orderBy: [{ column: "amount", direction: "asc" }],
        },
      ],
    });

    const evaluated = windowEngine.evaluate(dataset);

    expect(evaluated.columns).toContain("running_total");
    expect(evaluated.columnTypes.running_total).toBe("numeric");
    // Real computed values, not undefined/blank/NaN placeholders.
    expect(evaluated.data).toEqual([
      { group: "a", amount: 10, running_total: 10 },
      { group: "a", amount: 20, running_total: 30 },
      { group: "b", amount: 5, running_total: 5 },
    ]);

    const meta = evaluated.metadata!.columns.find((c) => c.name === "running_total");
    expect(meta?.role).toBe("window");
  });

  it("prunes a deleted window query's alias from data/columns/columnTypes/metadata", () => {
    const withQuery = windowEngine.evaluate(
      makeDataset({
        windowQueries: [
          { alias: "rn", functionType: "ROW_NUMBER", partitionBy: ["group"] },
        ],
      })
    );
    expect(withQuery.columns).toContain("rn");

    // Simulate deleteWindowQuery: same dataset shape, windowQueries now empty.
    const afterDelete = windowEngine.evaluate({ ...withQuery, windowQueries: [] });

    expect(afterDelete.columns).not.toContain("rn");
    expect(afterDelete.columnTypes.rn).toBeUndefined();
    expect(afterDelete.metadata!.columns.some((c) => c.name === "rn")).toBe(false);
    expect(afterDelete.data.every((row) => !("rn" in row))).toBe(true);
  });

  it("does not misidentify a raw numeric ('measure') column as a stale window alias", () => {
    // Regression guard: an earlier draft of this reconciliation used
    // role === 'measure' to detect prior window columns, which collides with
    // ordinary raw numeric columns (parsingService also tags those 'measure').
    const dataset = makeDataset({ windowQueries: [] });
    const evaluated = windowEngine.evaluate(dataset);

    expect(evaluated.columns).toContain("amount");
    expect(evaluated.data.every((row) => "amount" in row)).toBe(true);
  });

  it("is a no-op when there are no window queries and none were ever materialized", () => {
    const dataset = makeDataset({ windowQueries: [] });
    const evaluated = windowEngine.evaluate(dataset);
    expect(evaluated).toBe(dataset);
  });
});
