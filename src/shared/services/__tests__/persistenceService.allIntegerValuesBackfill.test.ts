import { describe, it, expect, vi, beforeEach } from "vitest";
import { Dataset, ColumnMetadata, DatasetMetadata } from "@/shared/types";

function legacyColumnMissingField(): ColumnMetadata {
  const col = {
    id: 'ds1_Education', name: 'Education', displayName: 'Education', originalHeader: 'Education',
    inferredDataType: 'numeric' as const, nullableStatus: false,
    uniqueValueCount: 5, missingValueCount: 0, minimumValue: 1, maximumValue: 5,
    categoryCardinality: {}, role: 'measure' as const,
  };
  return col as ColumnMetadata; // deliberately missing allIntegerValues, simulating pre-migration persisted data
}

const metadata: DatasetMetadata = {
  datasetId: 'ds1', name: 'ds1', createdAt: 0, updatedAt: 0,
  rowCount: 2, columnCount: 1, originalFileName: 'f.csv', originalFileType: 'csv',
  parsingStatistics: { processingTimeMs: 0 }, version: 1,
  columns: [legacyColumnMissingField()],
};

const legacyDataset: Dataset = {
  id: 'ds1', name: 'ds1',
  data: [{ Education: 1 }, { Education: 3 }],
  columns: ['Education'], columnTypes: { Education: 'numeric' }, metadata,
};

vi.mock("@/shared/lib/db", () => ({
  db: {
    datasets: { toArray: () => Promise.resolve([legacyDataset]) },
    charts: { toArray: () => Promise.resolve([]) },
    filters: { toArray: () => Promise.resolve([]) },
    uiState: { toArray: () => Promise.resolve([]) },
    dashboards: { toArray: () => Promise.resolve([]) },
  },
}));

import { persistenceService } from "../persistenceService";
import { useDatasetStore } from "@/store/datasetStore";
import { useUiStore } from "@/store/uiStore";

describe('persistenceService hydrate - allIntegerValues backfill', () => {
  beforeEach(() => {
    useUiStore.setState({ isDataHydrated: false });
    useDatasetStore.setState({ datasets: [], activeDataset: null });
  });

  it('backfills allIntegerValues on hydrate for a dataset persisted before this field existed', async () => {
    await persistenceService.hydrate();

    const hydrated = useDatasetStore.getState().datasets.find(d => d.id === 'ds1')!;
    const col = hydrated.metadata!.columns.find(c => c.name === 'Education')!;
    expect(col.allIntegerValues).toBe(true);
  });
});
