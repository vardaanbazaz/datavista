import type { Dataset, DataRow } from "@/shared/types";
import { aggregationFlag } from "@/shared/utils/columnRoles";
import { isNullToken, toNumberOrNull } from "@/shared/utils/numeric";
import { summarizeNumericColumns } from "./columnSummary";
import { countOf } from "@/shared/utils/plural";

/**
 * How a numeric column's statistics may be shown (Overview ledger, Data view column stats,
 * PDF summary):
 * - `constant`: one distinct valid value in the rows shown (EmployeeCount, StandardHours):
 *   one line, no statistics. "constant: 1" only when the whole dataset has that one value
 *   (`constantIn: "dataset"`); when a filter leaves one value in a column that varies,
 *   "same value in the 3 rows shown: 4.1" (`constantIn: "shown"`), with no "constant" tag.
 * - `id` / `year`: numbers that are labels (utils/columnRoles.ts): count, distinct, min,
 *   max only — never a sum or an average.
 * - `measure`: everything.
 */
export type StatRole = "measure" | "id" | "year" | "constant";

export interface NumericProfile {
  column: string;
  role: StatRole;
  /** Valid numbers. */
  count: number;
  /** Distinct valid numbers; counted for id/year columns only (null otherwise). */
  distinct: number | null;
  /** Blank cells and null tokens ("", N/A, -, ...). */
  missing: number;
  /** Non-blank cells that are not numbers ("ERROR", "$5"). */
  invalid: number;
  mean: number;
  min: number;
  max: number;
  sum: number;
  /** Role `constant` only: one value in the whole dataset, or only in the rows shown (a filter). */
  constantIn?: "dataset" | "shown";
}

/** Blank or a null token: what every view calls "missing". */
export function isMissingCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return typeof value === "string" && isNullToken(value);
}

/** The display role of a numeric column, from its valid numbers' min/max and the name rule. */
export function numericStatRole(dataset: Dataset | null | undefined, column: string, min: number, max: number, count: number): StatRole {
  if (count > 0 && min === max) return "constant";
  return aggregationFlag(dataset, column) ?? "measure";
}

/** Every valid number in `rows[column]` is the same (early exit on the second distinct one). */
export function isConstantInRows(rows: DataRow[], column: string): boolean {
  let first: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const n = toNumberOrNull(rows[i][column]);
    if (n === null) continue;
    if (first === null) first = n;
    else if (n !== first) return false;
  }
  return true;
}

/**
 * One profile per numeric column over the rows shown. Count, sum, mean, min and max come
 * from summarizeNumericColumns (the shared numeric rule), so they agree with every other
 * view; missing and invalid are counted on the same rows. Columns with no valid number are
 * still listed (role "measure", count 0), so an all-invalid column is visible.
 */
export function profileNumericColumns(rows: DataRow[], columns: string[], dataset?: Dataset | null): NumericProfile[] {
  const summaries = new Map(summarizeNumericColumns(rows, columns).map((s) => [s.column, s]));
  return columns.map((column) => {
    let missing = 0;
    let invalid = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][column];
      if (isMissingCell(v)) missing++;
      else if (toNumberOrNull(v) === null) invalid++;
    }
    const s = summaries.get(column);
    if (!s) {
      return { column, role: "measure", count: 0, distinct: null, missing, invalid, mean: NaN, min: NaN, max: NaN, sum: NaN };
    }
    const role = numericStatRole(dataset, column, s.min, s.max, s.count);
    let distinct: number | null = null;
    if (role === "id" || role === "year") {
      const seen = new Set<number>();
      for (let i = 0; i < rows.length; i++) {
        const n = toNumberOrNull(rows[i][column]);
        if (n !== null) seen.add(n);
      }
      distinct = seen.size;
    }
    let constantIn: NumericProfile["constantIn"];
    if (role === "constant") {
      const all = dataset?.data;
      constantIn = !all || all === rows || all.length === rows.length || isConstantInRows(all, column) ? "dataset" : "shown";
    }
    return { column, role, count: s.count, distinct, missing, invalid, mean: s.mean, min: s.min, max: s.max, sum: s.sum, ...(constantIn ? { constantIn } : {}) };
  });
}

/** Short tag shown next to a non-measure column's name; no "constant" tag when only the filtered rows share a value. */
export function roleLabel(role: StatRole, constantIn?: NumericProfile["constantIn"]): string | null {
  if (role === "constant") return constantIn === "shown" ? null : "constant";
  return role === "id" ? "ID" : role === "year" ? "year" : null;
}

/** The one-line text of a constant column: "constant: 1", or "same value in the 3 rows shown: 4.1" under a filter. */
export function constantText(p: Pick<NumericProfile, "constantIn" | "count">, value: string): string {
  return p.constantIn === "shown" ? `same value in the ${countOf(p.count, "row")} shown: ${value}` : `constant: ${value}`;
}
