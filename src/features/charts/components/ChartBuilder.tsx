import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Trash2, Plus, BarChart, LineChart, PieChart, ScatterChart } from "lucide-react";
import { useMemo } from "react";
import { Dataset, ChartConfig } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { ChartVisualization } from "./ChartVisualization";
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
  const [yAxis, setYAxis] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [sizeBy, setSizeBy] = useState('');

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

  const chartTypes = [
    { value: 'bar', label: 'Bar Chart', icon: BarChart },
    { value: 'line', label: 'Line Chart', icon: LineChart },
    { value: 'pie', label: 'Pie Chart', icon: PieChart },
    { value: 'scatter', label: 'Scatter Plot', icon: ScatterChart },
    { value: 'histogram', label: 'Histogram', icon: BarChart },
    { value: 'heatmap', label: 'Heatmap', icon: BarChart },
    { value: 'area', label: 'Area Chart', icon: LineChart },
    { value: 'bubble', label: 'Bubble Chart', icon: ScatterChart },
  ] as const;

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
    };

    createChart(newChart);

    if (activeDashboard) {
      const updatedChartIds = [...activeDashboard.chartIds, newChart.id];
      saveDashboard(activeDashboard.id, { chartIds: updatedChartIds });
    }
    
    // Reset form
    setChartTitle('');
    setXAxis('');
    setYAxis('');
    setGroupBy('none');
    setSizeBy('');
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
        return false;
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
              <Select value={xAxis} onValueChange={setXAxis}>
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
