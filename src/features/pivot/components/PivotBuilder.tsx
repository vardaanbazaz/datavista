import React from "react";
import { cn } from "@/shared/lib/utils";
import { Dataset, AggregationOperator } from "@/shared/types";
import { getEffectiveColumnType } from "@/shared/utils/columnType";
import { aggregationFlag, aggregationNote } from "@/shared/utils/columnRoles";
import { PivotConfig, PivotValueField } from "@/shared/services/pivot";
import { usePivotStore } from "@/store/pivotStore";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  X,
  ArrowUp,
  ArrowDown,
  Hash,
  Type,
  Calendar,
  Sparkles,
  Settings2
} from "lucide-react";
import { Hint } from "@/shared/components/Hint";

interface PivotBuilderProps {
  dataset: Dataset;
}

// "COUNT_ROWS of Item" would read as a count of Item's values; it counts every row.
const valueFieldDisplayName = (operator: AggregationOperator, column: string) => {
  if (operator === "count_rows") return "Count of rows";
  if (operator === "stddev") return `Std. deviation (sample) of ${column}`;
  return `${operator.toUpperCase()} of ${column}`;
};

const AGGREGATION_OPTIONS: { value: AggregationOperator; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count" },
  { value: "count_rows", label: "Count of rows" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "median", label: "Median" },
  { value: "stddev", label: "Std. deviation (sample)" },
  { value: "count_distinct", label: "Distinct Count" },
  { value: "weighted_average", label: "Weighted Average" },
  { value: "percentile", label: "Percentile" },
  { value: "sum_if", label: "Sum If" },
  { value: "count_if", label: "Count If" },
];

export const PivotBuilder: React.FC<PivotBuilderProps> = ({ dataset }) => {
  const pivotConfig = usePivotStore((state) => state.pivotConfig);
  const setPivotConfig = usePivotStore((state) => state.setPivotConfig);

  // Initialize config if null
  const currentConfig: PivotConfig = pivotConfig || {
    rowDimensions: [],
    columnDimensions: [],
    valueFields: [],
    displayOptions: {
      showRowTotals: true,
      showColumnTotals: true,
      showGrandTotals: true,
    },
  };

  const updateConfig = (newConfig: Partial<PivotConfig>) => {
    setPivotConfig({
      ...currentConfig,
      ...newConfig,
    });
  };

  const updateDisplayOption = (key: 'showRowTotals' | 'showColumnTotals' | 'showGrandTotals', val: boolean) => {
    updateConfig({
      displayOptions: {
        ...currentConfig.displayOptions,
        [key]: val,
      },
    });
  };

  // Helper to get column metadata or type
  const getColumnsMetadata = (): { name: string; type: 'numeric' | 'categorical' | 'date'; role: string }[] => {
    if (dataset.metadata) {
      return dataset.metadata.columns.map(c => ({
        name: c.name,
        type: getEffectiveColumnType(dataset, c.name),
        role: c.role,
      }));
    }
    return dataset.columns.map(colName => ({
      name: colName,
      type: getEffectiveColumnType(dataset, colName),
      role: getEffectiveColumnType(dataset, colName) === 'numeric' ? 'measure' : 'dimension',
    }));
  };

  const columns = getColumnsMetadata();

  const renderTypeIcon = (type: string, role: string) => {
    if (role === 'calculated') {
      return <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    switch (type) {
      case 'numeric':
        return <Hash className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'categorical':
      default:
        return <Type className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    }
  };

  // Add field to Row dimensions
  const addRowDimension = (colName: string) => {
    if (currentConfig.rowDimensions.includes(colName)) return;
    updateConfig({
      rowDimensions: [...currentConfig.rowDimensions, colName],
      // Remove from columns if it exists there to keep it clean (or allow duplicate dimensions, though clean pivot hides it)
      columnDimensions: currentConfig.columnDimensions.filter(c => c !== colName),
    });
  };

  // Add field to Column dimensions
  const addColumnDimension = (colName: string) => {
    if (currentConfig.columnDimensions.includes(colName)) return;
    updateConfig({
      columnDimensions: [...currentConfig.columnDimensions, colName],
      rowDimensions: currentConfig.rowDimensions.filter(r => r !== colName),
    });
  };

  // Add field to Values
  const addValueField = (colName: string, operator: AggregationOperator = 'sum') => {
    // We can allow multiple of the same value fields with different aggregates
    const colMetadata = columns.find(c => c.name === colName);
    // Year- and ID-like numbers start as Count (adding them up means nothing); the user can still pick Sum.
    const resolvedOp = (colMetadata?.type === 'numeric' && !aggregationFlag(dataset, colName) ? operator : 'count') as AggregationOperator;
    
    const vf: PivotValueField = {
      column: colName,
      operator: resolvedOp,
      displayName: valueFieldDisplayName(resolvedOp, colName),
    };
    updateConfig({
      valueFields: [...currentConfig.valueFields, vf],
    });
  };

  // Remove rows
  const removeRowDimension = (idx: number) => {
    const list = [...currentConfig.rowDimensions];
    list.splice(idx, 1);
    updateConfig({ rowDimensions: list });
  };

  // Remove columns
  const removeColumnDimension = (idx: number) => {
    const list = [...currentConfig.columnDimensions];
    list.splice(idx, 1);
    updateConfig({ columnDimensions: list });
  };

  // Remove values
  const removeValueField = (idx: number) => {
    const list = [...currentConfig.valueFields];
    list.splice(idx, 1);
    updateConfig({ valueFields: list });
  };

  // Reorder Row dimensions
  const moveRowDimension = (idx: number, direction: 'up' | 'down') => {
    const list = [...currentConfig.rowDimensions];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    updateConfig({ rowDimensions: list });
  };

  // Reorder Column dimensions
  const moveColumnDimension = (idx: number, direction: 'up' | 'down') => {
    const list = [...currentConfig.columnDimensions];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    updateConfig({ columnDimensions: list });
  };

  // Update value aggregation operator
  const updateValueOperator = (idx: number, operator: AggregationOperator) => {
    const list = [...currentConfig.valueFields];
    list[idx] = {
      ...list[idx],
      operator,
      displayName: valueFieldDisplayName(operator, list[idx].column),
      percentileValue: operator === 'percentile' ? (list[idx].percentileValue ?? 90) : list[idx].percentileValue,
      weightColumn: operator === 'weighted_average' ? (list[idx].weightColumn ?? "") : list[idx].weightColumn,
      conditionExpression: (operator === 'sum_if' || operator === 'count_if') ? (list[idx].conditionExpression ?? "") : list[idx].conditionExpression,
    };
    updateConfig({ valueFields: list });
  };

  const updateValueFieldParams = (idx: number, params: Partial<PivotValueField>) => {
    const list = [...currentConfig.valueFields];
    list[idx] = {
      ...list[idx],
      ...params,
    };
    updateConfig({ valueFields: list });
  };

  return (
    <div className="w-full lg:w-80 shrink-0 glass border border-border rounded-xl flex flex-col h-[78vh] shadow-xl overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-2 select-none">
        <Settings2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm tracking-wide uppercase">Pivot Settings</h3>
      </div>

      <ScrollArea className="flex-1 p-4 space-y-5">
        {/* Available Fields */}
        <div className="space-y-2">
          <span className="text-caption uppercase text-textTertiary select-none">Fields</span>
          <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {columns.map((col) => {
              const inRows = currentConfig.rowDimensions.includes(col.name);
              const inCols = currentConfig.columnDimensions.includes(col.name);
              
              return (
                <div
                  key={col.name}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/55 hover:border-primary/50 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {renderTypeIcon(col.type, col.role)}
                    <span className="text-xs font-medium truncate" title={col.name}>
                      {col.name}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addRowDimension(col.name)}
                          className={cn("text-[9px] px-1.5 h-6", inRows && "bg-primary/20 hover:bg-primary/30 border-primary text-primary")}
                        >
                          Row
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Add field as a row dimension</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addColumnDimension(col.name)}
                          className={cn("text-[9px] px-1.5 h-6", inCols && "bg-primary/20 hover:bg-primary/30 border-primary text-primary")}
                        >
                          Col
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Add field as a column dimension</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addValueField(col.name, col.type === 'numeric' ? 'sum' : 'count')}
                          className="text-[9px] px-1.5 h-6"
                        >
                          + Val
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Add field to aggregate value metrics</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator className="bg-border/60" />

        {/* Row Dimensions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between select-none">
            <span className="text-caption uppercase text-textTertiary">Row Dimensions</span>
            <Badge variant="outline" className="text-[10px] font-semibold text-primary">{currentConfig.rowDimensions.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {currentConfig.rowDimensions.map((dim, idx) => (
              <div
                key={`row-dim-${dim}-${idx}`}
                className="flex items-center justify-between p-2 [@media(pointer:coarse)]:pr-4 rounded-lg bg-primary/5 border border-primary/20"
              >
                <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
                  {dim}
                </span>
                <div className="flex items-center gap-1 [@media(pointer:coarse)]:gap-6">
                  <Hint label={`Move ${dim} up`} disabledReason="already first">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-5 h-5"
                      disabled={idx === 0}
                      onClick={() => moveRowDimension(idx, "up")}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                  </Hint>
                  <Hint label={`Move ${dim} down`} disabledReason="already last">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-5 h-5"
                      disabled={idx === currentConfig.rowDimensions.length - 1}
                      onClick={() => moveRowDimension(idx, "down")}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                  </Hint>
                  <Hint label={`Remove ${dim} from rows`}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-5 h-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeRowDimension(idx)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </Hint>
                </div>
              </div>
            ))}
            {currentConfig.rowDimensions.length === 0 && (
              <div className="text-[11px] text-center text-muted-foreground italic py-3 bg-muted/20 border border-dashed rounded-lg border-border/80 select-none">
                No row groupings selected.
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-border/60" />

        {/* Column Dimensions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between select-none">
            <span className="text-caption uppercase text-textTertiary">Column Dimensions</span>
            <Badge variant="outline" className="text-[10px] font-semibold text-primary">{currentConfig.columnDimensions.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {currentConfig.columnDimensions.map((dim, idx) => (
              <div
                key={`col-dim-${dim}-${idx}`}
                className="flex items-center justify-between p-2 [@media(pointer:coarse)]:pr-4 rounded-lg bg-primary/5 border border-primary/20"
              >
                <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
                  {dim}
                </span>
                <div className="flex items-center gap-1 [@media(pointer:coarse)]:gap-6">
                  <Hint label={`Move ${dim} up`} disabledReason="already first">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-5 h-5"
                      disabled={idx === 0}
                      onClick={() => moveColumnDimension(idx, "up")}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                  </Hint>
                  <Hint label={`Move ${dim} down`} disabledReason="already last">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-5 h-5"
                      disabled={idx === currentConfig.columnDimensions.length - 1}
                      onClick={() => moveColumnDimension(idx, "down")}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                  </Hint>
                  <Hint label={`Remove ${dim} from columns`}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-5 h-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeColumnDimension(idx)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </Hint>
                </div>
              </div>
            ))}
            {currentConfig.columnDimensions.length === 0 && (
              <div className="text-[11px] text-center text-muted-foreground italic py-3 bg-muted/20 border border-dashed rounded-lg border-border/80 select-none">
                No column groupings selected.
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-border/60" />

        {/* Value Fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between select-none">
            <span className="text-caption uppercase text-textTertiary">Values / Aggregates</span>
            <Badge variant="outline" className="text-[10px] font-semibold text-primary">{currentConfig.valueFields.length}</Badge>
          </div>
          <div className="space-y-2">
            {currentConfig.valueFields.map((vf, idx) => {
              const colMetadata = columns.find(c => c.name === vf.column);
              const isNumeric = colMetadata?.type === 'numeric';
              
              return (
                <div
                  key={`vf-${vf.column}-${idx}`}
                  className="p-2 [@media(pointer:coarse)]:pr-4 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground truncate max-w-[170px]">
                      {vf.column}
                    </span>
                    <Hint label={`Remove value ${vf.column}`}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-5 h-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeValueField(idx)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </Hint>
                  </div>
                  <div className="flex flex-col gap-1.5 w-full">
                    <Select
                      value={vf.operator}
                      onValueChange={(val) => updateValueOperator(idx, val as AggregationOperator)}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background/50 border-primary/25">
                        <SelectValue placeholder="Select aggregation" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGGREGATION_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            disabled={!isNumeric && !["count", "count_rows", "count_distinct", "count_if"].includes(opt.value)}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {aggregationNote(aggregationFlag(dataset, vf.column), vf.operator) && (
                      <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-400" role="note" data-testid="aggregation-note">
                        {aggregationNote(aggregationFlag(dataset, vf.column), vf.operator)}
                      </p>
                    )}

                    {/* Weighted Average Secondary Input */}
                    {vf.operator === "weighted_average" && (
                      <div className="space-y-1 mt-1">
                        <Label className="text-[9px] font-bold text-muted-foreground uppercase">Weight Column</Label>
                        <Select
                          value={vf.weightColumn || ""}
                          onValueChange={(val) => updateValueFieldParams(idx, { weightColumn: val })}
                        >
                          <SelectTrigger className="h-7 text-xs bg-background/50 border-primary/25">
                            <SelectValue placeholder="Select weight" />
                          </SelectTrigger>
                          <SelectContent>
                            {columns
                              .filter((c) => c.type === "numeric")
                              .map((c) => (
                                <SelectItem key={c.name} value={c.name}>
                                  {c.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Percentile Secondary Input */}
                    {vf.operator === "percentile" && (
                      <div className="space-y-1 mt-1">
                        <Label className="text-[9px] font-bold text-muted-foreground uppercase">Percentile (0-100)</Label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={vf.percentileValue !== undefined ? vf.percentileValue : 90}
                          onChange={(e) => updateValueFieldParams(idx, { percentileValue: Number(e.target.value) })}
                          className="w-full h-7 px-2 text-xs rounded border border-primary/25 bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    )}

                    {/* Condition Formula Secondary Input */}
                    {(vf.operator === "sum_if" || vf.operator === "count_if") && (
                      <div className="space-y-1 mt-1">
                        <Label className="text-[9px] font-bold text-muted-foreground uppercase">Condition Formula</Label>
                        <input
                          type="text"
                          placeholder='e.g. [Status] = "Active"'
                          value={vf.conditionExpression || ""}
                          onChange={(e) => updateValueFieldParams(idx, { conditionExpression: e.target.value })}
                          className="w-full h-7 px-2 text-xs rounded border border-primary/25 bg-background/50 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {currentConfig.valueFields.length === 0 && (
              <div className="text-[11px] text-center text-muted-foreground italic py-3 bg-muted/20 border border-dashed rounded-lg border-border/80 select-none">
                No aggregation values selected.
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-border/60" />

        {/* Display Settings */}
        <div className="space-y-3 pb-2 select-none">
          <span className="text-caption uppercase text-textTertiary">Display Settings</span>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showRowTotals"
                checked={currentConfig.displayOptions?.showRowTotals !== false}
                onCheckedChange={(checked) => updateDisplayOption('showRowTotals', !!checked)}
              />
              <Label htmlFor="showRowTotals" className="text-xs font-medium cursor-pointer">
                Show Row Subtotals
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showColumnTotals"
                checked={currentConfig.displayOptions?.showColumnTotals !== false}
                onCheckedChange={(checked) => updateDisplayOption('showColumnTotals', !!checked)}
              />
              <Label htmlFor="showColumnTotals" className="text-xs font-medium cursor-pointer">
                Show Column Subtotals
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showGrandTotals"
                checked={currentConfig.displayOptions?.showGrandTotals !== false}
                onCheckedChange={(checked) => updateDisplayOption('showGrandTotals', !!checked)}
              />
              <Label htmlFor="showGrandTotals" className="text-xs font-medium cursor-pointer">
                Show Grand Totals
              </Label>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
