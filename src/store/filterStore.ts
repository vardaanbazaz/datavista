import { create } from "zustand";
import { DataRow, FilterState } from "@/shared/types";

interface FilterStoreState {
  filteredData: DataRow[];
  activeFilters: FilterState;
  setFilteredData: (data: DataRow[]) => void;
  setActiveFilters: (filters: FilterState) => void;
  setFiltersChange: (filteredData: DataRow[], filters: FilterState) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterStoreState>((set) => ({
  filteredData: [],
  activeFilters: {
    categoricalFilters: {},
    dateRangeFilters: {},
  },
  setFilteredData: (filteredData) => set({ filteredData }),
  setActiveFilters: (activeFilters) => set({ activeFilters }),
  setFiltersChange: (filteredData, activeFilters) => set({ filteredData, activeFilters }),
  resetFilters: () => set({
    activeFilters: {
      categoricalFilters: {},
      dateRangeFilters: {},
      groupByColumn: undefined,
      groupByPeriod: undefined,
    }
  })
}));
