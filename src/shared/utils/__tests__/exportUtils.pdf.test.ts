import { describe, it, expect, vi } from "vitest";
import { getDocument, OPS, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { processRawData } from "@/shared/services/parsingService";
import type { ChartConfig } from "@/shared/types";
import { buildPDFReport, type ChartImage } from "../exportUtils";

// 1×1 PNG; the report scales it to the 2:1 size below (170 × 85 mm).
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const image: ChartImage = { dataUrl: PNG, width: 400, height: 200 };

const chart = (id: string, title: string): ChartConfig => ({ id, type: "bar", title, xAxis: "Region", yAxis: "Sales", datasetId: "d" });

async function parse(bytes: ArrayBuffer) {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: VerbosityLevel.ERRORS }).promise;
  const pages: { text: string; images: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const ops = await page.getOperatorList();
    pages.push({
      text: content.items.map((item) => ("str" in item ? item.str : "")).join("\n"),
      images: ops.fnArray.filter((fn) => fn === OPS.paintImageXObject).length,
    });
  }
  return pages;
}

describe("buildPDFReport", () => {
  it("writes a valid PDF with the summary, chart titles and chart images", async () => {
    const ds = processRawData(
      [
        { Region: "North", Sales: 10, StoreID: 7, Units: 1 },
        { Region: "South", Sales: 30, StoreID: 8, Units: 1 },
        { Region: "East", Sales: 20, StoreID: 8, Units: 1 },
      ],
      "sales.csv",
    );
    const charts = [chart("c1", "Sales by Region"), chart("c2", "Second Chart")];

    const pdf = await buildPDFReport(ds, ds.data, charts, async () => image);
    const bytes = pdf.output("arraybuffer");

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pages = await parse(bytes);
    // The second image doesn't fit under the first, so it moves to page 2.
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.images)).toEqual([1, 1]);
    const page1 = pages[0].text;
    expect(page1).toContain("DataVista Report");
    expect(page1).toContain(`Dataset: ${ds.name}`);
    expect(page1).toContain("Total Records: 3");
    expect(page1).toContain("Filtered Records: 3");
    expect(page1).toContain("Sales: Min=10.00, Max=30.00, Avg=20.00");
    // ID columns: no average; constant columns: one line.
    expect(page1).toContain("StoreID (ID): Count=3, Distinct=2, Min=7, Max=8");
    expect(page1).toContain("Units: constant: 1");
    expect(page1).toContain("Sales by Region");
    expect(page1).toContain("Second Chart");
  });

  it("notes a chart whose capture fails and keeps going", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ds = processRawData([{ Region: "North", Sales: 1 }], "one.csv");
    const pdf = await buildPDFReport(ds, ds.data, [chart("c1", "Broken")], async () => {
      throw new Error("no canvas");
    });
    const pages = await parse(pdf.output("arraybuffer"));
    expect(pages).toHaveLength(1);
    expect(pages[0].images).toBe(0);
    expect(pages[0].text).toContain("Chart image could not be captured");
  });
});
