import { describe, it, expect } from "vitest";
import { isCommaDecimal, parseCurrency, parseGroupedNumber, parseSuffixNumber } from "../numberFormats";

describe("parseGroupedNumber", () => {
  it("reads western grouping", () => {
    expect(parseGroupedNumber("1,234,567")).toEqual({ value: 1234567, grouping: "western" });
    expect(parseGroupedNumber("123,456.78")).toEqual({ value: 123456.78, grouping: "western" });
    expect(parseGroupedNumber("-1,234,567.5")).toEqual({ value: -1234567.5, grouping: "western" });
  });

  it("reads Indian lakh/crore grouping", () => {
    expect(parseGroupedNumber("12,34,567")).toEqual({ value: 1234567, grouping: "indian" });
    expect(parseGroupedNumber("1,23,45,678.90")).toEqual({ value: 12345678.9, grouping: "indian" });
  });

  it("marks values valid in both styles", () => {
    expect(parseGroupedNumber("1,234")).toEqual({ value: 1234, grouping: "both" });
    expect(parseGroupedNumber("12,345")).toEqual({ value: 12345, grouping: "both" });
  });

  it("rejects grouping that isn't valid for the whole value", () => {
    for (const bad of ["1,2,3", "12,3456", "1,23", ",123", "123,", "1,,234", "1,234,56", "12,34,5678", "1 234", "1234"]) {
      expect(parseGroupedNumber(bad), bad).toBeNull();
    }
  });

  it("tells comma decimals apart", () => {
    expect(isCommaDecimal("1.234,56")).toBe(true);
    expect(isCommaDecimal("12,5")).toBe(true);
    expect(isCommaDecimal("1,234")).toBe(false); // valid grouping
    expect(isCommaDecimal("abc")).toBe(false);
  });
});

describe("parseCurrency", () => {
  it("reads a mark before or after the number, with or without a space, any case", () => {
    expect(parseCurrency("$0.99")).toEqual({ value: 0.99, code: "USD", symbol: "$" });
    expect(parseCurrency("ksh 6976")).toEqual({ value: 6976, code: "KES", symbol: "ksh" });
    expect(parseCurrency("KSH6976")).toEqual({ value: 6976, code: "KES", symbol: "KSH" });
    expect(parseCurrency("Rs. 1,200")).toEqual({ value: 1200, code: "INR", symbol: "Rs." });
    expect(parseCurrency("₹12,34,567")).toEqual({ value: 1234567, code: "INR", symbol: "₹" });
    expect(parseCurrency("1,200 INR")).toEqual({ value: 1200, code: "INR", symbol: "INR" });
    expect(parseCurrency("5€")).toEqual({ value: 5, code: "EUR", symbol: "€" });
    expect(parseCurrency("£3.50")?.code).toBe("GBP");
    expect(parseCurrency("¥100")?.code).toBe("JPY");
    expect(parseCurrency("usd 10")?.code).toBe("USD");
    expect(parseCurrency("-$5")?.value).toBe(-5);
  });

  it("rejects values that aren't a single mark and a number", () => {
    for (const bad of ["$", "ksh", "$$5", "5 $ 5", "$1,2,3", "Free", "10", "USD10USD", "Rs 1.234,56"]) {
      expect(parseCurrency(bad), bad).toBeNull();
    }
  });
});

describe("parseSuffixNumber", () => {
  it("reads +, k, M, G (case-insensitive) and grouping", () => {
    expect(parseSuffixNumber("10,000+")).toEqual({ value: 10000, plus: true, suffix: false });
    expect(parseSuffixNumber("19M")).toEqual({ value: 19e6, plus: false, suffix: true });
    expect(parseSuffixNumber("512k")).toEqual({ value: 512e3, plus: false, suffix: true });
    expect(parseSuffixNumber("8.5m")?.value).toBe(8.5e6);
    expect(parseSuffixNumber("1.5G")?.value).toBe(1.5e9);
    expect(parseSuffixNumber("1,000,000,000+")?.value).toBe(1e9);
    expect(parseSuffixNumber("0")?.value).toBe(0);
  });

  it("leaves text alone", () => {
    expect(parseSuffixNumber("Varies with device")).toBeNull();
    expect(parseSuffixNumber("1.0.19")).toBeNull();
    expect(parseSuffixNumber("19 MB")).toBeNull();
  });
});
