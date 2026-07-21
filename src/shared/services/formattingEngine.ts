import { compile, evaluateAST, ASTNode } from "./formulaEngine";
import { ConditionalFormatRule, FormattingStyle } from "../types/formatting";

export interface CompiledFormatRule {
  rule: ConditionalFormatRule;
  ast: ASTNode | null;
}

export class FormattingEngine {
  /**
   * Pre-compiles condition expressions into AST nodes.
   * Call this ONCE per render cycle or batch prior to iterating over rows or visual elements.
   */
  compileRules(rules: ConditionalFormatRule[]): CompiledFormatRule[] {
    if (!rules || rules.length === 0) return [];
    
    return rules.map((rule) => {
      if (!rule.conditionExpression || !rule.conditionExpression.trim()) {
        return { rule, ast: null };
      }
      try {
        const ast = compile(rule.conditionExpression.trim());
        return { rule, ast };
      } catch (err) {
        console.warn(`[FormattingEngine] Failed to compile condition "${rule.conditionExpression}":`, err);
        return { rule, ast: null };
      }
    });
  }

  /**
   * Evaluates pre-compiled rules against a single data row or aggregated chart point.
   * Returns the merged style object for the first matching rule, or null if no condition matches.
   * If `currentColumn` is provided, rules with `targetColumn` set will only match if `targetColumn` matches `currentColumn`.
   */
  evaluateCompiledRules(
    compiledRules: CompiledFormatRule[],
    row: Record<string, unknown>,
    currentColumn?: string
  ): FormattingStyle | null {
    if (!compiledRules || compiledRules.length === 0 || !row) return null;

    for (const { rule, ast } of compiledRules) {
      if (!ast) continue;

      // Filter by target column if targetColumn is specified on rule & currentColumn is supplied
      if (
        rule.targetColumn &&
        rule.targetColumn.trim() !== "" &&
        currentColumn &&
        currentColumn.trim() !== "" &&
        rule.targetColumn.trim().toLowerCase() !== currentColumn.trim().toLowerCase()
      ) {
        continue;
      }

      try {
        const result = evaluateAST(ast, row as Record<string, number | string | boolean | null | undefined>);
        // A condition matches if the formula returns true, non-zero number, or non-empty string
        if (result === true || (typeof result === 'number' && result !== 0 && !isNaN(result))) {
          return rule.styles;
        }
      } catch (err) {
        // Condition failed evaluation for this particular row
      }
    }

    return null;
  }

  /**
   * One-shot convenience method that compiles and evaluates rules against a single row.
   */
  evaluate(
    rules: ConditionalFormatRule[],
    row: Record<string, unknown>,
    currentColumn?: string
  ): FormattingStyle | null {
    const compiled = this.compileRules(rules);
    return this.evaluateCompiledRules(compiled, row, currentColumn);
  }
}

export const formattingEngine = new FormattingEngine();
