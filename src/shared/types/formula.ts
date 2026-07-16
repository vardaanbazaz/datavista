export interface CalculatedField {
  name: string;
  expression: string;
}

export interface FormulaValidationError {
  field?: string;
  message: string;
  type: 'syntax' | 'type_mismatch' | 'unknown_column' | 'circular_dependency' | 'duplicate_name';
}
