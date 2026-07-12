import { create } from "zustand";
import type { RegressionReport, VitalMetric, VitalsSnapshot } from "@wvp/types";

interface VitalsStore {
  snapshot: VitalsSnapshot | null;
  history: VitalMetric[];
  regressions: RegressionReport[];
  overlayEnabled: boolean;
  setSnapshot: (snapshot: VitalsSnapshot | null) => void;
  setHistory: (history: VitalMetric[]) => void;
  setRegressions: (regressions: RegressionReport[]) => void;
  setOverlayEnabled: (enabled: boolean) => void;
}

export const useVitalsStore = create<VitalsStore>((set) => ({
  snapshot: null,
  history: [],
  regressions: [],
  overlayEnabled: true,
  setSnapshot: (snapshot) => set({ snapshot }),
  setHistory: (history) => set({ history }),
  setRegressions: (regressions) => set({ regressions }),
  setOverlayEnabled: (overlayEnabled) => set({ overlayEnabled }),
}));
