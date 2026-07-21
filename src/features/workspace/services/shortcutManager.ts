import { useCommandRegistry } from "@/shared/services/commandRegistry";

class ShortcutManager {
  private listenerAttached = false;
  private onOpenPaletteCallback?: () => void;

  public init(onOpenPalette?: () => void) {
    if (onOpenPalette) {
      this.onOpenPaletteCallback = onOpenPalette;
    }

    if (this.listenerAttached) return;
    this.listenerAttached = true;

    window.addEventListener("keydown", this.handleKeyDown);
  }

  public setOpenPaletteCallback(callback: () => void) {
    this.onOpenPaletteCallback = callback;
  }

  public destroy() {
    if (!this.listenerAttached) return;
    window.removeEventListener("keydown", this.handleKeyDown);
    this.listenerAttached = false;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInputTarget =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const isAlt = e.altKey;
    const key = e.key.toLowerCase();

    // 1. Command Palette Trigger (Cmd+K / Ctrl+K)
    if (isCmdOrCtrl && key === "k") {
      e.preventDefault();
      this.onOpenPaletteCallback?.();
      return;
    }

    // 2. Ignore plain character keypresses inside form inputs
    if (isInputTarget && !isCmdOrCtrl && !isAlt) {
      return;
    }

    // 3. Match against registered commands
    const commands = useCommandRegistry.getState().getEnabledCommands();

    for (const cmd of commands) {
      if (!cmd.shortcut || cmd.shortcut.length === 0) continue;

      const sc = cmd.shortcut.map((s) => s.toLowerCase());

      const requiresMod = sc.includes("⌘") || sc.includes("ctrl");
      const requiresShift = sc.includes("⇧") || sc.includes("shift");
      const requiresAlt = sc.includes("alt");

      // Check modifier matches
      if (requiresMod && !isCmdOrCtrl) continue;
      if (requiresShift && !e.shiftKey) continue;
      if (requiresAlt && !isAlt) continue;

      // Extract primary key (the last item in shortcut array, e.g. "z", "p", "t", "1")
      const primaryKeySymbol = sc[sc.length - 1];

      let isKeyMatch = false;
      if (primaryKeySymbol === "z" && key === "z") isKeyMatch = true;
      else if (primaryKeySymbol === "p" && key === "p") isKeyMatch = true;
      else if (primaryKeySymbol === "t" && key === "t") isKeyMatch = true;
      else if (primaryKeySymbol === "s" && key === "s") isKeyMatch = true;
      else if (primaryKeySymbol === key) isKeyMatch = true;

      if (isKeyMatch) {
        e.preventDefault();
        cmd.execute();
        return;
      }
    }
  };
}

export const shortcutManager = new ShortcutManager();
