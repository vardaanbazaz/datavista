import { describe, it, expect } from "vitest";
import { tokenize, compile, evaluateAST } from "../../formulaEngine";

// Regression tests for: the formula grammar had no `^` operator, despite the engine
// already having an equivalent POWER() function. `^` is parser sugar that compiles to
// the same POWER(base, exponent) FunctionCall AST shape POWER() itself produces, so
// evaluation reuses the existing POWER handler rather than duplicating the math.

describe("Formula Engine - exponentiation (^)", () => {
  it("tokenizes '^' as an OPERATOR", () => {
    const tokens = tokenize("2^3");
    expect(tokens).toEqual([
      { type: "NUMBER", value: "2", position: 0 },
      { type: "OPERATOR", value: "^", position: 1 },
      { type: "NUMBER", value: "3", position: 2 },
      { type: "EOF", value: "", position: 3 },
    ]);
  });

  it("compiles 'a^b' to the same AST shape as POWER(a, b)", () => {
    const fromOperator = compile("[Base]^[Exp]");
    const fromFunction = compile("POWER([Base], [Exp])");
    expect(fromOperator).toEqual(fromFunction);
    expect(fromOperator).toEqual({
      type: "FunctionCall",
      name: "POWER",
      args: [
        { type: "FieldReference", name: "Base" },
        { type: "FieldReference", name: "Exp" },
      ],
    });
  });

  it("evaluates a basic exponentiation", () => {
    expect(evaluateAST(compile("2^10"), {})).toBe(1024);
  });

  it("binds tighter than multiplication and division", () => {
    expect(evaluateAST(compile("2*3^2"), {})).toBe(18); // 2*(3^2) = 2*9, not (2*3)^2 = 36
    expect(evaluateAST(compile("2^3*2"), {})).toBe(16); // (2^3)*2 = 8*2, not 2^(3*2) = 64
    expect(evaluateAST(compile("8/2^2"), {})).toBe(2); // 8/(2^2) = 8/4, not (8/2)^2 = 16
  });

  it("is right-associative: 2^3^2 == 2^(3^2), not (2^3)^2", () => {
    expect(evaluateAST(compile("2^3^2"), {})).toBe(512);
    expect(evaluateAST(compile("(2^3)^2"), {})).toBe(64);
  });

  it("lets explicit parens override the default right-associative grouping", () => {
    expect(evaluateAST(compile("(2^3)^2"), {})).toBe(64);
  });

  it("binds tighter than a leading unary minus on the base (-2^2 == -(2^2))", () => {
    expect(evaluateAST(compile("-2^2"), {})).toBe(-4);
  });

  it("accepts a unary-signed exponent directly (2^-2)", () => {
    expect(evaluateAST(compile("2^-2"), {})).toBe(0.25);
  });

  it("works with field references", () => {
    expect(evaluateAST(compile("[Base]^[Exp]"), { Base: 3, Exp: 4 })).toBe(81);
  });
});
