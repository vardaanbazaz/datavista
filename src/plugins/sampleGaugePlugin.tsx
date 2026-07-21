/* eslint-disable react-refresh/only-export-components */
import React from "react";
import { DataVistaPlugin } from "@/shared/types/plugins";
import { ChartConfig, DataRow } from "@/shared/types";
import { FunctionDefinition } from "@/shared/services/formula/library/types";

interface GaugeComponentProps {
  chart: ChartConfig;
  data: DataRow[];
}

export const GaugeChartComponent: React.FC<GaugeComponentProps> = ({ chart, data }) => {
  const yCol = chart.yAxis;

  // Calculate sum or average metric value
  const totalValue = React.useMemo(() => {
    if (!data.length) return 0;
    if (!yCol) return data.length;
    return data.reduce((acc, row) => {
      const val = Number(row[yCol]);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [data, yCol]);

  // Target max for gauge scale (defaulting to 100 or rounded ceiling)
  const maxScale = Math.max(100, Math.ceil(totalValue * 1.25));
  const percentage = Math.min(100, Math.max(0, (totalValue / maxScale) * 100));

  // SVG Gauge calculations (semi-circle radius 80)
  const radius = 70;
  const circumference = Math.PI * radius; // Half-circle perimeter
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4 text-foreground">
      <div className="relative flex flex-col items-center justify-center">
        <svg className="w-52 h-28 overflow-visible" viewBox="0 0 180 100">
          {/* Background track */}
          <path
            d="M 20 90 A 70 70 0 0 1 160 90"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* Foreground colored arc */}
          <path
            d="M 20 90 A 70 70 0 0 1 160 90"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center Text Readout */}
        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="text-2xl font-bold tracking-tight">
            {totalValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            {yCol ? yCol : "Total Count"} ({percentage.toFixed(0)}%)
          </span>
        </div>
      </div>
    </div>
  );
};

export const multiplyByTenFormula: FunctionDefinition = {
  name: "MULTIPLY_BY_TEN",
  description: "Multiplies a numeric value by 10 (Sample Plugin Formula)",
  args: [{ name: "value", type: "number" }],
  returnType: "number",
  apply: (args: unknown[]) => {
    const val = Number(args[0]) || 0;
    return val * 10;
  },
};

export const sampleGaugePlugin: DataVistaPlugin = {
  name: "SampleGaugePlugin",
  version: "1.0.0",
  init: (context) => {
    context.registerChartType({
      type: "gauge",
      label: "Gauge Chart",
      description: "Renders metric value as a semi-circle radial gauge",
      component: GaugeChartComponent,
    });

    context.registerFormula(multiplyByTenFormula);
  },
};
