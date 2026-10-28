import { describe, it, expect } from "vitest";
import { parseCsvText } from "../csvParse";
import { normalizeHeaders, processRawData } from "../parsingService";

// Reference outputs below were produced with pandas 3.1.0 (scripts/golden/requirements.txt):
//   pd.DataFrame({"a": [1, 2], "b": ["x", "y"], "c": [3.5, None]}).to_csv()
//   list(pd.read_csv(io.StringIO(header + "\n" + row)).columns)
const PANDAS_TO_CSV = ",a,b,c\n0,1,x,3.5\n1,2,y,\n";

const PANDAS_HEADER_CASES: [string[], string[]][] = [
  [["Name", "Age", "Name", "Name.1", "", ""], ["Name", "Age", "Name.2", "Name.1", "Unnamed: 4", "Unnamed: 5"]],
  [["a", "a", "a"], ["a", "a.1", "a.2"]],
  [["a", "a", "a.1", "a"], ["a", "a.2", "a.1", "a.3"]],
  [["a", "a.1", "a", "a"], ["a", "a.1", "a.2", "a.3"]],
  [["a.1", "a", "a"], ["a.1", "a", "a.2"]],
  [["", "a", ""], ["Unnamed: 0", "a", "Unnamed: 2"]],
  [["x", "", "x", ""], ["x", "Unnamed: 1", "x.1", "Unnamed: 3"]],
  [["a", "a", "a.1", "a.1"], ["a", "a.2", "a.1", "a.1.1"]],
];

describe("normalizeHeaders matches pandas read_csv", () => {
  for (const [input, expected] of PANDAS_HEADER_CASES) {
    it(JSON.stringify(input), () => {
      expect(normalizeHeaders(input)).toEqual(expected);
    });
  }

  it("leaves unique names unchanged (idempotent)", () => {
    const once = normalizeHeaders(["Name", "", "Name"]);
    expect(normalizeHeaders(once)).toEqual(once);
  });
});

describe("blank and duplicate headers don't shift columns", () => {
  it("pandas df.to_csv() output: blank first header + index column", () => {
    const ds = processRawData(parseCsvText(PANDAS_TO_CSV).rows, "to_csv.csv");
    expect(ds.columns).toEqual(["Unnamed: 0", "a", "b", "c"]);
    expect(ds.data).toEqual([
      { "Unnamed: 0": 0, a: 1, b: "x", c: 3.5 },
      { "Unnamed: 0": 1, a: 2, b: "y", c: null },
    ]);
  });

  it("two identical header names keep their own values", () => {
    const ds = processRawData(parseCsvText("Name,Age,Name\nAnn,30,Bo\nCy,41,Di\n").rows, "dup.csv");
    expect(ds.columns).toEqual(["Name", "Age", "Name.1"]);
    expect(ds.data[0]).toEqual({ Name: "Ann", Age: 30, "Name.1": "Bo" });
    expect(ds.data[1]).toEqual({ Name: "Cy", Age: 41, "Name.1": "Di" });
  });

  it("processRawData alone also keeps alignment for records keyed by a blank header", () => {
    const ds = processRawData([{ "": 1, a: 2, b: 3 }], "keys.csv");
    expect(ds.columns).toEqual(["Unnamed: 0", "a", "b"]);
    expect(ds.data[0]).toEqual({ "Unnamed: 0": 1, a: 2, b: 3 });
  });

  it("strips a UTF-8 BOM from the first header", () => {
    const ds = processRawData(parseCsvText("\uFEFFAge,Name\n30,Ann\n").rows, "bom.csv");
    expect(ds.columns).toEqual(["Age", "Name"]);
  });

  it("reports short and long rows; a short row's missing cells are null", () => {
    const parsed = parseCsvText("a,b,c\n1,2\n3,4,5,6\n");
    expect(parsed.errors.map(e => [e.code, e.row])).toEqual([["TooFewFields", 0], ["TooManyFields", 1]]);
    const ds = processRawData(parsed.rows, "short.csv");
    expect(ds.data).toEqual([{ a: 1, b: 2, c: null }, { a: 3, b: 4, c: 5 }]);
  });
});

describe("non-breaking spaces survive cleaning", () => {
  it("keeps a trailing NBSP inside a value and trims only ASCII whitespace", () => {
    const ds = processRawData(parseCsvText('title,n\n"Consequences\u00a0",1\n"  Inner\u00a0Space  ",2\n').rows, "nbsp.csv");
    expect(ds.data[0].title).toBe("Consequences\u00a0");
    expect(ds.data[1].title).toBe("Inner\u00a0Space");
  });
});

describe("strict number parsing at ingest", () => {
  it("keeps hex, Infinity and NaN as text; accepts exponents", () => {
    const ds = processRawData(
      parseCsvText("v\n1\n2\n3\n4\n5\n6\n7\n8\n1e3\n0x1A\nInfinity\nNaN\n").rows,
      "strict.csv"
    );
    const v = ds.data.map(r => r.v);
    expect(v.slice(0, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1000]);
    expect(v.slice(9)).toEqual(["0x1A", "Infinity", "NaN"]);
  });
});
