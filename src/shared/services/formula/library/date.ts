import { FunctionDefinition } from "./types";

export const dateFunctions: FunctionDefinition[] = [
  {
    name: "YEAR",
    description: "Extracts the year from a date value.",
    args: [{ name: "date", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      const d = new Date(String(args[0]));
      return isNaN(d.getTime()) ? null : d.getFullYear();
    }
  },
  {
    name: "MONTH",
    description: "Extracts the month (1-12) from a date value.",
    args: [{ name: "date", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      const d = new Date(String(args[0]));
      return isNaN(d.getTime()) ? null : d.getMonth() + 1;
    }
  },
  {
    name: "DAY",
    description: "Extracts the day of the month (1-31) from a date value.",
    args: [{ name: "date", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      const d = new Date(String(args[0]));
      return isNaN(d.getTime()) ? null : d.getDate();
    }
  },
  {
    name: "DATEADD",
    description: "Adds a specified amount (days, months, years) to a date.",
    args: [
      { name: "date", type: "string" },
      { name: "amount", type: "number" },
      { name: "unit", type: "string" } // 'day' | 'month' | 'year'
    ],
    returnType: "string",
    apply: (args) => {
      if (args.length < 3) return null;
      const dateVal = args[0];
      const amount = Number(args[1]);
      const unit = String(args[2]).toLowerCase();
      if (!dateVal || isNaN(amount)) return null;

      const d = new Date(String(dateVal));
      if (isNaN(d.getTime())) return null;

      switch (unit) {
        case "year":
        case "years":
        case "y":
          d.setFullYear(d.getFullYear() + amount);
          break;
        case "month":
        case "months":
        case "m":
          d.setMonth(d.getMonth() + amount);
          break;
        case "day":
        case "days":
        case "d":
          d.setDate(d.getDate() + amount);
          break;
        default:
          return null;
      }
      return d.toISOString();
    }
  },
  {
    name: "DATEDIFF",
    description: "Calculates the difference between two dates in specified units ('day', 'month', 'year').",
    args: [
      { name: "startDate", type: "string" },
      { name: "endDate", type: "string" },
      { name: "unit", type: "string" }
    ],
    returnType: "number",
    apply: (args) => {
      if (args.length < 3) return null;
      const d1Val = args[0];
      const d2Val = args[1];
      const unit = String(args[2]).toLowerCase();
      if (!d1Val || !d2Val) return null;

      const d1 = new Date(String(d1Val));
      const d2 = new Date(String(d2Val));
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

      const diffMs = d2.getTime() - d1.getTime();

      switch (unit) {
        case "year":
        case "years":
        case "y":
          return d2.getFullYear() - d1.getFullYear();
        case "month":
        case "months":
        case "m":
          return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
        case "day":
        case "days":
        case "d":
          return Math.floor(diffMs / (1000 * 60 * 60 * 24));
        default:
          return null;
      }
    }
  },
  {
    name: "NOW",
    description: "Returns the current date and time as an ISO string.",
    args: [],
    returnType: "string",
    apply: () => {
      return new Date().toISOString();
    }
  }
];
export default dateFunctions;
