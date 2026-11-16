import { Dataset, ChartConfig, GlobalFilter, FilterState, DataRow } from "@/shared/types";
import { anomalyDetector, DetectedAnomaly } from "./anomalyDetector";
import { buildSummaryMessages, runChat } from "./aiRequests";
import { isAiConnected } from "./settings/aiSettingsStore";
import { countOf } from "@/shared/utils/plural";

export const summaryEngine = {
  /**
   * Generates a 2-3 sentence executive summary of the dashboard's current state and detected anomalies.
   * `rows` are the rows the charts currently plot (the filtered rows); defaults to all rows.
   */
  async generateExecutiveSummary(
    dataset: Dataset | null,
    charts: ChartConfig[],
    filters?: FilterState | GlobalFilter[],
    rows?: DataRow[]
  ): Promise<{ summary: string; anomalies: DetectedAnomaly[]; source: 'ai' | 'offline' }> {
    if (!dataset) {
      return {
        summary: "No active dataset loaded. Upload or select a dataset to generate automated insights.",
        anomalies: [],
        source: 'offline'
      };
    }

    // 1. Detect statistical anomalies
    let anomalies = anomalyDetector.detectDashboardAnomalies(charts, rows ?? dataset.data, dataset);
    if (anomalies.length === 0) {
      anomalies = anomalyDetector.detectDatasetAnomalies(dataset, rows);
    }

    // 2. Build summary context
    const datasetName = dataset.name;
    const rowCount = dataset.data.length;
    const chartCount = charts.length;

    const filterText = Array.isArray(filters)
      ? filters.map((f) => `${f.column} = ${JSON.stringify(f.value)}`).join(", ")
      : Object.entries(filters?.categoricalFilters || {})
          .map(([k, v]) => `${k}: [${v.join(", ")}]`)
          .join("; ");

    // 3. No provider connected: the offline summary, and no request is made.
    if (!isAiConnected()) {
      return {
        summary: this.generateOfflineSummary(datasetName, rowCount, chartCount, anomalies, filterText),
        anomalies,
        source: 'offline'
      };
    }

    try {
      // Dataset content, filter values and unusual values all pass the privacy builder.
      const messages = await buildSummaryMessages(dataset, charts, filters, anomalies, rows);
      const rawResponse = await runChat("summary", messages);

      let clean = rawResponse.trim();
      // If JSON returned, attempt to extract summary field or text
      if (clean.startsWith("{")) {
        try {
          const parsed = JSON.parse(clean);
          const candidate = parsed.summary || parsed.explanation || parsed.title;
          // The LLM response is untyped JSON - `summary` could be an object/array/number
          // instead of a string (a nested object, say). Only accept it if it's actually
          // a non-blank string; otherwise keep the raw text rather than handing a
          // non-string value to the UI, which would throw when React tries to render it.
          if (typeof candidate === "string" && candidate.trim() !== "") {
            clean = candidate;
          }
        } catch {
          // preserve raw clean text
        }
      }

      return {
        summary: clean,
        anomalies,
        source: 'ai'
      };
    } catch (e) {
      // Only the error kind is logged: provider messages can carry request details.
      console.warn("AI summary failed, using the offline summary:", e instanceof Error ? e.name : "error", (e as { kind?: string })?.kind ?? "");
      return {
        summary: this.generateOfflineSummary(datasetName, rowCount, chartCount, anomalies, filterText),
        anomalies,
        source: 'offline'
      };
    }
  },

  /**
   * Generates a polished 2-3 sentence executive summary offline when no API key is provided
   */
  generateOfflineSummary(
    datasetName: string,
    rowCount: number,
    _chartCount: number,
    anomalies: DetectedAnomaly[],
    filterText?: string
  ): string {
    // Only sentences with something real to say: which values stand out, and where.
    const scope = filterText && filterText.trim() ? ` (filtered: ${filterText})` : "";
    if (anomalies.length === 0) {
      return `No unusual values in the numeric columns of "${datasetName}"${scope}.`;
    }
    const top = anomalies.slice(0, 2).map((a) => a.description.replace(/\.$/, ""));
    const more = anomalies.length - top.length;
    return (
      `Most unusual values in "${datasetName}" (${countOf(rowCount, "row")}${scope}): ${top.join("; ")}.` +
      (more > 0 ? ` ${more} more ${more === 1 ? "value stands" : "values stand"} out.` : "")
    );
  }
};
