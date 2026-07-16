import { PivotRowNode, PivotColumnNode } from "./types";

/**
 * Flattens a row hierarchy tree into a linear array using pre-order DFS traversal.
 */
export function flattenRowHierarchy(root: PivotRowNode, includeRoot = true): PivotRowNode[] {
  const result: PivotRowNode[] = [];
  
  function traverse(node: PivotRowNode) {
    if (node !== root || includeRoot) {
      result.push(node);
    }
    for (const child of node.children) {
      traverse(child);
    }
  }
  
  traverse(root);
  return result;
}

/**
 * Flattens a column hierarchy tree into a linear array using pre-order DFS traversal.
 */
export function flattenColumnHierarchy(root: PivotColumnNode, includeRoot = true): PivotColumnNode[] {
  const result: PivotColumnNode[] = [];
  
  function traverse(node: PivotColumnNode) {
    if (node !== root || includeRoot) {
      result.push(node);
    }
    for (const child of node.children) {
      traverse(child);
    }
  }
  
  traverse(root);
  return result;
}
