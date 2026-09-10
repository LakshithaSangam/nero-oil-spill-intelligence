"use client";

import { create } from "zustand";
import { api } from "@/lib/api/client";
import type { VesselDossier } from "@/types/api";

interface DossierState {
  byMmsi: Record<string, VesselDossier>;
  loadFor: (mmsi: string) => Promise<void>;
}

export const useDossierStore = create<DossierState>((set, get) => ({
  byMmsi: {},
  loadFor: async (mmsi) => {
    if (get().byMmsi[mmsi]) return;
    try {
      const d = await api<VesselDossier>(`/vessel/${mmsi}/dossier`);
      set((s) => ({ byMmsi: { ...s.byMmsi, [mmsi]: d } }));
    } catch {
      /* leave unset */
    }
  },
}));
