import { describe, expect, it } from "vitest";
import { formatShare } from "../percent";

describe("formatShare", () => {
  it("rounds to one decimal", () => {
    expect(formatShare(1, 8)).toBe("12.5%");
    expect(formatShare(0, 10)).toBe("0.0%");
    expect(formatShare(10, 10)).toBe("100.0%");
  });
  it("never shows a non-zero share as 0.0% or a partial one as 100.0%", () => {
    expect(formatShare(1, 10_841)).toBe("<0.1%");
    expect(formatShare(4, 10_841)).toBe("<0.1%");
    expect(formatShare(6, 10_841)).toBe("0.1%");
    expect(formatShare(10_840, 10_841)).toBe(">99.9%");
  });
  it("handles an empty total", () => {
    expect(formatShare(0, 0)).toBe("0.0%");
  });
});
