import { describe, it, expect, afterEach, vi } from "vitest";
import type { Dataset } from "@/shared/types";
import { aiEngine } from "../aiEngine";
import { useAiSettingsStore } from "../settings/aiSettingsStore";
import { requestOptions } from "../aiRequests";
import { createChatClient } from "../client";
import { getProvider } from "../providers/registry";

function makeDataset(): Dataset {
  return {
    id: "ds1",
    name: "Orders",
    data: Array.from({ length: 30 }, (_, i) => ({ Email: `buyer${i}@shop.example`, Region: i % 2 ? "North" : "South", Sales: 100 + i })),
    columns: ["Email", "Region", "Sales"],
    columnTypes: { Email: "categorical", Region: "categorical", Sales: "numeric" },
  };
}

const QUERY_JSON = JSON.stringify({
  type: "query",
  query: { groupBy: { column: "Region" }, aggregations: [{ column: "Sales", operator: "sum", alias: "Total Sales" }] },
  chartType: "bar",
  title: "Sales by region",
});

function answerFor(providerId: string, text: string): unknown {
  if (providerId === "anthropic") return { content: [{ type: "text", text }] };
  if (providerId === "gemini") return { candidates: [{ content: { parts: [{ text }] } }] };
  return { choices: [{ message: { content: text } }] };
}

/** Stubs fetch with the provider's answer shape and records each request body. */
function stubProvider(providerId: string, text: string) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(answerFor(providerId, text)), { status: 200 });
    })
  );
  return bodies;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useAiSettingsStore.setState({ providerId: "gemini", keys: {}, models: {} });
});

describe("AI query through a connected provider", () => {
  it("builds the context through the privacy builder, calls the client and parses a prose-wrapped answer", async () => {
    useAiSettingsStore.setState({ providerId: "openai", keys: { openai: "sk-k" }, privacy: { level: "samples", sampleRows: 20, unmasked: [] } });
    const bodies = stubProvider("openai", `Here you go:\n${QUERY_JSON}\nHope that helps.`);

    const { response, queryResult } = await aiEngine.generateAIQueryPreview("sales by region", makeDataset());

    expect(response.title).toBe("Sales by region");
    expect(queryResult.rows.length).toBe(2);
    expect(bodies).toHaveLength(1);
    const sent = JSON.stringify(bodies[0]);
    expect(sent).toContain("[masked email]");
    expect(sent).not.toContain("@shop.example");
    expect(bodies[0]).toMatchObject({ model: "gpt-4o-mini", response_format: { type: "json_object" } });
  });
});

describe("Test connection sends what the features send", () => {
  for (const id of ["openai", "anthropic", "gemini", "ollama"]) {
    it(`${id}: same request options as a query`, async () => {
      const provider = getProvider(id);
      useAiSettingsStore.setState({ providerId: id, keys: { [id]: "k" } });
      const bodies = stubProvider(id, QUERY_JSON);

      await createChatClient({ provider, baseUrl: provider.baseUrl, apiKey: "k" }).testConnection(requestOptions("query", "m", provider.apiStyle));
      await aiEngine.generateAIQueryPreview("sales by region", makeDataset());

      const strip = (b: Record<string, unknown>) => {
        const { messages: _m, contents: _c, system: _s, systemInstruction: _si, model: _model, ...rest } = b;
        return rest;
      };
      expect(bodies).toHaveLength(2);
      expect(strip(bodies[0])).toEqual(strip(bodies[1]));
    });
  }

  it("openai-compatible requests carry no temperature or max_tokens (reasoning models reject them)", () => {
    expect(requestOptions("query", "m", "openai-compatible")).toEqual({ model: "m", json: true });
    expect(requestOptions("summary", "m", "openai-compatible")).toEqual({ model: "m", json: false });
  });
});
