import { PivotConfig, PivotRowNode, PivotColumnNode } from "./types";

export class PivotResultModel {
  public config: PivotConfig;
  public rowHierarchy: PivotRowNode;
  public columnHierarchy: PivotColumnNode;
  public rows: PivotRowNode[];
  public columns: PivotColumnNode[];
  public metadata: {
    rowCount: number;
    columnCount: number;
    processingTimeMs: number;
  };

  constructor(
    config: PivotConfig,
    rowHierarchy: PivotRowNode,
    columnHierarchy: PivotColumnNode,
    rows: PivotRowNode[],
    columns: PivotColumnNode[],
    metadata: { rowCount: number; columnCount: number; processingTimeMs: number }
  ) {
    this.config = config;
    this.rowHierarchy = rowHierarchy;
    this.columnHierarchy = columnHierarchy;
    this.rows = rows;
    this.columns = columns;
    this.metadata = metadata;
  }

  /**
   * Look up aggregated value for a cell at the intersection of a row path and column path.
   * If valueAlias is provided, returns that specific value; otherwise, returns the entire record.
   * Path [] represents Grand Total or root.
   */
  public getCell(
    rowPath: string[],
    columnPath: string[],
    valueAlias?: string
  ): number | Record<string, number | null> | null {
    const rowNode = this.findRowNode(rowPath);
    if (!rowNode) return null;

    const colKey = columnPath.join('\u0000');
    const cellValues = rowNode.values[colKey];
    if (!cellValues) return null;

    if (valueAlias) {
      return cellValues[valueAlias] ?? null;
    }
    return cellValues;
  }

  /**
   * Finds a row node matching the path segments from the root.
   */
  private findRowNode(path: string[]): PivotRowNode | null {
    let current = this.rowHierarchy;
    
    for (const segment of path) {
      const child = current.children.find(c => c.key === segment);
      if (!child) return null;
      current = child;
    }
    
    return current;
  }
}
export default PivotResultModel;
