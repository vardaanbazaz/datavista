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
  });
});
