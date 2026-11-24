import { db } from "@/shared/lib/db";
import { persistenceService } from "./persistenceService";
import { resumeChatWrites, stopChatWrites } from "@/features/ai/copilot/chatHistory";

/** Every localStorage/sessionStorage key DataVista writes starts with this (ui prefs, AI settings and key, templates, saved views, snapshots, first-visit flag). */
export const LOCAL_STORAGE_PREFIX = "datavista";

/**
 * What "Clear all local data" deletes, for the confirm step. IndexedDB `DataVistaDatabase`:
 * datasets, their rows, charts, dashboards, filters, UI state and copilot chats. localStorage `datavista*`:
 * preferences, the AI provider and a remembered key, templates, saved views, snapshots.
 * sessionStorage `datavista*`: the AI key kept for this session.
 */
export const CLEARED_ITEMS = [
  "Every dataset and all its rows",
  "Charts, dashboards, KPI cards and saved filters",
  "Copilot chats",
  "Dashboard templates, saved views and snapshots",
  "Preferences (theme, last view, tour progress)",
  "The AI provider choice and the AI API key",
] as const;

/**
 * Deletes everything DataVista keeps in this browser, then reloads. Only DataVista's own
 * database and `datavista*` keys go: on GitHub Pages the origin (*.github.io) is shared with
 * other sites, so neither localStorage.clear() nor deleting every database is safe.
 */
export async function clearAllLocalData(reload: () => void = () => window.location.reload()): Promise<void> {
  // Stop writes first: a waiting row save or the pagehide flush would recreate the database.
  await persistenceService.stopWriting();
  stopChatWrites();
  try {
    db.close();
    await db.delete();
  } catch (e) {
    // Nothing deleted (e.g. another tab holds the database): reopen and keep saving.
    await db.open().catch(() => {});
    persistenceService.stopped = false;
    resumeChatWrites();
    throw e;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LOCAL_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
  // The AI key is kept in sessionStorage unless the user chose "Remember on this device".
  try {
    const sessionKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(LOCAL_STORAGE_PREFIX)) sessionKeys.push(key);
    }
    for (const key of sessionKeys) sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage blocked: nothing stored there */
  }
  reload();
}
