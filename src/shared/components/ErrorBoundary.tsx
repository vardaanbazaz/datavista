import React, { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/shared/utils/logger";
import { Button } from "@/shared/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export interface FallbackProps {
  error: Error | null;
  resetErrorBoundary?: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.logError(error, { componentStack: errorInfo.componentStack });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback({
          error: this.state.error,
          resetErrorBoundary: this.handleReset,
        });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <FullPageError error={this.state.error} resetErrorBoundary={this.handleReset} />;
    }

    return this.props.children;
  }
}

export function FullPageError({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-6">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-bold mb-2">Something went wrong</h1>
      <p className="text-muted-foreground max-w-md mb-6 text-sm">
        {error?.message || "An unexpected error occurred in DataVista workspace."}
      </p>
      <div className="flex gap-3">
        {resetErrorBoundary && (
          <Button variant="outline" onClick={resetErrorBoundary} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </Button>
        )}
        <Button variant="default" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      </div>
    </div>
  );
}

export function WidgetError({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="h-full w-full min-h-[160px] flex flex-col items-center justify-center p-4 bg-muted/30 border border-destructive/20 rounded-lg text-center">
      <AlertTriangle className="w-6 h-6 text-amber-500 mb-2" />
      <h4 className="text-sm font-semibold text-foreground mb-1">Widget Crashed</h4>
      <p className="text-xs text-muted-foreground max-w-xs mb-3 truncate">
        {error?.message || "Failed to render visualization widget."}
      </p>
      {resetErrorBoundary && (
        <Button variant="outline" size="sm" onClick={resetErrorBoundary} className="h-7 text-xs gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </Button>
      )}
    </div>
  );
}
