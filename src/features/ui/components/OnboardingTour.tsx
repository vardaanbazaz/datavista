import React from "react";
import { Joyride, EventData, STATUS, Step } from "react-joyride";
import { useUiStore } from "@/store/uiStore";

export const OnboardingTour: React.FC = () => {
  const { runTour, setRunTour, setHasSeenTour } = useUiStore();

  const steps: Step[] = [
    {
      target: '[data-tour="nav-dashboard"]',
      content: "Welcome to DataVista! The Overview Dashboard provides real-time executive summaries, anomaly detection alerts, and top-level KPIs for your active dataset.",
      skipBeacon: true,
    },
    {
      target: '[data-tour="nav-upload"]',
      content: "Upload Data: Drag and drop CSV, TSV, or XLSX datasets (up to 100MB). Features automatic type inference and instant data validation.",
    },
    {
      target: '[data-tour="nav-datasets"]',
      content: "Manage all your uploaded datasets, switch between active tables, and review schema version histories here.",
    },
    {
      target: '[data-tour="tool-filters"]',
      content: "Apply complex, multi-layered conditions to instantly narrow down your dataset.",
    },
    {
      target: '[data-tour="dataset-grid"]',
      content: "Data Explorer: Inspect raw data rows, apply conditional formatting, create custom calculated fields, and export cleaned CSVs.",
    },
    {
      target: '[data-tour="nav-charts"]',
      content: "Visualization & Charts: Build over 8 interactive chart types (Bar, Line, Scatter, Pie, Heatmap, Area) with customizable color palettes.",
    },
    {
      target: '[data-tour="nav-pivot"]',
      content: "Pivot Explorer: Slice, dice, and aggregate multidimensional data. Easily drag and drop fields into Rows, Columns, and Values.",
    },
    {
      target: '[data-tour="tool-statistics"]',
      content: "View automated statistical summaries of your columns, including mean, median, variance, and standard deviation.",
    },
    {
      target: '[data-tour="tool-window-functions"]',
      content: "Perform advanced rolling calculations, moving averages, and cumulative sums directly in the browser.",
    },
    {
      target: '[data-tour="tool-export"]',
      content: "Done analyzing? Export your processed data and visual reports directly to your local machine.",
    },
    {
      target: '[data-tour="nav-dashboards"]',
      content: "Access, organize, and manage your saved visual dashboard layouts and reports.",
    },
    {
      target: '[data-tour="global-search"]',
      content: "Global Search / Command Palette: Press Cmd+K (or Ctrl+K) anywhere to execute commands, open templates, or search datasets.",
    },
    {
      target: '[data-tour="nav-settings"]',
      content: "AI Co-Pilot & Settings: Configure Google Gemini or OpenAI GPT-4o keys for natural language query execution and automated insights.",
    },
  ];

  const handleJoyrideCallback = (data: EventData) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRunTour(false);
      setHasSeenTour(true);
    }
  };

  if (!runTour) return null;

  return (
    <Joyride
      steps={steps}
      run={runTour}
      continuous
      scrollToFirstStep
      options={{
        primaryColor: "#2563eb",
        textColor: "#18181b",
        backgroundColor: "#ffffff",
        arrowColor: "#ffffff",
        zIndex: 10000,
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
      }}
      styles={{
        tooltip: {
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.25)",
        },
        buttonPrimary: {
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 600,
          padding: "8px 16px",
        },
        buttonBack: {
          marginRight: "8px",
          fontSize: "13px",
          color: "#71717a",
        },
        buttonSkip: {
          fontSize: "13px",
          color: "#71717a",
        },
      }}
      onEvent={handleJoyrideCallback}
    />
  );
};

export default OnboardingTour;
