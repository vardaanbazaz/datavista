import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { Download, FileImage, FileText, FileSpreadsheet } from "lucide-react";
import { useMemo } from "react";
import { ChartConfig } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { useFilterStore } from "@/store/filterStore";
import { useChartStore } from "@/store/chartStore";
import { exportChartAsPNG, exportChartAsSVG, exportDataAsCSV, generatePDFReport } from "@/shared/utils/exportUtils";
import { useToast } from "@/shared/hooks/use-toast";
import { ChartVisualization } from "@/features/charts/components/ChartVisualization";

export function ExportPanel() {
  const dataset = useDatasetStore((state) => state.activeDataset);
  const filteredData = useFilterStore((state) => state.filteredData);
  const allCharts = useChartStore((state) => state.charts);

  const charts = useMemo(() => {
    if (!dataset) return [];
    return allCharts.filter((c) => c.datasetId === dataset.id);
  }, [allCharts, dataset]);

  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
          <Download className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Active Dataset</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Upload or select a dataset first to start exporting.
        </p>
      </div>
    );
  }

  const handleChartExport = async (chart: ChartConfig, format: 'png' | 'svg') => {
    setIsExporting(true);
    try {
      if (format === 'png') {
        await exportChartAsPNG(chart);
      } else {
        await exportChartAsSVG(chart);
      }
      toast({
        title: "Chart exported",
        description: `${chart.title} exported as ${format.toUpperCase()}`,
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Failed to export chart. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDataExport = async () => {
    setIsExporting(true);
    try {
      await exportDataAsCSV(filteredData, dataset.name);
      toast({
        title: "Data exported",
        description: "Filtered dataset exported as CSV",
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePDFReport = async () => {
    setIsExporting(true);
    try {
      await generatePDFReport(dataset, filteredData, charts);
      toast({
        title: "PDF report generated",
        description: "Complete report with charts and data exported",
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Failed to generate PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Off-screen chart staging: exportChartAsPNG/SVG and generatePDFReport (exportUtils.ts)
          locate charts via document.querySelector('[data-chart-id]'), which only exists while
          a ChartVisualization for that chart is mounted somewhere. The Overview tab mounts one
          per dashboard chart, but Export can be reached independently of Overview and covers ALL
          of the dataset's charts (see `charts` above), not just the active dashboard's — so those
          nodes aren't guaranteed to exist. Render every exportable chart off-screen here instead,
          scoped to this panel's own mount lifetime (i.e. only while the Export tab is open, not
          for the whole session). `position: fixed` keeps it out of normal layout/scroll flow, and
          each chart gets an explicit pixel size so ChartVisualization's mount-time width read
          (see ChartVisualization.tsx's ResizeObserver effect) has a real value to draw against
          immediately — no waiting on async layout before it's capturable. */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 pointer-events-none"
        style={{ transform: "translateX(-10000px)" }}
      >
        {charts.map((chart) => (
          <div key={chart.id} className="w-[640px] h-[360px]">
            <ChartVisualization chart={chart} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Download className="h-6 w-6" />
        <h2 className="text-3xl font-bold">Export Dashboard</h2>
      </div>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Data Export
          </CardTitle>
          <CardDescription>
            Export your filtered dataset ({filteredData.length} rows) as CSV
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleDataExport}
            disabled={isExporting || filteredData.length === 0}
            className="w-full"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Filtered Data as CSV
          </Button>
        </CardContent>
      </Card>

      {/* Chart Exports */}
      {charts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5" />
              Chart Exports
            </CardTitle>
            <CardDescription>
              Export individual charts as PNG or SVG images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {charts.map((chart) => (
              <div key={chart.id} className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3">{chart.title}</h4>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleChartExport(chart, 'png')}
                    disabled={isExporting}
                  >
                    <FileImage className="h-4 w-4 mr-2" />
                    PNG
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleChartExport(chart, 'svg')}
                    disabled={isExporting}
                  >
                    <FileImage className="h-4 w-4 mr-2" />
                    SVG
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* PDF Report */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Complete PDF Report
          </CardTitle>
          <CardDescription>
            Generate a comprehensive PDF report with all charts and data summary
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handlePDFReport}
            disabled={isExporting || charts.length === 0}
            variant="premium"
            className="w-full"
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate PDF Report
          </Button>
          {charts.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Create at least one chart to generate a PDF report
            </p>
          )}
        </CardContent>
      </Card>

      {isExporting && (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            Exporting...
          </div>
        </div>
      )}
    </div>
  );
}