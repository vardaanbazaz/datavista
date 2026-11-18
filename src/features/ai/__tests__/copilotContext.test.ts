import { describe, it, expect } from "vitest";
import type { Dataset } from "@/shared/types";
import { buildCopilotMessages, describeFilters, starterQuestions } from "../copilot/context";
import { parseMarkdown } from "../copilot/markdownParse";
import { clampCopilotWidth } from "../copilot/copilotStore";
import { buildAiContext } from "../privacy/contextBuilder";
import { contextSends, privacyLevelSends } from "../privacy/levels";

function ds(): Dataset {
  const data = Array.from({ length: 12 }, (_, i) => ({
    "Customer Name": `Asha Rao${i}`,
    Category: ["GAME", "FAMILY"][i % 2],
    Rating: i % 5,
    Updated: `2024-0${(i % 9) + 1}-01`,
  }));
  return {
    id: "ctx",
    name: "apps",
    data,
    columns: ["Customer Name", "Category", "Rating", "Updated"],
    columnTypes: { "Customer Name": "categorical", Category: "categorical", Rating: "numeric", Updated: "date" },
  };
}
const privacy = { level: "queries" as const, sampleRows: 50, unmasked: [] };

describe("copilot context", () => {
  it("starter questions come from the dataset's columns", () => {
    expect(starterQuestions(ds())).toEqual([
      "What is the average Rating by Category?",
      "Which Category values are most common?",
      "How does Rating change over time by month?",
      "Summarise Rating: range, average and any outliers.",
    ]);
    const empty: Dataset = { id: "e", name: "e", data: [], columns: [], columnTypes: {} };
    expect(starterQuestions(empty)).toEqual(["What does this dataset contain?"]);
  });

  it("sends the view, active filters (personal data masked) and privacy level with the context", () => {
    const filters = { categoricalFilters: { Category: ["GAME"], "Customer Name": ["Asha Rao1"] }, dateRangeFilters: {} };
    const msgs = buildCopilotMessages({ dataset: ds(), view: "Data Explorer", filters, filteredRowCount: 1, privacy }, [{ role: "user", content: "hi" }], { tools: true, rowsTool: false });
    expect(msgs).toHaveLength(2);
    const sys = msgs[0].content;
    expect(sys).toContain('privacy level "queries"');
    expect(sys).toContain('The user is on the "Data Explorer" view.');
    expect(sys).toContain("Category in [GAME]");
    expect(sys).toContain("Customer Name in [[masked name]]");
    expect(sys).not.toContain("Asha Rao1");
    expect(sys).toMatch(/FULL dataset/);
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
  });

  it("describes date and text-search filters", () => {
    const ctx = buildAiContext(ds(), privacy);
    expect(describeFilters({ categoricalFilters: {}, dateRangeFilters: { Updated: { start: new Date(2024, 0, 5) } }, textSearchFilters: { Category: "GA" } }, ctx)).toEqual([
      "Updated between 2024-01-05 and …",
      'Category contains "GA"',
    ]);
  });

  it("wording per level (item 6): the palette names what the context carries", () => {
    expect(contextSends("queries")).toBe("column names, types and summaries");
    expect(contextSends("samples")).toBe("column summaries and a sample of rows");
    expect(privacyLevelSends("queries")).toMatch(/results of queries/);
  });
});

describe("copilot markdown and width", () => {
  it("parses lists, headings, code and tables", () => {
    const blocks = parseMarkdown("# Top\n\nText **bold** here\n- a\n- b\n\n1. one\n2. two\n\n| Cat | Avg |\n|---|---:|\n| GAME | 4.2 |\n\n```\nx = 1\n```");
    expect(blocks.map((b) => b.kind)).toEqual(["h", "p", "ul", "ol", "table", "code"]);
    expect(blocks[4]).toEqual({ kind: "table", head: ["Cat", "Avg"], rows: [["GAME", "4.2"]] });
  });

  it("width is clamped to 320-560", () => {
    expect(clampCopilotWidth(100)).toBe(320);
    expect(clampCopilotWidth(900)).toBe(560);
    expect(clampCopilotWidth(Number.NaN)).toBe(400);
  });
});
