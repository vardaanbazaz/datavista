import { describe, it, expect } from "vitest";
import {
  minMax,
  numericValues,
  parseStrictNumber,
  sampleStdDev,
  sampleVariance,
  toNumberOrNull,
  trimAscii,
} from "../numeric";
import { computeDescriptive } from "@/shared/services/stats/descriptive";

describe("toNumberOrNull: the one numeric rule", () => {
  it("accepts plain decimals with optional sign, decimal point and exponent", () => {
    expect(toNumberOrNull("42")).toBe(42);
    expect(toNumberOrNull("-3.5")).toBe(-3.5);
    expect(toNumberOrNull("+7")).toBe(7);
    expect(toNumberOrNull(".5")).toBe(0.5);
    expect(toNumberOrNull("5.")).toBe(5);
    expect(toNumberOrNull("1e3")).toBe(1000);
    expect(toNumberOrNull("2.5E-2")).toBe(0.025);
    expect(toNumberOrNull("  12 \t")).toBe(12);
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull(-1.25)).toBe(-1.25);
  });

  it("treats blanks and null tokens as null, case-insensitively", () => {
    for (const t of ["", "   ", "n/a", "N/A", "na", "NA", "nan", "NaN", "null", "NULL", "none", "None", "#N/A", "-", "undefined", " - "]) {
      expect(toNumberOrNull(t), JSON.stringify(t)).toBeNull();
    }
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it("rejects junk, hex, Infinity, currency, thousands separators and letters", () => {
    for (const t of ["ERROR", "UNKNOWN", "0x1A", "Infinity", "-Infinity", "$0.99", "1,000", "3.0M", "1e", "e3", "--1", "1.2.3", "1e400", "\u0661\u0662"]) {
      expect(toNumberOrNull(t), t).toBeNull();
    }
  });

  it("never coerces non-strings: booleans, NaN, Infinity, dates and objects are null", () => {
    expect(toNumberOrNull(true)).toBeNull();
    expect(toNumberOrNull(false)).toBeNull();
    expect(toNumberOrNull(NaN)).toBeNull();
    expect(toNumberOrNull(Infinity)).toBeNull();
    expect(toNumberOrNull(new Date(0))).toBeNull();
    expect(toNumberOrNull({})).toBeNull();
  });

  it("only trims ASCII whitespace: a non-breaking space makes the cell not a number", () => {
    expect(trimAscii(" a\u00a0 ")).toBe("a\u00a0");
    expect(trimAscii("\u2003x\u2003")).toBe("\u2003x\u2003");
    expect(parseStrictNumber("12\u00a0")).toBeNull();
  });

  it("numericValues keeps order and drops everything that isn't a number", () => {
    expect(numericValues([1, "2", "", "ERROR", null, "n/a", " 3 ", true])).toEqual([1, 2, 3]);
  });
});

describe("sample variance / std (n − 1)", () => {
  it("matches the textbook sample formula", () => {
    // mean 5, squared deviations 9+1+1+1+0+0+4+16 = 32, / (8 − 1)
    const v = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(sampleVariance(v)).toBeCloseTo(32 / 7, 12);
    expect(sampleStdDev(v)).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it("is 0 (not NaN) when undefined, for n < 2", () => {
    expect(sampleVariance([])).toBe(0);
    expect(sampleVariance([5])).toBe(0);
    expect(computeDescriptive([5]).stdDev).toBe(0);
  });
});

describe("no spread on large arrays", () => {
  const N = 2_000_000;
  const big: number[] = new Array(N);
  for (let i = 0; i < N; i++) big[i] = (i * 7919) % N;
  big[123_456] = -5;
  big[1_999_999] = N + 10;

  it("minMax handles 2,000,000 values", () => {
    expect(() => Math.min(...big)).toThrow(RangeError);
    expect(minMax(big)).toEqual({ min: -5, max: N + 10 });
    expect(minMax([])).toBeNull();
  });

  it("computeDescriptive (non-full path) handles 2,000,000 values", () => {
    const stats = computeDescriptive(big);
    expect(stats.count).toBe(N);
    expect(stats.min).toBe(-5);
    expect(stats.max).toBe(N + 10);
  });
});
