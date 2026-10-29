import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useDatasetStore } from "@/store/datasetStore";
import { KPICardConfig } from "../types";
import { AggregationOperator, ConditionalFormatRule } from "@/shared/types";
import { ConditionalFormattingBuilder } from "@/features/dashboards/components/ConditionalFormattingBuilder";
import { getEffectiveColumnTypes } from "@/shared/utils/columnType";
import { aggregationFlag, aggregationNote } from "@/shared/utils/columnRoles";
import { Palette } from "lucide-react";

interface KPIBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (kpi: KPICardConfig) => void;
  editKpi?: KPICardConfig | null;
}

export function KPIBuilder({ isOpen, onClose, onSave, editKpi = null }: KPIBuilderProps) {
  const dataset = useDatasetStore((state) => state.activeDataset);

  const [title, setTitle] = useState("");
  const [metricCol, setMetricCol] = useState("");
  const [aggregation, setAggregation] = useState<AggregationOperator>("sum");
  // Until the user picks an aggregation, it follows the column: Count for year/ID-like ones.
  const [aggregationTouched, setAggregationTouched] = useState(false);
  const [polarity, setPolarity] = useState<"positive" | "negative">("positive");
  const [enableTrend, setEnableTrend] = useState(false);
  const [trendDateCol, setTrendDateCol] = useState("");
  const [comparisonPeriod, setComparisonPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  const [enableSparkline, setEnableSparkline] = useState(true);
  const [formattingRules, setFormattingRules] = useState<ConditionalFormatRule[]>([]);
  const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);

  // Columns from active dataset
  const allColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns.map((c) => c.name);
    }
    return dataset.columns;
  }, [dataset]);

  const dateColumns = useMemo(() => {
    if (!dataset) return [];
    const effectiveTypes = getEffectiveColumnTypes(dataset);
    return dataset.columns.filter((col) => effectiveTypes[col] === "date");
  }, [dataset]);

  // Load configuration if editing
  useEffect(() => {
    if (editKpi) {
      setTitle(editKpi.title);
      setMetricCol(editKpi.primaryMetric.column);
      setAggregation(editKpi.primaryMetric.aggregation);
      setAggregationTouched(true);
      setPolarity(editKpi.polarity);
      setEnableTrend(!!editKpi.trendConfiguration);
      if (editKpi.trendConfiguration) {
        setTrendDateCol(editKpi.trendConfiguration.dateColumn);
        setComparisonPeriod(editKpi.trendConfiguration.comparisonPeriod);
      } else {
        setTrendDateCol(dateColumns[0] || "");
        setComparisonPeriod("month");
      }
      setEnableSparkline(editKpi.sparkline);
      setFormattingRules(editKpi.formattingRules || []);
    } else {
      // Defaults for new KPI card
      setTitle("");
      setMetricCol(allColumns[0] || "");
      setAggregation("sum");
      setAggregationTouched(false);
      setPolarity("positive");
      setEnableTrend(false);
      setTrendDateCol(dateColumns[0] || "");
      setComparisonPeriod("month");
      setEnableSparkline(true);
      setFormattingRules([]);
    }
  }, [editKpi, isOpen, allColumns, dateColumns]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataset) return;
    if (!title.trim()) return;

    const kpiConfig: KPICardConfig = {
      id: editKpi?.id || `kpi-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: title.trim(),
      datasetId: dataset.id,
      primaryMetric: {
        column: metricCol,
        aggregation,
      },
      trendConfiguration: enableTrend && trendDateCol ? {
        dateColumn: trendDateCol,
        comparisonPeriod,
      } : undefined,
      sparkline: enableSparkline,
      polarity,
      formattingRules: formattingRules.length > 0 ? formattingRules : undefined,
    };

    onSave(kpiConfig);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed right-0 top-0 bottom-0 h-full w-full max-w-md left-auto translate-x-0 translate-y-0 rounded-none border-l bg-background p-6 shadow-lg duration-300 flex flex-col">
        <DialogHeader className="mb-4">
          <DialogTitle>{editKpi ? "Edit KPI Card" : "Add KPI Card"}</DialogTitle>
          <DialogDescription>
            Configure the metrics, PoP comparisons, and style settings for this card.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-y-auto space-y-6 pr-1">
          <div className="space-y-5">
            {/* KPI Title */}
            <div className="space-y-2">
              <Label htmlFor="kpi-title" className="text-sm font-semibold">Card Title</Label>
              <Input
                id="kpi-title"
                placeholder="e.g. Total Revenue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Primary Metric */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="metric-col" className="text-sm font-semibold">Measure Column</Label>
                <Select
                  value={metricCol}
                  onValueChange={(col) => {
                    setMetricCol(col);
                    if (!aggregationTouched) setAggregation(aggregationFlag(dataset, col) ? "count" : "sum");
                  }}
                >
                  <SelectTrigger id="metric-col" className="glass">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {allColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="aggregation" className="text-sm font-semibold">Aggregation</Label>
                <Select
                  value={aggregation}
                  onValueChange={(val: AggregationOperator) => {
                    setAggregation(val);
                    setAggregationTouched(true);
                  }}
                >
                  <SelectTrigger id="aggregation" className="glass">
                    <SelectValue placeholder="Select agg" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="avg">Average</SelectItem>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="count_rows">Count of rows</SelectItem>
                    <SelectItem value="min">Minimum</SelectItem>
                    <SelectItem value="max">Maximum</SelectItem>
                    <SelectItem value="median">Median</SelectItem>
                    <SelectItem value="stddev">Std. deviation (sample)</SelectItem>
                  </SelectContent>
                </Select>
                {aggregationNote(aggregationFlag(dataset, metricCol), aggregation) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400" role="note" data-testid="aggregation-note">
                    {aggregationNote(aggregationFlag(dataset, metricCol), aggregation)}
                  </p>
                )}
              </div>
            </div>

            {/* Polarity Setting */}
            <div className="space-y-2">
              <Label htmlFor="polarity" className="text-sm font-semibold">Metric Polarity</Label>
              <Select value={polarity} onValueChange={(val: "positive" | "negative") => setPolarity(val)}>
                <SelectTrigger id="polarity" className="glass">
                  <SelectValue placeholder="Select polarity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Direct Polarity (Up is Green / Good)</SelectItem>
                  <SelectItem value="negative">Reversed Polarity (Down is Green / Good, e.g. Cost)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <hr className="border-border/60" />

            {/* Sparkline Toggle */}
            <div className="flex items-center space-x-2 py-1">
              <Checkbox
                id="sparkline"
                checked={enableSparkline}
                onCheckedChange={(checked) => setEnableSparkline(!!checked)}
              />
              <Label htmlFor="sparkline" className="text-sm font-medium cursor-pointer">
                Render sparkline trend chart
              </Label>
            </div>

            {/* Trend Configuration */}
            <div className="flex items-center space-x-2 py-1">
              <Checkbox
                id="enable-trend"
                checked={enableTrend}
                onCheckedChange={(checked) => setEnableTrend(!!checked)}
              />
              <Label htmlFor="enable-trend" className="text-sm font-medium cursor-pointer">
                Enable period-over-period comparison
              </Label>
            </div>

            {enableTrend && (
              <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-4 animate-fade-in">
                <div className="space-y-2">
                  <Label htmlFor="trend-date-col" className="text-sm font-semibold">Date Column</Label>
                  <Select value={trendDateCol} onValueChange={setTrendDateCol}>
                    <SelectTrigger id="trend-date-col" className="bg-background">
                      <SelectValue placeholder="Select date column" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                      {dateColumns.length === 0 && (
                        <SelectItem value="none" disabled>
                          No date columns found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comparison-period" className="text-sm font-semibold">Comparison Period</Label>
                  <Select value={comparisonPeriod} onValueChange={(val: "day" | "week" | "month" | "quarter" | "year") => setComparisonPeriod(val)}>
                    <SelectTrigger id="comparison-period" className="bg-background">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day over Day</SelectItem>
                      <SelectItem value="week">Week over Week</SelectItem>
                      <SelectItem value="month">Month over Month</SelectItem>
                      <SelectItem value="quarter">Quarter over Quarter</SelectItem>
                      <SelectItem value="year">Year over Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Conditional Formatting Section */}
            <hr className="border-border/60" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Conditional Formatting</Label>
                {formattingRules.length > 0 && (
                  <span className="text-xs text-emerald-500 font-medium">
                    {formattingRules.length} rule(s) configured
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormattingModalOpen(true)}
                className="w-full justify-start gap-2"
              >
                <Palette className="h-4 w-4 text-primary" />
                {formattingRules.length > 0 ? "Edit Threshold Rules" : "Add Formatting Rules"}
              </Button>
            </div>

            {/* Nested Formatting Dialog */}
            <Dialog open={isFormattingModalOpen} onOpenChange={setIsFormattingModalOpen}>
              <DialogContent className="max-w-3xl glass border-white/20 shadow-2xl p-6">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Palette className="h-5 w-5 text-primary" />
                    KPI Threshold Formatting Rules
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <ConditionalFormattingBuilder
                    rules={formattingRules}
                    onChange={setFormattingRules}
                    availableColumns={allColumns}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <DialogFooter className="mt-8 flex gap-2 flex-col sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" variant="premium" className="w-full sm:w-auto">
              {editKpi ? "Save Changes" : "Create Card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
