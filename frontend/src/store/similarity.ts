"use client";

import { create } from "zustand";
import { api } from "@/lib/api/client";
import type { SimilaritySearchResult } from "@/types/api";

interface SimilarityState {
  byDetection: Record<string, SimilaritySearchResult>;
  loading: string | null;
  error: string | null;
  loadFor: (detectionId: string) => Promise<void>;
  forDetection: (detectionId: string) => SimilaritySearchResult | null;
}

export const useSimilarityStore = create<SimilarityState>((set, get) => ({
  byDetection: {},
  loading: null,
  error: null,
  loadFor: async (detectionId) => {
    if (get().byDetection[detectionId] || get().loading === detectionId) return;
    set({ loading: detectionId, error: null });
    try {
      const res = await api<SimilaritySearchResult>(`/similarity/${detectionId}`);
      set((s) => ({ byDetection: { ...s.byDetection, [detectionId]: res }, loading: null }));
    } catch (e) {
      set({ loading: null, error: e instanceof Error ? e.message : "similarity failed" });
    }
  },
  forDetection: (detectionId) => get().byDetection[detectionId] ?? null,
}));
