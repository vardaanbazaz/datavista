import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PivotResultModel, PivotColumnNode, PivotRowNode, aggregationAdapter } from "@/shared/services/pivot";
import { cn } from "@/shared/lib/utils";

interface PivotTableProps {
  result: PivotResultModel;
}

/** Above this many body rows only the rows in view (plus overscan) are in the DOM. */
export const PIVOT_VIRTUALIZE_AT = 200;
/** Leaf columns rendered at most; a column dimension with thousands of values is cut here. */
export const PIVOT_MAX_COLUMNS = 100;
/** First guess per row before it is measured (default text size). */
const ROW_HEIGHT = 41;

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

  const allColumns = getVisibleColumns(columnHierarchy);
  // Keep the grand total column when cutting a very wide pivot.
  const columnsCut = allColumns.length > PIVOT_MAX_COLUMNS;
  const visibleColumns = columnsCut
    ? [...allColumns.slice(0, PIVOT_MAX_COLUMNS), ...allColumns.slice(PIVOT_MAX_COLUMNS).filter((c) => c.isTotal && c.level === -1)]
    : allColumns;

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

  // A pivot by a near-unique column (an app name, an invoice number) has thousands of rows;
  // rendering every one froze the view. Spacer rows keep the scroll height and column widths.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = visibleRows.length > PIVOT_VIRTUALIZE_AT;
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
    enabled: virtual,
  });
  const virtualItems = virtual ? rowVirtualizer.getVirtualItems() : [];
  const renderedRows = virtual
    ? virtualItems.map((v) => ({ rowNode: visibleRows[v.index], index: v.index }))
    : visibleRows.map((rowNode, index) => ({ rowNode, index }));
  const padTop = virtual && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const padBottom = virtual && virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;
  const totalColSpan = 1 + (visibleColumns.length || 1) * valueFields.length;

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
              "px-4 py-2 border border-border text-center text-sm font-semibold",
              colNode.isTotal ? "bg-primary/10 text-primary-ink font-bold" : "bg-muted/50 text-textTertiary",
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
              className="px-4 py-3 border border-border bg-muted/50 text-left text-sm font-semibold text-textTertiary align-middle min-w-[200px]"
            >
              <div className="flex flex-col gap-1">
                <span className="text-caption font-semibold text-muted-foreground">Rows</span>
                <span className="text-body font-semibold text-foreground normal-case">
                  {rowDimensions.join(" → ") || "Grand Total"}
                </span>
                {columnDimensions.length > 0 && (
                  <>
                    <span className="text-caption font-semibold text-muted-foreground mt-1">Columns</span>
                    <span className="text-xs text-muted-foreground normal-case">
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
              key={`vf-${colNode.path.join("-")}-${aggregationAdapter.getValueFieldAlias(vf)}`}
              className={cn(
                "px-2 py-1.5 border border-border text-center text-sm font-semibold bg-muted/50 text-textTertiary",
                colNode.isTotal && "bg-primary/10 text-primary-ink font-bold"
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
    <div className="w-full overflow-hidden rounded-xl surface-solid border border-border shadow-2xl">
      <div ref={scrollRef} className="w-full overflow-auto max-h-[70vh]" data-testid="pivot-scroll">
        <table className="w-full border-collapse text-sm">
          <thead>
            {renderColumnHeaders()}
            {columnDimensions.length === 0 && (
              <tr>
                <th className="px-4 py-3 border border-border bg-muted/50 text-left text-sm font-semibold text-textTertiary min-w-[200px]">
                  Rows
                </th>
                {valueFields.map((vf) => (
                  <th
                    key={`header-vf-${aggregationAdapter.getValueFieldAlias(vf)}`}
                    className="px-4 py-3 border border-border bg-muted/50 text-center text-sm font-semibold text-textTertiary"
                  >
                    {vf.displayName}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden="true" style={{ height: padTop }}>
                <td colSpan={totalColSpan} className="p-0 border-0" />
              </tr>
            )}
            {renderedRows.map(({ rowNode, index }) => {
              const isGrandTotalRow = rowNode.level === -1;
              const isParentRow = rowNode.children.length > 0;
              const showValues = !isParentRow || showRowTotals;

              return (
                <tr
                  key={`row-${rowNode.path.join("-")}-${rowNode.key}`}
                  // Measured, not assumed: row height follows the Reading comfort text size.
                  ref={virtual ? rowVirtualizer.measureElement : undefined}
                  data-index={index}
                  className={cn(
                    "hover:bg-muted/50 border-b border-border/60",
                    isGrandTotalRow && "bg-tertiary/20 font-bold border-t-2 border-double border-tertiary/40",
                    isParentRow && !isGrandTotalRow && "bg-muted/30 font-semibold"
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
                      const alias = aggregationAdapter.getValueFieldAlias(vf);
                      const val = showValues ? result.getCell(rowNode.path, colNode.path, alias) : null;
                      
                      return (
                        <td
                          key={`cell-${rowNode.path.join("-")}-${colNode.path.join("-")}-${alias}`}
                          className={cn(
                            "px-4 py-2 border border-border text-right text-dataTable tabular-nums",
                            colNode.isTotal || isGrandTotalRow ? "bg-tertiary/20 font-semibold" : "",
                            isParentRow && !isGrandTotalRow ? "font-semibold" : ""
                          )}
                        >
                          {formatCellValue(val as number)}
                        </td>
                      );
                    });
                  })}
                </tr>
              );
            })}
            {padBottom > 0 && (
              <tr aria-hidden="true" style={{ height: padBottom }}>
                <td colSpan={totalColSpan} className="p-0 border-0" />
              </tr>
            )}

            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={totalColSpan}
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
          <span className="text-dataTable text-foreground">{result.metadata.processingTimeMs.toFixed(1)}ms</span>
        </div>
        <div className="flex gap-4">
          {columnsCut && (
            <span data-testid="pivot-columns-cut">
              First {PIVOT_MAX_COLUMNS} of {allColumns.length.toLocaleString()} columns shown; filter or pick a column dimension with fewer values.
            </span>
          )}
          <span>Rows: <span className="text-dataTable text-foreground">{result.rows.length}</span></span>
          <span>Columns: <span className="text-dataTable text-foreground">{result.columns.length}</span></span>
        </div>
      </div>
    </div>
  );
};
