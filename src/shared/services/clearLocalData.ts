import { db } from "@/shared/lib/db";
import { persistenceService } from "./persistenceService";

/** Every localStorage key DataVista writes starts with this (ui prefs + AI key, templates, saved views, snapshots, first-visit flag). */
export const LOCAL_STORAGE_PREFIX = "datavista";

/**
 * What "Clear all local data" deletes, for the confirm step. IndexedDB `DataVistaDatabase`:
 * datasets, their rows, charts, dashboards, filters and UI state. localStorage `datavista*`:
 * preferences, the AI provider and key, templates, saved views, snapshots.
 */
export const CLEARED_ITEMS = [
  "Every dataset and all its rows",
  "Charts, dashboards, KPI cards and saved filters",
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
  try {
    db.close();
    await db.delete();
  } catch (e) {
    // Nothing deleted (e.g. another tab holds the database): reopen and keep saving.
    await db.open().catch(() => {});
    persistenceService.stopped = false;
    throw e;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(LOCAL_STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
  reload();
}
