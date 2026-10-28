export const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Display name of the primary shortcut modifier: "⌘" on Apple platforms, "Ctrl" elsewhere. */
export const modKey = isMac ? "⌘" : "Ctrl";

/** Formats shortcut parts for display, e.g. ["Ctrl", "K"] -> "Ctrl+K", ["⌘", "K"] -> "⌘K". */
export function formatShortcut(parts: string[]): string {
  return parts.join(isMac ? "" : "+");
}
