import React, { useState, useMemo } from "react";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { usePivotStore } from "@/store/pivotStore";
import { statsEngine } from "@/shared/services/stats";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Dataset } from "@/shared/types";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  Grid3X3, 
  HelpCircle,
  Percent,
  Compass,
  ArrowRightLeft
} from "lucide-react";

export const StatsExplorer: React.FC = () => {
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const filteredData = useFilterStore((state) => state.filteredData);
  const pivotResult = usePivotStore((state) => state.pivotResult);

  const [activeTab, setActiveTab] = useState<'summary' | 'correlation' | 'outliers' | 'pivot'>('summary');
  
  // States for descriptive & outliers
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [outlierMethod, setOutlierMethod] = useState<'iqr' | 'zscore'>('iqr');
  const [outlierThreshold, setOutlierThreshold] = useState<number>(1.5);

  // States for Pivot slicing
  const [pivotSliceType, setPivotSliceType] = useState<'row' | 'col'>('row');
  const [selectedPivotRowKey, setSelectedPivotRowKey] = useState<string>("");
  const [selectedPivotColKey, setSelectedPivotColKey] = useState<string>("");
  const [selectedPivotValField, setSelectedPivotValField] = useState<string>("");

  // Resolve numeric columns
  const numericColumns = useMemo(() => {
    if (!activeDataset) return [];
    if (activeDataset.metadata) {
      return activeDataset.metadata.columns
        .filter(c => c.inferredDataType === 'numeric')
        .map(c => c.name);
    }
    return activeDataset.columns.filter(
      col => activeDataset.columnTypes[col] === 'numeric'
    );
  }, [activeDataset]);

  // Set default column
  React.useEffect(() => {
    if (numericColumns.length > 0 && !selectedColumn) {
      setSelectedColumn(numericColumns[0]);
    }
  }, [numericColumns, selectedColumn]);

  // Adjust default threshold when method changes
  React.useEffect(() => {
    setOutlierThreshold(outlierMethod === 'iqr' ? 1.5 : 3.0);
  }, [outlierMethod]);

  // Compute all dataset statistics based on filtered data (Query Engine output)
  const statsResult = useMemo(() => {
    if (!activeDataset || filteredData.length === 0) return null;
    
    // Construct a synthetic dataset wrapping the filtered rows to run calculations
    const syntheticDataset: Dataset = {
      ...activeDataset,
      data: filteredData
    };

    return statsEngine.calculateDatasetStats(syntheticDataset, {
      outlierMethod,
      outlierThreshold
    });
  }, [activeDataset, filteredData, outlierMethod, outlierThreshold]);

  // Set default pivot values when pivotResult changes
  React.useEffect(() => {
    if (pivotResult) {
      const activeRows = pivotResult.rows.filter(r => r.children.length === 0 && r.level !== -1);
      const activeCols = pivotResult.columns.filter(c => !c.isTotal && c.level !== -1);
      const valFields = pivotResult.config.valueFields;

      if (activeRows.length > 0 && !selectedPivotRowKey) {
        setSelectedPivotRowKey(activeRows[0].path.join(" > "));
      }
      if (activeCols.length > 0 && !selectedPivotColKey) {
        setSelectedPivotColKey(activeCols[0].path.join(" > "));
      }
      if (valFields.length > 0 && !selectedPivotValField) {
        setSelectedPivotValField(`${valFields[0].operator}_${valFields[0].column}`);
      }
    }
  }, [pivotResult, selectedPivotRowKey, selectedPivotColKey, selectedPivotValField]);

  // Compute Pivot Stats slice
  const pivotSliceStats = useMemo(() => {
    if (!pivotResult || !selectedPivotValField) return null;

    if (pivotSliceType === 'row' && selectedPivotRowKey) {
      const path = selectedPivotRowKey.split(" > ");
      return statsEngine.calculatePivotStats(pivotResult, {
        rowPath: path,
        valueFieldAlias: selectedPivotValField
      });
    } else if (pivotSliceType === 'col' && selectedPivotColKey) {
      const path = selectedPivotColKey.split(" > ");
      return statsEngine.calculatePivotStats(pivotResult, {
        colPath: path,
        valueFieldAlias: selectedPivotValField
      });
    }

    return null;
  }, [pivotResult, pivotSliceType, selectedPivotRowKey, selectedPivotColKey, selectedPivotValField]);

  if (!activeDataset) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
          <HelpCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Active Dataset</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Please upload or select a dataset first to begin statistical analysis.
        </p>
      </div>
    );
  }

  if (numericColumns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Numeric Fields</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Statistical summaries require at least one numeric field. Ensure your headers and numeric column types are configured correctly.
        </p>
      </div>
    );
  }

  const columnStats = selectedColumn && statsResult ? statsResult.getColumnStats(selectedColumn) : null;

  const renderSummaryTab = () => {
    if (!columnStats) return null;
    const { descriptive } = columnStats;

    const statRows = [
      { label: "Count (Valid Records)", val: descriptive.count, desc: "Total observations with non-null numeric values." },
      { label: "Sum", val: descriptive.sum, desc: "Sum of all valid observations." },
      { label: "Mean (Average)", val: descriptive.mean, desc: "Arithmetic mean of the observations." },
      { label: "Median", val: descriptive.median, desc: "Middle value when numbers are sorted." },
      { label: "Mode", val: descriptive.mode.length > 0 ? descriptive.mode.join(", ") : "None", desc: "Most frequently occurring value(s)." },
      { label: "Minimum", val: descriptive.min, desc: "Smallest observation in the set." },
      { label: "Maximum", val: descriptive.max, desc: "Largest observation in the set." },
      { label: "Range", val: descriptive.range, desc: "Difference between maximum and minimum values." },
      { label: "Variance", val: descriptive.variance, desc: "Spread of values around the mean." },
      { label: "Standard Deviation", val: descriptive.stdDev, desc: "Average distance of values from the mean." },
      { label: "First Quartile (Q1)", val: descriptive.q1, desc: "25th percentile value." },
      { label: "Third Quartile (Q3)", val: descriptive.q3, desc: "75th percentile value." },
      { label: "Interquartile Range (IQR)", val: descriptive.iqr, desc: "Difference between Q3 and Q1." },
      { label: "Skewness", val: descriptive.skewness, desc: "Asymmetry of the probability distribution." },
      { label: "Kurtosis", val: descriptive.kurtosis, desc: "Tail weight or peakedness of the distribution." },
      { label: "Unique Value Count", val: descriptive.uniqueCount, desc: "Number of unique values in the dataset." },
      { label: "Missing Records", val: `${descriptive.missingCount} (${descriptive.nullPercentage.toFixed(1)}%)`, desc: "Count and percentage of empty cells." }
    ];

    const formatVal = (v: unknown) => {
      if (typeof v === "number") {
        if (Number.isInteger(v)) return v.toLocaleString();
        return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 });
      }
      return String(v ?? "");
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
        {/* Column Select Panel */}
        <div className="glass p-4 rounded-xl space-y-4">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
            Selected Column
          </label>
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
            {numericColumns.map((col) => (
              <button
                key={col}
                onClick={() => setSelectedColumn(col)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg text-xs font-medium border transition-all duration-200 flex justify-between items-center",
                  selectedColumn === col
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted/30 border-border hover:border-primary/50 text-foreground"
                )}
              >
                <span className="truncate pr-2">{col}</span>
                {selectedColumn === col && (
                  <Badge variant="outline" className="text-[9px] px-1 h-5 text-primary border-primary bg-primary/5">Active</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Statistics Summary Grid */}
        <div className="md:col-span-2 glass p-5 rounded-xl space-y-4">
          <div className="flex justify-between items-center select-none border-b border-border/60 pb-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span>Descriptive Analysis: {selectedColumn}</span>
            </h3>
          </div>
          <ScrollArea className="h-[52vh] pr-2">
            <div className="grid grid-cols-1 gap-2.5">
              {statRows.map((row) => (
                <div 
                  key={row.label}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40 hover:bg-muted/35 hover:border-border/80 transition-all duration-150"
                >
                  <div className="space-y-0.5 max-w-md">
                    <span className="text-xs font-semibold text-foreground">{row.label}</span>
                    <p className="text-[10px] text-muted-foreground leading-relaxed select-none">{row.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums text-left sm:text-right mt-1.5 sm:mt-0 shrink-0">
                    {formatVal(row.val)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  };

  const renderCorrelationTab = () => {
    if (!statsResult) return null;
    const { correlationMatrix } = statsResult;
    const cols = correlationMatrix.columns;

    // Helper to get color coding based on coefficient
    const getCorrBgColor = (r: number | null): string => {
      if (r === null) return "bg-muted/10";
      if (r >= 0.7) return "bg-primary/20 text-primary-foreground font-semibold border-primary/25"; // Strong positive
      if (r <= -0.7) return "bg-destructive/20 text-destructive-foreground font-semibold border-destructive/25"; // Strong negative
      if (r > 0.3 && r < 0.7) return "bg-primary/5 text-primary/80";
      if (r < -0.3 && r > -0.7) return "bg-destructive/5 text-destructive/80";
      return "bg-background text-muted-foreground"; // Weak/neutral
    };

    return (
      <div className="glass p-5 rounded-xl space-y-4 animate-fade-in w-full overflow-hidden">
        <div className="flex justify-between items-center select-none border-b border-border/60 pb-3">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-secondary" />
            <span>Pearson Correlation Matrix</span>
          </h3>
          <span className="text-xs text-muted-foreground">Color coding highlights strong relationships (r ≥ ±0.7)</span>
        </div>
        <div className="overflow-x-auto w-full max-h-[55vh]">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 border border-border bg-muted/60 text-left font-bold uppercase tracking-wider text-muted-foreground sticky left-0 z-10 bg-background/90 min-w-[150px]">
                  Fields
                </th>
                {cols.map((col) => (
                  <th
                    key={`thead-${col}`}
                    className="px-4 py-3 border border-border bg-muted/40 text-center font-semibold tracking-wider text-muted-foreground min-w-[100px]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map((rowCol) => (
                <tr key={`tr-${rowCol}`} className="hover:bg-muted/15 transition-colors">
                  <td className="px-4 py-2.5 border border-border font-medium text-foreground sticky left-0 z-10 bg-background/90 min-w-[150px]">
                    {rowCol}
                  </td>
                  {cols.map((colCol) => {
                    const r = correlationMatrix.matrix[rowCol]?.[colCol];
                    const rFormatted = r !== null && r !== undefined 
                      ? r.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                      : "—";

                    return (
                      <td
                        key={`td-${rowCol}-${colCol}`}
                        className={cn(
                          "px-4 py-2.5 border border-border text-center tabular-nums transition-all duration-200 border-opacity-30",
                          getCorrBgColor(r)
                        )}
                      >
                        {rFormatted}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderOutliersTab = () => {
    if (!columnStats) return null;
    const { outliers } = columnStats;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
        {/* Outlier Control Panel */}
        <div className="glass p-4 rounded-xl space-y-5">
          <div className="space-y-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider select-none">
              Selected Column
            </span>
            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger className="h-9 bg-background/50 border-border">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {numericColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="bg-border/60" />

          {/* Outlier Method */}
          <div className="space-y-2 select-none">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Detection Method
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOutlierMethod("iqr")}
                className={cn("text-xs h-8.5", outlierMethod === "iqr" && "bg-primary/20 hover:bg-primary/30 border-primary text-primary")}
              >
                IQR bounds
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOutlierMethod("zscore")}
                className={cn("text-xs h-8.5", outlierMethod === "zscore" && "bg-secondary/20 hover:bg-secondary/30 border-secondary text-secondary")}
              >
                Z-Score
              </Button>
            </div>
          </div>

          {/* Slider Threshold */}
          <div className="space-y-2 select-none">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Threshold
              </span>
              <span className="text-xs font-bold text-foreground font-mono">{outlierThreshold.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={outlierMethod === 'iqr' ? 1.0 : 1.5}
              max={outlierMethod === 'iqr' ? 3.5 : 5.0}
              step="0.1"
              value={outlierThreshold}
              onChange={(e) => setOutlierThreshold(parseFloat(e.target.value))}
              className="w-full accent-primary bg-muted/60 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
              <span>More Outliers</span>
              <span>Less Outliers</span>
            </div>
          </div>
        </div>

        {/* Outliers List Panel */}
        <div className="md:col-span-2 glass p-5 rounded-xl space-y-4">
          <div className="flex justify-between items-center select-none border-b border-border/60 pb-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>Outliers Detected ({outliers.count})</span>
            </h3>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[10px] bg-muted/30">
                Method: {outliers.method.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-[10px] bg-muted/30">
                Threshold: {outliers.threshold.toFixed(1)}
              </Badge>
            </div>
          </div>

          <ScrollArea className="h-[48vh] pr-2">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 border-b border-border font-semibold text-muted-foreground select-none">Row Index</th>
                  <th className="px-3 py-2 border-b border-border font-semibold text-muted-foreground">Value</th>
                  <th className="px-3 py-2 border-b border-border font-semibold text-muted-foreground text-right">
                    {outlierMethod === "iqr" ? "Distance from Bound" : "Z-Score"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {outliers.outliers.map((record, index) => (
                  <tr 
                    key={`outlier-${record.index}-${index}`}
                    className="hover:bg-muted/20 border-b border-border/40 transition-colors"
                  >
                    <td className="px-3 py-2 tabular-nums font-mono text-muted-foreground">{record.index + 1}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-foreground">{record.value.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums text-right text-destructive font-semibold">
                      {record.score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                    </td>
                  </tr>
                ))}
                {outliers.outliers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-12 text-center text-muted-foreground italic select-none">
                      No outliers detected with current configuration.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      </div>
    );
  };

  const renderPivotTab = () => {
    if (!pivotResult) {
      return (
        <div className="flex flex-col items-center justify-center h-[50vh] border border-dashed border-border rounded-xl bg-muted/5 text-center select-none animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
            <Grid3X3 className="w-6 h-6 text-accent" />
          </div>
          <h4 className="text-sm font-semibold mb-1">No Active Pivot Grid</h4>
          <p className="text-xs text-muted-foreground max-w-xs px-4">
            Navigate to the Pivot Table view, configure row/column dimensions and values, and then return here to run statistical slice analysis.
          </p>
        </div>
      );
    }

    const activeRows = pivotResult.rows.filter(r => r.children.length === 0 && r.level !== -1);
    const activeCols = pivotResult.columns.filter(c => !c.isTotal && c.level !== -1);
    const valFields = pivotResult.config.valueFields;

    const formatVal = (v: unknown) => {
      if (typeof v === "number") {
        if (Number.isInteger(v)) return v.toLocaleString();
        return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 });
      }
      return String(v ?? "");
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
        {/* Pivot Selector Panel */}
        <div className="glass p-4 rounded-xl space-y-4">
          <div className="space-y-2 select-none">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Slicing Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPivotSliceType("row")}
                className={cn("text-xs h-8.5", pivotSliceType === "row" && "bg-primary/20 hover:bg-primary/30 border-primary text-primary")}
              >
                Analyze Row
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPivotSliceType("col")}
                className={cn("text-xs h-8.5", pivotSliceType === "col" && "bg-secondary/20 hover:bg-secondary/30 border-secondary text-secondary")}
              >
                Analyze Column
              </Button>
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Slices Select */}
          {pivotSliceType === 'row' ? (
            <div className="space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Select Row Group
              </span>
              <Select value={selectedPivotRowKey} onValueChange={setSelectedPivotRowKey}>
                <SelectTrigger className="h-9 bg-background/50 border-border">
                  <SelectValue placeholder="Select row path" />
                </SelectTrigger>
                <SelectContent>
                  {activeRows.map(r => {
                    const key = r.path.join(" > ");
                    return <SelectItem key={key} value={key}>{key}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Select Column Group
              </span>
              <Select value={selectedPivotColKey} onValueChange={setSelectedPivotColKey}>
                <SelectTrigger className="h-9 bg-background/50 border-border">
                  <SelectValue placeholder="Select column path" />
                </SelectTrigger>
                <SelectContent>
                  {activeCols.map(c => {
                    const key = c.path.join(" > ");
                    return <SelectItem key={key} value={key}>{key}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Value Aggregations Select */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Aggregate Metric
            </span>
            <Select value={selectedPivotValField} onValueChange={setSelectedPivotValField}>
              <SelectTrigger className="h-9 bg-background/50 border-border">
                <SelectValue placeholder="Select value metric" />
              </SelectTrigger>
              <SelectContent>
                {valFields.map(vf => {
                  const alias = `${vf.operator}_${vf.column}`;
                  return <SelectItem key={alias} value={alias}>{vf.displayName}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pivot Slice Summary Panel */}
        <div className="md:col-span-2 glass p-5 rounded-xl space-y-4">
          <div className="flex justify-between items-center select-none border-b border-border/60 pb-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Compass className="w-5 h-5 text-accent" />
              <span>
                Pivot Summary: {pivotSliceType === 'row' ? selectedPivotRowKey : selectedPivotColKey} ({valFields.find(vf => `${vf.operator}_${vf.column}` === selectedPivotValField)?.displayName || selectedPivotValField})
              </span>
            </h3>
          </div>

          <ScrollArea className="h-[48vh] pr-2">
            {pivotSliceStats ? (
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: "Observations Count", val: pivotSliceStats.count },
                  { label: "Sum", val: pivotSliceStats.sum },
                  { label: "Mean (Average)", val: pivotSliceStats.mean },
                  { label: "Median", val: pivotSliceStats.median },
                  { label: "Minimum", val: pivotSliceStats.min },
                  { label: "Maximum", val: pivotSliceStats.max },
                  { label: "Range", val: pivotSliceStats.range },
                  { label: "Variance", val: pivotSliceStats.variance },
                  { label: "Standard Deviation", val: pivotSliceStats.stdDev },
                  { label: "Q1", val: pivotSliceStats.q1 },
                  { label: "Q3", val: pivotSliceStats.q3 },
                  { label: "IQR", val: pivotSliceStats.iqr }
                ].map((row) => (
                  <div 
                    key={`pivot-stat-${row.label}`}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/40 hover:bg-muted/30 transition-all"
                  >
                    <span className="text-xs font-semibold text-foreground">{row.label}</span>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      {formatVal(row.val)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground italic select-none">
                No pivot values found to analyze. Ensure the selected slice has numeric values.
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full animate-fade-in">
      {/* Dynamic Tab Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border/60 pb-1 select-none">
        <div className="flex gap-2">
          {[
            { id: "summary" as const, label: "Descriptive Summaries", icon: TrendingUp },
            { id: "correlation" as const, label: "Correlation Matrix", icon: ArrowRightLeft },
            { id: "outliers" as const, label: "Outlier Analysis", icon: AlertTriangle },
            { id: "pivot" as const, label: "Pivot Table Analytics", icon: Grid3X3 },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all relative border-b-2 border-transparent -mb-[5px]",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        
        {filteredData.length !== activeDataset.data.length && (
          <div className="flex items-center gap-1.5 text-xs text-secondary font-medium bg-secondary/10 px-2.5 py-1 rounded-full border border-secondary/20 mt-2 sm:mt-0">
            <Percent className="w-3.5 h-3.5" />
            <span>Analyzing Filtered Dataset ({filteredData.length} / {activeDataset.data.length} rows)</span>
          </div>
        )}
      </div>

      {/* Tab Panels */}
      <div className="w-full">
        {activeTab === "summary" && renderSummaryTab()}
        {activeTab === "correlation" && renderCorrelationTab()}
        {activeTab === "outliers" && renderOutliersTab()}
        {activeTab === "pivot" && renderPivotTab()}
      </div>
    </div>
  );
};
export default StatsExplorer;
