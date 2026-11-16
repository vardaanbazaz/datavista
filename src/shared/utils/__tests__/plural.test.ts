import { describe, expect, it } from "vitest";
import { countOf, plural } from "../plural";

describe("plural / countOf", () => {
  it("picks singular only for exactly 1", () => {
    expect(countOf(1, "row")).toBe("1 row");
    expect(countOf(0, "row")).toBe("0 rows");
    expect(countOf(2, "row")).toBe("2 rows");
    expect(countOf(1234, "row")).toBe((1234).toLocaleString() + " rows");
  });
  it("verbs agree with the count", () => {
    const msg = (n: number) => `${countOf(n, "row")} had parse problems at import and ${plural(n, "was", "were")} kept.`;
    expect(msg(1)).toBe("1 row had parse problems at import and was kept.");
    expect(msg(3)).toBe("3 rows had parse problems at import and were kept.");
  });
  it("irregular plurals", () => {
    expect(countOf(2, "fix", "fixes")).toBe("2 fixes");
    expect(plural(1, "isn't a valid date", "aren't valid dates")).toBe("isn't a valid date");
  });
});
