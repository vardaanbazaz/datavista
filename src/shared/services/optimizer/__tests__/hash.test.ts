import { describe, it, expect } from "vitest";
import { hashQuery, stableStringify } from "../hash";

describe("Query Optimizer - Deterministic Hashing", () => {
  it("should produce the exact same FNV-1a hash for objects with different key order", () => {
    const queryA = {
      table: "sales",
      filter: { category: "Electronics", minAmount: 100 },
      aggregations: ["SUM(amount)", "AVG(discount)"],
      limit: 50,
    };

    const queryB = {
      limit: 50,
      aggregations: ["SUM(amount)", "AVG(discount)"],
      filter: { minAmount: 100, category: "Electronics" },
      table: "sales",
    };

    const hashA = hashQuery(queryA);
    const hashB = hashQuery(queryB);

    expect(hashA).toBe(hashB);
    expect(typeof hashA).toBe("string");
    expect(hashA.length).toBeGreaterThan(0);
  });

  it("should handle deeply nested object key sorting deterministically", () => {
    const objA = { z: { b: 2, a: 1 }, y: [1, 2, { d: 4, c: 3 }] };
    const objB = { y: [1, 2, { c: 3, d: 4 }], z: { a: 1, b: 2 } };

    expect(stableStringify(objA)).toBe(stableStringify(objB));
    expect(hashQuery(objA)).toBe(hashQuery(objB));
  });

  it("should produce different hashes for non-identical query objects", () => {
    const queryA = { table: "sales", limit: 50 };
    const queryB = { table: "sales", limit: 100 };

    expect(hashQuery(queryA)).not.toBe(hashQuery(queryB));
  });

  it("should handle primitives, nulls, undefined, and Date objects safely", () => {
    expect(hashQuery(null)).toBe(hashQuery(null));
    expect(hashQuery(undefined)).toBe(hashQuery(undefined));
    expect(hashQuery(123)).toBe(hashQuery(123));

    const dateStr = "2026-01-01T00:00:00.000Z";
    const date1 = new Date(dateStr);
    const date2 = new Date(dateStr);
    expect(hashQuery({ date: date1 })).toBe(hashQuery({ date: date2 }));
  });
});
