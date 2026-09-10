"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api/client";
import type { KnowledgeGraph } from "@/types/api";

interface GraphState {
  byDetection: Record<string, KnowledgeGraph>;
  loading: string | null;
  error: string | null;
  selectedNodeId: string | null;
  loadFor: (detectionId: string, force?: boolean) => Promise<void>;
  select: (nodeId: string | null) => void;
  forDetection: (detectionId: string) => KnowledgeGraph | null;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  byDetection: {},
  loading: null,
  error: null,
  selectedNodeId: null,
  loadFor: async (detectionId, force) => {
    if ((get().byDetection[detectionId] && !force) || get().loading === detectionId) return;
    set({ loading: detectionId, error: null });
    try {
      const g = await api<KnowledgeGraph>(`/graph/${detectionId}`);
      set((s) => ({ byDetection: { ...s.byDetection, [detectionId]: g }, loading: null }));
    } catch (e) {
      set({
        loading: null,
        error: e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "graph failed",
      });
    }
  },
  select: (selectedNodeId) => set({ selectedNodeId }),
  forDetection: (detectionId) => get().byDetection[detectionId] ?? null,
}));
