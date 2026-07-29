import React from "react";
import { PivotResultModel, PivotColumnNode, PivotRowNode } from "@/shared/services/pivot";
import { cn } from "@/shared/lib/utils";

interface PivotTableProps {
  result: PivotResultModel;
}

export const PivotTable: React.FC<PivotTableProps> = ({ result }) => {
  const { config, rowHierarchy, columnHierarchy } = result;
  const { rowDimensions, columnDimensions, valueFields, displayOptions } = config;
  
  const showRowTotals = displayOptions?.showRowTotals !== false;
  const showColumnTotals = displayOptions?.showColumnTotals !== false;
  const showGrandTotals = displayOptions?.showGrandTotals !== false;

  // 1. Get visible columns
  const getVisibleColumns = (node: PivotColumnNode): PivotColumnNode[] => {
    const cols: PivotColumnNode[] = [];
    
    const traverse = (n: PivotColumnNode) => {
      if (n.children.length === 0) {
        cols.push(n);
      } else {
        // Nested columns
        for (const child of n.children) {
          traverse(child);
        }
        // Sub-total column for this group
        if (n.level === -1) {
          if (showGrandTotals) {
            cols.push({
              key: "Grand Total",
              level: n.level,
              path: [],
              children: [],
              isTotal: true
            });
          }
        } else if (showColumnTotals) {
          cols.push({
            key: `${n.key} Total`,
            dimension: n.dimension,
            level: n.level,
            path: n.path,
            children: [],
            isTotal: true
          });
        }
      }
    };
    
    traverse(node);
    return cols;
  };

  const visibleColumns = getVisibleColumns(columnHierarchy);

  // 2. Get visible rows
  const getVisibleRows = (node: PivotRowNode): PivotRowNode[] => {
    const rows: PivotRowNode[] = [];
    
    const traverse = (n: PivotRowNode) => {
      // Include the node
      if (n.level === -1) {
        // Grand Total row is handled separately or appended at the end
      } else {
        rows.push(n);
      }
      for (const child of n.children) {
        traverse(child);
      }
    };
    
    traverse(node);
    
    // Append Grand Total row at the bottom if enabled
    if (showGrandTotals) {
      rows.push(rowHierarchy);
    }
    
    return rows;
  };

  const visibleRows = getVisibleRows(rowHierarchy);

  // 3. Helper to determine if paths share the same prefix up to a certain index
  const isSamePrefix = (pathA: string[], pathB: string[], length: number): boolean => {
    if (pathA.length < length || pathB.length < length) return false;
    for (let i = 0; i < length; i++) {
      if (pathA[i] !== pathB[i]) return false;
    }
    return true;
  };

  // 4. Render column headers
  const renderColumnHeaders = () => {
    const headerRows: React.ReactNode[] = [];
    const numDims = columnDimensions.length;

    // For each column dimension, generate a header row
    for (let d = 0; d < numDims; d++) {
      const cells: React.ReactNode[] = [];
      let colIdx = 0;

      while (colIdx < visibleColumns.length) {
        const colNode = visibleColumns[colIdx];
        const prefix = colNode.path.slice(0, d + 1);
        
        let span = 1;
        while (
          colIdx + span < visibleColumns.length &&
          isSamePrefix(prefix, visibleColumns[colIdx + span].path.slice(0, d + 1), d + 1)
        ) {
          span++;
        }

        const value = prefix[d] || colNode.key;
        cells.push(
          <th
            key={`${d}-${colIdx}-${value}`}
            colSpan={span * valueFields.length}
            className={cn(
              "px-4 py-2 border border-gray-200 dark:border-white/10 text-center text-xs font-semibold uppercase tracking-wider transition-all duration-200",
              colNode.isTotal ? "bg-accent/30 text-accent-foreground font-bold" : "bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-zinc-400",
              d === 0 && "border-t-0"
            )}
          >
            {value}
          </th>
        );

        colIdx += span;
      }

      headerRows.push(
        <tr key={`col-dim-${d}`}>
          {d === 0 && (
            <th
              rowSpan={numDims + (valueFields.length > 1 ? 1 : 0)}
              className="px-4 py-3 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 align-middle min-w-[200px]"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-primary tracking-widest font-extrabold uppercase">Rows</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {rowDimensions.join(" → ") || "Grand Total"}
                </span>
                {columnDimensions.length > 0 && (
                  <>
                    <span className="text-[10px] text-secondary tracking-widest font-extrabold uppercase mt-1">Columns</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-400">
                      {columnDimensions.join(" → ")}
                    </span>
                  </>
                )}
              </div>
            </th>
          )}
          {cells}
        </tr>
      );
    }

    // Render value fields labels row if there are multiple value fields
    if (valueFields.length > 1) {
      const cells: React.ReactNode[] = [];
      visibleColumns.forEach((colNode) => {
        valueFields.forEach((vf) => {
          cells.push(
            <th
              key={`vf-${colNode.path.join("-")}-${vf.column}-${vf.operator}`}
              className={cn(
                "px-2 py-1.5 border border-gray-200 dark:border-white/10 text-center text-[10px] font-medium tracking-wider uppercase bg-gray-50 dark:bg-zinc-900/50 text-gray-500 dark:text-zinc-400",
                colNode.isTotal && "bg-accent/20 text-accent-foreground font-bold"
              )}
            >
              {vf.displayName}
            </th>
          );
        });
      });

      headerRows.push(
        <tr key="col-vf-labels">
          {cells}
        </tr>
      );
    }

    return headerRows;
  };

  // Helper to format values elegantly
  const formatCellValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return "—";
    if (Number.isInteger(val)) {
      return val.toLocaleString();
    }
    return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  };

  return (
    <div className="w-full overflow-hidden rounded-xl glass border border-gray-200 dark:border-white/10 shadow-2xl">
      <div className="w-full overflow-auto max-h-[70vh]">
        <table className="w-full border-collapse text-sm">
          <thead>
            {renderColumnHeaders()}
            {columnDimensions.length === 0 && (
              <tr>
                <th className="px-4 py-3 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 min-w-[200px]">
                  Rows
                </th>
                {valueFields.map((vf) => (
                  <th
                    key={`header-vf-${vf.column}-${vf.operator}`}
                    className="px-4 py-3 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900/50 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400"
                  >
                    {vf.displayName}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {visibleRows.map((rowNode) => {
              const isGrandTotalRow = rowNode.level === -1;
              const isParentRow = rowNode.children.length > 0;
              const showValues = !isParentRow || showRowTotals;

              return (
                <tr
                  key={`row-${rowNode.path.join("-")}-${rowNode.key}`}
                  className={cn(
                    "hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors duration-150 border-b border-gray-100 dark:border-white/5",
                    isGrandTotalRow && "bg-accent/20 font-bold border-t-2 border-double border-accent/50",
                    isParentRow && !isGrandTotalRow && "bg-gray-50/50 dark:bg-zinc-900/30 font-semibold"
                  )}
                >
                  {/* Row Header Cell with Nesting Indentation */}
                  <td
                    className="px-4 py-2.5 border border-border font-medium text-foreground relative select-none"
                    style={{
                      paddingLeft: isGrandTotalRow ? "1rem" : `${rowNode.level * 1.5 + 1}rem`
                    }}
                  >
                    {isParentRow && !isGrandTotalRow && (
                      <span className="inline-block w-2.5 h-2.5 mr-1 border-t-2 border-r-2 border-foreground/60 transform rotate-45 shrink-0 align-middle -translate-y-[2px]" />
                    )}
                    {rowNode.key}
                  </td>

                  {/* Values Cells */}
                  {visibleColumns.map((colNode) => {
                    return valueFields.map((vf) => {
                      const alias = `${vf.operator}_${vf.column}`;
                      const val = showValues ? result.getCell(rowNode.path, colNode.path, alias) : null;
                      
                      return (
                        <td
                          key={`cell-${rowNode.path.join("-")}-${colNode.path.join("-")}-${alias}`}
                          className={cn(
                            "px-4 py-2 border border-border text-right tabular-nums transition-all duration-200",
                            colNode.isTotal || isGrandTotalRow ? "bg-accent/10 font-semibold" : "",
                            isParentRow && !isGrandTotalRow ? "font-semibold" : ""
                          )}
                        >
                          {formatCellValue(val as number)}
                        </td>
                      );
                    });
                  })}

                  {/* If there are no column dimensions, just render the values */}
                  {columnDimensions.length === 0 &&
                    valueFields.map((vf) => {
                      const alias = `${vf.operator}_${vf.column}`;
                      const val = showValues ? result.getCell(rowNode.path, [], alias) : null;
                      return (
                        <td
                          key={`cell-${rowNode.path.join("-")}-none-${alias}`}
                          className={cn(
                            "px-4 py-2 border border-border text-right tabular-nums transition-all duration-200",
                            isGrandTotalRow && "bg-accent/10 font-bold"
                          )}
                        >
                          {formatCellValue(val as number)}
                        </td>
                      );
                    })}
                </tr>
              );
            })}

            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={1 + (visibleColumns.length || 1) * valueFields.length}
                  className="px-6 py-12 text-center text-muted-foreground bg-muted/10 italic"
                >
                  Configure Row / Column dimensions and Values to start analyzing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-muted/30 border-t border-border flex justify-between items-center text-xs text-muted-foreground select-none">
        <div>
          <span>Processed in </span>
          <span className="font-semibold text-foreground">{result.metadata.processingTimeMs.toFixed(1)}ms</span>
        </div>
        <div className="flex gap-4">
          <span>Rows: <span className="font-semibold text-foreground">{result.rows.length}</span></span>
          <span>Columns: <span className="font-semibold text-foreground">{result.columns.length}</span></span>
        </div>
      </div>
    </div>
  );
};
