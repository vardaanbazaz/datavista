import { PivotConfig, PivotResultModel } from "@/shared/services/pivot";

interface PivotState {
  pivotConfig: PivotConfig | null;
  pivotResult: PivotResultModel | null;
  setPivotConfig: (config: PivotConfig | null) => void;
  setPivotResult: (result: PivotResultModel | null) => void;
  resetPivotConfig: () => void;
}

export const usePivotStore = create<PivotState>((set) => ({
  pivotConfig: null,
  pivotResult: null,
  setPivotConfig: (pivotConfig) => set({ pivotConfig }),
  setPivotResult: (pivotResult) => set({ pivotResult }),
  resetPivotConfig: () => set({ pivotConfig: null, pivotResult: null })
}));
export default usePivotStore;
