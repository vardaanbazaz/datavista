import React from "react";
import { Joyride, EventData, STATUS, Step } from "react-joyride";
import { useShallow } from "zustand/react/shallow";
import { useUiStore } from "@/store/uiStore";

export const OnboardingTour: React.FC = () => {
  const { runTour, setRunTour, setHasSeenTour } = useUiStore(
    useShallow((state) => ({
      runTour: state.runTour,
      setRunTour: state.setRunTour,
      setHasSeenTour: state.setHasSeenTour,
    }))
  );

  const steps: Step[] = [
    // --- MAIN FUNCTIONS ---
    {
      target: '[data-tour="nav-dashboard"]',
      content: "Overview: The Dashboard provides real-time executive summaries and high-level metrics.",
      skipBeacon: true,
    },
    {
      target: '[data-tour="nav-upload"]',
      content: "Upload Data: Drag and drop your raw CSV or Excel datasets here to begin.",
    },
    {
      target: '[data-tour="tool-filters"]',
      content: "Filters: Apply complex, multi-layered conditions to instantly narrow down your dataset.",
    },
    {
      target: '[data-tour="tool-statistics"]',
      content: "Statistics: View automated statistical summaries including mean, median, and variance.",
    },
    {
      target: '[data-tour="tool-window-functions"]',
      content: "Window Builder: Perform advanced rolling calculations and moving averages.",
    },
    {
      target: '[data-tour="tool-export"]',
      content: "Export: Download your processed data and visual reports directly to your local machine.",
    },
    {
      target: '[data-tour="nav-charts"]',
      content: "Charts: Build over 8 interactive chart types from your data.",
    },
    {
      target: '[data-tour="nav-pivot"]',
      content: "Pivot Table: Slice, dice, and aggregate multidimensional data into summary tables.",
    },
    {
      target: '[data-tour="global-search"]',
      content: "Command Palette: Power user? Press Cmd+K (or Ctrl+K) anywhere to search and navigate instantly.",
    },

    // --- SUB-MENUS ---
    {
      target: '[data-tour="nav-datasets"]',
      content: "Datasets: Manage all your uploaded files, switch between tables, and review history.",
    },
    {
      target: '[data-tour="nav-dashboards"]',
      content: "Dashboards: Access, organize, and manage your saved visual layouts.",
    },

    // --- HEADER ACTIONS ---
    {
      target: '[data-tour="header-copilot"]',
      content: "AI Co-Pilot: Click the star to ask natural language queries. API key settings live inside that panel too.",
    },
    {
      target: '[data-tour="header-tutorial"]',
      content: "Tutorial: Need a refresher? Click this question mark to restart this tour anytime.",
    },
    {
      target: '[data-tour="header-theme"]',
      content: "Reading comfort: text size, high contrast, reduced motion, simple frames, and Light or Dark theme.",
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
      // Theme tokens (CSS variables work inside inline styles): the tour reads as a framed
      // card in every theme, high contrast and text size included.
      options={{
        primaryColor: "hsl(var(--primary))",
        textColor: "hsl(var(--card-foreground))",
        backgroundColor: "hsl(var(--card))",
        arrowColor: "hsl(var(--card))",
        overlayColor: "rgb(0 0 0 / 0.6)",
        zIndex: 10000,
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
      }}
      styles={{
        tooltip: {
          borderRadius: "6px",
          padding: "1rem",
          border: "1px solid hsl(var(--border))",
          outline: "1px solid hsl(var(--ornament) / 0.45)",
          outlineOffset: "-4px",
          fontFamily: "inherit",
          fontSize: "1rem",
          boxShadow: "0 10px 30px -5px rgb(0 0 0 / 0.35)",
        },
        buttonPrimary: {
          borderRadius: "6px",
          fontSize: "0.875rem",
          fontWeight: 600,
          padding: "0.5rem 1rem",
          color: "hsl(var(--primary-foreground))",
          border: "1px solid hsl(var(--tertiary) / 0.5)",
        },
        buttonBack: {
          marginRight: "0.5rem",
          fontSize: "0.875rem",
          color: "hsl(var(--muted-foreground))",
        },
        buttonSkip: {
          fontSize: "0.875rem",
          color: "hsl(var(--muted-foreground))",
        },
      }}
      onEvent={handleJoyrideCallback}
    />
  );
};

export default OnboardingTour;
