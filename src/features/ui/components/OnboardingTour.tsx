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
      content: "AI Co-Pilot: Click the star to configure your API keys and ask natural language queries.",
    },
    {
      target: '[data-tour="header-tutorial"]',
      content: "Tutorial: Need a refresher? Click this question mark to restart this tour anytime.",
    },
    {
      target: '[data-tour="header-theme"]',
      content: "Theme Toggle: Switch between Light and Dark mode to suit your workspace preference.",
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
