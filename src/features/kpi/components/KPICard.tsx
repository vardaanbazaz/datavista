import { useMemo } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { formattingEngine } from "@/shared/services/formattingEngine";
import { KPICardConfig } from "../types";
import { kpiEngine } from "../kpiEngine";
import { Edit2, Trash2, GripVertical, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useDrillStore } from "@/features/dashboards/store/drillStore";
import { filterManager } from "@/features/dashboards/services/filterManager";
import { Query } from "@/shared/types";
import { Hint } from "@/shared/components/Hint";

interface KPICardProps {
  config: KPICardConfig;
  onRemove: () => void;
  onEdit: () => void;
  isMobile?: boolean;
}

export function KPICard({ config, onRemove, onEdit, isMobile = false }: KPICardProps) {
  const dataset = useDatasetStore((state) => state.activeDataset);
  const activeFilters = useFilterStore((state) => state.activeFilters);
  const activeGlobalFilters = useDashboardStore((state) => state.activeGlobalFilters || []);

  const openDrillThrough = useDrillStore((state) => state.openDrillThrough);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!dataset) return;

    const baseQuery: Query = {
      filters: {
        categoricalFilters: activeFilters.categoricalFilters,
        dateRangeFilters: activeFilters.dateRangeFilters,
        conditions: [],
      },
      pagination: { pageSize: 1000 }
    };

    const mergedQuery = filterManager.merge(baseQuery, activeGlobalFilters, undefined, dataset);

    const title = `Raw Data for KPI: ${config.title}`;
    openDrillThrough(dataset.id, mergedQuery, title);
  };

  // Compute KPI data from the unified engine
  const kpiData = useMemo(() => {
    if (!dataset) return null;
    
    // Create filters object to pass to query engine
    const queryFilters = {
      categoricalFilters: activeFilters.categoricalFilters,
      dateRangeFilters: activeFilters.dateRangeFilters,
    };

    return kpiEngine.calculateKPIData(dataset, config, queryFilters, activeGlobalFilters);
  }, [dataset, config, activeFilters, activeGlobalFilters]);

  // Evaluate conditional formatting rules
  const formatStyle = useMemo(() => {
    if (!kpiData || !config.formattingRules || config.formattingRules.length === 0) return null;
    const evalRow = {
      [config.primaryMetric.column]: kpiData.primaryValue,
      value: kpiData.primaryValue,
      primaryValue: kpiData.primaryValue,
      [config.title]: kpiData.primaryValue
    };
    return formattingEngine.evaluate(config.formattingRules, evalRow, config.primaryMetric.column);
  }, [kpiData, config]);

  // Premium value formatter
  const formattedValue = useMemo(() => {
    if (!kpiData) return "0";
    const value = kpiData.primaryValue;
    const absVal = Math.abs(value);
    
    let formatted = "";
    if (absVal >= 1e9) {
      formatted = (value / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    } else if (absVal >= 1e6) {
      formatted = (value / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    } else if (absVal >= 1e3) {
      formatted = (value / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    } else {
      formatted = Number(value.toFixed(2)).toLocaleString();
    }

    // Check if column looks like currency
    const isCurrency = /sales|revenue|profit|price|cost|budget|spend/i.test(config.primaryMetric.column);
    return isCurrency ? `$${formatted}` : formatted;
  }, [kpiData, config.primaryMetric.column]);

  // Determine trend color and arrow based on percentage and polarity
  const trendInfo = useMemo(() => {
    if (!kpiData || kpiData.trendPercentage === null) return null;
    const percent = kpiData.trendPercentage;
    const isPositive = percent > 0;
    const isZero = percent === 0;

    let isGood = isPositive;
    if (config.polarity === "negative") {
      isGood = !isPositive;
    }

    let colorClass = "text-muted-foreground bg-muted";
    if (!isZero) {
      colorClass = isGood 
        ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" 
        : "text-rose-500 bg-rose-500/10 border-rose-500/20";
    }

    return {
      percent: Math.abs(percent).toFixed(1) + "%",
      isPositive,
      isZero,
      colorClass,
    };
  }, [kpiData, config.polarity]);

  // Generate responsive/clean SVG sparkline path
  const sparklineSvg = useMemo(() => {
    if (!kpiData || kpiData.sparklineData.length < 2) return null;
    const values = kpiData.sparklineData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min === 0 ? 1 : max - min;

    const width = 120;
    const height = 36;
    const padding = 2;

    const points = values.map((val, idx) => {
      const x = padding + (idx / (values.length - 1)) * (width - 2 * padding);
      const y = padding + (1 - (val - min) / range) * (height - 2 * padding);
      return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

    // Line color based on trend
    let lineColor = "hsl(var(--primary))";
    if (kpiData.trendPercentage !== null) {
      const isGood = config.polarity === "negative" ? kpiData.trendPercentage < 0 : kpiData.trendPercentage > 0;
      if (kpiData.trendPercentage !== 0) {
        lineColor = isGood ? "rgb(16 185 129)" : "rgb(244 63 94)"; // emerald vs rose
      }
    }

    return {
      linePath,
      areaPath,
      width,
      height,
      lineColor,
    };
  }, [kpiData, config.polarity]);

  if (!dataset || !kpiData) return null;

  return (
    <Card
      className="h-full w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 flex flex-col overflow-hidden shadow-none group transition-colors"
      style={formatStyle?.backgroundColor ? { backgroundColor: formatStyle.backgroundColor } : undefined}
    >
      {/* Header / Drag Handle */}
      <div className="p-3 pb-1 flex flex-row items-center justify-between drag-handle select-none flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {!isMobile && (
            <GripVertical className="h-4 w-4 text-zinc-400 dark:text-zinc-500 cursor-grab active:cursor-grabbing shrink-0" />
          )}
          <span className="text-caption uppercase text-textTertiary truncate">
            {config.title}
          </span>
        </div>
        <div className="flex items-center gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Hint label="Edit this KPI card">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0"
              onClick={onEdit}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </Hint>
          <Hint label="Remove this KPI card">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-400 hover:text-rose-500 shrink-0"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </Hint>
        </div>
      </div>

      {/* Main Metric Content */}
      <CardContent 
        className="p-4 pt-1 flex-1 flex flex-row items-center justify-between min-h-0 w-full relative bg-gray-50/50 dark:bg-zinc-900/50 cursor-context-menu"
        onContextMenu={handleContextMenu}
        title="Right-click to view raw data records"
      >
        <div className="flex flex-col justify-center min-w-0 pr-4">
          <span
            className="font-mono text-kpi text-zinc-900 dark:text-white truncate leading-none mb-2"
            style={formatStyle?.textColor ? { color: formatStyle.textColor } : undefined}
          >
            {formattedValue}
          </span>
          
          {/* Trend Badge */}
          {trendInfo ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className={`px-1.5 py-0 text-[10px] font-semibold flex items-center gap-0.5 border ${trendInfo.colorClass}`}>
                {trendInfo.isZero ? (
                  <Minus className="h-3 w-3" />
                ) : trendInfo.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{trendInfo.percent}</span>
              </Badge>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                vs last {config.trendConfiguration?.comparisonPeriod || "period"}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              Overall aggregate
            </span>
          )}
        </div>

        {/* Sparkline Graphic */}
        {config.sparkline && sparklineSvg && (
          <div className="shrink-0 w-[120px] h-[36px] flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity">
            <svg width={sparklineSvg.width} height={sparklineSvg.height} className="overflow-visible">
              <defs>
                <linearGradient id={`kpi-spark-grad-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparklineSvg.lineColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={sparklineSvg.lineColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <path
                d={sparklineSvg.areaPath}
                fill={`url(#kpi-spark-grad-${config.id})`}
                stroke="none"
              />
              <path
                d={sparklineSvg.linePath}
                fill="none"
                stroke={sparklineSvg.lineColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
