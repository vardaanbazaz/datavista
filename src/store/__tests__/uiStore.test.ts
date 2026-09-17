import { describe, it, expect, afterEach } from "vitest";
import { useUiStore } from "../uiStore";

describe("useUiStore - hasAcknowledgedAiInsights (item 5)", () => {
  afterEach(() => {
    useUiStore.setState({ hasAcknowledgedAiInsights: false });
  });

  it("defaults to false", () => {
    // Reset first in case an earlier test in this run mutated it.
    useUiStore.setState({ hasAcknowledgedAiInsights: false });
    expect(useUiStore.getState().hasAcknowledgedAiInsights).toBe(false);
  });

  it("setHasAcknowledgedAiInsights updates state", () => {
    useUiStore.getState().setHasAcknowledgedAiInsights(true);
    expect(useUiStore.getState().hasAcknowledgedAiInsights).toBe(true);

    useUiStore.getState().setHasAcknowledgedAiInsights(false);
    expect(useUiStore.getState().hasAcknowledgedAiInsights).toBe(false);
  });
});
