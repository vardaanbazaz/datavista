import { DataRow } from "@/shared/types";
import { compile, evaluateAST } from "@/shared/services/formulaEngine";
import { numericValues, toNumberOrNull } from "@/shared/utils/numeric";

/**
 * Counts unique non-null, non-undefined, non-empty values.
 */
export function countDistinct(values: unknown[]): number {
  const unique = new Set<unknown>();
  values.forEach((v) => {
    if (v !== null && v !== undefined && v !== "") {
      unique.add(v);
    }
  });
  return unique.size;
}

/**
 * Calculates the weighted average of values.
 * Gracefully skips rows where either value or weight is null/NaN.
 */
export function weightedAverage(values: unknown[], weights: unknown[]): number | null {
  let sumProduct = 0;
  let sumWeights = 0;
  const len = Math.min(values.length, weights.length);

  for (let i = 0; i < len; i++) {
    const val = toNumberOrNull(values[i]);
    const w = toNumberOrNull(weights[i]);

    if (val === null || w === null) {
      continue;
    }

    sumProduct += val * w;
    sumWeights += w;
  }

  return sumWeights === 0 ? null : sumProduct / sumWeights;
}

/**
 * Extracts the p-th percentile (0-100) using linear interpolation.
 */
export const percentile = (values: unknown[], p: number): number | null => {
  // 1. Filter out all non-numeric values and sort
  const valid = numericValues(values).sort((a, b) => a - b);

  // 2. Guard clause: return null for empty arrays (Fixes Failure 1)
  if (valid.length === 0) return null;

  // 3. Handle 0th and 100th percentiles safely
  if (p <= 0) return valid[0];
  if (p >= 100) return valid[valid.length - 1];

  // 4. Calculate fractional index and interpolate (Fixes Failure 2)
  const index = (p / 100) * (valid.length - 1);
  const lower = Math.floor(index);
  const upper = lower + 1;
  const weight = index % 1;

  if (upper >= valid.length) return valid[lower];

  return valid[lower] * (1 - weight) + valid[upper] * weight;
};
/**
 * Evaluates the conditional aggregation using the Formula Engine AST.
 */
export function conditionalAggregate(
  rows: DataRow[],
  conditionExpression: string,
  targetColumn: string,
  type: "sum" | "count"
): number {
  let ast;
  try {
    ast = compile(conditionExpression);
  } catch (e) {
    console.error("Failed to compile conditionExpression", conditionExpression, e);
    return 0;
  }

  let result = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const conditionMet = !!evaluateAST(ast, row);
    if (conditionMet) {
      if (type === "count") {
        result++;
      } else {
        const val = toNumberOrNull(row[targetColumn]);
        if (val !== null) {
          result += val;
        }
      }
    }
  }

  return result;
}
