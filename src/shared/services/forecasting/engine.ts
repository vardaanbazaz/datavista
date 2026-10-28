import { DataRow } from "@/shared/types";
import { ForecastConfig, ForecastPoint } from "./types";
import { toNumberOrNull } from "@/shared/utils/numeric";

export const forecastingEngine = {
  /**
   * Generates forecasted future data points using Linear Regression or Moving Average
   */
  generateForecast(
    data: DataRow[],
    xCol: string,
    yCol: string,
    config?: ForecastConfig
  ): ForecastPoint[] {
    if (!config || !config.enabled || config.periodsToProject <= 0 || !data || data.length < 2) {
      return data.map((d) => ({ ...d, isForecast: false }));
    }

    const yValues: number[] = [];
    const validRows: { row: DataRow; index: number; y: number }[] = [];

    data.forEach((row, i) => {
      const val = toNumberOrNull(row[yCol]);
      if (val !== null) {
        yValues.push(val);
        validRows.push({ row, index: i, y: val });
      }
    });

    if (yValues.length < 2) {
      return data.map((d) => ({ ...d, isForecast: false }));
    }

    const N = config.periodsToProject;
    const projectedValues: number[] = [];

    if (config.method === 'moving_average') {
      // Moving Average extrapolation
      const windowSize = Math.min(3, yValues.length);
      const recent = yValues.slice(-windowSize);
      const avg = recent.reduce((sum, v) => sum + v, 0) / windowSize;

      // Optional slight trend calculation
      const trend = yValues.length >= 2 ? (yValues[yValues.length - 1] - yValues[yValues.length - windowSize]) / windowSize : 0;

      for (let k = 1; k <= N; k++) {
        const nextVal = avg + (trend * k * 0.3); // dampened trend
        projectedValues.push(Math.round(nextVal * 100) / 100);
      }
    } else {
      // Linear Regression extrapolation (Least Squares)
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      const count = yValues.length;

      for (let i = 0; i < count; i++) {
        const x = i;
        const y = yValues[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      }

      const denominator = count * sumXX - sumX * sumX;
      const m = denominator !== 0 ? (count * sumXY - sumX * sumY) / denominator : 0;
      const b = (sumY - m * sumX) / count;

      for (let k = 1; k <= N; k++) {
        const nextX = count - 1 + k;
        const nextY = m * nextX + b;
        projectedValues.push(Math.round(nextY * 100) / 100);
      }
    }

    // Prepare original points
    const result: ForecastPoint[] = data.map((d) => ({ ...d, isForecast: false }));

    // Generate future X labels
    const lastRow = data[data.length - 1];
    const lastXVal = lastRow[xCol];

    for (let k = 1; k <= N; k++) {
      let futureXLabel = `Forecast +${k}`;

      if (lastXVal !== null && lastXVal !== undefined) {
        const lastStr = String(lastXVal);
        const lastNum = Number(lastXVal);

        if (!isNaN(lastNum) && /^\d+$/.test(lastStr)) {
          futureXLabel = String(lastNum + k);
        } else {
          // Try date parsing
          const date = new Date(lastStr);
          if (!isNaN(date.getTime())) {
            const nextDate = new Date(date);
            nextDate.setMonth(nextDate.getMonth() + k);
            futureXLabel = nextDate.toISOString().split('T')[0];
          } else {
            futureXLabel = `${lastStr} +${k}`;
          }
        }
      }

      const newPoint: ForecastPoint = {
        [xCol]: futureXLabel,
        [yCol]: projectedValues[k - 1],
        isForecast: true,
      };

      result.push(newPoint);
    }

    return result;
  }
};
