import { describe, it, expect } from "vitest";
import { tokenize, compile, evaluateAST } from "../../formulaEngine";

describe("Formula Engine", () => {
  describe("Tokenizer & Parser", () => {
    it("should tokenize and parse standard math expressions ((10 + 5) * 2)", () => {
      const expr = "((10 + 5) * 2)";
      const tokens = tokenize(expr);

      expect(tokens).toEqual([
        { type: "LPAREN", value: "(", position: 0 },
        { type: "LPAREN", value: "(", position: 1 },
        { type: "NUMBER", value: "10", position: 2 },
        { type: "OPERATOR", value: "+", position: 5 },
        { type: "NUMBER", value: "5", position: 7 },
        { type: "RPAREN", value: ")", position: 8 },
        { type: "OPERATOR", value: "*", position: 10 },
        { type: "NUMBER", value: "2", position: 12 },
        { type: "RPAREN", value: ")", position: 13 },
        { type: "EOF", value: "", position: 14 },
      ]);

      const ast = compile(expr);
      expect(ast).toEqual({
        type: "BinaryExpression",
        left: {
          type: "BinaryExpression",
          left: { type: "NumberLiteral", value: 10 },
          operator: "+",
          right: { type: "NumberLiteral", value: 5 },
        },
        operator: "*",
        right: { type: "NumberLiteral", value: 2 },
      });
    });

    it("should tokenize and parse field references ([Revenue] - [Cost])", () => {
      const expr = "[Revenue] - [Cost]";
      const tokens = tokenize(expr);

      expect(tokens).toEqual([
        { type: "FIELD", value: "Revenue", position: 0 },
        { type: "OPERATOR", value: "-", position: 10 },
        { type: "FIELD", value: "Cost", position: 12 },
        { type: "EOF", value: "", position: 18 },
      ]);

      const ast = compile(expr);
      expect(ast).toEqual({
        type: "BinaryExpression",
        left: { type: "FieldReference", name: "Revenue" },
        operator: "-",
        right: { type: "FieldReference", name: "Cost" },
      });
    });
  });

  describe("Evaluation", () => {
    it("should correctly evaluate numeric math and field references", () => {
      const astMath = compile("((10 + 5) * 2)");
      expect(evaluateAST(astMath, {})).toBe(30);

      const astFields = compile("[Revenue] - [Cost]");
      expect(evaluateAST(astFields, { Revenue: 100, Cost: 40 })).toBe(60);
    });

    it("should handle missing values / nulls gracefully without crashing", () => {
      const ast = compile("[Revenue] - [Cost]");
      
      // Missing 'Cost' in row
      const resultMissing = evaluateAST(ast, { Revenue: 100 });
      expect(resultMissing).toBeNull();

      // Explicit null in row
      const resultNull = evaluateAST(ast, { Revenue: 100, Cost: null });
      expect(resultNull).toBeNull();

      // Completely empty row
      const resultEmpty = evaluateAST(ast, {});
      expect(resultEmpty).toBeNull();
    });

    it("should handle division by zero gracefully without crashing", () => {
      const astDivZero = compile("10 / 0");
      expect(evaluateAST(astDivZero, {})).toBeNull();

      const astDivZeroFields = compile("[Revenue] / [Units]");
      expect(evaluateAST(astDivZeroFields, { Revenue: 500, Units: 0 })).toBeNull();
    });

    it("should bind NOT to the full comparison, not just its operand", () => {
      // NOT [Status] == "Closed"  ->  NOT([Status] == "Closed")
      const ast = compile('NOT [Status] == "Closed"');
      expect(ast).toEqual({
        type: "UnaryExpression",
        operator: "NOT",
        argument: {
          type: "BinaryExpression",
          left: { type: "FieldReference", name: "Status" },
          operator: "==",
          right: { type: "StringLiteral", value: "Closed" },
        },
      });

      expect(evaluateAST(ast, { Status: "Closed" })).toBe(false);
      expect(evaluateAST(ast, { Status: "Open" })).toBe(true);
    });

    it("should bind NOT tighter than AND/OR in a nested expression", () => {
      // NOT [A] AND [B]  ->  (NOT [A]) AND [B]
      const ast = compile("NOT [A] AND [B]");
      expect(ast).toEqual({
        type: "BinaryExpression",
        left: {
          type: "UnaryExpression",
          operator: "NOT",
          argument: { type: "FieldReference", name: "A" },
        },
        operator: "AND",
        right: { type: "FieldReference", name: "B" },
      });

      expect(evaluateAST(ast, { A: false, B: true })).toBe(true);
      expect(evaluateAST(ast, { A: true, B: true })).toBe(false);
    });

    it("should reject chained comparisons as a parse error instead of silently coercing", () => {
      expect(() => compile("5 < 3 < 1")).toThrow(/[Cc]hained comparison/);
      expect(() => compile('1 == 1 == 1')).toThrow(/[Cc]hained comparison/);
      expect(() => compile("0 <= [X] < 100")).toThrow(/[Cc]hained comparison/);
      // mixed comparison/equality chaining is the same nonsense, also rejected
      expect(() => compile("[A] < [B] == [C]")).toThrow(/[Cc]hained comparison/);
    });

    it("should still allow a single comparison or equality", () => {
      expect(compile("[Age] > 18")).toEqual({
        type: "BinaryExpression",
        left: { type: "FieldReference", name: "Age" },
        operator: ">",
        right: { type: "NumberLiteral", value: 18 },
      });

      const ast = compile('[Age] > 18');
      expect(evaluateAST(ast, { Age: 25 })).toBe(true);
      expect(evaluateAST(ast, { Age: 10 })).toBe(false);
    });

    it("should still allow multiple comparisons combined via explicit AND/OR", () => {
      const ast = compile("[Age] > 18 AND [Age] < 65");
      expect(ast).toEqual({
        type: "BinaryExpression",
        left: {
          type: "BinaryExpression",
          left: { type: "FieldReference", name: "Age" },
          operator: ">",
          right: { type: "NumberLiteral", value: 18 },
        },
        operator: "AND",
        right: {
          type: "BinaryExpression",
          left: { type: "FieldReference", name: "Age" },
          operator: "<",
          right: { type: "NumberLiteral", value: 65 },
        },
      });

      expect(evaluateAST(ast, { Age: 30 })).toBe(true);
      expect(evaluateAST(ast, { Age: 70 })).toBe(false);
      expect(evaluateAST(ast, { Age: 5 })).toBe(false);

      const orAst = compile('[Status] == "Open" OR [Status] == "Pending"');
      expect(evaluateAST(orAst, { Status: "Open" })).toBe(true);
      expect(evaluateAST(orAst, { Status: "Closed" })).toBe(false);
    });

    it("should coerce numeric-looking strings for == and != (CSV-parsed values)", () => {
      const eq = compile("[Age] == 25");
      // CSV parsing often leaves numeric columns as strings
      expect(evaluateAST(eq, { Age: "25" })).toBe(true);
      expect(evaluateAST(eq, { Age: 25 })).toBe(true);
      expect(evaluateAST(eq, { Age: "30" })).toBe(false);
      // leading-zero numeric strings still compare numerically
      expect(evaluateAST(eq, { Age: "025" })).toBe(true);

      const neq = compile("[Age] != 25");
      expect(evaluateAST(neq, { Age: "25" })).toBe(false);
      expect(evaluateAST(neq, { Age: "30" })).toBe(true);

      // non-numeric strings never get coerced into a NaN comparison
      const strEq = compile('[Status] == "Closed"');
      expect(evaluateAST(strEq, { Status: "Closed" })).toBe(true);
      expect(evaluateAST(strEq, { Status: "Open" })).toBe(false);
      expect(evaluateAST(compile("[Status] == 5"), { Status: "abc" })).toBe(false);
    });

    it("should not falsely coerce blank strings, null, or booleans in == comparisons", () => {
      const eqZero = compile("[X] == 0");
      // blank/whitespace-only strings are not "numeric-looking" - stay unequal to 0
      expect(evaluateAST(eqZero, { X: "" })).toBe(false);
      expect(evaluateAST(eqZero, { X: " " })).toBe(false);
      // null short-circuits to null (propagates) before == ever runs, same as every
      // other binary operator - it does not settle to false
      expect(evaluateAST(eqZero, { X: null })).toBeNull();
      expect(evaluateAST(eqZero, { X: 0 })).toBe(true);

      // booleans are not numeric-like either, so true/false never coerce to 1/0
      expect(evaluateAST(compile("[Y] == 1"), { Y: true })).toBe(false);
      expect(evaluateAST(compile("[Y] == 0"), { Y: false })).toBe(false);
    });
  });
});
