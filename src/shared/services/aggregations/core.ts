import { DataRow } from "@/shared/types";
import { compile, evaluateAST } from "@/shared/services/formulaEngine";

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
    const rawVal = values[i];
    const rawWeight = weights[i];

    if (
      rawVal === null ||
      rawVal === undefined ||
      rawWeight === null ||
      rawWeight === undefined
    ) {
      continue;
    }

    const val = Number(rawVal);
    const w = Number(rawWeight);

    if (isNaN(val) || isNaN(w)) {
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
export function percentile(values: unknown[], p: number): number | null {
  const nums = values
    .map(Number)
    .filter((v) => !isNaN(v) && v !== null && v !== undefined)
    .sort((a, b) => a - b);

  if (nums.length === 0) return null;
  if (p < 0) p = 0;
  if (p > 100) p = 100;

  const index = (p / 100) * (nums.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);

  if (low === high) return nums[low];
  return nums[low] + (index - low) * (nums[high] - nums[low]);
}

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
        const val = Number(row[targetColumn]);
        if (!isNaN(val) && row[targetColumn] !== null && row[targetColumn] !== undefined) {
          result += val;
        }
      }
    }
  }

  return result;
}
