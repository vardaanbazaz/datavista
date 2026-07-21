import { FunctionDefinition } from "./types";
import { mathFunctions } from "./math";
import { stringFunctions } from "./string";
import { dateFunctions } from "./date";
import { logicalFunctions } from "./logical";

export const formulaRegistry = new Map<string, FunctionDefinition>();

// Centralized list of all library functions
export const allFunctions: FunctionDefinition[] = [
  ...mathFunctions,
  ...stringFunctions,
  ...dateFunctions,
  ...logicalFunctions
];

// Register all functions into the map using uppercase names for case-insensitive lookup
allFunctions.forEach((func) => {
  formulaRegistry.set(func.name.toUpperCase(), func);
});

export function registerCustomFormula(func: FunctionDefinition): void {
  const upperName = func.name.toUpperCase();
  formulaRegistry.set(upperName, func);
  if (!allFunctions.some((f) => f.name.toUpperCase() === upperName)) {
    allFunctions.push(func);
  }
}

