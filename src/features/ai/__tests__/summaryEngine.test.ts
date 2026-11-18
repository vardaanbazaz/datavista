import { describe, it, expect, vi, afterEach } from "vitest";
import { Dataset } from "@/shared/types";

vi.mock("../aiRequests", () => ({
  runChat: vi.fn(),
  buildSummaryMessages: vi.fn(async () => []),
}));

import { summaryEngine } from "../summaryEngine";
import { runChat as callLLM } from "../aiRequests";
import { useAiSettingsStore } from "../settings/aiSettingsStore";

const makeDataset = (): Dataset => ({
  id: "ds1",
  name: "test",
  data: [{ a: 1 }, { a: 2 }],
  columns: ["a"],
  columnTypes: { a: "numeric" },
});

describe("summaryEngine.generateExecutiveSummary - result source tagging (item 5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAiSettingsStore.setState({ providerId: "gemini", keys: {} });
  });

  it("tags the result 'offline' when no API key is configured", async () => {
    useAiSettingsStore.setState({ keys: {} });

    const result = await summaryEngine.generateExecutiveSummary(makeDataset(), [], []);

    expect(result.source).toBe("offline");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("tags the result 'ai' when a key is configured and the LLM call succeeds", async () => {
    useAiSettingsStore.setState({ providerId: "gemini", keys: { gemini: "test-key" } });
    vi.mocked(callLLM).mockResolvedValue("Everything looks fine.");

    const result = await summaryEngine.generateExecutiveSummary(makeDataset(), [], []);

    expect(result.source).toBe("ai");
    expect(callLLM).toHaveBeenCalledTimes(1);
  });

  it("a failed LLM call is never replaced silently by the offline summary: 'error' with the typed message", async () => {
    useAiSettingsStore.setState({ providerId: "gemini", keys: { gemini: "test-key" } });
    vi.mocked(callLLM).mockRejectedValue(new Error("The provider did not answer within 90 s. It may be slow or unreachable; try again."));

    const result = await summaryEngine.generateExecutiveSummary(makeDataset(), [], []);

    expect(result.source).toBe("error");
    expect(result.summary).toBe("");
    expect(result.error).toMatch(/did not answer within 90 s/);
  });

  it("the offline summary on request (the 'Use offline summary' button) makes no call", async () => {
    useAiSettingsStore.setState({ providerId: "gemini", keys: { gemini: "test-key" } });
    vi.mocked(callLLM).mockClear();

    const result = await summaryEngine.generateExecutiveSummary(makeDataset(), [], [], undefined, { offline: true });

    expect(result.source).toBe("offline");
    expect(result.summary).not.toBe("");
    expect(callLLM).not.toHaveBeenCalled();
  });

  it("tags 'offline' when there is no active dataset (no call attempted)", async () => {
    useAiSettingsStore.setState({ keys: { gemini: "test-key" } });

    const result = await summaryEngine.generateExecutiveSummary(null, [], []);

    expect(result.source).toBe("offline");
    expect(callLLM).not.toHaveBeenCalled();
  });
});
