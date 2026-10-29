import { FunctionDefinition } from "./types";
import {
  addMonths,
  CalendarParts,
  formatCalendar,
  localeDayFirst,
  parseDateValue,
  parseStoredDate,
  partsToUtcMs,
} from "@/shared/utils/dates";

/**
 * Calendar parts of a formula argument: a stored date ("2008-01-01", "2008-01-01T10:00"),
 * or any source format the importer accepts ("January 1, 2008"; numeric D/M in the browser
 * locale's order). No time zone is involved (utils/dates.ts).
 */
function toParts(v: unknown): CalendarParts | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  return parseStoredDate(v) ?? parseStoredDate(parseDateValue(String(v), localeDayFirst()));
}

const DAY_MS = 86_400_000;

export const dateFunctions: FunctionDefinition[] = [
  {
    name: "YEAR",
    description: "Extracts the year from a date value.",
    args: [{ name: "date", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      const p = toParts(args[0]);
      return p ? p.year : null;
    }
  },
  {
    name: "MONTH",
    description: "Extracts the month (1-12) from a date value.",
    args: [{ name: "date", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      const p = toParts(args[0]);
      return p ? p.month : null;
    }
  },
  {
    name: "DAY",
    description: "Extracts the day of the month (1-31) from a date value.",
    args: [{ name: "date", type: "string" }],
    returnType: "number",
    apply: (args) => {
      if (args.length < 1 || args[0] === null || args[0] === undefined) return null;
      const p = toParts(args[0]);
      return p ? p.day : null;
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

      const p = toParts(dateVal);
      if (!p) return null;

      switch (unit) {
        case "year":
        case "years":
        case "y":
          return formatCalendar(addMonths(p, amount * 12));
        case "month":
        case "months":
        case "m":
          return formatCalendar(addMonths(p, amount));
        case "day":
        case "days":
        case "d": {
          // UTC arithmetic on the parts: no DST days, no zone.
          const d = new Date(partsToUtcMs(p) + amount * DAY_MS);
          return formatCalendar({ ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
        }
        default:
          return null;
      }
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

      const p1 = toParts(d1Val);
      const p2 = toParts(d2Val);
      if (!p1 || !p2) return null;

      const diffMs = partsToUtcMs(p2) - partsToUtcMs(p1);

      switch (unit) {
        case "year":
        case "years":
        case "y":
          return p2.year - p1.year;
        case "month":
        case "months":
        case "m":
          return (p2.year - p1.year) * 12 + (p2.month - p1.month);
        case "day":
        case "days":
        case "d":
          return Math.floor(diffMs / DAY_MS);
        default:
          return null;
      }
    }
  },
  {
    name: "NOW",
    description: "Returns the current local date and time as YYYY-MM-DDTHH:mm:ss.",
    args: [],
    returnType: "string",
    apply: () => {
      // The user's wall clock, in the same form as stored dates, so YEAR(NOW()) etc. work.
      const d = new Date();
      return formatCalendar({
        year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
        hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(),
      });
    }
  }
];
export default dateFunctions;
