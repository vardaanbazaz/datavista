import { FunctionDefinition } from "./types";

export const mathFunctions: FunctionDefinition[] = [
  {
    name: "ABS",
    description: "Returns the absolute value of a number.",
    args: [{ name: "number", type: "number" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1) return null;
      const val = Number(args[0]);
      return isNaN(val) ? null : Math.abs(val);
    }
  },
  {
    name: "ROUND",
    description: "Rounds a number to a specified number of decimal places.",
    args: [
      { name: "number", type: "number" },
      { name: "decimals", type: "number", optional: true }
    ],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1) return null;
      const val = Number(args[0]);
      const decimals = args.length > 1 ? Number(args[1]) : 0;
      if (isNaN(val) || isNaN(decimals)) return null;
      const factor = Math.pow(10, decimals);
      return Math.round(val * factor) / factor;
    }
  },
  {
    name: "FLOOR",
    description: "Rounds a number down to the nearest integer.",
    args: [{ name: "number", type: "number" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1) return null;
      const val = Number(args[0]);
      return isNaN(val) ? null : Math.floor(val);
    }
  },
  {
    name: "CEIL",
    description: "Rounds a number up to the nearest integer.",
    args: [{ name: "number", type: "number" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1) return null;
      const val = Number(args[0]);
      return isNaN(val) ? null : Math.ceil(val);
    }
  },
  {
    name: "POWER",
    description: "Returns the result of a number raised to a given power.",
    args: [
      { name: "base", type: "number" },
      { name: "exponent", type: "number" }
    ],
    returnType: "number",
    apply: (args) => {
      if (args.length < 2) return null;
      const base = Number(args[0]);
      const exponent = Number(args[1]);
      if (isNaN(base) || isNaN(exponent)) return null;
      return Math.pow(base, exponent);
    }
  },
  {
    name: "SQRT",
    description: "Returns the square root of a non-negative number.",
    args: [{ name: "number", type: "number" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1) return null;
      const val = Number(args[0]);
      if (isNaN(val) || val < 0) return null;
      return Math.sqrt(val);
    }
  },
  {
    name: "LOG",
    description: "Returns the natural logarithm of a number.",
    args: [{ name: "number", type: "number" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1) return null;
      const val = Number(args[0]);
      if (isNaN(val) || val <= 0) return null;
      return Math.log(val);
    }
  }
];
export default mathFunctions;
