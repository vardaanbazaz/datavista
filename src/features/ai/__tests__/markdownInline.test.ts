import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, type Inline } from "../copilot/markdownParse";

/** Inline Markdown of copilot answers (markdownParse.ts:parseInline), CommonMark's intraword rule for "_". */

const text = (t: string): Inline => ({ kind: "text", text: t });
const em = (...children: Inline[]): Inline => ({ kind: "em", children });
const strong = (...children: Inline[]): Inline => ({ kind: "strong", children });

describe("parseInline: underscores inside words are literal", () => {
  it("ART_AND_DESIGN stays one word, no italics", () => {
    expect(parseInline("ART_AND_DESIGN")).toEqual([text("ART_AND_DESIGN")]);
    expect(parseInline("Top: ART_AND_DESIGN and AUTO_AND_VEHICLES.")).toEqual([text("Top: ART_AND_DESIGN and AUTO_AND_VEHICLES.")]);
  });

  it("snake_case, foo__bar__ and a trailing underscore stay literal", () => {
    expect(parseInline("avg_Rating by snake_case_name")).toEqual([text("avg_Rating by snake_case_name")]);
    expect(parseInline("foo__bar__")).toEqual([text("foo__bar__")]);
    expect(parseInline("x_ y_")).toEqual([text("x_ y_")]);
  });

  it("inside bold and in a table cell", () => {
    expect(parseInline("**ART_AND_DESIGN** leads")).toEqual([strong(text("ART_AND_DESIGN")), text(" leads")]);
    const [table] = parseMarkdown("| Category | Avg |\n|---|---|\n| ART_AND_DESIGN | 4.36 |");
    expect(table).toEqual({ kind: "table", head: ["Category", "Avg"], rows: [["ART_AND_DESIGN", "4.36"]] });
    expect(parseInline((table as { rows: string[][] }).rows[0][0])).toEqual([text("ART_AND_DESIGN")]);
  });

  it("_emphasis_ and __strong__ at word boundaries still work", () => {
    expect(parseInline("an _italic_ word")).toEqual([text("an "), em(text("italic")), text(" word")]);
    expect(parseInline("__init__")).toEqual([strong(text("init"))]);
    expect(parseInline("(_note_)")).toEqual([text("("), em(text("note")), text(")")]);
  });
});

describe("parseInline: asterisks", () => {
  it("*emphasis* and **bold** work, also inside a word (CommonMark allows intraword *)", () => {
    expect(parseInline("a *b* c")).toEqual([text("a "), em(text("b")), text(" c")]);
    expect(parseInline("**4.36** average")).toEqual([strong(text("4.36")), text(" average")]);
    expect(parseInline("a*b*c")).toEqual([text("a"), em(text("b")), text("c")]);
  });

  it("nested and unmatched delimiters", () => {
    expect(parseInline("**bold *and* italic**")).toEqual([strong(text("bold "), em(text("and")), text(" italic"))]);
    expect(parseInline("2 * 3 = 6")).toEqual([text("2 * 3 = 6")]);
    expect(parseInline("**open")).toEqual([text("**open")]);
  });

  it("code spans are literal and links become their text", () => {
    expect(parseInline("`a_b*c*` and [docs](https://example.com)")).toEqual([{ kind: "code", text: "a_b*c*" }, text(" and docs")]);
  });
});
