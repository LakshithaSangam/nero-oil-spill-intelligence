"use client";

import { create } from "zustand";
import { api } from "@/lib/api/client";
import type { FleetRiskIndex, VesselRiskProfile } from "@/types/api";

interface RiskState {
  index: FleetRiskIndex | null;
  profiles: Record<string, VesselRiskProfile>;
  loading: boolean;
  error: string | null;
  loadIndex: (force?: boolean) => Promise<void>;
  loadProfile: (mmsi: string) => Promise<void>;
}

export const useRiskStore = create<RiskState>((set, get) => ({
  index: null,
  profiles: {},
  loading: false,
  error: null,

  loadIndex: async (force) => {
    if (get().loading || (get().index && !force)) return;
    set({ loading: true, error: null });
    try {
      set({ index: await api<FleetRiskIndex>("/risk/index"), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "failed to load risk index" });
    }
  },

  loadProfile: async (mmsi) => {
    if (get().profiles[mmsi]) return;
    try {
      const p = await api<VesselRiskProfile>(`/risk/vessel/${mmsi}`);
      set((s) => ({ profiles: { ...s.profiles, [mmsi]: p } }));
    } catch {
      /* leave unset */
    }
  },
}));
