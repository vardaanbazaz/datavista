import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Plus, BarChart, LineChart, PieChart, ScatterChart, X, Palette, Gauge, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { ChartConfig, ConditionalFormatRule } from "@/shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { pluginRegistry } from "@/shared/services/pluginRegistry";
import { ConditionalFormattingBuilder } from "@/features/dashboards/components/ConditionalFormattingBuilder";
import { motion } from "framer-motion";

export function ChartBuilder() {
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const filteredData = useFilterStore((state) => state.filteredData);
  const createChart = useChartStore((state) => state.createChart);

  const activeDashboardId = useDashboardStore((state) => state.activeDashboardId);
  const dashboards = useDashboardStore((state) => state.dashboards);
  const saveDashboard = useDashboardStore((state) => state.saveDashboard);

  const activeDashboard = useMemo(() => {
    return dashboards.find(d => d.id === activeDashboardId) || null;
  }, [dashboards, activeDashboardId]);

  const dataset = useMemo(() => {
    if (!activeDataset) return null;
    return {
      ...activeDataset,
      data: filteredData,
    };
  }, [activeDataset, filteredData]);

  const [chartType, setChartType] = useState<ChartConfig['type']>('bar');
  const [chartTitle, setChartTitle] = useState('');
  const [xAxis, setXAxis] = useState('');
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [yAxis, setYAxis] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [sizeBy, setSizeBy] = useState('');
  const [formattingRules, setFormattingRules] = useState<ConditionalFormatRule[]>([]);
  const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);

  // Predictive Analytics Forecast State
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const [forecastPeriods, setForecastPeriods] = useState(3);
  const [forecastMethod, setForecastMethod] = useState<'linear' | 'moving_average'>('linear');

  const chartTypes = useMemo(() => {
    const coreTypes = [
      { value: 'bar', label: 'Bar Chart', icon: BarChart },
      { value: 'line', label: 'Line Chart', icon: LineChart },
      { value: 'pie', label: 'Pie Chart', icon: PieChart },
      { value: 'scatter', label: 'Scatter Plot', icon: ScatterChart },
      { value: 'histogram', label: 'Histogram', icon: BarChart },
      { value: 'heatmap', label: 'Heatmap', icon: BarChart },
      { value: 'area', label: 'Area Chart', icon: LineChart },
      { value: 'bubble', label: 'Bubble Chart', icon: ScatterChart },
    ];

    const pluginTypes = pluginRegistry.getCustomCharts().map((c) => ({
      value: c.type,
      label: `${c.label} (Plugin)`,
      icon: Gauge,
    }));

    return [...coreTypes, ...pluginTypes];
  }, []);

  const numericColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns
        .filter(c => c.inferredDataType === 'numeric')
        .map(c => c.name);
    }
    return dataset.columns.filter(col => dataset.columnTypes[col] === 'numeric');
  }, [dataset]);
  
  const categoricalColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns
        .filter(c => c.inferredDataType === 'categorical')
        .map(c => c.name);
    }
    return dataset.columns.filter(col => dataset.columnTypes[col] === 'categorical');
  }, [dataset]);

  const allColumns = useMemo(() => {
    if (!dataset) return [];
    if (dataset.metadata) {
      return dataset.metadata.columns.map(c => c.name);
    }
    return dataset.columns;
  }, [dataset]);

  const getColumnType = (col: string): string => {
    if (!dataset) return 'categorical';
    if (dataset.metadata) {
      const c = dataset.metadata.columns.find(x => x.name === col);
      if (c) return c.inferredDataType;
    }
    return dataset.columnTypes[col] || 'categorical';
  };

  if (!dataset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No dataset selected. Upload data to build charts.
        </p>
      </div>
    );
  }

  const handleCreateChart = () => {
    if (!chartTitle.trim()) {
      return;
    }

    const newChart: ChartConfig = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chart-${Math.random().toString(36).substring(2, 9)}`,
      type: chartType,
      title: chartTitle.trim(),
      xAxis: xAxis || undefined,
      yAxis: yAxis || undefined,
      groupBy: groupBy && groupBy !== 'none' ? groupBy : undefined,
      sizeBy: sizeBy || undefined,
      data: dataset.data,
      datasetId: activeDataset?.id || "",
      drillPath: xAxis ? [xAxis, ...drillPath] : undefined,
      formattingRules: formattingRules.length > 0 ? formattingRules : undefined,
      forecast: (chartType === 'line' || chartType === 'area') && forecastEnabled ? {
        enabled: true,
        periodsToProject: forecastPeriods > 0 ? forecastPeriods : 3,
        method: forecastMethod,
      } : undefined,
    };

    createChart(newChart);

    if (activeDashboard) {
      const updatedChartIds = [...activeDashboard.chartIds, newChart.id];
      saveDashboard(activeDashboard.id, { chartIds: updatedChartIds });
    }
    
    // Reset form
    setChartTitle('');
    setXAxis('');
    setDrillPath([]);
    setYAxis('');
    setGroupBy('none');
    setSizeBy('');
    setFormattingRules([]);
  };

  const isFormValid = () => {
    if (!chartTitle.trim()) return false;
    
    switch (chartType) {
      case 'bar':
      case 'line':
      case 'area':
        return xAxis && yAxis;
      case 'pie':
        return xAxis && yAxis;
      case 'scatter':
        return xAxis && yAxis;
      case 'histogram':
        return xAxis;
      case 'heatmap':
        return xAxis && yAxis;
      case 'bubble':
        return xAxis && yAxis && sizeBy;
      default:
        // Plugin-registered chart types (see chartTypes above) carry no required-fields/
        // validation metadata of their own — CustomChartTypeDefinition (shared/types/plugins.ts)
        // is just { type, label, description?, iconName?, component }. The plugin's own
        // component is the only thing that knows how to interpret a ChartConfig for its
        // rendering, so there's nothing more to validate here beyond the title (checked above)
        // and that this actually is a registered plugin type, not a typo/unknown value.
        return pluginRegistry.getCustomChart(chartType) !== undefined;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Chart Builder Form */}
      <Card className="glass border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Chart
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Chart Type */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="space-y-2"
            >
              <Label>Chart Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {chartTypes.map((type, index) => {
                  const Icon = type.icon;
                  return (
                    <motion.div
                      key={type.value}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + index * 0.05, duration: 0.2 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant={chartType === type.value ? "premium" : "outline"}
                        onClick={() => setChartType(type.value)}
                        className="transition-all duration-200"
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {type.label}
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            {/* Chart Title */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="space-y-2"
            >
              <Label htmlFor="chart-title">Chart Title</Label>
              <Input
                id="chart-title"
                placeholder="Enter chart title"
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                className="transition-all duration-200 focus:shadow-sm"
              />
            </motion.div>

            {/* X Axis */}
            <div className="space-y-2">
              <Label>X Axis</Label>
              <Select value={xAxis} onValueChange={(val) => {
                setXAxis(val);
                setDrillPath([]);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {allColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      <div className="flex items-center gap-2">
                        <span>{column}</span>
                        <Badge variant="outline" className="text-xs">
                          {getColumnType(column)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drill Path Setup */}
            <div className="space-y-2 col-span-full">
              <Label className="flex items-center justify-between">
                <span>Configure Drill Path (Optional Hierarchy)</span>
                {drillPath.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setDrillPath([])}
                  >
                    Clear Drill Path
                  </Button>
                )}
              </Label>
              
              <div className="flex flex-wrap gap-2 items-center min-h-[40px] p-2 border border-dashed rounded-lg">
                {xAxis ? (
                  <Badge variant="secondary" className="gap-1">
                    1. {xAxis} (X-Axis)
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Select an X-Axis first to build a hierarchy.</span>
                )}
                
                {drillPath.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">→</span>
                    <Badge variant="outline" className="gap-1 pr-1">
                      {idx + 2}. {col}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-3 w-3 rounded-full p-0 text-muted-foreground hover:text-destructive hover:bg-muted"
                        onClick={() => setDrillPath(drillPath.filter((_, i) => i !== idx))}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </Badge>
                  </div>
                ))}

                {xAxis && (
                  <Select
                    value=""
                    onValueChange={(col) => {
                      if (col && !drillPath.includes(col) && col !== xAxis) {
                        setDrillPath([...drillPath, col]);
                      }
                    }}
                  >
                    <SelectTrigger className="w-40 h-8 text-xs border-dashed">
                      <SelectValue placeholder="+ Add drill depth" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {allColumns
                        .filter(col => col !== xAxis && !drillPath.includes(col))
                        .map(col => (
                          <SelectItem key={col} value={col} className="text-xs">
                            {col}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Define a hierarchy path (e.g. Region → Country → State). Click data points on the chart with Drill Mode active to drill down.
              </p>
            </div>

            {/* Y Axis - conditional */}
            {chartType !== 'histogram' && (
              <div className="space-y-2">
                <Label>Y Axis</Label>
                <Select value={yAxis} onValueChange={setYAxis}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {(chartType === 'pie' || chartType === 'heatmap' ? allColumns : numericColumns).map((column) => (
                      <SelectItem key={column} value={column}>
                        <div className="flex items-center gap-2">
                          <span>{column}</span>
                          <Badge variant="outline" className="text-xs">
                            {getColumnType(column)}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Size By - for bubble charts */}
            {chartType === 'bubble' && (
              <div className="space-y-2">
                <Label>Size By</Label>
                <Select value={sizeBy} onValueChange={setSizeBy}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size column" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map((column) => (
                      <SelectItem key={column} value={column}>
                        <div className="flex items-center gap-2">
                          <span>{column}</span>
                          <Badge variant="outline" className="text-xs">
                            {getColumnType(column)}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Group By - optional */}
            <div className="space-y-2">
              <Label>Group By (Optional)</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grouping column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  {categoricalColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      <div className="flex items-center gap-2">
                        <span>{column}</span>
                        <Badge variant="outline" className="text-xs">
                          {getColumnType(column)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditional Formatting Rules */}
            <div className="space-y-2 col-span-full">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Chart Conditional Formatting</Label>
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

              <Dialog open={isFormattingModalOpen} onOpenChange={setIsFormattingModalOpen}>
                <DialogContent className="max-w-3xl glass border-white/20 shadow-2xl p-6">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                      <Palette className="h-5 w-5 text-primary" />
                      Chart Visual Threshold Formatting Rules
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

            {/* Predictive Analytics Section (Line & Area charts) */}
            {(chartType === 'line' || chartType === 'area') && (
              <div className="space-y-3 col-span-full p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5 text-primary">
                      <TrendingUp className="h-4 w-4" /> Predictive Analytics & Forecasting
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Extrapolate future data points using linear regression or moving average.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={forecastEnabled ? "premium" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setForecastEnabled(!forecastEnabled)}
                  >
                    {forecastEnabled ? "Forecast: ON" : "Forecast: OFF"}
                  </Button>
                </div>

                {forecastEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-primary/10">
                    <div className="space-y-1">
                      <Label htmlFor="forecast-periods" className="text-xs">Periods to Project</Label>
                      <Input
                        id="forecast-periods"
                        type="number"
                        min={1}
                        max={30}
                        value={forecastPeriods}
                        onChange={(e) => setForecastPeriods(parseInt(e.target.value, 10) || 3)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Method</Label>
                      <Select
                        value={forecastMethod}
                        onValueChange={(val: 'linear' | 'moving_average') => setForecastMethod(val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="linear" className="text-xs">Linear Regression (Least Squares)</SelectItem>
                          <SelectItem value="moving_average" className="text-xs">Moving Average Extrapolation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              onClick={handleCreateChart}
              disabled={!isFormValid()}
              variant="premium"
              className="transition-all duration-200"
            >
              Create Chart
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
