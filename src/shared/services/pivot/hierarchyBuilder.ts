import { DataRow, QueryAggregation } from "@/shared/types";
import { PivotRowNode, PivotColumnNode, PivotDimensionSort } from "./types";
import { queryEngine } from "../queryEngine";

/**
 * Sorts child nodes alphabetically or numerically, depending on config and data values.
 */
function sortHierarchy<T extends { key: string; dimension?: string; children: T[] }>(
  node: T,
  sorts?: PivotDimensionSort[]
): void {
  if (node.children.length === 0) return;

  const dim = node.children[0].dimension;
  let direction: 'asc' | 'desc' = 'asc';

  if (dim && sorts) {
    const rule = sorts.find(s => s.column === dim);
    if (rule) {
      direction = rule.direction;
    }
  }

  node.children.sort((a, b) => {
    const aVal = a.key;
    const bVal = b.key;

    // Handle blanks to sort last
    if (aVal === '(Blank)') return 1;
    if (bVal === '(Blank)') return -1;

    // Try numeric sort
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    // Fallback to localeCompare
    const comp = aVal.localeCompare(bVal);
    return direction === 'asc' ? comp : -comp;
  });

  // Sort recursively
  for (const child of node.children) {
    sortHierarchy(child, sorts);
  }
}

/**
 * Builds the nested Row Tree hierarchy in a single pass of the rows.
 */
export function buildRowHierarchy(
  data: DataRow[],
  dimensions: string[],
  sorts?: PivotDimensionSort[]
): PivotRowNode & { rows: DataRow[] } {
  const root: PivotRowNode & { rows: DataRow[] } = {
    key: 'Grand Total',
    level: -1,
    path: [],
    children: [],
    isTotal: true,
    values: {},
    rows: data
  };

  const nodeMap = new Map<string, PivotRowNode & { rows: DataRow[] }>();
  nodeMap.set('', root);

  for (const row of data) {
    const currentPath: string[] = [];
    let currentNode = root;

    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];
      const val = row[dim] === null || row[dim] === undefined ? '(Blank)' : String(row[dim]);
      currentPath.push(val);
      const pathKey = currentPath.join('\u0000');

      let childNode = nodeMap.get(pathKey);
      if (!childNode) {
        childNode = {
          key: val,
          dimension: dim,
          level: i,
          path: [...currentPath],
          children: [],
          isTotal: false,
          values: {},
          rows: []
        };
        currentNode.children.push(childNode);
        nodeMap.set(pathKey, childNode);
      }
      childNode.rows.push(row);
      currentNode = childNode;
    }
  }

  sortHierarchy(root, sorts);
  return root;
}

/**
 * Builds the nested Column Tree hierarchy in a single pass of the rows.
 */
export function buildColumnHierarchy(
  data: DataRow[],
  dimensions: string[],
  sorts?: PivotDimensionSort[]
): PivotColumnNode & { rows: DataRow[] } {
  const root: PivotColumnNode & { rows: DataRow[] } = {
    key: 'Grand Total',
    level: -1,
    path: [],
    children: [],
    isTotal: true,
    rows: data
  };

  const nodeMap = new Map<string, PivotColumnNode & { rows: DataRow[] }>();
  nodeMap.set('', root);

  for (const row of data) {
    const currentPath: string[] = [];
    let currentNode = root;

    for (let i = 0; i < dimensions.length; i++) {
      const dim = dimensions[i];
      const val = row[dim] === null || row[dim] === undefined ? '(Blank)' : String(row[dim]);
      currentPath.push(val);
      const pathKey = currentPath.join('\u0000');

      let childNode = nodeMap.get(pathKey);
      if (!childNode) {
        childNode = {
          key: val,
          dimension: dim,
          level: i,
          path: [...currentPath],
          children: [],
          isTotal: false,
          rows: []
        };
        currentNode.children.push(childNode);
        nodeMap.set(pathKey, childNode);
      }
      childNode.rows.push(row);
      currentNode = childNode;
    }
  }

  sortHierarchy(root, sorts);
  return root;
}

/**
 * Groups rows by all prefix paths of column dimensions.
 */
export function groupRowsByColumnPath(
  rows: DataRow[],
  columnDimensions: string[]
): Map<string, DataRow[]> {
  const groups = new Map<string, DataRow[]>();
  
  // Grand Total represents all rows
  groups.set('', [...rows]);

  for (const row of rows) {
    const currentPath: string[] = [];
    for (const dim of columnDimensions) {
      const val = row[dim] === null || row[dim] === undefined ? '(Blank)' : String(row[dim]);
      currentPath.push(val);
      const pathKey = currentPath.join('\u0000');

      if (!groups.has(pathKey)) {
        groups.set(pathKey, []);
      }
      groups.get(pathKey)!.push(row);
    }
  }

  return groups;
}

/**
 * Computes cell aggregations for a single row node across all matching column paths.
 */
export function computeNodeValues(
  rowNode: PivotRowNode & { rows: DataRow[] },
  columnDimensions: string[],
  aggregations: QueryAggregation[]
): void {
  const colGroups = groupRowsByColumnPath(rowNode.rows, columnDimensions);

  colGroups.forEach((rows, colKey) => {
    // Consume existing QueryEngine aggregation service
    rowNode.values[colKey] = queryEngine.computeAggregations(rows, aggregations);
  });
}

/**
 * Recursively computes aggregations for all row nodes in the hierarchy.
 */
export function computeHierarchyValues(
  rowNode: PivotRowNode & { rows: DataRow[] },
  columnDimensions: string[],
  aggregations: QueryAggregation[]
): void {
  computeNodeValues(rowNode, columnDimensions, aggregations);

  for (const child of rowNode.children) {
    computeHierarchyValues(child as PivotRowNode & { rows: DataRow[] }, columnDimensions, aggregations);
  }
}

/**
 * Sorts row children based on the aggregated value for a specific column and value alias.
 */
export function sortHierarchyByValue(
  rowNode: PivotRowNode,
  valueFieldAlias: string,
  columnPath: string[],
  direction: 'asc' | 'desc'
): void {
  if (rowNode.children.length === 0) return;

  const colKey = columnPath.join('\u0000');

  rowNode.children.sort((a, b) => {
    const aVals = a.values[colKey];
    const bVals = b.values[colKey];

    const aVal = aVals ? aVals[valueFieldAlias] : null;
    const bVal = bVals ? bVals[valueFieldAlias] : null;

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    return direction === 'asc' ? aVal - bVal : bVal - aVal;
  });

  for (const child of rowNode.children) {
    sortHierarchyByValue(child, valueFieldAlias, columnPath, direction);
  }
}
