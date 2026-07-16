import React, { useState, useMemo } from "react";
import { useDatasetStore } from "@/store/datasetStore";
import { WindowQuery, WindowFunctionType, WindowFrameBound, WindowOrderBy, WindowFrame } from "@/shared/services/window/types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { DataTable } from "@/features/datasets/components/DataTable";
import { 
  Plus, 
  Trash2, 
  Settings, 
  Columns, 
  ChevronRight, 
  ArrowUpDown, 
  Layers,
  HelpCircle
} from "lucide-react";

export const WindowExplorer: React.FC = () => {
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const addWindowQuery = useDatasetStore((state) => state.addWindowQuery);
  const deleteWindowQuery = useDatasetStore((state) => state.deleteWindowQuery);

  // Form State
  const [alias, setAlias] = useState("");
  const [functionType, setFunctionType] = useState<WindowFunctionType>("MOVING_AVG");
  const [targetColumn, setTargetColumn] = useState("");
  const [partitionBy, setPartitionBy] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<WindowOrderBy[]>([]);
  
  // Sort selection helper
  const [selectedSortCol, setSelectedSortCol] = useState("");
  const [selectedSortDir, setSelectedSortDir] = useState<"asc" | "desc">("asc");

  // Frame States
  const [useCustomFrame, setUseCustomFrame] = useState(false);
  const [frameStartType, setFrameStartType] = useState<WindowFrameBound["type"]>("UNBOUNDED_PRECEDING");
  const [frameStartVal, setFrameStartVal] = useState("3");
  const [frameEndType, setFrameEndType] = useState<WindowFrameBound["type"]>("CURRENT_ROW");
  const [frameEndVal, setFrameEndVal] = useState("0");

  // Offset & Args States
  const [offset, setOffset] = useState("1");
  const [defaultValue, setDefaultValue] = useState("");
  const [ntileGroups, setNtileGroups] = useState("4");

  // Columns resolution
  const columns = useMemo(() => {
    if (!activeDataset) return [];
    return activeDataset.columns;
  }, [activeDataset]);

  const numericColumns = useMemo(() => {
    if (!activeDataset) return [];
    if (activeDataset.metadata) {
      return activeDataset.metadata.columns
        .filter(c => c.inferredDataType === 'numeric')
        .map(c => c.name);
    }
    return activeDataset.columns.filter(col => activeDataset.columnTypes[col] === 'numeric');
  }, [activeDataset]);

  // Defaults
  React.useEffect(() => {
    if (numericColumns.length > 0 && !targetColumn) {
      setTargetColumn(numericColumns[0]);
    }
  }, [numericColumns, targetColumn]);

  if (!activeDataset) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
          <HelpCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Active Dataset</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Please upload or select a dataset first to begin window functions builder.
        </p>
      </div>
    );
  }

  // Handle Sort Rule Addition
  const handleAddSortRule = () => {
    if (!selectedSortCol) return;
    if (orderBy.some(rule => rule.column === selectedSortCol)) return;
    setOrderBy([...orderBy, { column: selectedSortCol, direction: selectedSortDir }]);
    setSelectedSortCol("");
  };

  const handleRemoveSortRule = (colName: string) => {
    setOrderBy(orderBy.filter(rule => rule.column !== colName));
  };

  // Handle Partition Toggles
  const handleTogglePartitionCol = (colName: string) => {
    if (partitionBy.includes(colName)) {
      setPartitionBy(partitionBy.filter(c => c !== colName));
    } else {
      setPartitionBy([...partitionBy, colName]);
    }
  };

  // Form Submission
  const handleCreateColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAlias = alias.trim();
    if (!cleanAlias) return;

    // Build frame
    let frame: WindowFrame | undefined = undefined;
    if (useCustomFrame) {
      frame = {
        type: "ROWS",
        start: {
          type: frameStartType,
          value: (frameStartType === "PRECEDING" || frameStartType === "FOLLOWING") ? parseInt(frameStartVal) : undefined
        },
        end: {
          type: frameEndType,
          value: (frameEndType === "PRECEDING" || frameEndType === "FOLLOWING") ? parseInt(frameEndVal) : undefined
        }
      };
    }

    const query: WindowQuery = {
      alias: cleanAlias,
      functionType,
      targetColumn: (functionType !== "ROW_NUMBER" && functionType !== "RANK" && functionType !== "DENSE_RANK" && functionType !== "PERCENT_RANK" && functionType !== "NTILE") ? targetColumn : undefined,
      partitionBy: partitionBy.length > 0 ? partitionBy : undefined,
      orderBy: orderBy.length > 0 ? orderBy : undefined,
      frame,
      offset: (functionType === "LAG" || functionType === "LEAD") ? parseInt(offset) : undefined,
      defaultValue: (functionType === "LAG" || functionType === "LEAD") ? (defaultValue ? (isNaN(Number(defaultValue)) ? defaultValue : Number(defaultValue)) : null) : undefined,
      ntileGroups: functionType === "NTILE" ? parseInt(ntileGroups) : undefined
    };

    addWindowQuery(query);

    // Reset Form
    setAlias("");
    setPartitionBy([]);
    setOrderBy([]);
  };

  const needsTargetCol = functionType !== "ROW_NUMBER" && functionType !== "RANK" && functionType !== "DENSE_RANK" && functionType !== "PERCENT_RANK" && functionType !== "NTILE";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full animate-fade-in">
      
      {/* Sidebar Controls */}
      <div className="lg:col-span-4 space-y-6">
        
        {/* Form Panel */}
        <Card className="glass shadow-xl border-border/80">
          <CardHeader className="pb-3 select-none">
            <CardTitle className="flex items-center gap-2 text-md font-bold">
              <Plus className="w-5 h-5 text-primary" />
              Add Window Column
            </CardTitle>
            <CardDescription className="text-xs">
              Define analytical window calculations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <form onSubmit={handleCreateColumn} className="space-y-4">
              
              {/* Alias */}
              <div className="space-y-1.5">
                <Label htmlFor="alias" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  New Column Name (Alias)
                </Label>
                <Input
                  id="alias"
                  placeholder="e.g. running_sales_total"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value.replace(/\s+/g, '_'))}
                  required
                  className="h-9 text-xs"
                />
              </div>

              {/* Function Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Window Function
                </Label>
                <Select value={functionType} onValueChange={(val) => setFunctionType(val as WindowFunctionType)}>
                  <SelectTrigger className="h-9 text-xs bg-background/50">
                    <SelectValue placeholder="Choose a function" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="MOVING_AVG">Moving Average (MOVING_AVG)</SelectItem>
                    <SelectItem value="RUNNING_TOTAL">Running Total (RUNNING_TOTAL)</SelectItem>
                    <SelectItem value="WINDOW_MIN">Window Minimum (WINDOW_MIN)</SelectItem>
                    <SelectItem value="WINDOW_MAX">Window Maximum (WINDOW_MAX)</SelectItem>
                    <SelectItem value="ROW_NUMBER">Row Number (ROW_NUMBER)</SelectItem>
                    <SelectItem value="RANK">Rank (RANK)</SelectItem>
                    <SelectItem value="DENSE_RANK">Dense Rank (DENSE_RANK)</SelectItem>
                    <SelectItem value="PERCENT_RANK">Percent Rank (PERCENT_RANK)</SelectItem>
                    <SelectItem value="NTILE">Ntile (NTILE)</SelectItem>
                    <SelectItem value="LAG">Lag Value (LAG)</SelectItem>
                    <SelectItem value="LEAD">Lead Value (LEAD)</SelectItem>
                    <SelectItem value="FIRST_VALUE">First Value in Frame</SelectItem>
                    <SelectItem value="LAST_VALUE">Last Value in Frame</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Target Column */}
              {needsTargetCol && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Target Column
                  </Label>
                  <Select value={targetColumn} onValueChange={setTargetColumn}>
                    <SelectTrigger className="h-9 text-xs bg-background/50">
                      <SelectValue placeholder="Select target field" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* LAG / LEAD arguments */}
              {(functionType === "LAG" || functionType === "LEAD") && (
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Offset</Label>
                    <Input
                      type="number"
                      min="1"
                      value={offset}
                      onChange={(e) => setOffset(e.target.value)}
                      className="h-8.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Default Value</Label>
                    <Input
                      placeholder="null"
                      value={defaultValue}
                      onChange={(e) => setDefaultValue(e.target.value)}
                      className="h-8.5 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* NTILE Groups */}
              {functionType === "NTILE" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Ntile Buckets</Label>
                  <Input
                    type="number"
                    min="1"
                    value={ntileGroups}
                    onChange={(e) => setNtileGroups(e.target.value)}
                    className="h-8.5 text-xs"
                  />
                </div>
              )}

              <Separator className="bg-border/60" />

              {/* Partition By */}
              <div className="space-y-2 select-none">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Partition By</span>
                </div>
                <ScrollArea className="h-28 border rounded-md p-2 bg-muted/10">
                  <div className="space-y-2">
                    {columns.map(col => (
                      <div key={`part-${col}`} className="flex items-center space-x-2">
                        <Checkbox
                          id={`part-${col}`}
                          checked={partitionBy.includes(col)}
                          onCheckedChange={() => handleTogglePartitionCol(col)}
                        />
                        <label htmlFor={`part-${col}`} className="text-xs font-medium leading-none cursor-pointer">
                          {col}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Order By */}
              <div className="space-y-2.5 select-none">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Order By</span>
                </div>
                
                {/* Active Sort list */}
                {orderBy.length > 0 && (
                  <div className="flex flex-wrap gap-1 border border-dashed rounded-md p-1.5 min-h-[38px] bg-muted/5">
                    {orderBy.map(rule => (
                      <Badge key={`order-${rule.column}`} variant="secondary" className="text-[10px] pr-1.5 h-6 flex items-center gap-1">
                        <span>{rule.column} ({rule.direction.toUpperCase()})</span>
                        <button type="button" onClick={() => handleRemoveSortRule(rule.column)} className="text-muted-foreground hover:text-foreground">
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Add rule form */}
                <div className="flex gap-2">
                  <Select value={selectedSortCol} onValueChange={setSelectedSortCol}>
                    <SelectTrigger className="h-8 text-[11px] bg-background/50 flex-1">
                      <SelectValue placeholder="Add sorting column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.filter(c => !orderBy.some(rule => rule.column === c)).map(col => (
                        <SelectItem key={`sort-col-${col}`} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedSortDir} onValueChange={(v) => setSelectedSortDir(v as "asc" | "desc")}>
                    <SelectTrigger className="h-8 w-20 text-[11px] bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">ASC</SelectItem>
                      <SelectItem value="desc">DESC</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button type="button" onClick={handleAddSortRule} size="sm" variant="outline" className="h-8">
                    Add
                  </Button>
                </div>
              </div>

              <Separator className="bg-border/60" />

              {/* Window Frame */}
              {needsTargetCol && (
                <div className="space-y-3.5 select-none">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="customFrame"
                      checked={useCustomFrame}
                      onCheckedChange={(checked) => setUseCustomFrame(!!checked)}
                    />
                    <label htmlFor="customFrame" className="text-xs font-bold text-muted-foreground uppercase tracking-wider cursor-pointer">
                      Use Custom Window Frame
                    </label>
                  </div>

                  {useCustomFrame && (
                    <div className="space-y-3 p-3 border border-border/80 rounded-lg bg-muted/10 animate-slide-in">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Frame Start</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={frameStartType} onValueChange={(val) => setFrameStartType(val as WindowFrameBound["type"])}>
                            <SelectTrigger className="h-8 text-[10px] bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UNBOUNDED_PRECEDING">UNBOUNDED PRECEDING</SelectItem>
                              <SelectItem value="PRECEDING">PRECEDING</SelectItem>
                              <SelectItem value="CURRENT_ROW">CURRENT ROW</SelectItem>
                              <SelectItem value="FOLLOWING">FOLLOWING</SelectItem>
                            </SelectContent>
                          </Select>

                          {(frameStartType === "PRECEDING" || frameStartType === "FOLLOWING") && (
                            <Input
                              type="number"
                              min="1"
                              value={frameStartVal}
                              onChange={(e) => setFrameStartVal(e.target.value)}
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase">Frame End</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={frameEndType} onValueChange={(val) => setFrameEndType(val as WindowFrameBound["type"])}>
                            <SelectTrigger className="h-8 text-[10px] bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UNBOUNDED_FOLLOWING">UNBOUNDED FOLLOWING</SelectItem>
                              <SelectItem value="PRECEDING">PRECEDING</SelectItem>
                              <SelectItem value="CURRENT_ROW">CURRENT ROW</SelectItem>
                              <SelectItem value="FOLLOWING">FOLLOWING</SelectItem>
                            </SelectContent>
                          </Select>

                          {(frameEndType === "PRECEDING" || frameEndType === "FOLLOWING") && (
                            <Input
                              type="number"
                              min="0"
                              value={frameEndVal}
                              onChange={(e) => setFrameEndVal(e.target.value)}
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full text-xs h-9 bg-primary hover:bg-primary/95 text-primary-foreground font-bold rounded-lg shadow-md">
                Add Column
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Preview Table & Active Columns Panel */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* Configured Columns Card */}
        {activeDataset.windowQueries && activeDataset.windowQueries.length > 0 && (
          <Card className="glass border-border/80 shadow-md">
            <CardHeader className="pb-3 select-none">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Columns className="w-5 h-5 text-secondary" />
                Configured Window Columns ({activeDataset.windowQueries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2.5">
                {activeDataset.windowQueries.map(q => (
                  <Badge 
                    key={`active-q-${q.alias}`} 
                    variant="outline" 
                    className="pl-3 pr-2 py-1.5 h-8 text-xs border-primary/20 bg-primary/5 flex items-center gap-2 rounded-lg"
                  >
                    <span className="font-semibold text-foreground">{q.alias}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">({q.functionType})</span>
                    <button 
                      onClick={() => deleteWindowQuery(q.alias)} 
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0 pl-1 border-l border-border/85"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Preview Table */}
        <div className="w-full">
          <DataTable />
        </div>
      </div>
    </div>
  );
};
export default WindowExplorer;
