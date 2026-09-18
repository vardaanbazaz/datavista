import { describe, it, expect } from "vitest";
import { windowEngine } from "../engine";
import { Dataset, DatasetMetadata, ColumnMetadata } from "@/shared/types";

// Regression tests for AUDIT-COMPREHENSIVE-2026-09-14 §item-4: with no explicit frame,
// SQL's actual default is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW, which must
// include every row tied on the ORDER BY column(s) — not just rows up to one arbitrary
// array position within the tied block.

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

function makeDataset(rows: Record<string, unknown>[]): Dataset {
  const metadata: DatasetMetadata = {
    datasetId: "d1",
    name: "t",
    createdAt: 0,
    updatedAt: 0,
    rowCount: rows.length,
    columnCount: 2,
    originalFileName: "t.csv",
    originalFileType: "csv",
    parsingStatistics: { processingTimeMs: 0 } as DatasetMetadata["parsingStatistics"],
    columns: [makeMetadataColumn("score", "dimension"), makeMetadataColumn("amount", "measure")],
  };

  return {
    id: "d1",
    name: "t",
    data: rows,
    columns: ["score", "amount"],
    columnTypes: { score: "numeric", amount: "numeric" },
    metadata,
  };
}

// score has two tied groups: {10,10} and {20,20,20}, plus a lone 30.
// amount is deliberately non-monotonic so MIN/MAX aren't trivially "always row 0".
const tiedRows = [
  { score: 10, amount: 5 },
  { score: 10, amount: 3 },
  { score: 20, amount: 8 },
  { score: 20, amount: 1 },
  { score: 20, amount: 9 },
  { score: 30, amount: 2 },
];

describe("windowEngine peer-aware default frame (no explicit frame, ORDER BY present)", () => {
  it("gives tied rows the same RUNNING_TOTAL/MOVING_AVG/WINDOW_MIN/WINDOW_MAX as their peers, not a value based on array position", () => {
    const dataset = makeDataset(tiedRows);
    const evaluated = windowEngine.evaluate({
      ...dataset,
      windowQueries: [
        { alias: "rt", functionType: "RUNNING_TOTAL", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "ma", functionType: "MOVING_AVG", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "wmin", functionType: "WINDOW_MIN", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "wmax", functionType: "WINDOW_MAX", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
      ],
    });

    // score=10 peers (rows 0,1): frame = amounts[0..1] = [5,3]
    expect(evaluated.data[0].rt).toBe(8);
    expect(evaluated.data[1].rt).toBe(8);
    expect(evaluated.data[0].ma).toBe(4);
    expect(evaluated.data[1].ma).toBe(4);
    expect(evaluated.data[0].wmin).toBe(3);
    expect(evaluated.data[1].wmin).toBe(3);
    expect(evaluated.data[0].wmax).toBe(5);
    expect(evaluated.data[1].wmax).toBe(5);

    // score=20 peers (rows 2,3,4): frame = amounts[0..4] = [5,3,8,1,9]
    for (const i of [2, 3, 4]) {
      expect(evaluated.data[i].rt).toBe(26);
      expect(evaluated.data[i].ma).toBe(5.2);
      expect(evaluated.data[i].wmin).toBe(1);
      expect(evaluated.data[i].wmax).toBe(9);
    }

    // score=30, lone row (row 5): frame = all rows = [5,3,8,1,9,2]
    expect(evaluated.data[5].rt).toBe(28);
    expect(evaluated.data[5].wmin).toBe(1);
    expect(evaluated.data[5].wmax).toBe(9);
  });

  it("gives tied rows the same LAST_VALUE as their peers (the last row of the tied group, not their own row)", () => {
    const dataset = makeDataset(tiedRows);
    const evaluated = windowEngine.evaluate({
      ...dataset,
      windowQueries: [
        { alias: "last", functionType: "LAST_VALUE", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "first", functionType: "FIRST_VALUE", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
      ],
    });

    // Peer group {10,10} (rows 0,1) both resolve to the last peer's value (row 1 = 3),
    // not row 0's own position (which the old positional bug would have given row 0).
    expect(evaluated.data[0].last).toBe(3);
    expect(evaluated.data[1].last).toBe(3);

    // Peer group {20,20,20} (rows 2,3,4) all resolve to row 4's value (9).
    expect(evaluated.data[2].last).toBe(9);
    expect(evaluated.data[3].last).toBe(9);
    expect(evaluated.data[4].last).toBe(9);

    expect(evaluated.data[5].last).toBe(2);

    // FIRST_VALUE's start bound is always UNBOUNDED PRECEDING (0) regardless of ties —
    // unaffected by this fix, every row sees the partition's first value.
    for (let i = 0; i < 6; i++) {
      expect(evaluated.data[i].first).toBe(5);
    }
  });

  it("leaves non-tied cases exactly as before (every row is its own peer group)", () => {
    const rows = [
      { score: 10, amount: 5 },
      { score: 20, amount: 3 },
      { score: 30, amount: 8 },
    ];
    const dataset = makeDataset(rows);
    const evaluated = windowEngine.evaluate({
      ...dataset,
      windowQueries: [
        { alias: "rt", functionType: "RUNNING_TOTAL", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "last", functionType: "LAST_VALUE", targetColumn: "amount", orderBy: [{ column: "score", direction: "asc" }] },
      ],
    });

    expect(evaluated.data.map((r) => r.rt)).toEqual([5, 8, 16]);
    expect(evaluated.data.map((r) => r.last)).toEqual([5, 3, 8]);
  });

  it("does not change RANK/DENSE_RANK/PERCENT_RANK tie behavior, which was already correct", () => {
    const dataset = makeDataset(tiedRows);
    const evaluated = windowEngine.evaluate({
      ...dataset,
      windowQueries: [
        { alias: "rnk", functionType: "RANK", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "drnk", functionType: "DENSE_RANK", orderBy: [{ column: "score", direction: "asc" }] },
        { alias: "prnk", functionType: "PERCENT_RANK", orderBy: [{ column: "score", direction: "asc" }] },
      ],
    });

    expect(evaluated.data.map((r) => r.rnk)).toEqual([1, 1, 3, 3, 3, 6]);
    expect(evaluated.data.map((r) => r.drnk)).toEqual([1, 1, 2, 2, 2, 3]);
    expect(evaluated.data.map((r) => r.prnk)).toEqual([0, 0, 0.4, 0.4, 0.4, 1]);
  });
});
