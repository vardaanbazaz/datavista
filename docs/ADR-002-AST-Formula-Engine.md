# ADR-002: Abstract Syntax Tree (AST) Formula Engine

## Status
Accepted

## Context
Users require the ability to create dynamic calculated fields and custom formulas (e.g., `[Revenue] - [Cost]`, `IF([Profit] > 0, "Profitable", "Loss")`, `UPPER([Category])`) to enrich datasets. Standard dynamic evaluation methods in JavaScript (such as `eval()` or `new Function()`) introduce severe security vulnerabilities (XSS, code injection) and lack domain-specific validation.

## Decision
We engineered a custom **Recursive-Descent Parser and AST-based Expression Engine**:
1. **Lexical Analysis**: A tokenizer converts raw formula strings into a structured stream of tokens (Identifiers, Literals, Operators, Function calls).
2. **AST Construction**: A recursive-descent parser constructs an Abstract Syntax Tree (AST) enforcing strict operator precedence, syntax rules, and parenthesis matching.
3. **Type Checking & Safe Evaluation**: The AST evaluator evaluates expressions row-by-row in $O(1)$ time per node using a pure functional visitor pattern, with zero risk of code injection.
4. **Expression Library**: Built-in functions (Mathematical, String manipulation, Date arithmetic, Logical branching) are registered in a modular expression library.

## Consequences

### Positive
- **Enterprise-Grade Security**: Completely eliminates `eval()` security vectors and unsafe code execution.
- **High Performance**: Pre-compiled AST nodes enable rapid row-by-row evaluation during dataset transformation.
- **Strict Validation & Feedback**: Provides precise syntax error locations and type mismatch warnings before dataset evaluation.
- **Extensibility**: Simple pattern for registering new functions and analytical operators.

### Negative
- **Upfront Implementation Complexity**: Requires maintaining tokenizer, parser, and AST evaluation logic.
