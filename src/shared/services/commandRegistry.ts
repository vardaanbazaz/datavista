import { create } from "zustand";
import { CommandDefinition } from "@/shared/types/commands";
import { useUiStore } from "@/store/uiStore";
import { useDashboardStore } from "@/features/dashboards/store/dashboardStore";
import { useFilterStore } from "@/store/filterStore";
import { toast } from "@/shared/hooks/use-toast";
import { modKey } from "@/shared/lib/platform";

interface CommandRegistryState {
  commands: Record<string, CommandDefinition>;
  registerCommand: (command: CommandDefinition) => void;
  unregisterCommand: (id: string) => void;
  getCommands: () => CommandDefinition[];
  getEnabledCommands: () => CommandDefinition[];
  executeCommand: (id: string) => boolean;
}


export const defaultCommands: CommandDefinition[] = [
  {
    id: "theme-toggle",
    label: "Toggle Theme (Dark / Light)",
    description: "Switch workspace theme between Dark and Light mode",
    category: "Theme",
    icon: "Sun",
    shortcut: ["Alt", "T"],
    execute: () => {
      const currentTheme = useUiStore.getState().theme;
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      useUiStore.getState().setTheme(newTheme);
      if (newTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      toast({
        title: "Theme Toggled",
        description: `Theme set to ${newTheme}.`,
      });
    },
  },
  {
    id: "nav-overview",
    label: "Go to Dashboard Overview",
    description: "Switch view to main executive dashboard overview",
    category: "Navigation",
    icon: "LayoutDashboard",
    shortcut: ["Alt", "1"],
    execute: () => {
      useUiStore.getState().setActiveView("overview");
    },
  },
  {
    id: "nav-data",
    label: "Go to Data Explorer",
    description: "View and edit tabular dataset records",
    category: "Navigation",
    icon: "Database",
    shortcut: ["Alt", "2"],
    execute: () => {
      useUiStore.getState().setActiveView("data");
    },
  },
  {
    id: "nav-charts",
    label: "Go to Charts Builder",
    description: "Create and customize chart visualizations",
    category: "Navigation",
    icon: "BarChart3",
    shortcut: ["Alt", "3"],
    execute: () => {
      useUiStore.getState().setActiveView("charts");
    },
  },
  {
    id: "nav-pivot",
    label: "Go to Pivot Table Explorer",
    description: "Analyze data using multi-dimensional pivot tables",
    category: "Navigation",
    icon: "Table",
    shortcut: ["Alt", "4"],
    execute: () => {
      useUiStore.getState().setActiveView("pivot");
    },
  },
  {
    id: "nav-stats",
    label: "Go to Statistical Analysis",
    description: "Explore statistical summaries and distributions",
    category: "Navigation",
    icon: "TrendingUp",
    shortcut: ["Alt", "5"],
    execute: () => {
      useUiStore.getState().setActiveView("stats");
    },
  },
  {
    id: "nav-window",
    label: "Go to Window Functions",
    description: "Define rolling averages, cumulative totals, and ranks",
    category: "Navigation",
    icon: "Calculator",
    shortcut: ["Alt", "6"],
    execute: () => {
      useUiStore.getState().setActiveView("window-builder");
    },
  },
  {
    id: "workspace-undo",
    label: "Undo State Change",
    description: "Revert previous layout or filter modification",
    category: "Workspace",
    icon: "RotateCcw",
    shortcut: [modKey, "Z"],
    isEnabled: () => useDashboardStore.getState().canUndo(),
    execute: () => {
      useDashboardStore.getState().undo();
    },
  },
  {
    id: "workspace-redo",
    label: "Redo State Change",
    description: "Re-apply un-done modification",
    category: "Workspace",
    icon: "RotateCw",
    shortcut: [modKey, "⇧", "Z"],
    isEnabled: () => useDashboardStore.getState().canRedo(),
    execute: () => {
      useDashboardStore.getState().redo();
    },
  },
  {
    id: "workspace-snapshots",
    label: "Manage Workspace Snapshots",
    description: "Save or restore named workspace state snapshots",
    category: "Workspace",
    icon: "Camera",
    shortcut: ["Alt", "S"],
    execute: () => {
      window.dispatchEvent(new CustomEvent("datavista:open-snapshots"));
    },
  },
  {
    id: "workspace-pdf-export",
    label: "Export Dashboard to PDF",
    description: "Generate and download print-ready PDF export",
    category: "Dashboard",
    icon: "FileDown",
    shortcut: [modKey, "P"],
    isEnabled: () => Boolean(useDashboardStore.getState().activeDashboardId),
    execute: () => {
      window.dispatchEvent(new CustomEvent("datavista:export-pdf"));
    },
  },
  {
    id: "dashboard-clear-filters",
    label: "Clear All Active Filters",
    description: "Reset active global cross-filters and column filters",
    category: "Data",
    icon: "FilterX",
    execute: () => {
      useFilterStore.getState().resetFilters();
      useDashboardStore.getState().clearGlobalFilters();
      toast({
        title: "Filters Cleared",
        description: "All active cross-filters and tabular filters have been reset.",
      });
    },
  },
];

const initialCommandsMap: Record<string, CommandDefinition> = {};
defaultCommands.forEach((cmd) => {
  initialCommandsMap[cmd.id] = cmd;
});

export const useCommandRegistry = create<CommandRegistryState>((set, get) => ({
  commands: initialCommandsMap,

  registerCommand: (command: CommandDefinition) => {
    set((state) => ({
      commands: {
        ...state.commands,
        [command.id]: command,
      },
    }));
  },

  unregisterCommand: (id: string) => {
    set((state) => {
      const copy = { ...state.commands };
      delete copy[id];
      return { commands: copy };
    });
  },

  getCommands: () => {
    return Object.values(get().commands);
  },

  getEnabledCommands: () => {
    return Object.values(get().commands).filter(
      (cmd) => !cmd.isEnabled || cmd.isEnabled()
    );
  },

  executeCommand: (id: string) => {
    const cmd = get().commands[id];
    if (cmd && (!cmd.isEnabled || cmd.isEnabled())) {
      cmd.execute();
      return true;
    }
    return false;
  },
}));
