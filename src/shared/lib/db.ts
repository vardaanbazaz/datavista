import Dexie, { type Table } from 'dexie';
import { Dataset, ChartConfig, FilterState, Dashboard } from '@/shared/types';

export interface UIPreference {
  key: string;
  value: unknown;
}

export class DataVistaDatabase extends Dexie {
  datasets!: Table<Dataset, string>;
  charts!: Table<ChartConfig, string>;
  filters!: Table<{ datasetId: string; state: FilterState }, string>;
  uiState!: Table<UIPreference, string>;
  dashboards!: Table<Dashboard, string>;

  constructor() {
    super('DataVistaDatabase');
    
    // Version 1 of the schema
    this.version(1).stores({
      datasets: 'id',
      charts: 'id, datasetId',
      filters: 'datasetId',
      uiState: 'key',
      dashboards: 'id'
    });
  }
}

export const db = new DataVistaDatabase();
export default db;
