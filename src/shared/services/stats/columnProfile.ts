import type { Dataset, DataRow } from "@/shared/types";
import { aggregationFlag } from "@/shared/utils/columnRoles";
import { isNullToken, toNumberOrNull } from "@/shared/utils/numeric";
import { summarizeNumericColumns } from "./columnSummary";

/**
 * How a numeric column's statistics may be shown (Overview ledger, Data view column stats,
 * PDF summary):
 * - `constant`: one distinct valid value in the rows shown (EmployeeCount, StandardHours):
 *   one line, "constant: 1", no statistics.
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
    return { column, role, count: s.count, distinct, missing, invalid, mean: s.mean, min: s.min, max: s.max, sum: s.sum };
  });
}

/** Short tag shown next to a non-measure column's name. */
export function roleLabel(role: StatRole): string | null {
  return role === "id" ? "ID" : role === "year" ? "year" : role === "constant" ? "constant" : null;
}
