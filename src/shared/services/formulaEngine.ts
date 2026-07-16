import { Dataset, DataRow, ColumnMetadata, DatasetMetadata, CalculatedField, FormulaValidationError } from "../types";

// Token interfaces
export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENTIFIER'
  | 'FIELD'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// AST Node interfaces
export type ASTNode =
  | { type: 'NumberLiteral'; value: number }
  | { type: 'StringLiteral'; value: string }
  | { type: 'FieldReference'; name: string }
  | { type: 'BinaryExpression'; left: ASTNode; operator: string; right: ASTNode }
  | { type: 'UnaryExpression'; operator: string; argument: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] };

import { formulaRegistry } from "./formula/library";

export class UnknownFunctionError extends Error {
  constructor(functionName: string) {
    super(`Unknown function: ${functionName}`);
    this.name = "UnknownFunctionError";
  }
}

/**
 * Tokenizer / Lexer
 */
export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    const pos = i;

    // Number literals: 123, 123.45
    if (/\d/.test(char) || (char === '.' && i + 1 < len && /\d/.test(expr[i + 1]))) {
      let val = '';
      while (i < len && (/\d/.test(expr[i]) || expr[i] === '.')) {
        val += expr[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: val, position: pos });
      continue;
    }

    // String literals: "hello", 'hello'
    if (char === '"' || char === "'") {
      const quote = char;
      let val = '';
      i++; // skip opening quote
      while (i < len && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < len) {
          val += expr[i + 1];
          i += 2;
        } else {
          val += expr[i];
          i++;
        }
      }
      if (i >= len) {
        throw new Error(`Unterminated string starting at position ${pos}`);
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: val, position: pos });
      continue;
    }

    // Field references: [Column Name]
    if (char === '[') {
      let val = '';
      i++; // skip '['
      while (i < len && expr[i] !== ']') {
        val += expr[i];
        i++;
      }
      if (i >= len) {
        throw new Error(`Unterminated field reference starting at position ${pos}`);
      }
      i++; // skip ']'
      tokens.push({ type: 'FIELD', value: val, position: pos });
      continue;
    }

    // Identifiers (functions or logical operators)
    if (/[a-zA-Z_]/.test(char)) {
      let val = '';
      while (i < len && /[a-zA-Z0-9_]/.test(expr[i])) {
        val += expr[i];
        i++;
      }
      const upperVal = val.toUpperCase();
      if (upperVal === 'AND' || upperVal === 'OR' || upperVal === 'NOT') {
        tokens.push({ type: 'OPERATOR', value: upperVal, position: pos });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: val, position: pos });
      }
      continue;
    }

    // Multi-char operators: ==, !=, <=, >=
    if (i + 1 < len) {
      const doubleOp = expr.substring(i, i + 2);
      if (doubleOp === '==' || doubleOp === '!=' || doubleOp === '<=' || doubleOp === '>=') {
        tokens.push({ type: 'OPERATOR', value: doubleOp, position: pos });
        i += 2;
        continue;
      }
    }

    // Single-char operators
    if ('+-*/%<>=,()'.indexOf(char) !== -1) {
      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: char, position: pos });
      } else if (char === ')') {
        tokens.push({ type: 'RPAREN', value: char, position: pos });
      } else if (char === ',') {
        tokens.push({ type: 'COMMA', value: char, position: pos });
      } else {
        // Map standard single '=' to '==' comparison
        const resolvedOp = char === '=' ? '==' : char;
        tokens.push({ type: 'OPERATOR', value: resolvedOp, position: pos });
      }
      i++;
      continue;
    }

    throw new Error(`Unexpected character '${char}' at position ${pos}`);
  }

  tokens.push({ type: 'EOF', value: '', position: len });
  return tokens;
}

/**
 * Expression Parser (Recursive Descent)
 */
class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} at position ${this.peek().position}`);
  }

  /**
   * Entry Point: expression -> logicOr
   */
  public parse(): ASTNode {
    const expr = this.logicOr();
    if (!this.isAtEnd()) {
      throw new Error(`Unexpected token '${this.peek().value}' after expression at position ${this.peek().position}`);
    }
    return expr;
  }

  private logicOr(): ASTNode {
    let expr = this.logicAnd();
    while (this.match('OPERATOR', 'OR')) {
      const op = this.previous().value;
      const right = this.logicAnd();
      expr = { type: 'BinaryExpression', left: expr, operator: op, right };
    }
    return expr;
  }

  private logicAnd(): ASTNode {
    let expr = this.equality();
    while (this.match('OPERATOR', 'AND')) {
      const op = this.previous().value;
      const right = this.equality();
      expr = { type: 'BinaryExpression', left: expr, operator: op, right };
    }
    return expr;
  }

  private equality(): ASTNode {
    let expr = this.comparison();
    while (this.match('OPERATOR', '==') || this.match('OPERATOR', '!=')) {
      const op = this.previous().value;
      const right = this.comparison();
      expr = { type: 'BinaryExpression', left: expr, operator: op, right };
    }
    return expr;
  }

  private comparison(): ASTNode {
    let expr = this.addition();
    while (
      this.match('OPERATOR', '<') ||
      this.match('OPERATOR', '<=') ||
      this.match('OPERATOR', '>') ||
      this.match('OPERATOR', '>=')
    ) {
      const op = this.previous().value;
      const right = this.addition();
      expr = { type: 'BinaryExpression', left: expr, operator: op, right };
    }
    return expr;
  }

  private addition(): ASTNode {
    let expr = this.multiplication();
    while (this.match('OPERATOR', '+') || this.match('OPERATOR', '-')) {
      const op = this.previous().value;
      const right = this.multiplication();
      expr = { type: 'BinaryExpression', left: expr, operator: op, right };
    }
    return expr;
  }

  private multiplication(): ASTNode {
    let expr = this.unary();
    while (this.match('OPERATOR', '*') || this.match('OPERATOR', '/') || this.match('OPERATOR', '%')) {
      const op = this.previous().value;
      const right = this.unary();
      expr = { type: 'BinaryExpression', left: expr, operator: op, right };
    }
    return expr;
  }

  private unary(): ASTNode {
    if (this.match('OPERATOR', 'NOT') || this.match('OPERATOR', '-')) {
      const op = this.previous().value;
      const arg = this.unary();
      return { type: 'UnaryExpression', operator: op, argument: arg };
    }
    return this.primary();
  }

  private primary(): ASTNode {
    if (this.match('NUMBER')) {
      return { type: 'NumberLiteral', value: Number(this.previous().value) };
    }

    if (this.match('STRING')) {
      return { type: 'StringLiteral', value: this.previous().value };
    }

    if (this.match('FIELD')) {
      return { type: 'FieldReference', name: this.previous().value };
    }

    if (this.match('IDENTIFIER')) {
      const name = this.previous().value.toUpperCase();
      this.consume('LPAREN', `Expect '(' after function name '${name}'`);
      
      const args: ASTNode[] = [];
      if (!this.check('RPAREN')) {
        do {
          args.push(this.logicOr());
        } while (this.match('COMMA'));
      }
      this.consume('RPAREN', "Expect ')' after function arguments");
      return { type: 'FunctionCall', name, args };
    }

    if (this.match('LPAREN')) {
      const expr = this.logicOr();
      this.consume('RPAREN', "Expect ')' after parenthesized expression");
      return expr;
    }

    throw new Error(`Expected expression but found '${this.peek().value}'`);
  }
}

/**
 * Compiles a formula string into an AST
 */
export function compile(expr: string): ASTNode {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  return parser.parse();
}

/**
 * AST Evaluator
 */
export function evaluateAST(node: ASTNode, row: DataRow): unknown {
  switch (node.type) {
    case 'NumberLiteral':
      return node.value;
    case 'StringLiteral':
      return node.value;
    case 'FieldReference':
      return row[node.name] ?? null;
    case 'UnaryExpression': {
      const val = evaluateAST(node.argument, row);
      if (node.operator === '-') {
        return val === null ? null : -Number(val);
      }
      if (node.operator === 'NOT') {
        return !val;
      }
      return null;
    }
    case 'BinaryExpression': {
      const leftVal = evaluateAST(node.left, row);
      const rightVal = evaluateAST(node.right, row);

      // Logical operators have short-circuit truthiness
      if (node.operator === 'AND') {
        return !!leftVal && !!rightVal;
      }
      if (node.operator === 'OR') {
        return !!leftVal || !!rightVal;
      }

      // Null propagates for other operators
      if (leftVal === null || rightVal === null) return null;

      switch (node.operator) {
        case '+':
          if (typeof leftVal === 'string' || typeof rightVal === 'string') {
            return String(leftVal) + String(rightVal);
          }
          return Number(leftVal) + Number(rightVal);
        case '-':
          return Number(leftVal) - Number(rightVal);
        case '*':
          return Number(leftVal) * Number(rightVal);
        case '/':
          return Number(rightVal) === 0 ? null : Number(leftVal) / Number(rightVal);
        case '%':
          return Number(rightVal) === 0 ? null : Number(leftVal) % Number(rightVal);
        case '==':
          return leftVal === rightVal;
        case '!=':
          return leftVal !== rightVal;
        case '<':
          return leftVal < rightVal;
        case '<=':
          return leftVal <= rightVal;
        case '>':
          return leftVal > rightVal;
        case '>=':
          return leftVal >= rightVal;
        default:
          return null;
      }
    }
    case 'FunctionCall': {
      const functionName = node.name.toUpperCase();
      const handlerDef = formulaRegistry.get(functionName);
      if (!handlerDef) {
        throw new UnknownFunctionError(node.name);
      }
      
      // Lazy argument execution for conditional logic (IF)
      if (functionName === 'IF') {
        if (node.args.length < 3) return null;
        const cond = !!evaluateAST(node.args[0], row);
        return cond ? evaluateAST(node.args[1], row) : evaluateAST(node.args[2], row);
      }

      const argsEvaluated = node.args.map(arg => evaluateAST(arg, row));
      return handlerDef.apply(argsEvaluated);
    }
    default:
      return null;
  }
}

/**
 * Resolves FieldReference column names in AST
 */
function getReferences(node: ASTNode, refs: Set<string>): void {
  if (node.type === 'FieldReference') {
    refs.add(node.name);
  } else if (node.type === 'UnaryExpression') {
    getReferences(node.argument, refs);
  } else if (node.type === 'BinaryExpression') {
    getReferences(node.left, refs);
    getReferences(node.right, refs);
  } else if (node.type === 'FunctionCall') {
    node.args.forEach(arg => getReferences(arg, refs));
  }
}

export const formulaEngine = {
  /**
   * Validates expression syntactically, circular deps, duplicate names, etc.
   */
  validate(
    fieldName: string,
    expression: string,
    existingColumns: string[],
    calculatedFields: CalculatedField[]
  ): FormulaValidationError[] {
    const errors: FormulaValidationError[] = [];

    // 1. Duplicate name checks
    const colNameUpper = fieldName.trim().toUpperCase();
    if (existingColumns.map(c => c.toUpperCase()).includes(colNameUpper)) {
      errors.push({
        field: fieldName,
        message: `Column name '${fieldName}' duplicates an imported dataset column.`,
        type: 'duplicate_name'
      });
      return errors;
    }

    const calcDuplicates = calculatedFields.filter(f => f.name.trim().toUpperCase() === colNameUpper && f.name !== fieldName);
    if (calcDuplicates.length > 0) {
      errors.push({
        field: fieldName,
        message: `Calculated field name '${fieldName}' is already defined.`,
        type: 'duplicate_name'
      });
      return errors;
    }

    // 2. Syntax parsing check
    let ast: ASTNode;
    try {
      ast = compile(expression);
    } catch (e: unknown) {
      errors.push({
        field: fieldName,
        message: e instanceof Error ? e.message : 'Syntax Error',
        type: 'syntax'
      });
      return errors;
    }

    // Validate function calls
    const validateFunctions = (node: ASTNode) => {
      if (node.type === 'FunctionCall') {
        if (!formulaRegistry.has(node.name.toUpperCase())) {
          errors.push({
            field: fieldName,
            message: `Unknown function '${node.name}'.`,
            type: 'syntax'
          });
        }
        node.args.forEach(validateFunctions);
      } else if (node.type === 'UnaryExpression') {
        validateFunctions(node.argument);
      } else if (node.type === 'BinaryExpression') {
        validateFunctions(node.left);
        validateFunctions(node.right);
      }
    };
    validateFunctions(ast);
    if (errors.length > 0) {
      return errors;
    }

    // 3. Unknown columns check
    const refs = new Set<string>();
    getReferences(ast, refs);

    const allValidColumns = new Set([
      ...existingColumns,
      ...calculatedFields.map(f => f.name)
    ]);

    for (const ref of refs) {
      if (!allValidColumns.has(ref)) {
        errors.push({
          field: fieldName,
          message: `Unknown column reference '[${ref}]'.`,
          type: 'unknown_column'
        });
      }
    }

    // Check circular dependencies
    const tempFields = [...calculatedFields.filter(f => f.name !== fieldName), { name: fieldName, expression }];
    try {
      this.resolveEvaluationOrder(existingColumns, tempFields);
    } catch (e: unknown) {
      errors.push({
        field: fieldName,
        message: e instanceof Error ? e.message : 'Circular reference detected.',
        type: 'circular_dependency'
      });
    }

    return errors;
  },

  /**
   * Performs topological sort to find execution order. Throws error on circular references.
   */
  resolveEvaluationOrder(existingColumns: string[], fields: CalculatedField[]): CalculatedField[] {
    const order: CalculatedField[] = [];
    const visited = new Map<string, 'VISITING' | 'VISITED'>();

    // Build map of parsed ASTs
    const fieldASTs = new Map<string, ASTNode>();
    fields.forEach(f => {
      try {
        fieldASTs.set(f.name, compile(f.expression));
      } catch (e) {
        // ignore syntax errors during sorting, handled in validation
      }
    });

    const visit = (field: CalculatedField) => {
      const state = visited.get(field.name);
      if (state === 'VISITING') {
        throw new Error(`Circular reference detected involving calculated field '[${field.name}]'.`);
      }
      if (state === 'VISITED') return;

      visited.set(field.name, 'VISITING');

      const ast = fieldASTs.get(field.name);
      if (ast) {
        const refs = new Set<string>();
        getReferences(ast, refs);

        for (const ref of refs) {
          // If the reference is another calculated field, visit it first
          const dep = fields.find(f => f.name === ref);
          if (dep) {
            visit(dep);
          }
        }
      }

      visited.set(field.name, 'VISITED');
      order.push(field);
    };

    fields.forEach(f => {
      if (!visited.has(f.name)) {
        visit(f);
      }
    });

    return order;
  },

  /**
   * Evaluates all calculated fields row-by-row and appends them to dataset properties + metadata.
   */
  evaluateCalculatedFields(dataset: Dataset): Dataset {
    if (!dataset.calculatedFields || dataset.calculatedFields.length === 0) {
      return dataset;
    }

    // 1. Resolve sorting order
    let sortedFields: CalculatedField[];
    try {
      sortedFields = this.resolveEvaluationOrder(dataset.columns, dataset.calculatedFields);
    } catch (e) {
      console.error("Failed to resolve calculations order due to cycle:", e);
      return dataset; // Abort calculations on cycle to avoid infinite loops
    }

    // 2. Setup baseline columns to reset recalculations (clean state)
    // We filter out any previous calculated columns from the data row keys
    const rawColumnsSet = new Set(dataset.columns);
    const calculatedFieldNames = dataset.calculatedFields.map(f => f.name);

    const cleanData = dataset.data.map(row => {
      const cleanRow: DataRow = {};
      Object.keys(row).forEach(key => {
        if (rawColumnsSet.has(key) && !calculatedFieldNames.includes(key)) {
          cleanRow[key] = row[key];
        }
      });
      return cleanRow;
    });

    const evaluatedColumns = [...dataset.columns];
    const evaluatedColumnTypes = { ...dataset.columnTypes };

    // Initialize/reset metadata columns mapping
    const metadataColumnsMap = new Map<string, ColumnMetadata>();
    if (dataset.metadata) {
      dataset.metadata.columns.forEach(col => {
        if (col.role !== 'calculated') {
          metadataColumnsMap.set(col.name, col);
        }
      });
    }

    // 3. Evaluate each calculated field sequentially
    sortedFields.forEach(field => {
      let ast: ASTNode;
      try {
        ast = compile(field.expression);
      } catch (e) {
        console.error(`Skipping invalid formula for field '${field.name}':`, e);
        return;
      }

      const values: unknown[] = [];
      let missingCount = 0;
      const uniqueValuesMap = new Map<string, number>();
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let validNumCount = 0;

      // Single pass row-by-row
      for (let i = 0; i < cleanData.length; i++) {
        const row = cleanData[i];
        let val = evaluateAST(ast, row);

        // Normalize value type
        if (val === undefined || val === '') {
          val = null;
        }

        row[field.name] = val;
        values.push(val);

        if (val === null) {
          missingCount++;
        } else {
          const strVal = String(val);
          const count = uniqueValuesMap.get(strVal) || 0;
          uniqueValuesMap.set(strVal, count + 1);

          const num = Number(val);
          if (!isNaN(num)) {
            validNumCount++;
            sum += num;
            if (num < min) min = num;
            if (num > max) max = num;
          }
        }
      }

      // Infer data type
      let inferredType: 'numeric' | 'categorical' | 'date' = 'categorical';
      const nonNullCount = values.length - missingCount;
      if (nonNullCount > 0) {
        if (validNumCount / nonNullCount > 0.8) {
          inferredType = 'numeric';
        } else {
          // Check date count
          let dateCount = 0;
          values.forEach(v => {
            if (v !== null) {
              const str = String(v);
              if (/^\d+$/.test(str)) return;
              if (!isNaN(Date.parse(str))) dateCount++;
            }
          });
          if (dateCount / nonNullCount > 0.8) {
            inferredType = 'date';
          }
        }
      }

      // Append definitions
      if (!evaluatedColumns.includes(field.name)) {
        evaluatedColumns.push(field.name);
      }
      evaluatedColumnTypes[field.name] = inferredType;

      // Category cardinality
      const categoryCardinality: Record<string, number> = {};
      if (inferredType === 'categorical' || uniqueValuesMap.size <= 100) {
        let idx = 0;
        for (const [key, count] of uniqueValuesMap.entries()) {
          if (idx >= 100) break;
          categoryCardinality[key] = count;
          idx++;
        }
      }

      // Role mapping
      const role = 'calculated';

      const columnMetadata: ColumnMetadata = {
        id: `${dataset.id}_${field.name}`,
        name: field.name,
        displayName: field.name,
        originalHeader: field.name,
        inferredDataType: inferredType,
        nullableStatus: missingCount > 0,
        uniqueValueCount: uniqueValuesMap.size,
        missingValueCount: missingCount,
        minimumValue: inferredType === 'numeric' && validNumCount > 0 ? min : undefined,
        maximumValue: inferredType === 'numeric' && validNumCount > 0 ? max : undefined,
        average: inferredType === 'numeric' && validNumCount > 0 ? sum / validNumCount : undefined,
        categoryCardinality,
        role
      };

      metadataColumnsMap.set(field.name, columnMetadata);
    });

    // 4. Update dataset metadata columns
    let updatedMetadata: DatasetMetadata | undefined = undefined;
    if (dataset.metadata) {
      updatedMetadata = {
        ...dataset.metadata,
        rowCount: cleanData.length,
        columnCount: evaluatedColumns.length,
        columns: Array.from(metadataColumnsMap.values())
      };
    }

    return {
      ...dataset,
      data: cleanData,
      columns: evaluatedColumns,
      columnTypes: evaluatedColumnTypes,
      metadata: updatedMetadata
    };
  }
};
export default formulaEngine;
