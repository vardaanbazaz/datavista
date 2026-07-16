export interface ArgumentDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'any';
  optional?: boolean;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  args: ArgumentDefinition[];
  returnType: 'string' | 'number' | 'boolean' | 'any';
  apply: (args: unknown[]) => unknown;
}
