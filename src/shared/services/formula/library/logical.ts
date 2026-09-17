import { FunctionDefinition } from "./types";

export const logicalFunctions: FunctionDefinition[] = [
  {
    name: "IF",
    description: "Evaluates a condition and returns one value if true, another if false.",
    args: [
      { name: "condition", type: "boolean" },
      { name: "trueValue", type: "any" },
      { name: "falseValue", type: "any" }
    ],
    returnType: "any",
    apply: (args) => {
      if (args.length < 3) return null;
      return args[0] ? args[1] : args[2];
    }
  },
  {
    name: "COALESCE",
    description: "Returns the first non-null, non-empty value in a list of arguments.",
    args: [
      { name: "value1", type: "any" },
      { name: "value2", type: "any", optional: true }
    ],
    variadic: true,
    returnType: "any",
    apply: (args) => {
      for (const arg of args) {
        if (arg !== null && arg !== undefined && arg !== "") {
          return arg;
        }
      }
      return null;
    }
  },
  {
    name: "ISNULL",
    description: "Returns true if the argument is null or undefined, false otherwise.",
    args: [{ name: "value", type: "any" }],
    returnType: "boolean",
    apply: (args) => {
      if (args.length < 1) return true;
      return args[0] === null || args[0] === undefined;
    }
  }
];
export default logicalFunctions;
