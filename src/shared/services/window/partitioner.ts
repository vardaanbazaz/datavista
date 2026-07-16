import { DataRow } from "@/shared/types";
import { WindowOrderBy } from "./types";

export interface PartitionItem {
  row: DataRow;
  originalIndex: number;
}

/**
 * Sorts partition items according to Order By configurations.
 */
export function sortPartitionItems(items: PartitionItem[], orderBy: WindowOrderBy[]): void {
  items.sort((a, b) => {
    for (const rule of orderBy) {
      const { column, direction } = rule;
      const valA = a.row[column];
      const valB = b.row[column];

      // Handle nulls by keeping them at the end
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let comp = 0;
      if (typeof valA === "number" && typeof valB === "number") {
        comp = valA - valB;
      } else {
        comp = String(valA).localeCompare(String(valB));
      }

      if (comp !== 0) {
        return direction === "asc" ? comp : -comp;
      }
    }
    return 0;
  });
}

/**
 * Splits a list of rows into partitions, and sorts each partition according to rules.
 */
export function partitionAndSort(
  data: DataRow[],
  partitionBy?: string[],
  orderBy?: WindowOrderBy[]
): Map<string, PartitionItem[]> {
  const partitions = new Map<string, PartitionItem[]>();

  // 1. Group rows into partitions
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    let key = "";
    
    if (partitionBy && partitionBy.length > 0) {
      key = partitionBy.map(col => String(row[col] ?? "(Blank)")).join("\u0000");
    }

    if (!partitions.has(key)) {
      partitions.set(key, []);
    }
    partitions.get(key)!.push({ row, originalIndex: i });
  }

  // 2. Sort rows within each partition
  if (orderBy && orderBy.length > 0) {
    partitions.forEach(items => {
      sortPartitionItems(items, orderBy);
    });
  }

  return partitions;
}
