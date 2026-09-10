"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import type { SuspectRanking } from "@/types/api";
import { useLayersStore } from "./layers";

export const INVESTIGATION_PHASES = [
  "AIS reconstruction",
  "Behavioural analysis",
  "Evidence scoring",
  "Ranking suspects",
] as const;

interface InvestigationState {
  byDetection: Record<string, SuspectRanking>;
  running: string | null;
  phase: string | null;
  error: string | null;
  focusMmsi: string | null;
  run: (detectionId: string) => Promise<void>;
  setFocus: (mmsi: string | null) => void;
  forDetection: (detectionId: string) => SuspectRanking | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useInvestigationStore = create<InvestigationState>((set, get) => ({
  byDetection: {},
  running: null,
  phase: null,
  error: null,
  focusMmsi: null,

  run: async (detectionId) => {
    if (get().running) return;
    set({ running: detectionId, error: null, phase: INVESTIGATION_PHASES[0] });
    try {
      await wait(80);
      set({ phase: INVESTIGATION_PHASES[1] });
      await wait(80);
      set({ phase: INVESTIGATION_PHASES[2] });
      const ranking = await api<SuspectRanking>("/investigation/run", {
        method: "POST",
        body: JSON.stringify({ detection_id: detectionId }),
      });
      set({ phase: INVESTIGATION_PHASES[3] });
      await wait(80);
      set((s) => ({
        byDetection: { ...s.byDetection, [detectionId]: ranking },
        running: null,
        phase: null,
        focusMmsi: ranking.cards[0]?.vessel.mmsi ?? null,
      }));
      useLayersStore.getState().markLive(["ais", "suspects"]);
      useLayersStore.getState().setVisible("ais", true);
      useLayersStore.getState().setVisible("suspects", true);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "investigation failed";
      set({ running: null, phase: null, error: msg });
    }
  },

  setFocus: (focusMmsi) => set({ focusMmsi }),
  forDetection: (detectionId) => get().byDetection[detectionId] ?? null,
}));
