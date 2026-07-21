export type CommandCategory =
  | "Navigation"
  | "Theme"
  | "Workspace"
  | "Dashboard"
  | "Data";

export interface CommandDefinition {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  shortcut?: string[];
  icon?: string;
  execute: () => void;
  isEnabled?: () => boolean;
}
