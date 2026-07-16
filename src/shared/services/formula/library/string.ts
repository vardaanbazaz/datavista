import { FunctionDefinition } from "./types";

export const stringFunctions: FunctionDefinition[] = [
  {
    name: "CONCAT",
    description: "Concatenates two or more values into a single string.",
    args: [
      { name: "text1", type: "string" },
      { name: "text2", type: "string", optional: true }
    ],
    returnType: "string",
    apply: (args) => {
      return args
        .map((arg) => (arg === null || arg === undefined ? "" : String(arg)))
        .join("");
    }
  },
  {
    name: "LOWER",
    description: "Converts text to lowercase.",
    args: [{ name: "text", type: "string" }],
    returnType: "string",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      return String(args[0]).toLowerCase();
    }
  },
  {
    name: "UPPER",
    description: "Converts text to uppercase.",
    args: [{ name: "text", type: "string" }],
    returnType: "string",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      return String(args[0]).toUpperCase();
    }
  },
  {
    name: "SUBSTRING",
    description: "Extracts characters from text, starting at a 1-based index.",
    args: [
      { name: "text", type: "string" },
      { name: "start", type: "number" },
      { name: "length", type: "number", optional: true }
    ],
    returnType: "string",
    apply: (args) => {
      if (args.length < 2 || args[0] === null || args[0] === undefined) return null;
      const str = String(args[0]);
      const start = Number(args[1]);
      const length = args.length > 2 ? Number(args[2]) : undefined;
      
      if (isNaN(start) || (length !== undefined && isNaN(length))) return null;
      
      // SQL SUBSTRING starts at index 1
      const startIdx = Math.max(0, start - 1);
      if (length !== undefined) {
        if (length < 0) return null;
        return str.substring(startIdx, startIdx + length);
      }
      return str.substring(startIdx);
    }
  },
  {
    name: "REPLACE",
    description: "Replaces all occurrences of a search string with a replacement string.",
    args: [
      { name: "text", type: "string" },
      { name: "search", type: "string" },
      { name: "replacement", type: "string" }
    ],
    returnType: "string",
    apply: (args) => {
      if (args.length < 3 || args[0] === null || args[0] === undefined) return null;
      const str = String(args[0]);
      const search = String(args[1] ?? "");
      const replacement = String(args[2] ?? "");
      return str.replaceAll(search, replacement);
    }
  },
  {
    name: "TRIM",
    description: "Removes leading and trailing whitespace from text.",
    args: [{ name: "text", type: "string" }],
    returnType: "string",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      return String(args[0]).trim();
    }
  },
  {
    name: "LEN",
    description: "Returns the number of characters in a text string.",
    args: [{ name: "text", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return 0;
      return String(args[0]).length;
    }
  }
];
export default stringFunctions;
