import { describe, it, expect } from "vitest";
import { isValidUIState } from "../validators";
import { VIEW_TYPES } from "@/store/viewTypes";

// Regression: isValidUIState kept its own hardcoded activeView list, which was missing
// 'pivot', 'stats' and 'window-builder', so those views were rejected when restoring
// preferences from IndexedDB. The allow-list is now derived from VIEW_TYPES.
describe("isValidUIState - activeView", () => {
  // Iterates the same list ViewType is derived from, so a newly added view is covered
  // automatically and fails here if the validator ever stops accepting it.
  it.each(VIEW_TYPES)("accepts every ViewType (%s)", (view) => {
    expect(isValidUIState("activeView", view)).toBe(true);
  });

  it("rejects unknown views and non-strings", () => {
    expect(isValidUIState("activeView", "not-a-view")).toBe(false);
    expect(isValidUIState("activeView", 42)).toBe(false);
    expect(isValidUIState("activeView", null)).toBe(false);
  });
});
