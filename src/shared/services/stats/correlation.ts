import { DataRow } from "@/shared/types";
import { CorrelationMatrix } from "./types";

/**
 * Calculates the Pearson correlation coefficient between two numeric arrays.
 */
export function calculatePearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n <= 1) return null;

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }

  // Zero variance in either column makes r = 0/0, mathematically undefined - not "no
  // linear relationship" (r=0). Matches the n<=1 branch above, which returns null for
  // its own undefined case.
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

/**
 * Computes the Pearson correlation coefficient matrix between selected numeric columns.
 */
export function computeCorrelationMatrix(
  data: DataRow[],
  columns: string[]
): CorrelationMatrix {
  const matrix: Record<string, Record<string, number | null>> = {};

  for (const col of columns) {
    matrix[col] = {};
  }

  for (let i = 0; i < columns.length; i++) {
    const colA = columns[i];
    matrix[colA][colA] = 1;

    for (let j = i + 1; j < columns.length; j++) {
      const colB = columns[j];
      const x: number[] = [];
      const y: number[] = [];

      for (const row of data) {
        const valA = row[colA];
        const valB = row[colB];

        if (
          valA !== null && valA !== undefined && valA !== "" &&
          valB !== null && valB !== undefined && valB !== ""
        ) {
          const numA = Number(valA);
          const numB = Number(valB);
          if (!isNaN(numA) && !isNaN(numB)) {
            x.push(numA);
            y.push(numB);
          }
        }
      }

      const r = calculatePearson(x, y);
      matrix[colA][colB] = r;
      matrix[colB][colA] = r;
    }
  }

  return {
    columns,
    matrix
  };
}
