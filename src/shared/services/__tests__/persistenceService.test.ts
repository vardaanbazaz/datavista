import { describe, it, expect, vi, beforeEach } from "vitest";

// Control exactly when the "IndexedDB read" resolves so we can assert the UI stays
// gated while it's pending and only unlocks once it actually completes - this is the
// real bug: `isHydrated` used to flip true synchronously from localStorage, long before
// this read (the real data load) was done.
let resolveDatasetsRead: (rows: unknown[]) => void;
const datasetsReadPromise = new Promise<unknown[]>((resolve) => {
  resolveDatasetsRead = resolve;
});

vi.mock("@/shared/lib/db", () => ({
  db: {
    datasets: { toArray: () => datasetsReadPromise },
    charts: { toArray: () => Promise.resolve([]) },
    filters: { toArray: () => Promise.resolve([]) },
    uiState: { toArray: () => Promise.resolve([]) },
    dashboards: { toArray: () => Promise.resolve([]) },
  },
}));

import { persistenceService } from "../persistenceService";
import { useUiStore } from "@/store/uiStore";

describe("persistenceService hydration gate (isDataHydrated)", () => {
  beforeEach(() => {
    useUiStore.setState({ isDataHydrated: false });
  });

  it("keeps isDataHydrated false while the real IndexedDB read is still pending", async () => {
    expect(useUiStore.getState().isDataHydrated).toBe(false);

    const hydratePromise = persistenceService.hydrate();

    // Let any already-resolved microtasks flush, but the datasets read is still pending -
    // the loading gate must still be closed here, on a dataset large enough to take time.
    await Promise.resolve();
    await Promise.resolve();
    expect(useUiStore.getState().isDataHydrated).toBe(false);

    resolveDatasetsRead([]);
    await hydratePromise;

    expect(useUiStore.getState().isDataHydrated).toBe(true);
  });
});
