import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ChartConfig } from "@/features/dashboard/components/Dashboard";
import { useDatasetStore } from "@/store/datasetStore";

interface ChartVisualizationProps {
  chart: ChartConfig;
}

export function ChartVisualization({ chart }: ChartVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);

  // ResizeObserver to handle layout container resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // Give it a bit of padding inside the container card
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

  useEffect(() => {
    if (!svgRef.current || !chart.data.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const height = 320;
    const margin = { top: 20, right: 30, bottom: 65, left: 60 };

    svg.attr("width", width).attr("height", height);

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

      const nonNull = chart.data.map(d => d[col]).filter(v => v !== null && v !== undefined && v !== "");
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

    const xType = chart.xAxis ? getColumnType(chart.xAxis) : 'categorical';
    const yType = chart.yAxis ? getColumnType(chart.yAxis) : 'categorical';
    const sizeType = chart.sizeBy ? getColumnType(chart.sizeBy) : null;

    // Validate configuration safety
    let validationError = "";
    if (chart.type === 'scatter') {
      if (!chart.xAxis || !chart.yAxis) {
        validationError = "Scatter Plot requires both X and Y axis fields.";
      } else if (xType !== 'numeric' || yType !== 'numeric') {
        validationError = "Scatter Plot requires numeric columns for both X and Y axes.";
      }
    } else if (chart.type === 'bubble') {
      if (!chart.xAxis || !chart.yAxis || !chart.sizeBy) {
        validationError = "Bubble Chart requires X axis, Y axis, and Size By fields.";
      } else if (xType !== 'numeric' || yType !== 'numeric' || (sizeType && sizeType !== 'numeric')) {
        validationError = "Bubble Chart requires numeric columns for X axis, Y axis, and Size parameter.";
      }
    } else if (chart.type === 'histogram') {
      if (!chart.xAxis) {
        validationError = "Histogram requires an X-axis field.";
      } else if (xType !== 'numeric') {
        validationError = "Histogram requires a numeric column for the X-axis.";
      }
    } else if (['bar', 'line', 'area'].includes(chart.type)) {
      if (!chart.xAxis || !chart.yAxis) {
        validationError = `${chart.type.charAt(0).toUpperCase() + chart.type.slice(1)} chart requires both X and Y axis fields.`;
      } else if (yType !== 'numeric') {
        validationError = `${chart.type.charAt(0).toUpperCase() + chart.type.slice(1)} chart requires a numeric column for the Y-axis.`;
      }
    } else if (chart.type === 'pie') {
      if (!chart.xAxis || !chart.yAxis) {
        validationError = "Pie chart requires Category and Values fields.";
      } else if (yType !== 'numeric') {
        validationError = "Pie chart requires a numeric column for Values.";
      }
    }

    if (validationError) {
      renderErrorMessage(validationError);
      return;
    }

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
      if (!chart.xAxis || !chart.yAxis) return;

      const aggregatedData = chart.groupBy
        ? d3.rollup(
            chart.data,
            v => d3.sum(v, d => Number(d[chart.yAxis!]) || 0),
            d => String(d[chart.xAxis!]),
            d => String(d[chart.groupBy!])
          )
        : d3.rollup(
            chart.data,
            v => d3.sum(v, d => Number(d[chart.yAxis!]) || 0),
            d => String(d[chart.xAxis!])
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
          .attr("x", d => (xScale(d.key) || 0) + (xSubScale(d.group!) || 0))
          .attr("y", d => yScale(d.value))
          .attr("width", xSubScale.bandwidth())
          .attr("height", d => chartHeight - yScale(d.value))
          .attr("fill", d => colorScale(d.group!) as string)
          .attr("opacity", 0.85);
      } else {
        chartArea.selectAll(".bar")
          .data(data)
          .enter().append("rect")
          .attr("class", "bar")
          .attr("x", d => xScale(d.key) || 0)
          .attr("y", d => yScale(d.value))
          .attr("width", xScale.bandwidth())
          .attr("height", d => chartHeight - yScale(d.value))
          .attr("fill", "hsl(var(--chart-1))")
          .attr("opacity", 0.85);
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
        .text(chart.xAxis);
    }

    function renderLineChart() {
      if (!chart.xAxis || !chart.yAxis) return;

      const data = chart.data
        .filter(d => d[chart.xAxis!] !== null && d[chart.yAxis!] !== null)
        .sort((a, b) => {
          const aVal = a[chart.xAxis!];
          const bVal = b[chart.xAxis!];
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

      let xScale: any;
      if (xType === 'numeric') {
        xScale = d3.scaleLinear()
          .domain(d3.extent(data, d => Number(d[chart.xAxis!])) as [number, number])
          .range([0, chartWidth]);
      } else if (xType === 'date') {
        xScale = d3.scaleTime()
          .domain(d3.extent(data, d => new Date(String(d[chart.xAxis!]))) as [Date, Date])
          .range([0, chartWidth]);
      } else {
        xScale = d3.scalePoint()
          .domain(data.map(d => String(d[chart.xAxis!])))
          .range([0, chartWidth])
          .padding(0.1);
      }

      const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[chart.yAxis!])) as [number, number])
        .nice()
        .range([chartHeight, 0]);

      const line = d3.line<any>()
        .x(d => {
          const val = d[chart.xAxis!];
          if (xType === 'numeric') return xScale(Number(val));
          if (xType === 'date') return xScale(new Date(String(val)));
          return xScale(String(val)) || 0;
        })
        .y(d => yScale(Number(d[chart.yAxis!])))
        .curve(d3.curveMonotoneX);

      // Axes
      const xAxisG = chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`);

      if (xType === 'date') {
        xAxisG.call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 85))).tickFormat(d3.timeFormat("%Y-%m-%d") as any));
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

      // Path
      chartArea.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "hsl(var(--chart-1))")
        .attr("stroke-width", 2)
        .attr("d", line);

      // Points (only draw if dataset is reasonably sized to avoid overlap crowding)
      if (data.length <= 100) {
        chartArea.selectAll(".dot")
          .data(data)
          .enter().append("circle")
          .attr("class", "dot")
          .attr("cx", d => {
            const val = d[chart.xAxis!];
            if (xType === 'numeric') return xScale(Number(val));
            if (xType === 'date') return xScale(new Date(String(val)));
            return xScale(String(val)) || 0;
          })
          .attr("cy", d => yScale(Number(d[chart.yAxis!])))
          .attr("r", 3)
          .attr("fill", "hsl(var(--chart-1))");
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
        .text(chart.xAxis);
    }

    function renderPieChart() {
      if (!chart.xAxis || !chart.yAxis) return;

      const aggregatedData = d3.rollup(
        chart.data,
        v => d3.sum(v, d => Number(d[chart.yAxis!]) || 0),
        d => String(d[chart.xAxis!])
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

      const pie = d3.pie<any>()
        .value(d => d.value)
        .sort(null);

      const arc = d3.arc<any>()
        .innerRadius(0)
        .outerRadius(radius);

      const arcs = chartArea.selectAll(".arc")
        .data(pie(data))
        .enter().append("g")
        .attr("class", "arc")
        .attr("transform", `translate(${centerX},${centerY})`);

      arcs.append("path")
        .attr("d", arc)
        .attr("fill", d => colorScale(d.data.key) as string)
        .attr("opacity", 0.85);

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
      if (!chart.xAxis || !chart.yAxis) return;

      const data = chart.data.filter(d => 
        d[chart.xAxis!] !== null && d[chart.yAxis!] !== null
      );

      const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[chart.xAxis!])) as [number, number])
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

      chartArea.selectAll(".dot")
        .data(data)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(Number(d[chart.xAxis!])))
        .attr("cy", d => yScale(Number(d[chart.yAxis!])))
        .attr("r", 4.5)
        .attr("fill", d => colorScale(chart.groupBy ? String(d[chart.groupBy!]) : 'default') as string)
        .attr("opacity", 0.75);

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
        .text(chart.xAxis);
    }

    function renderHistogram() {
      if (!chart.xAxis) return;

      const data = chart.data
        .map(d => Number(d[chart.xAxis!]))
        .filter(d => !isNaN(d));

      const xScale = d3.scaleLinear()
        .domain(d3.extent(data) as [number, number])
        .nice()
        .range([0, chartWidth]);

      const histogram = d3.histogram()
        .value(d => d)
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
        .attr("fill", "hsl(var(--chart-1))")
        .attr("opacity", 0.85);

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
        .text(chart.xAxis);
    }

    function renderHeatmap() {
      if (!chart.xAxis || !chart.yAxis) return;

      const aggregated = d3.rollup(
        chart.data,
        v => v.length,
        d => String(d[chart.xAxis!]),
        d => String(d[chart.yAxis!])
      );

      const xValues = Array.from(new Set(chart.data.map(d => String(d[chart.xAxis!])))).sort();
      const yValues = Array.from(new Set(chart.data.map(d => String(d[chart.yAxis!])))).sort();

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

      const heatmapData: any[] = [];
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
        .attr("x", (d: any) => xScale(d.x) || 0)
        .attr("y", (d: any) => yScale(d.y) || 0)
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", (d: any) => colorScale(d.value))
        .append("title")
        .text((d: any) => `${d.x}, ${d.y}: ${d.value}`);

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
        .text(chart.xAxis);
    }

    function renderAreaChart() {
      if (!chart.xAxis || !chart.yAxis) return;

      const data = chart.data
        .filter(d => d[chart.xAxis!] !== null && d[chart.yAxis!] !== null)
        .sort((a, b) => {
          const aVal = a[chart.xAxis!];
          const bVal = b[chart.xAxis!];
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

      let xScale: any;
      if (xType === 'numeric') {
        xScale = d3.scaleLinear()
          .domain(d3.extent(data, d => Number(d[chart.xAxis!])) as [number, number])
          .range([0, chartWidth]);
      } else if (xType === 'date') {
        xScale = d3.scaleTime()
          .domain(d3.extent(data, d => new Date(String(d[chart.xAxis!]))) as [Date, Date])
          .range([0, chartWidth]);
      } else {
        xScale = d3.scalePoint()
          .domain(data.map(d => String(d[chart.xAxis!])))
          .range([0, chartWidth])
          .padding(0.1);
      }

      const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => Number(d[chart.yAxis!])) || 0])
        .nice()
        .range([chartHeight, 0]);

      const area = d3.area<any>()
        .x(d => {
          const val = d[chart.xAxis!];
          if (xType === 'numeric') return xScale(Number(val));
          if (xType === 'date') return xScale(new Date(String(val)));
          return xScale(String(val)) || 0;
        })
        .y0(chartHeight)
        .y1(d => yScale(Number(d[chart.yAxis!])))
        .curve(d3.curveMonotoneX);

      const line = d3.line<any>()
        .x(d => {
          const val = d[chart.xAxis!];
          if (xType === 'numeric') return xScale(Number(val));
          if (xType === 'date') return xScale(new Date(String(val)));
          return xScale(String(val)) || 0;
        })
        .y(d => yScale(Number(d[chart.yAxis!])))
        .curve(d3.curveMonotoneX);

      const xAxisG = chartArea.append("g")
        .attr("transform", `translate(0,${chartHeight})`);

      if (xType === 'date') {
        xAxisG.call(d3.axisBottom(xScale).ticks(Math.max(2, Math.floor(chartWidth / 85))).tickFormat(d3.timeFormat("%Y-%m-%d") as any));
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

      chartArea.append("path")
        .datum(data)
        .attr("fill", "hsl(var(--chart-1))")
        .attr("fill-opacity", 0.45)
        .attr("d", area);

      chartArea.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "hsl(var(--chart-1))")
        .attr("stroke-width", 2)
        .attr("d", line);

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
        .text(chart.xAxis);
    }

    function renderBubbleChart() {
      if (!chart.xAxis || !chart.yAxis || !chart.sizeBy) return;

      const data = chart.data.filter(d => 
        d[chart.xAxis!] !== null && 
        d[chart.yAxis!] !== null && 
        d[chart.sizeBy!] !== null
      );

      const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => Number(d[chart.xAxis!])) as [number, number])
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

      chartArea.selectAll(".bubble")
        .data(data)
        .enter().append("circle")
        .attr("class", "bubble")
        .attr("cx", d => xScale(Number(d[chart.xAxis!])))
        .attr("cy", d => yScale(Number(d[chart.yAxis!])))
        .attr("r", d => sizeScale(Number(d[chart.sizeBy!])))
        .attr("fill", d => colorScale(chart.groupBy ? String(d[chart.groupBy!]) : 'default') as string)
        .attr("opacity", 0.7)
        .append("title")
        .text(d => `${chart.xAxis}: ${d[chart.xAxis!]}, ${chart.yAxis}: ${d[chart.yAxis!]}, ${chart.sizeBy}: ${d[chart.sizeBy!]}`);

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
        .text(chart.xAxis);
    }

  }, [chart, width]);

  return (
    <div ref={containerRef} className="w-full animate-chart-animate" data-chart-id={chart.id}>
      <svg ref={svgRef} className="w-full h-auto" />
    </div>
  );
}