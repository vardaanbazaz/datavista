import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { ChartConfig, Query, DataRow, FilterOperator } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useFilterStore } from "@/store/filterStore";
import { filterManager } from "@/features/dashboards/services/filterManager";
import { queryEngine } from "@/shared/services/queryEngine";
import { formattingEngine } from "@/shared/services/formattingEngine";
import { useDrillStore } from "@/features/dashboards/store/drillStore";
import { ArrowUp, GitFork, X, AlertTriangle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { toast } from "@/shared/hooks/use-toast";
import { ErrorBoundary, WidgetError } from "@/shared/components/ErrorBoundary";

import { pluginRegistry } from "@/shared/services/pluginRegistry";
import { anomalyDetector } from "@/features/ai/anomalyDetector";
import { forecastingEngine } from "@/shared/services/forecasting/engine";
import { ForecastPoint } from "@/shared/services/forecasting/types";

interface ChartVisualizationProps {
  chart: ChartConfig;
}

interface PieSlice {
  key: string;
  value: number;
}

interface HeatmapCell {
  x: string;
  y: string;
  value: number;
}

function ChartVisualizationContent({ chart }: ChartVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [isDrillMode, setIsDrillMode] = useState(false);

  const pluginChartDef = pluginRegistry.getCustomChart(chart.type);

  // Pre-compile conditional formatting rules
  const compiledFormattingRules = useMemo(() => {
    return formattingEngine.compileRules(chart.formattingRules || []);
  }, [chart.formattingRules]);

  // Retrieve global store data
  const dataset = useDatasetStore((state) => state.activeDataset);
  const activeGlobalFilters = useDashboardStore((state) => state.activeGlobalFilters || []);
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const toggleCrossFilter = useDashboardStore((state) => state.toggleCrossFilter);

  // Drill State
  const widgetDrillStates = useDrillStore((state) => state.widgetDrillStates);
  const setWidgetDrillState = useDrillStore((state) => state.setWidgetDrillState);
  const resetWidgetDrillState = useDrillStore((state) => state.resetWidgetDrillState);
  const openDrillThrough = useDrillStore((state) => state.openDrillThrough);

  const drillState = widgetDrillStates[chart.id];

  // Detect statistical anomalies in widget data
  const chartAnomalies = useMemo(() => {
    return anomalyDetector.detectChartAnomalies(chart);
  }, [chart]);

  // Resolve current active X-axis dimension based on drillState depth
  const currentDimension = useMemo(() => {
    if (chart.drillPath && chart.drillPath.length > 0 && drillState) {
      return chart.drillPath[drillState.currentDepth] || chart.xAxis || "";
    }
    return chart.xAxis || "";
  }, [chart.xAxis, chart.drillPath, drillState]);

  // Dynamically calculate chart data using queryEngine, filterManager, and drillState
  const chartData = useMemo(() => {
    if (!dataset) return chart.data;

    const baseQuery: Query = {
      filters: {
        categoricalFilters: activeFilters.categoricalFilters,
        dateRangeFilters: activeFilters.dateRangeFilters,
        conditions: []
      },
      pagination: { pageSize: 'all' }
    };

    // 1. Merge global dashboard filters
    const mergedQuery = filterManager.merge(baseQuery, activeGlobalFilters, chart.id, dataset);

    // 2. Merge local drill-down path filters
    if (drillState && drillState.activeFilters.length > 0) {
      if (!mergedQuery.filters) mergedQuery.filters = {};
      if (!mergedQuery.filters.conditions) mergedQuery.filters.conditions = [];
      
      drillState.activeFilters.forEach((f) => {
        mergedQuery.filters!.conditions!.push({
          column: f.column,
          operator: f.operator,
          value: f.value,
        });
      });
    }

    const result = queryEngine.execute(dataset, mergedQuery);
    return result.rows;
  }, [dataset, chart.data, activeFilters, activeGlobalFilters, chart.id, drillState]);

  // Apply forecasting engine if configured for line or area charts
  const processedChartData = useMemo(() => {
    if ((chart.type === 'line' || chart.type === 'area') && chart.forecast?.enabled && currentDimension && chart.yAxis) {
      return forecastingEngine.generateForecast(chartData, currentDimension, chart.yAxis, chart.forecast);
    }
    return chartData.map((d) => ({ ...d, isForecast: false })) as ForecastPoint[];
  }, [chartData, chart.type, chart.forecast, currentDimension, chart.yAxis]);

  // Find if there is an active cross-filter originating from this chart
  const activeCrossFilter = useMemo(() => {
    return activeGlobalFilters.find((f) => f.sourceWidgetId === chart.id);
  }, [activeGlobalFilters, chart.id]);

  // ResizeObserver to handle layout container resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.max(entry.contentRect.width, 280);
        setWidth(newWidth);
      }
    });

    resizeObserver.observe(containerRef.current);
    
    // Set initial width
    const initialWidth = containerRef.current.clientWidth;
    if (initialWidth) {
      setWidth(initialWidth);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const handleDrillUp = () => {
    if (!drillState) return;
    if (drillState.currentDepth <= 1) {
      resetWidgetDrillState(chart.id);
    } else {
      setWidgetDrillState(chart.id, {
        currentDepth: drillState.currentDepth - 1,
        activeFilters: drillState.activeFilters.slice(0, -1),
      });
    }
  };

  useEffect(() => {
    if (!svgRef.current || !chartData.length || !currentDimension) {
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();
      const chartAreaError = svg
        .append("g")
        .attr("transform", `translate(${width / 2},160)`);
        
      chartAreaError.append("text")
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("fill", "hsl(var(--muted-foreground))")
        .style("font-weight", "500")
        .text("No data matches current filters.");
      return;
    }

    // Helper to determine visual opacity based on cross-filter highlight state
    const getOpacity = (val: unknown, defaultOpacity = 0.85) => {
      if (!activeCrossFilter) return defaultOpacity;
      
      // Equal match
      if (activeCrossFilter.operator === 'equals' && String(activeCrossFilter.value) === String(val)) {
        return 1.0;
      }
      
      // Between match (range-based highlight for histogram bins)
      if (
        activeCrossFilter.operator === 'between' && 
        typeof activeCrossFilter.value === 'object' && 
        activeCrossFilter.value !== null &&
        typeof val === 'object' && 
        val !== null
      ) {
        const range = activeCrossFilter.value as { start?: number; end?: number };
        const bin = val as { start?: number; end?: number };
        if (range.start === bin.start && range.end === bin.end) {
          return 1.0;
        }
      }
      
      return 0.25; // Dimmed state
    };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const height = 300;
    const margin = { top: 20, right: 30, bottom: 75, left: 60 };

    svg
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const chartArea = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Helper to infer column type on the fly or resolve via metadata
    const getColumnType = (col: string): 'numeric' | 'date' | 'categorical' => {
      const activeDataset = useDatasetStore.getState().activeDataset;
      if (activeDataset && activeDataset.id === chart.datasetId && activeDataset.metadata) {
        const colMeta = activeDataset.metadata.columns.find(c => c.name === col);
        if (colMeta) return colMeta.inferredDataType;
      }

      const nonNull = chartData.map(d => d[col]).filter(v => v !== null && v !== undefined && v !== "");
      if (!nonNull.length) return 'categorical';
      
      const numericCount = nonNull.filter(v => !isNaN(Number(v))).length;
      if (numericCount / nonNull.length > 0.8) return 'numeric';
      
      const dateCount = nonNull.filter(v => {
        const str = String(v);
        if (/^\d+$/.test(str)) return false; // Ignore raw integers like index values
        return !isNaN(Date.parse(str));
      }).length;
      
      if (dateCount / nonNull.length > 0.8) return 'date';
      return 'categorical';
    };

    const xType = currentDimension ? getColumnType(currentDimension) : 'categorical';
    const yType = chart.yAxis ? getColumnType(chart.yAxis) : 'categorical';
    const sizeType = chart.sizeBy ? getColumnType(chart.sizeBy) : null;

    // Validate configuration safety
    let validationError = "";
    if (chart.type === 'scatter') {
      if (!currentDimension || !chart.yAxis) {
        validationError = "Scatter Plot requires both X and Y axis fields.";
      } else if (xType !== 'numeric' || yType !== 'numeric') {
        validationError = "Scatter Plot requires numeric columns for both X and Y axes.";
      }
    } else if (chart.type === 'bubble') {
      if (!currentDimension || !chart.yAxis || !chart.sizeBy) {
        validationError = "Bubble Chart requires X axis, Y axis, and Size By fields.";
      } else if (xType !== 'numeric' || yType !== 'numeric' || (sizeType && sizeType !== 'numeric')) {
        validationError = "Bubble Chart requires numeric columns for X axis, Y axis, and Size parameter.";
      }
    } else if (chart.type === 'histogram') {
      if (!currentDimension) {
        validationError = "Histogram requires an X-axis field.";
      } else if (xType !== 'numeric') {
        validationError = "Histogram requires a numeric column for the X-axis.";
      }
    } else if (['bar', 'line', 'area'].includes(chart.type)) {
      if (!currentDimension || !chart.yAxis) {
        validationError = `${chart.type.charAt(0).toUpperCase() + chart.type.slice(1)} chart requires both X and Y axis fields.`;
      } else if (yType !== 'numeric') {
        validationError = `${chart.type.charAt(0).toUpperCase() + chart.type.slice(1)} chart requires a numeric column for the Y-axis.`;
      }
    } else if (chart.type === 'pie') {
      if (!currentDimension || !chart.yAxis) {
        validationError = "Pie chart requires Category and Values fields.";
      } else if (yType !== 'numeric') {
        validationError = "Pie chart requires a numeric column for Values.";
      }
    }

    if (validationError) {
      renderErrorMessage(validationError);
      return;
    }

    const datasetsList = useDatasetStore.getState().datasets;
    const linkedDatasets = datasetsList.map(d => d.id).filter(id => id !== chart.datasetId);

    // Consolidated Handler for clicks (Drill-Down vs. Cross-Filtering)
    const handlePointClick = (value: unknown, operator: FilterOperator = 'equals') => {
      if (isDrillMode && chart.drillPath && chart.drillPath.length > 0) {
        const currentDepth = drillState?.currentDepth || 0;
        const nextDepth = currentDepth + 1;
        
        if (nextDepth < chart.drillPath.length) {
          const newFilter = {
            column: currentDimension,
            operator,
            value,
          };
          const updatedFilters = drillState 
            ? [...drillState.activeFilters, newFilter]
            : [newFilter];
            
          setWidgetDrillState(chart.id, {
            currentDepth: nextDepth,
            activeFilters: updatedFilters
          });
        } else {
          toast({
            title: "End of Hierarchy",
            description: "You have reached the deepest level of the drill path.",
          });
        }
      } else {
        toggleCrossFilter({
          column: currentDimension,
          operator,
          value,
          sourceWidgetId: chart.id,
          datasetId: chart.datasetId,
          linkedDatasets
        });
      }
    };

    // Consolidated Handler for Right-Clicks (Drill-Through raw view)
    const handlePointRightClick = (event: MouseEvent, value: unknown, operator: FilterOperator = 'equals', filterCol: string = currentDimension) => {
      event.preventDefault();

      if (!dataset) return;

      const baseQuery: Query = {
        filters: {
          categoricalFilters: activeFilters.categoricalFilters,
          dateRangeFilters: activeFilters.dateRangeFilters,
          conditions: []
        },
        pagination: { pageSize: 1000 }
      };

      const mergedQuery = filterManager.merge(baseQuery, activeGlobalFilters, chart.id, dataset);

      // Append local drill-down filters
      if (drillState && drillState.activeFilters.length > 0) {
        drillState.activeFilters.forEach((f) => {
          mergedQuery.filters!.conditions!.push({
            column: f.column,
            operator: f.operator,
            value: f.value,
          });
        });
      }

      // Append selected element value filter
      mergedQuery.filters!.conditions!.push({
        column: filterCol,
        operator,
        value,
      });

      const rangeVal = value as { start?: number; end?: number } | null;
      const formattedVal = typeof value === 'object' && value !== null
        ? `${rangeVal?.start ?? "-∞"} to ${rangeVal?.end ?? "∞"}`
        : String(value);

      const modalTitle = `Raw Data for ${chart.title} (${filterCol} = ${formattedVal})`;
      openDrillThrough(chart.datasetId, mergedQuery, modalTitle);
    };

    try {
      switch (chart.type) {
        case 'bar':
          renderBarChart();
          break;
        case 'line':
          renderLineChart();
          break;
        case 'pie':
          renderPieChart();
          break;
        case 'scatter':
          renderScatterPlot();
          break;
        case 'histogram':
          renderHistogram();
          break;
        case 'heatmap':
          renderHeatmap();
          break;
        case 'area':
          renderAreaChart();
          break;
        case 'bubble':
          renderBubbleChart();
          break;
      }
    } catch (error) {
      console.error(`Error rendering D3 ${chart.type} chart:`, error);
      renderErrorMessage("An error occurred during D3 drawing compilation.");
    }

    function renderErrorMessage(message: string) {
      svg.selectAll("*").remove();
      const chartAreaError = svg
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);
        
      chartAreaError.append("text")
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("fill", "hsl(var(--muted-foreground))")
        .style("font-weight", "500")
        .text(message);
    }

    function renderBarChart() {
      if (!currentDimension || !chart.yAxis) return;

      const aggregatedData = chart.groupBy
        ? d3.rollup(
            chartData,
            v => d3.sum(v, d => Number(d[chart.yAxis!]) || 0),
            d => String(d[currentDimension]),
            d => String(d[chart.groupBy!])
          )
        : d3.rollup(
            chartData,
            v => d3.sum(v, d => Number(d[chart.yAxis!]) || 0),
            d => String(d[currentDimension])
          );

      let data: Array<{ key: string; value: number; group?: string }> = [];

      if (chart.groupBy) {
        const groupedMap = aggregatedData as Map<string, Map<string, number>>;
        groupedMap.forEach((groupData, key) => {
          groupData.forEach((value, group) => {
            data.push({ key, value, group });
          });
        });
      } else {
        const simpleMap = aggregatedData as Map<string, number>;
        data = Array.from(simpleMap, ([key, value]) => ({ key, value }));
      }

      if (!data.length) {
        renderErrorMessage("No aggregated data found.");
        return;
      }

      const xScale = d3.scaleBand()
        .domain(data.map(d => d.key))
        .range([0, chartWidth])
        .padding(0.1);

      const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 0])
        .nice()
        .range([chartHeight, 0]);

      // X axis
      chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

      // Horizontal grid lines - faint and dashed (no vertical grid lines)
      chartArea.append("g")
        .attr("class", "grid-horizontal")
        .call(d3.axisLeft(yScale).tickSize(-chartWidth).tickFormat(() => ""))
        .selectAll("line")
        .attr("stroke", "rgba(255, 255, 255, 0.05)")
        .attr("stroke-dasharray", "4 4");
      chartArea.selectAll(".grid-horizontal .domain").remove();

      // Y axis
      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      const colorScale = d3.scaleOrdinal()
        .domain(chart.groupBy ? Array.from(new Set(data.map(d => d.group!))) : [])
        .range(["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"]);

      if (chart.groupBy) {
        const groups = Array.from(new Set(data.map(d => d.group!)));
        const xSubScale = d3.scaleBand()
          .domain(groups)
          .range([0, xScale.bandwidth()])
          .padding(0.05);

        chartArea.selectAll(".bar")
          .data(data)
          .enter().append("rect")
          .attr("class", "bar")
          .attr("rx", 4)
          .attr("ry", 4)
          .attr("x", d => (xScale(d.key) || 0) + (xSubScale(d.group!) || 0))
          .attr("y", d => yScale(d.value))
          .attr("width", xSubScale.bandwidth())
          .attr("height", d => chartHeight - yScale(d.value))
          .attr("fill", d => {
            const evalRow = { [currentDimension]: d.key, [chart.yAxis!]: d.value, value: d.value, [chart.groupBy!]: d.group! };
            const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, evalRow, chart.yAxis || currentDimension);
            return style?.fill || style?.textColor || style?.backgroundColor || (colorScale(d.group!) as string);
          })
          .attr("opacity", d => getOpacity(d.key, 0.85))
          .style("cursor", "pointer")
          .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
          .on("click", (event, d) => handlePointClick(d.key))
          .on("contextmenu", (event, d) => {
            event.preventDefault();
            if (!dataset) return;
            const baseQuery: Query = {
              filters: {
                categoricalFilters: activeFilters.categoricalFilters,
                dateRangeFilters: activeFilters.dateRangeFilters,
                conditions: []
              },
              pagination: { pageSize: 1000 }
            };
            const mergedQuery = filterManager.merge(baseQuery, activeGlobalFilters, chart.id, dataset);
            if (drillState && drillState.activeFilters.length > 0) {
              drillState.activeFilters.forEach((f) => {
                mergedQuery.filters!.conditions!.push({ column: f.column, operator: f.operator, value: f.value });
              });
            }
            mergedQuery.filters!.conditions!.push({ column: currentDimension, operator: 'equals', value: d.key });
            mergedQuery.filters!.conditions!.push({ column: chart.groupBy!, operator: 'equals', value: d.group! });
            openDrillThrough(chart.datasetId, mergedQuery, `Raw Data (${currentDimension} = ${d.key}, ${chart.groupBy} = ${d.group})`);
          });
      } else {
        chartArea.selectAll(".bar")
          .data(data)
          .enter().append("rect")
          .attr("class", "bar")
          .attr("rx", 4)
          .attr("ry", 4)
          .attr("x", d => xScale(d.key) || 0)
          .attr("y", d => yScale(d.value))
          .attr("width", xScale.bandwidth())
          .attr("height", d => chartHeight - yScale(d.value))
          .attr("fill", d => {
            const evalRow = { [currentDimension]: d.key, [chart.yAxis!]: d.value, value: d.value };
            const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, evalRow, chart.yAxis || currentDimension);
            return style?.fill || style?.textColor || style?.backgroundColor || "hsl(var(--chart-1))";
          })
          .attr("opacity", d => getOpacity(d.key, 0.85))
          .style("cursor", "pointer")
          .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
          .on("click", (event, d) => handlePointClick(d.key))
          .on("contextmenu", (event, d) => handlePointRightClick(event, d.key));
      }

      // Axis labels
      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(chart.yAxis);

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    function renderLineChart() {
      if (!currentDimension || !chart.yAxis) return;

      const data = processedChartData
        .filter(d => d[currentDimension] !== null && d[chart.yAxis!] !== null)
        .sort((a, b) => {
          const aVal = a[currentDimension];
          const bVal = b[currentDimension];
          if (xType === 'numeric') {
            return Number(aVal) - Number(bVal);
          } else if (xType === 'date') {
            return Date.parse(String(aVal)) - Date.parse(String(bVal));
          } else {
            return String(aVal).localeCompare(String(bVal));
          }
        });

      if (!data.length) {
        renderErrorMessage("No valid records found for line charting.");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let xScale: any;
      if (xType === 'numeric') {
        xScale = d3.scaleLinear()
          .domain(d3.extent(data, d => Number(d[currentDimension])) as [number, number])
          .range([0, chartWidth]);
      } else if (xType === 'date') {
        xScale = d3.scaleTime()
          .domain(d3.extent(data, d => new Date(String(d[currentDimension]))) as [Date, Date])
          .range([0, chartWidth]);
      } else {
        xScale = d3.scalePoint()
          .domain(data.map(d => String(d[currentDimension])))
          .range([0, chartWidth])
          .padding(0.1);
      }

      const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[chart.yAxis!])) as [number, number])
        .nice()
        .range([chartHeight, 0]);

      const line = d3.line<ForecastPoint>()
        .x(d => {
          const val = d[currentDimension];
          if (xType === 'numeric') return Number(xScale(Number(val)));
          if (xType === 'date') return Number(xScale(new Date(String(val))));
          return Number(xScale(String(val))) || 0;
        })
        .y(d => yScale(Number(d[chart.yAxis!])))
        .curve(d3.curveMonotoneX);

      // Axes
      const xAxisG = chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`);

      if (xType === 'date') {
        xAxisG.call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 85))).tickFormat(d3.timeFormat("%Y-%m-%d") as unknown as (dv: d3.NumberValue, i: number) => string));
      } else {
        xAxisG.call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 85))));
      }

      if (xType === 'categorical' || xType === 'date') {
        xAxisG.selectAll("text")
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-45)");
      }

      // Horizontal grid lines - faint and dashed
      chartArea.append("g")
        .attr("class", "grid-horizontal")
        .call(d3.axisLeft(yScale).tickSize(-chartWidth).tickFormat(() => ""))
        .selectAll("line")
        .attr("stroke", "rgba(255, 255, 255, 0.05)")
        .attr("stroke-dasharray", "4 4");
      chartArea.selectAll(".grid-horizontal .domain").remove();

      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      // Separate historical vs forecast data points
      const historicalData = data.filter(d => !d.isForecast);
      const forecastStartIndex = data.findIndex(d => d.isForecast);
      const forecastData = forecastStartIndex !== -1
        ? data.slice(Math.max(0, forecastStartIndex - 1))
        : [];

      // Historical Path
      if (historicalData.length > 0) {
        chartArea.append("path")
          .datum(historicalData)
          .attr("fill", "none")
          .attr("stroke", "hsl(var(--chart-1))")
          .attr("stroke-width", 2)
          .attr("d", line);
      }

      // Forecast Path (Dashed)
      if (forecastData.length > 1) {
        chartArea.append("path")
          .datum(forecastData)
          .attr("fill", "none")
          .attr("stroke", "hsl(var(--primary))")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "5 4")
          .attr("opacity", 0.9)
          .attr("d", line);
      }

      // Points (only draw if dataset is reasonably sized to avoid overlap crowding)
      if (data.length <= 250) {
        chartArea.selectAll(".dot")
          .data(data)
          .enter().append("circle")
          .attr("class", "dot")
          .attr("cx", d => {
            const val = d[currentDimension];
            if (xType === 'numeric') return Number(xScale(Number(val)));
            if (xType === 'date') return Number(xScale(new Date(String(val))));
            return Number(xScale(String(val))) || 0;
          })
          .attr("cy", d => yScale(Number(d[chart.yAxis!])))
          .attr("r", d => d.isForecast ? 6 : 5)
          .attr("fill", d => {
            if (d.isForecast) return "hsl(var(--primary))";
            const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, d, chart.yAxis || currentDimension);
            return style?.fill || style?.textColor || style?.backgroundColor || "hsl(var(--chart-1))";
          })
          .attr("stroke", d => d.isForecast ? "hsl(var(--background))" : "none")
          .attr("stroke-width", d => d.isForecast ? 2 : 0)
          .attr("opacity", d => getOpacity(String(d[currentDimension]), d.isForecast ? 0.9 : 0.75))
          .style("cursor", "pointer")
          .attr("title", d => d.isForecast ? `Forecast (Projected): ${d[chart.yAxis!]}` : "Left-click to filter/drill, Right-click to view raw rows")
          .on("click", (event, d) => handlePointClick(String(d[currentDimension])))
          .on("contextmenu", (event, d) => handlePointRightClick(event, String(d[currentDimension])));
      }

      // Labels
      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(chart.yAxis);

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    function renderPieChart() {
      if (!currentDimension || !chart.yAxis) return;

      const aggregatedData = d3.rollup(
        chartData,
        v => d3.sum(v, d => Number(d[chart.yAxis!]) || 0),
        d => String(d[currentDimension])
      );

      const data = Array.from(aggregatedData, ([key, value]) => ({ key, value }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value);

      if (!data.length) {
        renderErrorMessage("No aggregated pie slices containing values > 0.");
        return;
      }

      const radius = Math.min(chartWidth, chartHeight) / 2;
      const centerX = chartWidth / 2;
      const centerY = chartHeight / 2;

      const colorScale = d3.scaleOrdinal()
        .domain(data.map(d => d.key))
        .range(["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"]);

      const pie = d3.pie<PieSlice>()
        .value(d => d.value)
        .sort(null);

      const arc = d3.arc<d3.PieArcDatum<PieSlice>>()
        .innerRadius(0)
        .outerRadius(radius);

      const arcs = chartArea.selectAll(".arc")
        .data(pie(data))
        .enter().append("g")
        .attr("class", "arc")
        .attr("transform", `translate(${centerX},${centerY})`);

      arcs.append("path")
        .attr("d", arc)
        .attr("fill", d => {
          const evalRow = { [currentDimension]: d.data.key, [chart.yAxis!]: d.data.value, value: d.data.value };
          const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, evalRow, chart.yAxis || currentDimension);
          return style?.fill || style?.textColor || style?.backgroundColor || (colorScale(d.data.key) as string);
        })
        .attr("opacity", d => getOpacity(d.data.key, 0.85))
        .style("cursor", "pointer")
        .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
        .on("click", (event, d) => handlePointClick(d.data.key))
        .on("contextmenu", (event, d) => handlePointRightClick(event, d.data.key));

      arcs.append("text")
        .attr("transform", d => `translate(${arc.centroid(d)})`)
        .attr("dy", ".35em")
        .style("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "hsl(var(--background))")
        .style("font-weight", "500")
        .text(d => {
          const percent = ((d.endAngle - d.startAngle) / (2 * Math.PI) * 100).toFixed(1);
          return Number(percent) > 7 ? `${percent}%` : '';
        });
    }

    function renderScatterPlot() {
      if (!currentDimension || !chart.yAxis) return;

      const data = chartData.filter(d => 
        d[currentDimension] !== null && d[chart.yAxis!] !== null
      );

      const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[currentDimension])) as [number, number])
        .nice()
        .range([0, chartWidth]);

      const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[chart.yAxis!])) as [number, number])
        .nice()
        .range([chartHeight, 0]);

      const colorScale = d3.scaleOrdinal()
        .domain(chart.groupBy ? Array.from(new Set(data.map(d => String(d[chart.groupBy!])))) : ['default'])
        .range(["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"]);

      chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xScale));

      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      const filterCol = chart.groupBy ? chart.groupBy : currentDimension;

      chartArea.selectAll(".dot")
        .data(data)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(Number(d[currentDimension])))
        .attr("cy", d => yScale(Number(d[chart.yAxis!])))
        .attr("r", 5)
        .attr("fill", d => {
          const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, d, chart.yAxis || currentDimension);
          return style?.fill || style?.textColor || style?.backgroundColor || (colorScale(chart.groupBy ? String(d[chart.groupBy!]) : 'default') as string);
        })
        .attr("opacity", d => getOpacity(chart.groupBy ? String(d[chart.groupBy!]) : String(d[currentDimension]), 0.75))
        .style("cursor", "pointer")
        .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
        .on("click", (event, d) => handlePointClick(String(d[filterCol])))
        .on("contextmenu", (event, d) => handlePointRightClick(event, String(d[filterCol]), 'equals', filterCol));

      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(chart.yAxis);

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    function renderHistogram() {
      if (!currentDimension) return;

      const data = chartData
        .map(d => Number(d[currentDimension]))
        .filter(d => !isNaN(d));

      const xScale = d3.scaleLinear()
        .domain(d3.extent(data) as [number, number])
        .nice()
        .range([0, chartWidth]);

      const histogram = d3.bin()
        .domain(xScale.domain() as [number, number])
        .thresholds(xScale.ticks(20));

      const bins = histogram(data);

      const yScale = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length) || 0])
        .nice()
        .range([chartHeight, 0]);

      chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xScale));

      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      chartArea.selectAll(".bar")
        .data(bins)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.x0!))
        .attr("y", d => yScale(d.length))
        .attr("width", d => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 1))
        .attr("height", d => chartHeight - yScale(d.length))
        .attr("fill", d => {
          const evalRow = { [currentDimension]: d.x0, count: d.length, value: d.length };
          const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, evalRow, currentDimension);
          return style?.fill || style?.textColor || style?.backgroundColor || "hsl(var(--chart-1))";
        })
        .attr("opacity", d => getOpacity({ start: d.x0, end: d.x1 }, 0.85))
        .style("cursor", "pointer")
        .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
        .on("click", (event, d) => handlePointClick({ start: d.x0, end: d.x1 }, 'between'))
        .on("contextmenu", (event, d) => handlePointRightClick(event, { start: d.x0, end: d.x1 }, 'between'));

      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text("Frequency");

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    function renderHeatmap() {
      if (!currentDimension || !chart.yAxis) return;

      const aggregated = d3.rollup(
        chartData,
        v => v.length,
        d => String(d[currentDimension]),
        d => String(d[chart.yAxis!])
      );

      const xValues = Array.from(new Set(chartData.map(d => String(d[currentDimension])))).sort();
      const yValues = Array.from(new Set(chartData.map(d => String(d[chart.yAxis!])))).sort();

      const xScale = d3.scaleBand()
        .domain(xValues)
        .range([0, chartWidth])
        .padding(0.1);

      const yScale = d3.scaleBand()
        .domain(yValues)
        .range([0, chartHeight])
        .padding(0.1);

      const maxValue = d3.max(Array.from(aggregated.values()), d => d3.max(Array.from(d.values()))) || 1;
      const colorScale = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, maxValue]);

      const heatmapData: HeatmapCell[] = [];
      xValues.forEach(x => {
        yValues.forEach(y => {
          const value = aggregated.get(x)?.get(y) || 0;
          heatmapData.push({ x, y, value });
        });
      });

      chartArea.selectAll(".cell")
        .data(heatmapData)
        .enter().append("rect")
        .attr("class", "cell")
        .attr("x", d => xScale(d.x) || 0)
        .attr("y", d => yScale(d.y) || 0)
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", d => {
          const evalRow = { [currentDimension]: d.x, [chart.yAxis!]: d.y, value: d.value };
          const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, evalRow, chart.yAxis || currentDimension);
          return style?.fill || style?.textColor || style?.backgroundColor || colorScale(d.value);
        })
        .attr("opacity", d => getOpacity(d.x, 1.0))
        .style("cursor", "pointer")
        .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
        .on("click", (event, d) => handlePointClick(d.x))
        .text(d => `${d.x}, ${d.y}: ${d.value}`);

      chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");

      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(chart.yAxis);

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    function renderAreaChart() {
      if (!currentDimension || !chart.yAxis) return;

      const data = processedChartData
        .filter(d => d[currentDimension] !== null && d[chart.yAxis!] !== null)
        .sort((a, b) => {
          const aVal = a[currentDimension];
          const bVal = b[currentDimension];
          if (xType === 'numeric') {
            return Number(aVal) - Number(bVal);
          } else if (xType === 'date') {
            return Date.parse(String(aVal)) - Date.parse(String(bVal));
          } else {
            return String(aVal).localeCompare(String(bVal));
          }
        });

      if (!data.length) {
        renderErrorMessage("No valid records found for area charting.");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let xScale: any;
      if (xType === 'numeric') {
        xScale = d3.scaleLinear()
          .domain(d3.extent(data, d => Number(d[currentDimension])) as [number, number])
          .range([0, chartWidth]);
      } else if (xType === 'date') {
        xScale = d3.scaleTime()
          .domain(d3.extent(data, d => new Date(String(d[currentDimension]))) as [Date, Date])
          .range([0, chartWidth]);
      } else {
        xScale = d3.scalePoint()
          .domain(data.map(d => String(d[currentDimension])))
          .range([0, chartWidth])
          .padding(0.1);
      }

      const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => Number(d[chart.yAxis!])) || 0])
        .nice()
        .range([chartHeight, 0]);

      const area = d3.area<ForecastPoint>()
        .x(d => {
          const val = d[currentDimension];
          if (xType === 'numeric') return Number(xScale(Number(val)));
          if (xType === 'date') return Number(xScale(new Date(String(val))));
          return Number(xScale(String(val))) || 0;
        })
        .y0(chartHeight)
        .y1(d => yScale(Number(d[chart.yAxis!])))
        .curve(d3.curveMonotoneX);

      const line = d3.line<ForecastPoint>()
        .x(d => {
          const val = d[currentDimension];
          if (xType === 'numeric') return Number(xScale(Number(val)));
          if (xType === 'date') return Number(xScale(new Date(String(val))));
          return Number(xScale(String(val))) || 0;
        })
        .y(d => yScale(Number(d[chart.yAxis!])))
        .curve(d3.curveMonotoneX);

      const xAxisG = chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`);

      if (xType === 'date') {
        xAxisG.call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 85))).tickFormat(d3.timeFormat("%Y-%m-%d") as unknown as (dv: d3.NumberValue, i: number) => string));
      } else {
        xAxisG.call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 85))));
      }

      if (xType === 'categorical' || xType === 'date') {
        xAxisG.selectAll("text")
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-45)");
      }

      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      const historicalData = data.filter(d => !d.isForecast);
      const forecastStartIndex = data.findIndex(d => d.isForecast);
      const forecastData = forecastStartIndex !== -1
        ? data.slice(Math.max(0, forecastStartIndex - 1))
        : [];

      if (historicalData.length > 0) {
        chartArea.append("path")
          .datum(historicalData)
          .attr("fill", "hsl(var(--chart-1))")
          .attr("fill-opacity", 0.45)
          .attr("d", area);

        chartArea.append("path")
          .datum(historicalData)
          .attr("fill", "none")
          .attr("stroke", "hsl(var(--chart-1))")
          .attr("stroke-width", 2)
          .attr("d", line);
      }

      if (forecastData.length > 1) {
        chartArea.append("path")
          .datum(forecastData)
          .attr("fill", "hsl(var(--primary))")
          .attr("fill-opacity", 0.2)
          .attr("d", area);

        chartArea.append("path")
          .datum(forecastData)
          .attr("fill", "none")
          .attr("stroke", "hsl(var(--primary))")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "5 4")
          .attr("d", line);
      }

      // Points (only draw if dataset is reasonably sized to avoid overlap crowding)
      if (data.length <= 250) {
        chartArea.selectAll(".dot")
          .data(data)
          .enter().append("circle")
          .attr("class", "dot")
          .attr("cx", d => {
            const val = d[currentDimension];
            if (xType === 'numeric') return Number(xScale(Number(val)));
            if (xType === 'date') return Number(xScale(new Date(String(val))));
            return Number(xScale(String(val))) || 0;
          })
          .attr("cy", d => yScale(Number(d[chart.yAxis!])))
          .attr("r", d => d.isForecast ? 5 : 4)
          .attr("fill", d => {
            if (d.isForecast) return "hsl(var(--primary))";
            const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, d, chart.yAxis || currentDimension);
            return style?.fill || style?.textColor || style?.backgroundColor || "hsl(var(--chart-1))";
          })
          .attr("stroke", d => d.isForecast ? "hsl(var(--background))" : "none")
          .attr("stroke-width", d => d.isForecast ? 2 : 0)
          .attr("opacity", d => getOpacity(String(d[currentDimension]), d.isForecast ? 0.9 : 0.75))
          .style("cursor", "pointer")
          .attr("title", d => d.isForecast ? `Forecast (Projected): ${d[chart.yAxis!]}` : "Left-click to filter/drill, Right-click to view raw rows")
          .on("click", (event, d) => handlePointClick(String(d[currentDimension])))
          .on("contextmenu", (event, d) => handlePointRightClick(event, String(d[currentDimension])));
      }

      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(chart.yAxis);

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    function renderBubbleChart() {
      if (!currentDimension || !chart.yAxis || !chart.sizeBy) return;

      const data = chartData
        .filter(d => d[currentDimension] !== null && d[chart.yAxis!] !== null && d[chart.sizeBy!] !== null)
        .filter(d => !isNaN(Number(d[currentDimension])) && !isNaN(Number(d[chart.yAxis!])) && !isNaN(Number(d[chart.sizeBy!])));

      if (!data.length) {
        renderErrorMessage("No valid numeric records found for bubble chart.");
        return;
      }

      const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[currentDimension])) as [number, number])
        .nice()
        .range([0, chartWidth]);

      const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[chart.yAxis!])) as [number, number])
        .nice()
        .range([chartHeight, 0]);

      const sizeScale = d3.scaleSqrt()
        .domain(d3.extent(data, d => Number(d[chart.sizeBy!])) as [number, number])
        .range([4, 25]);

      const colorScale = d3.scaleOrdinal()
        .domain(chart.groupBy ? Array.from(new Set(data.map(d => String(d[chart.groupBy!])))) : ['default'])
        .range(["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"]);

      chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`)
        .call(d3.axisBottom(xScale));

      chartArea.append("g")
        .call(d3.axisLeft(yScale));

      const filterCol = chart.groupBy ? chart.groupBy : currentDimension;

      chartArea.selectAll(".bubble")
        .data(data)
        .enter().append("circle")
        .attr("class", "bubble")
        .attr("cx", d => xScale(Number(d[currentDimension])))
        .attr("cy", d => yScale(Number(d[chart.yAxis!])))
        .attr("r", d => sizeScale(Number(d[chart.sizeBy!])))
        .attr("fill", d => {
          const style = formattingEngine.evaluateCompiledRules(compiledFormattingRules, d, chart.yAxis || currentDimension);
          return style?.fill || style?.textColor || style?.backgroundColor || (colorScale(chart.groupBy ? String(d[chart.groupBy!]) : 'default') as string);
        })
        .attr("opacity", d => getOpacity(chart.groupBy ? String(d[chart.groupBy!]) : String(d[currentDimension]), 0.7))
        .style("cursor", "pointer")
        .attr("title", "Left-click to filter/drill, Right-click to view raw rows")
        .on("click", (event, d) => handlePointClick(String(d[filterCol])))
        .on("contextmenu", (event, d) => handlePointRightClick(event, String(d[filterCol]), 'equals', filterCol))
        .append("title")
        .text(d => `${currentDimension}: ${d[currentDimension]}, ${chart.yAxis}: ${d[chart.yAxis!]}, ${chart.sizeBy}: ${d[chart.sizeBy!]}`);

      chartArea.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(chart.yAxis);

      chartArea.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "hsl(var(--muted-foreground))")
        .text(currentDimension);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chart,
    width,
    chartData,
    activeCrossFilter,
    toggleCrossFilter,
    drillState,
    currentDimension,
    isDrillMode,
    openDrillThrough,
    setWidgetDrillState,
    resetWidgetDrillState,
    activeFilters,
    activeGlobalFilters,
    dataset,
    compiledFormattingRules
  ]);

  if (pluginChartDef) {
    const PluginComponent = pluginChartDef.component;
    return (
      <div ref={containerRef} className="h-full w-full flex flex-col p-2 bg-background overflow-hidden">
        <PluginComponent chart={chart} data={chartData} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col p-4 bg-background animate-chart-animate relative" data-chart-id={chart.id}>
      {/* Chart Toolbar (for Drill-Down controls) */}
      {chart.drillPath && chart.drillPath.length > 0 && (
        <div className="flex items-center justify-between text-xs border-b border-border/40 pb-2 px-1 flex-shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {drillState && drillState.currentDepth > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] gap-1 shrink-0"
                onClick={handleDrillUp}
                aria-label="Drill up to previous hierarchy level"
              >
                <ArrowUp className="h-3 w-3" />
                Up
              </Button>
            ) : (
              <span className="text-muted-foreground italic truncate text-[10px]">
                Drill Down Hierarchy
              </span>
            )}
            
            {/* Breadcrumb list */}
            {drillState && drillState.currentDepth > 0 && (
              <div className="flex items-center gap-1 min-w-0 text-[10px] text-muted-foreground overflow-hidden">
                <span className="shrink-0 font-semibold text-foreground">{chart.drillPath[0]}</span>
                {drillState.activeFilters.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-1 min-w-0">
                    <span>/</span>
                    <span className="truncate font-medium text-primary max-w-[60px]" title={String(f.value)}>
                      {String(f.value)}
                    </span>
                    <span>/</span>
                    <span className="shrink-0 font-semibold text-foreground">
                      {chart.drillPath[idx + 1] || 'Details'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Drill Mode Toggle */}
          <div className="flex items-center gap-1">
            <Button
              variant={isDrillMode ? "premium" : "ghost"}
              size="sm"
              className="h-7 px-2 text-[10px] gap-1"
              onClick={() => setIsDrillMode(!isDrillMode)}
              title={isDrillMode ? "Clicking a point will drill down" : "Clicking a point will cross-filter"}
              aria-label={`Toggle drill mode, currently ${isDrillMode ? "ON" : "OFF"}`}
              aria-pressed={isDrillMode}
            >
              <GitFork className="h-3.5 w-3.5 rotate-90" />
              Drill Mode: {isDrillMode ? "ON" : "OFF"}
            </Button>
          </div>
        </div>
      )}

      {/* SVG drawing area */}
      <div className="flex-1 min-w-0 min-h-[250px] w-full relative overflow-hidden flex items-center justify-center">
        {chartAnomalies.length > 0 && (
          <Badge
            variant="outline"
            className="absolute top-1 right-2 z-10 text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 border-amber-500/40 gap-1 font-medium pointer-events-none"
            title={chartAnomalies.map((a) => a.description).join("\n")}
          >
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            {chartAnomalies.length} {chartAnomalies.length === 1 ? "Outlier" : "Outliers"}
          </Badge>
        )}
        <svg ref={svgRef} className="w-full h-full max-w-full max-h-full block overflow-visible" role="img" aria-label={chart.title ? `Chart: ${chart.title}` : `${chart.type} visualization`} />
        
        {/* Screen Reader Accessible Fallback Table */}
        <div className="sr-only">
          <h4>{chart.title || `${chart.type.toUpperCase()} Chart Data Summary`}</h4>
          <p>{`Visualization of ${chart.yAxis || "Values"} grouped by ${currentDimension || "Categories"} containing ${chartData.length} records.`}</p>
          {chartData.length > 0 && (
            <table>
              <caption>{`${chart.title || "Chart"} aggregated dataset view`}</caption>
              <thead>
                <tr>
                  <th scope="col">{currentDimension || "Dimension"}</th>
                  {chart.yAxis && <th scope="col">{chart.yAxis}</th>}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, 15).map((row, idx) => (
                  <tr key={idx}>
                    <td>{String(row[currentDimension] ?? "")}</td>
                    {chart.yAxis && <td>{String(row[chart.yAxis] ?? "")}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChartVisualization({ chart }: ChartVisualizationProps) {
  return (
    <ErrorBoundary fallback={(props) => <WidgetError {...props} />}>
      <ChartVisualizationContent chart={chart} />
    </ErrorBoundary>
  );
}