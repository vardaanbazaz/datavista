import { describe, it, expect } from "vitest";
import { ORDER_BY_REQUIRED_REASONS, isOrderByMissing } from "../orderByRequirements";
import { WindowFunctionType, WindowOrderBy } from "@/shared/services/window/types";

// Every function type from WindowFunctionType (types.ts), split by whether it
// actually needs Order By to produce non-collapsed output. Confirmed empirically
// against windowEngine (see window/__tests__): RANK/DENSE_RANK/PERCENT_RANK and
// FIRST_VALUE/LAST_VALUE/RUNNING_TOTAL/MOVING_AVG/WINDOW_MIN/WINDOW_MAX all
// collapse to one constant value across every row with no orderBy; ROW_NUMBER,
// NTILE, LAG, LEAD stay well-defined (positional on existing row order).
const REQUIRES_ORDER_BY: WindowFunctionType[] = [
  "RANK",
  "DENSE_RANK",
  "PERCENT_RANK",
  "FIRST_VALUE",
  "LAST_VALUE",
  "RUNNING_TOTAL",
  "MOVING_AVG",
  "WINDOW_MIN",
  "WINDOW_MAX",
];

const ORDER_BY_OPTIONAL: WindowFunctionType[] = ["ROW_NUMBER", "NTILE", "LAG", "LEAD"];

const someOrderBy: WindowOrderBy[] = [{ column: "amount", direction: "asc" }];

describe("WindowExplorer Order By validation", () => {
  it("flags exactly the function types that collapse to a meaningless constant without ordering", () => {
    expect(Object.keys(ORDER_BY_REQUIRED_REASONS).sort()).toEqual([...REQUIRES_ORDER_BY].sort());
  });

  it("covers every WindowFunctionType between the required and optional lists", () => {
    const all = [...REQUIRES_ORDER_BY, ...ORDER_BY_OPTIONAL].sort();
    const expected: WindowFunctionType[] = [
      "ROW_NUMBER", "RANK", "DENSE_RANK", "PERCENT_RANK", "NTILE",
      "LAG", "LEAD", "FIRST_VALUE", "LAST_VALUE", "MOVING_AVG",
      "RUNNING_TOTAL", "WINDOW_MIN", "WINDOW_MAX",
    ].sort();
    expect(all).toEqual(expected);
  });

  it.each(REQUIRES_ORDER_BY)("disables Add Column for %s when no orderBy is set", (fn) => {
    expect(isOrderByMissing(fn, [])).toBe(true);
  });

  it.each(REQUIRES_ORDER_BY)("re-enables Add Column for %s once an orderBy rule is set", (fn) => {
    expect(isOrderByMissing(fn, someOrderBy)).toBe(false);
  });

  it.each(ORDER_BY_OPTIONAL)("never disables Add Column for %s, orderBy stays optional", (fn) => {
    expect(isOrderByMissing(fn, [])).toBe(false);
    expect(isOrderByMissing(fn, someOrderBy)).toBe(false);
  });

  it("every required reason names its function type and explains the concrete failure", () => {
    for (const fn of REQUIRES_ORDER_BY) {
      const reason = ORDER_BY_REQUIRED_REASONS[fn]!;
      expect(reason).toContain(fn);
      expect(reason).toContain("Order By");
      expect(reason.toLowerCase()).not.toBe("required field");
    }
  });

  it("re-validates live when switching function type with no orderBy set (e.g. FIRST_VALUE -> MOVING_AVG)", () => {
    // Both require ordering, so switching between them keeps Add Column disabled
    // without needing a submit attempt first.
    expect(isOrderByMissing("FIRST_VALUE", [])).toBe(true);
    expect(isOrderByMissing("MOVING_AVG", [])).toBe(true);
    // Switching to an optional type immediately re-enables it.
    expect(isOrderByMissing("ROW_NUMBER", [])).toBe(false);
  });
});
