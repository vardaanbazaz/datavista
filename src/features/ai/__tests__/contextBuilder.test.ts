import { describe, it, expect, afterEach } from "vitest";
import type { Dataset, DataRow } from "@/shared/types";
import { buildAiContext, sampleRowIndices, detectPersonalColumns, renderAiContext, valueForAi, SAMPLE_ROWS_MAX, SAMPLE_ROWS_MIN, type PrivacySettings } from "../privacy/contextBuilder";
import { detectPii, looksLikePhone } from "../privacy/pii";
import { buildSummaryMessages, buildQueryMessages } from "../aiRequests";
import { useAiSettingsStore } from "../settings/aiSettingsStore";
import type { DetectedAnomaly } from "../anomalyDetector";

const FIRST = ["Asha", "Ravi", "Meera", "John", "Priya", "Karan", "Sara", "Vikram", "Nina", "Arjun"];
const LAST = ["Rao", "Sharma", "Iyer", "Smith", "Das", "Mehta", "Khan", "Singh", "Patel", "Gupta"];

function makeDataset(n = 300): Dataset {
  const data: DataRow[] = Array.from({ length: n }, (_, i) => ({
    Contact: `user${i}@example.com`,
    Who: `${FIRST[i % 10]} ${LAST[Math.floor(i / 10) % 10]}${i >= 100 ? `-${LAST[i % 7]}` : ""}`,
    Mobile: `+91 98${String(10000000 + i).slice(0, 8)}`,
    Region: ["North", "South", "East"][i % 3],
    Revenue: 1000000000 + i * 7,
    OrderId: 9876543210 + i,
    Date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  return {
    id: "d1",
    name: "customers",
    data,
    columns: ["Contact", "Who", "Mobile", "Region", "Revenue", "OrderId", "Date"],
    columnTypes: { Contact: "categorical", Who: "categorical", Mobile: "categorical", Region: "categorical", Revenue: "numeric", OrderId: "numeric", Date: "date" },
  };
}

const settings = (level: PrivacySettings["level"], extra: Partial<PrivacySettings> = {}): PrivacySettings => ({ level, sampleRows: 50, unmasked: [], ...extra });

afterEach(() => {
  useAiSettingsStore.setState({ privacy: settings("summaries") });
});

describe("personal-data detection", () => {
  it("flags emails, phones and person names by value; numeric and date columns never by value", () => {
    const found = detectPersonalColumns(makeDataset());
    expect(Object.fromEntries(found)).toEqual({ Contact: "email", Who: "name", Mobile: "phone" });
  });

  it("flags by column name", () => {
    expect(detectPii("Email Address", "categorical", [])).toBe("email");
    expect(detectPii("phone_no", "numeric", [123])).toBe("phone");
    expect(detectPii("Customer Name", "categorical", [])).toBe("name");
    expect(detectPii("First Name", "categorical", [])).toBe("name");
  });

  it("does not flag product/app names, revenue or ID columns", () => {
    expect(detectPii("Product Name", "categorical", ["Coffee Maker Deluxe 3000"])).toBeNull();
    expect(detectPii("App", "categorical", ["Photo Editor & Candy Camera", "Coloring book moana"])).toBeNull();
    expect(detectPii("Revenue", "numeric", [9876543210, 9123456789])).toBeNull();
    // Digits-only text IDs (not a 10-digit mobile) are not phones.
    expect(detectPii("Ref", "categorical", ["12345678", "23456789", "34567890"])).toBeNull();
    expect(looksLikePhone("2024-01-15")).toBe(false);
    expect(looksLikePhone("+1 (555) 123-4567")).toBe(true);
  });
});

describe("buildAiContext levels", () => {
  it("schema: names and types only, no stats, values or rows", () => {
    const ctx = buildAiContext(makeDataset(), settings("schema"));
    expect(ctx.columns.find((c) => c.name === "Revenue")).toEqual({ name: "Revenue", type: "numeric" });
    expect(ctx.columns.find((c) => c.name === "Contact")).toEqual({ name: "Contact", type: "categorical", personalData: "email", masked: true });
    expect(ctx.sampleRows).toBeUndefined();
    expect(renderAiContext(ctx)).not.toContain("example.com");
    expect(renderAiContext(ctx)).not.toContain("North");
  });

  it("summaries: numeric stats and top values, personal-data values masked", () => {
    const ctx = buildAiContext(makeDataset(), settings("summaries"));
    const revenue = ctx.columns.find((c) => c.name === "Revenue")!;
    expect(revenue.stats).toMatchObject({ min: 1000000000, max: 1000000000 + 299 * 7 });
    const region = ctx.columns.find((c) => c.name === "Region")!;
    expect(region.topValues).toEqual([
      { value: "North", count: 100 },
      { value: "South", count: 100 },
      { value: "East", count: 100 },
    ]);
    const contact = ctx.columns.find((c) => c.name === "Contact")!;
    expect(contact.topValues!.every((t) => t.value === "[masked email]")).toBe(true);
    const text = renderAiContext(ctx);
    expect(text).not.toMatch(/@example\.com/);
    expect(text).not.toContain("Asha Rao");
    expect(text).not.toContain("+91");
    expect(ctx.sampleRows).toBeUndefined();
  });

  it("samples: N rows, masked cells, N clamped to 20-200", () => {
    const ctx = buildAiContext(makeDataset(), settings("samples", { sampleRows: 30 }));
    expect(ctx.sampleRows).toHaveLength(30);
    expect(ctx.sampleRows![0]).toMatchObject({ Contact: "[masked email]", Who: "[masked name]", Mobile: "[masked phone]" });
    expect(buildAiContext(makeDataset(), settings("samples", { sampleRows: 5000 })).sampleRows).toHaveLength(SAMPLE_ROWS_MAX);
    expect(buildAiContext(makeDataset(), settings("samples", { sampleRows: 1 })).sampleRows).toHaveLength(SAMPLE_ROWS_MIN);
    expect(buildAiContext(makeDataset(25), settings("samples", { sampleRows: 200 })).sampleRows).toHaveLength(25);
  });

  it("samples: a seeded random sample, the same rows for the same dataset, not the first N", () => {
    const a = buildAiContext(makeDataset(), settings("samples", { sampleRows: 30 }));
    const b = buildAiContext(makeDataset(), settings("samples", { sampleRows: 30 }));
    expect(a.sampleRows).toEqual(b.sampleRows);
    const revenues = a.sampleRows!.map((r) => r.Revenue as number);
    // Not simply the first 30 rows, and spread over the dataset, in row order.
    expect(revenues).not.toEqual(Array.from({ length: 30 }, (_, i) => 1000000000 + i * 7));
    expect(Math.max(...revenues)).toBeGreaterThan(1000000000 + 150 * 7);
    expect([...revenues].sort((x, y) => x - y)).toEqual(revenues);
    // Another dataset id: another sample.
    const other = buildAiContext({ ...makeDataset(), id: "d2" }, settings("samples", { sampleRows: 30 }));
    expect(other.sampleRows).not.toEqual(a.sampleRows);
  });

  it("sampleRowIndices: distinct, in range, deterministic per seed", () => {
    const idx = sampleRowIndices(1_000_000, 200, "big");
    expect(new Set(idx).size).toBe(200);
    expect(idx.every((i) => i >= 0 && i < 1_000_000)).toBe(true);
    expect(sampleRowIndices(1_000_000, 200, "big")).toEqual(idx);
    expect(sampleRowIndices(10, 50, "x")).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sampleRowIndices(0, 20, "x")).toEqual([]);
  });

  it("queries level: the same context as summaries, no rows", () => {
    const q = buildAiContext(makeDataset(), settings("queries"));
    const s = buildAiContext(makeDataset(), settings("summaries"));
    expect(q.level).toBe("queries");
    expect({ ...q, level: "x" }).toEqual({ ...s, level: "x" });
    expect(q.sampleRows).toBeUndefined();
  });

  it("an unmasked column is sent as-is", () => {
    const ctx = buildAiContext(makeDataset(), settings("samples", { sampleRows: 20, unmasked: ["Contact"] }));
    expect(ctx.sampleRows![0].Contact).toMatch(/^user\d+@example\.com$/);
    expect(ctx.sampleRows![0].Who).toBe("[masked name]");
  });

  it("valueForAi: masked columns give the token, schema level gives nothing", () => {
    const ds = makeDataset();
    expect(valueForAi(buildAiContext(ds, settings("summaries")), "Who", "Asha Rao")).toBe("[masked name]");
    expect(valueForAi(buildAiContext(ds, settings("summaries")), "Region", "North")).toBe("North");
    expect(valueForAi(buildAiContext(ds, settings("schema")), "Region", "North")).toBeNull();
  });
});

describe("every AI request goes through the builder", () => {
  it("query messages carry the builder's context, not raw rows", async () => {
    useAiSettingsStore.setState({ privacy: settings("samples", { sampleRows: 20 }) });
    const [, user] = await buildQueryMessages("top regions", makeDataset(), "query");
    expect(user.content).toContain('"level":"samples"');
    expect(user.content).toContain("[masked email]");
    expect(user.content).not.toContain("user0@example.com");
  });

  it("summary messages mask filter values and unusual values of personal-data columns", async () => {
    useAiSettingsStore.setState({ privacy: settings("summaries") });
    const anomaly: DetectedAnomaly = {
      id: "a",
      columnName: "Revenue",
      dimensionColumn: "Who",
      dimensionKey: "Asha Rao",
      value: 5,
      score: 4,
      type: "spike",
      severity: "high",
      description: "Revenue for Who = Asha Rao is unusually high.",
    };
    const [, user] = await buildSummaryMessages(makeDataset(), [], { categoricalFilters: { Who: ["Asha Rao"], Region: ["North"] } } as never, [anomaly]);
    expect(user.content).not.toContain("Asha Rao");
    expect(user.content).toContain("[masked name]");
    expect(user.content).toContain("Region: [North]");
  });

  it("summary at schema level leaves unusual values and filter values out", async () => {
    useAiSettingsStore.setState({ privacy: settings("schema") });
    const [, user] = await buildSummaryMessages(makeDataset(), [], { categoricalFilters: { Region: ["North"] } } as never, []);
    expect(user.content).not.toContain("North");
    expect(user.content).toContain("Region (filtered)");
    expect(user.content).toContain("Not shared");
  });
});
