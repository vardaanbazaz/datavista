import { DescriptiveStats, OutlierInfo, CorrelationMatrix } from "./types";

export class StatsResultModel {
  public descriptive: Record<string, DescriptiveStats>;
  public outliers: Record<string, OutlierInfo>;
  public correlationMatrix: CorrelationMatrix;

  constructor(
    descriptive: Record<string, DescriptiveStats>,
    outliers: Record<string, OutlierInfo>,
    correlationMatrix: CorrelationMatrix
  ) {
    this.descriptive = descriptive;
    this.outliers = outliers;
    this.correlationMatrix = correlationMatrix;
  }

  /**
   * Retrieves summary statistics and outlier analysis for a single column.
   */
  public getColumnStats(column: string): { descriptive: DescriptiveStats; outliers: OutlierInfo } | null {
    const desc = this.descriptive[column];
    const out = this.outliers[column];
    if (!desc || !out) return null;
    return {
      descriptive: desc,
      outliers: out
    };
  }

  /**
   * Gets the Pearson correlation coefficient between two columns.
   */
  public getCorrelation(colA: string, colB: string): number | null {
    const row = this.correlationMatrix.matrix[colA];
    if (!row) return null;
    return row[colB] ?? null;
  }
}
export default StatsResultModel;
