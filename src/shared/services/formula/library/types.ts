export interface ArgumentDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'any';
  optional?: boolean;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  args: ArgumentDefinition[];
  /** True if the function accepts more values than `args` declares (e.g. CONCAT, COALESCE). */
  variadic?: boolean;
  returnType: 'string' | 'number' | 'boolean' | 'any';
  apply: (args: unknown[]) => unknown;
}
