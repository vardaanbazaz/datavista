import { Dataset, ColumnMetadata } from "@/shared/types";

/**
 * Heuristic for "this numeric column looks like it might actually be an ordinal
 * or category code" (Likert scales, boolean 0/1 codes, small fixed-range integer
 * codes) rather than a genuine continuous measure. Deliberately conservative —
 * see docs/superpowers/specs/2026-09-17-numeric-categorical-override-design.md
 * Part 1 for the validation table these thresholds were checked against.
 */
export function mightBeCategorical(columnMeta: ColumnMetadata): boolean {
  if (columnMeta.inferredDataType !== 'numeric') return false;
  if (!columnMeta.allIntegerValues) return false;
  if (columnMeta.uniqueValueCount < 2 || columnMeta.uniqueValueCount > 12) return false;
  if (columnMeta.minimumValue === undefined || columnMeta.maximumValue === undefined) return false;
  const span = columnMeta.maximumValue - columnMeta.minimumValue;
  if (span > 10) return false;
  return true;
}

/**
 * Single resolution point for "what type should this column be treated as".
 * Returns the user's override if one is set, otherwise the auto-detected type.
 * Every consumer that branches on column type should read through this (or
 * getEffectiveColumnTypes) instead of dataset.columnTypes[col] /
 * metadata.columns[].inferredDataType directly, so a user's override is
 * respected everywhere at once.
 */
export function getEffectiveColumnType(
  dataset: Dataset,
  columnName: string
): 'numeric' | 'categorical' | 'date' {
  const colMeta = dataset.metadata?.columns.find(c => c.name === columnName);
  if (colMeta?.userOverrideType) return colMeta.userOverrideType;
  return dataset.columnTypes[columnName];
}

/** Bulk form of getEffectiveColumnType, for per-column render loops and all-column filters. */
export function getEffectiveColumnTypes(dataset: Dataset): Record<string, 'numeric' | 'categorical' | 'date'> {
  const result: Record<string, 'numeric' | 'categorical' | 'date'> = {};
  dataset.columns.forEach(col => {
    result[col] = getEffectiveColumnType(dataset, col);
  });
  return result;
}
