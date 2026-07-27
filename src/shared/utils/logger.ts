export interface LogContext {
  [key: string]: unknown;
}

export const logger = {
  logError: (error: Error | string, context?: LogContext) => {
    console.error("[DataVista Error]", error, context || "");
    // Future integration hook: Sentry / Datadog / Cloud Logging
  },
  logWarning: (message: string, context?: LogContext) => {
    console.warn("[DataVista Warning]", message, context || "");
  },
  logInfo: (message: string, context?: LogContext) => {
    console.info("[DataVista Info]", message, context || "");
  }
};

export const logError = logger.logError;
export const logWarning = logger.logWarning;
export const logInfo = logger.logInfo;
