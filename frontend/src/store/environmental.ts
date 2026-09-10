"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import type { EnvironmentalImpact } from "@/types/api";
import { useLayersStore } from "./layers";

interface EnvState {
  byDetection: Record<string, EnvironmentalImpact>;
  running: string | null;
  error: string | null;
  run: (detectionId: string) => Promise<void>;
  forDetection: (detectionId: string) => EnvironmentalImpact | null;
}

export const useEnvironmentalStore = create<EnvState>((set, get) => ({
  byDetection: {},
  running: null,
  error: null,
  run: async (detectionId) => {
    if (get().running) return;
    set({ running: detectionId, error: null });
    try {
      const impact = await api<EnvironmentalImpact>(`/environment/${detectionId}`, {
        method: "POST",
      });
      set((s) => ({
        byDetection: { ...s.byDetection, [detectionId]: impact },
        running: null,
      }));
      useLayersStore.getState().markLive(["protected"]);
      useLayersStore.getState().setVisible("protected", true);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "assessment failed";
      set({ running: null, error: msg });
    }
  },
  forDetection: (detectionId) => get().byDetection[detectionId] ?? null,
}));
