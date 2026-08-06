import React from "react";
import { Joyride, EventData, STATUS, Step } from "react-joyride";
import { useUiStore } from "@/store/uiStore";

export const OnboardingTour: React.FC = () => {
  const { runTour, setRunTour, setHasSeenTour } = useUiStore();

  const steps: Step[] = [
    {
      target: '[data-tour="sidebar-upload"]',
      content: "Welcome to DataVista! Start by uploading a CSV or Excel dataset here.",
      skipBeacon: true,
    },
    {
      target: '[data-tour="dataset-grid"]',
      content: "Here is your active dataset. You can view, filter, and manage your raw data.",
    },
    {
      target: '[data-tour="pivot-explorer"]',
      content: "Switch to the Pivot Builder to slice, dice, and aggregate your data into complex tables.",
    },
    {
      target: '[data-tour="global-search"]',
      content: "Power user? Hit Cmd+K (or Ctrl+K) anywhere to open the Command Palette for quick navigation.",
    },
    {
      target: '[data-tour="ai-copilot"]',
      content: "Need help? Ask the AI Co-Pilot to generate formulas or find anomalies in your data.",
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
      showSkipButton
      showProgress
      scrollToFirstStep
      styles={{
        options: {
          primaryColor: "#2563eb",
          textColor: "#18181b",
          backgroundColor: "#ffffff",
          arrowColor: "#ffffff",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.25)",
        },
        buttonNext: {
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
      callback={handleJoyrideCallback}
    />
  );
};

export default OnboardingTour;
